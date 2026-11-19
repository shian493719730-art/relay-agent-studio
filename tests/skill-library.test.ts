import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {SkillLibrary,atomicJson,validateIndex,refineProjectPrompt,type DiscoveryIndex} from '../server/skill-library.ts';
import {mergeSourceTree,refreshSkillLibrary,applyConnectorTrees} from '../server/library-refresh.ts';
import {refineWithSkills,type ClaudeJson} from '../server/studio-ai.ts';
const blob=(s:string)=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const hash='a'.repeat(40),body='# Practical skill\nRead the task before choosing a workflow.';
const fixture=():DiscoveryIndex=>({schema_version:1,revision:'fixture-1',sources:[{id:'example/skills',url:'https://github.com/example/skills',title:'Example skills',branch:'main',license:{reported_spdx:'MIT'}}],cases:[{id:'example/skills:skills/debugging',source_id:'example/skills',path:'skills/debugging',title:'systematic-debugging',kind:'skill-entry',url:'https://github.com/example/skills/tree/main/skills/debugging',artifact:{type:'tree',sha:hash},document:{path:'skills/debugging/SKILL.md',sha:blob(body)},review:{stage:'body-reviewed',checked_on:'2026-11-01'},execution:{status:'not-run'},native_labels:['debugging','development'],future:{keep:true}}]});
async function isolated(t:any,index=fixture()){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-library-')),resourceDir=path.join(root,'resources'),directory=path.join(root,'data');t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await atomicJson(path.join(resourceDir,'discovery-index.json'),index);await atomicJson(path.join(resourceDir,'highlights.json'),{});await atomicJson(path.join(resourceDir,'additional-sources.json'),{sources:[]});await atomicJson(path.join(resourceDir,'domain-methods.json'),{schema_version:1,revision:'test',methods:[],domains:[],sources:[]});
 return new SkillLibrary({directory,resourceDir});
}
test('bundled developer and office library is searchable, paginated, and distinguishes archive and review state',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-library-seed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const lib=new SkillLibrary({directory:root});
 const first=await lib.search({pageSize:2}),second=await lib.search({pageSize:2,page:2});assert.equal(first.entries.length,2);assert.ok(first.stats.upstreamEntries>=1182);assert.equal(first.stats.localMethods,17);assert.ok(first.categories.some(c=>c.id==='spreadsheets'));assert.notEqual(first.entries[0].id,second.entries[0].id);assert.ok((await lib.search({query:'Excel'})).total>0);
 const doc=await lib.search({query:'Word',category:'documents'});assert.ok(doc.entries.some(e=>/docx/.test(e.id)));assert.ok(doc.entries.every(e=>!e.historical));assert.ok((await lib.search({includeHistorical:true})).total>(await lib.search({})).total);
 assert.ok(!(await lib.search({query:'Excel'})).entries.some(e=>/excellence/.test(e.id)));
 const own=await lib.search({kind:'local-method'});assert.equal(own.total,17);assert.ok(own.entries.every(e=>e.review==='adapted-method'));
});
test('project recommendations use goals and file types, and do not invent needs for an empty goal',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-library-rec-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const lib=new SkillLibrary({directory:root});
 assert.equal((await lib.recommend({name:'empty'})).items.length,0);
 const office=await lib.recommend({name:'weekly',goal:'制作 Excel 表格与报表',fileTypes:['xlsx']}),debug=await lib.recommend({name:'fix',goal:'调试代码并修复测试'});
 assert.ok(office.items.some(i=>/xlsx|spreadsheet|excel/.test(i.entry.id)));assert.ok(debug.items.some(i=>/debug/.test(i.entry.id)));assert.notEqual(office.goalKey,debug.goalKey);
 const freight=await lib.recommend({name:'货运管理',goal:'承接运输咨询，连接项目并自动化'});assert.ok(freight.items.length>0);assert.ok(freight.items.every(i=>!/\.github\/workflows|kubernetes|cicd|benchling|dnanexus/.test(i.entry.path)));
 let payload:any;const generate:ClaudeJson=async(_s,u)=>{payload=u;return{summary:'按目标选取',items:[{id:office.items[0].entry.id,reason:'表格文件',adaptation:'检查公式'}]};};
 const selected=await lib.semanticRecommend({goal:'制作 Excel 表格与报表'},undefined,generate);assert.equal(selected.items.length,1);assert.ok(payload.candidates.length<=55);assert.doesNotMatch(JSON.stringify(payload),/instructions|api_key|fileContents/);
 await assert.rejects(()=>lib.semanticRecommend({goal:'制作 Excel'},undefined,async()=>({summary:'x',items:[{id:'invented',reason:'x',adaptation:'x'}]})),/未知或重复/);
});
test('directory updates preserve unrelated fields and invalidate changed body reviews while retaining history',()=>{
 const d=fixture(),s=d.sources[0],old=structuredClone(d.cases[0]);
 mergeSourceTree(d,s,[{path:old.path,type:'tree',sha:hash},{path:old.document.path,type:'blob',sha:blob(body)}],hash);assert.deepEqual(d.cases[0].review,old.review);assert.deepEqual(d.cases[0].future,{keep:true});
 const changed=mergeSourceTree(d,s,[{path:old.path,type:'tree',sha:'b'.repeat(40)},{path:old.document.path,type:'blob',sha:blob(body+' changed')},{path:'skills/excel',type:'tree',sha:hash},{path:'skills/excel/SKILL.md',type:'blob',sha:hash}],hash);
 assert.equal(changed.changed,1);assert.equal(changed.added,1);assert.equal(d.cases[0].review.stage,'indexed');assert.equal(d.cases[0].review_history[0].stage,'body-reviewed');assert.equal(d.cases[1].execution.status,'not-run');
 mergeSourceTree(d,s,[],hash);assert.equal(d.cases[0].unavailable,true);assert.equal(d.cases.length,2);validateIndex(d);
});
test('failed and truncated directory requests retain the previous entries; cancellation keeps the last effective catalog',async t=>{
 const lib=await isolated(t),initial=fixture();await atomicJson(path.join(lib.directory,'catalog.json'),initial);
 const fetcher:typeof fetch=async url=>String(url).includes('/git/trees/')?Response.json({truncated:true,tree:[],sha:hash}):Response.json({full_name:'example/skills',default_branch:'main',archived:false,license:{spdx_id:'MIT'}});
 const result=await refreshSkillLibrary({store:lib,fetcher,sharedRoot:path.join(lib.directory,'missing')});assert.equal(result.state,'partial');assert.deepEqual((await lib.index()).cases,initial.cases);
 const effective=await fs.readFile(path.join(lib.directory,'catalog.json'),'utf8'),ac=new AbortController();ac.abort();await assert.rejects(()=>refreshSkillLibrary({store:lib,fetcher,signal:ac.signal,sharedRoot:path.join(lib.directory,'missing')}),/停止/);assert.equal(await fs.readFile(path.join(lib.directory,'catalog.json'),'utf8'),effective);assert.equal(JSON.parse(await fs.readFile(path.join(lib.directory,'update-status.json'),'utf8')).state,'cancelled');
 await assert.rejects(()=>applyConnectorTrees([{sourceId:'example/skills',truncated:true,tree:[],sha:hash}],lib),/不完整/);assert.equal(await fs.readFile(path.join(lib.directory,'catalog.json'),'utf8'),effective);
});
test('guides verify exact source content and license, then retain the old project version after an upstream change',async t=>{
 const lib=await isolated(t);let reads=0;
 const fetcher:typeof fetch=async url=>{reads++;return String(url).endsWith('/SKILL.md')?new Response(body):String(url).endsWith('/LICENSE')?new Response('MIT License\nPermission is hereby granted, free of charge.'):new Response('',{status:404});};
 const id=fixture().cases[0].id,guide=await lib.guide(id,{fetcher});assert.equal(guide.bodyHash,blob(body));assert.equal(guide.referenceOnly,true);assert.equal((await lib.index()).cases[0].review.stage,'body-reviewed');const before=reads;await lib.guide(id,{fetcher});assert.equal(reads,before);
 const changed=fixture();changed.revision='fixture-2';changed.cases[0].document.sha=blob('new instructions');await atomicJson(path.join(lib.directory,'catalog.json'),changed);
 assert.equal((await lib.pinnedGuide(id,guide.bodyHash)).body,body);await assert.rejects(()=>lib.guide(id,{fetcher}),/内容已变化/);await assert.rejects(()=>lib.guide('unknown',{fetcher}),/未找到/);await assert.rejects(()=>lib.pinnedGuide(id,'../escape'),/版本无效/);
 const calls:any[]=[];await refineProjectPrompt({text:'请修复问题，保留原意',libraryBindings:[{id,bodyHash:guide.bodyHash}]},undefined,async(_s,u)=>{calls.push(u);return calls.length===1?{intent:'修复',selections:[{id,reason:'适用项目方法'}]}:{text:'修复问题并验证结果',intent:'修复',changes:[],questions:[],application:[{id,used:'从固定项目版本读取'}]};},{store:lib,guides:[]});assert.equal(calls[1].providedSkills[0].instructions,body);assert.doesNotMatch(JSON.stringify(calls),/new instructions/);
});
test('a semantic router resolves only selected complete guides and rejects duplicates before any read',async()=>{
 const candidates=['one','two'].map(id=>({id,title:id,description:'candidate metadata',body:'',source:'https://example.test/'+id}));const resolved:string[]=[],calls:any[]=[];
 const generate:ClaudeJson=async(_s,u)=>{calls.push(u);return calls.length===1?{intent:'调试',selections:[{id:'two',reason:'本条适用'}]}:{text:'检查问题',intent:'调试',changes:[],questions:[],application:[{id:'two',used:'读完后选择检查方法'}]};};
 await refineWithSkills({text:'调试这个问题'},undefined,generate,candidates,async id=>{resolved.push(id);return{...candidates.find(c=>c.id===id)!,body:'actual full instructions'};});
 assert.deepEqual(resolved,['two']);assert.equal(calls[1].providedSkills[0].instructions,'actual full instructions');assert.doesNotMatch(JSON.stringify(calls[0]),/actual full instructions/);
 await assert.rejects(()=>refineWithSkills({text:'x'},undefined,async()=>({intent:'x',selections:[{id:'one',reason:'a'},{id:'one',reason:'b'}]}),candidates,async()=>{throw new Error('must not read');}),/选择重复/);
});
