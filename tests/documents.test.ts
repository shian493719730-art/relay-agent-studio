import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {Documents} from '../server/documents.ts';
import {CanvasRuns} from '../server/canvas-runs.ts';
import {ModelConnections} from '../server/model-connections.ts';
import {ModelHandoffs} from '../server/model-handoffs.ts';
import {docxFixture,xlsxFixture,pdfFixture} from './document-fixtures.ts';
import ExcelJS from 'exceljs';
async function harness(t:any){const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-documents-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const docs=new Documents(path.join(root,'documents'));return{root,docs};}
const upload=(docs:Documents,name:string,bytes:Buffer,boardId='board')=>docs.upload({name,fileId:name,boardId},bytes);

test('actual DOCX paragraphs and table contents, XLSX cells/formulas/hidden sheets, PDF pages are extracted',async t=>{
 const {docs}=await harness(t);
 for(const [name,bytes,expected]of [['brief.docx',await docxFixture(),['WORD-CODE-83KF','小店主','表格资料']],['data.xlsx',await xlsxFixture(),['EXCEL-49QX','B2=7','C2=13','缓存结果：91','（隐藏）']],['policy.pdf',pdfFixture(),['PDF-CODE-72ZT','9 days','第 1 页']]]as const){
  const r=upload(docs,name,bytes);await docs.read(r.id,new AbortController().signal);assert.equal(r.status,'ready');const body=docs.context([r]);for(const text of expected)assert.ok(body.includes(text),text);if(process.platform!=='win32')assert.equal((await fs.stat(path.join(docs.directory,r.id+'.bin'))).mode&0o777,0o600);
 }
});

test('malformed, scanned-only and unsupported legacy files fail without a false successful read',async t=>{
 const {docs}=await harness(t);assert.throws(()=>upload(docs,'legacy.doc',Buffer.from('not docx')),/DOCX/);assert.throws(()=>upload(docs,'fake.xlsx',Buffer.from('wrong')),/扩展名/);
 for(const [name,bytes]of [['damaged.docx',Buffer.from('PK damaged')],['scan.pdf',pdfFixture('')]]as const){const r=upload(docs,name,bytes);await assert.rejects(docs.read(r.id,new AbortController().signal));assert.equal(r.status,'failed');}
});

test('a real parser is terminated on pause and resumes from retained immutable text segments',async t=>{
 const {docs}=await harness(t),r=upload(docs,'many-pages.pdf',pdfFixture('PAGE-CONTENT-READ',90));const ac=new AbortController();
 await assert.rejects(docs.read(r.id,ac.signal,p=>{if(p.segments.length>=1)ac.abort()}),/暂停/);assert.equal(r.status,'paused');assert.ok(r.segments.length>0);const kept=r.segments[0];
 const restored=new Documents(docs.directory),loaded=restored.get(r.id);await restored.read(loaded.id,new AbortController().signal);assert.equal(loaded.status,'ready');assert.equal(loaded.segments.length,90);assert.deepEqual(loaded.segments[0],kept);
});

test('file references enforce board ownership, content identity and size, and text is never silently truncated',async t=>{
 const {docs}=await harness(t),r=upload(docs,'notes.txt',Buffer.from('PRIVATE-FILE'));
 assert.throws(()=>docs.scoped({id:r.fileId,name:r.name,documentId:r.id},'other-board'),/不属于/);assert.throws(()=>docs.scoped({id:'wrong',name:r.name,documentId:r.id},'board'),/不属于/);
 const oversized=upload(docs,'long.txt',Buffer.from('a'.repeat(150001)));await assert.rejects(docs.read(oversized.id,new AbortController().signal),/上限/);assert.equal(oversized.status,'failed');
 assert.throws(()=>docs.get('../anything'),/编号/);
});

test('real file bodies reach planning, assigned workers and final; raw documents cross only an enabled document sharing rule',async t=>{
 for(const shareDocuments of [false,true]){const {root,docs}=await harness(t),r=upload(docs,'source.txt',Buffer.from('FILE-ONLY-583Q quantity=7 price=13'));
  const members=(id:string)=>({id,name:id,role:'按文件实际数据执行',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture-model'}),projects=['A','B'].map(id=>({id,name:id,summary:id+'目标',coordinator:members(id+'-coord'),members:[members(id+'-one')],files:id==='A'?[{id:r.fileId,name:r.name,documentId:r.id}]:[],msgs:[],artifacts:[],incoming:[]}));
  const calls:{id:string;packet:string}[]=[],service=new CanvasRuns(path.join(root,'runs'),new ModelConnections(root,()=> 'fixture-key'),async(step,packet)=>{calls.push({id:step.agent.id,packet});if(step.agent.role==='plan')return JSON.stringify({assignments:[{memberId:step.agent.id.startsWith('A')?'A-one':'B-one',task:'执行实际分工',dependsOn:[]}],acceptance:'核对文件'});return 'RESULT_WITHOUT_SOURCE_SECRET';},docs);
  const run=service.start({boardId:'board',rootProjectId:'A',request:'处理文件，不能凭文件名推断',projects,links:[{id:'AB',src:'A',dst:'B',state:'on',name:'AB',trigger:'done',share:{summary:false,artifacts:true,documents:shareDocuments,noteIds:[]}}],clientRequestId:crypto.randomUUID()});await service.settled(run.id);assert.equal(run.status,'completed');assert.equal(run.modelCalls,6);assert.ok(calls.filter(c=>c.id.startsWith('A')).every(c=>c.packet.includes('FILE-ONLY-583Q')));
  for(const call of calls.filter(c=>c.id.startsWith('B')))assert.equal(call.packet.includes('FILE-ONLY-583Q'),shareDocuments);assert.ok(run.steps.some(s=>s.phase==='read-files'&&s.status==='completed'));
 }
});

test('file parsing failure prevents every model request, including group planning',async t=>{
 const {root,docs}=await harness(t),r=upload(docs,'scan.pdf',pdfFixture(''));let calls=0;const m={id:'m',name:'m',role:'work',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture-model'},service=new CanvasRuns(path.join(root,'runs'),new ModelConnections(root,()=> 'fixture-key'),async()=>{calls++;return'bad'},docs);
 const run=service.start({boardId:'board',request:'read',group:{id:'g',coordinator:{...m,id:'gc'}},projects:[{id:'A',name:'A',coordinator:{...m,id:'coord'},members:[m],files:[{id:r.fileId,name:r.name,documentId:r.id}]}],links:[],clientRequestId:crypto.randomUUID()});await service.settled(run.id);assert.equal(run.status,'failed');assert.equal(calls,0);assert.equal(run.modelCalls,0);
});

test('pausing the workflow terminates its real file parser before any model call and resumes without losing pages',async t=>{
 const {root,docs}=await harness(t),r=upload(docs,'pages.pdf',pdfFixture('WORKFLOW-DOCUMENT-PAUSE',100));let calls=0;const m={id:'worker',name:'worker',role:'read the actual file',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture-model'};
 const service=new CanvasRuns(path.join(root,'runs'),new ModelConnections(root,()=> 'fixture-key'),async(step,packet)=>{calls++;assert.match(packet,/WORKFLOW-DOCUMENT-PAUSE/);return step.agent.role==='plan'?JSON.stringify({assignments:[{memberId:'worker',task:'summarize',dependsOn:[]}],acceptance:'actual pages'}):'ACTUAL RESULT';},docs);
 const run=service.start({boardId:'board',rootProjectId:'A',request:'read and work',projects:[{id:'A',name:'A',coordinator:{...m,id:'coord'},members:[m],files:[{id:r.fileId,name:r.name,documentId:r.id}]}],links:[],clientRequestId:crypto.randomUUID()});
 const off=service.subscribe(run.id,p=>{if(p.status==='running'&&r.segments.length>=1)void service.pause(p.id)});await service.settled(run.id);off();assert.equal(run.status,'paused');assert.equal(calls,0);assert.ok(r.segments.length>=1);assert.ok(r.segments.length<100);assert.equal(r.status,'paused');
 await service.resume(run.id);await service.settled(run.id);assert.equal(run.status,'completed');assert.equal(r.segments.length,100);assert.equal(run.steps.find(s=>s.phase==='read-files')!.attempt,2);assert.equal(calls,3);
});

test('ordinary bound-member handoffs include scoped actual file text and prepare without a model request',async t=>{
 const {root,docs}=await harness(t),r=upload(docs,'brief.docx',await docxFixture());await docs.read(r.id,new AbortController().signal);let calls=0;
 const handoffs=new ModelHandoffs(path.join(root,'handoffs'),new ModelConnections(root,()=> 'fixture-key'),async()=>{calls++;return'REAL RESULT'},docs);
 const input={boardId:'board',project:{id:'A',name:'A',goal:'file analysis'},member:{id:'one',name:'one',role:'read'},target:{connectionId:'official-anthropic',model:'claude-opus-5-5'},files:[{id:r.fileId,name:r.name,documentId:r.id}],request:'use actual text'};
 const preview=handoffs.prepare(input);assert.match(preview.packet,/WORD-CODE-83KF/);assert.match(preview.packet,/表格资料/);assert.match(preview.packet,/提取段落/);assert.equal(calls,0);
 assert.throws(()=>handoffs.prepare({...input,boardId:'other'}),/不属于/);await handoffs.run(preview.token,preview.fingerprint,()=>{});assert.equal(calls,1);
});

test('group coordinator receives file bodies only when raw document sharing was explicitly enabled',async t=>{
 for(const shared of [false,true]){const {root,docs}=await harness(t),r=upload(docs,'private.txt',Buffer.from('PRIVATE_RAW_DOC_729K'));const seen:string[]=[];const m=(id:string)=>({id,name:id,role:'work',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture-model'});
  const service=new CanvasRuns(path.join(root,'runs'),new ModelConnections(root,()=> 'fixture-key'),async(step,packet)=>{if(step.agent.id==='group'&&step.agent.role==='plan'){seen.push(packet);return JSON.stringify({projectTasks:['A','B'].map(projectId=>({projectId,task:'finish project'}))})}if(step.agent.role==='plan')return JSON.stringify({assignments:[{memberId:step.agent.id[0]+'-one',task:'actual work',dependsOn:[]}],acceptance:'verify'});return'SUMMARY_WITHOUT_RAW_TEXT';},docs);
  const run=service.start({boardId:'board',request:'coordinate projects',group:{id:'g',coordinator:m('group')},projects:['A','B'].map(id=>({id,name:id,coordinator:m(id+'-coord'),members:[m(id+'-one')],files:id==='A'?[{id:r.fileId,name:r.name,documentId:r.id}]:[]})),links:[{id:'AB',src:'A',dst:'B',state:'on',trigger:'done',share:{artifacts:true,documents:shared}}],clientRequestId:crypto.randomUUID()});await service.settled(run.id);assert.equal(run.status,'completed');assert.equal(seen[0].includes('PRIVATE_RAW_DOC_729K'),shared);
 }
});

test('merged Excel cells preserve their master reference instead of duplicating values',async t=>{
 const {docs}=await harness(t),wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('合并表');sheet.getCell('A1').value='UNIQUE-MERGED-VALUE';sheet.mergeCells('A1:B1');
 const r=upload(docs,'merged.xlsx',Buffer.from(await wb.xlsx.writeBuffer()));await docs.read(r.id,new AbortController().signal);const body=docs.context([r]);assert.equal(body.split('UNIQUE-MERGED-VALUE').length-1,1);assert.match(body,/B1=\[合并到 A1\]/);
});
