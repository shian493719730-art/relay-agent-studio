import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {Development} from '../server/development.ts';
import {practiceSource,practiceOriginal,practiceExpected,practiceHash} from '../server/development-practice.ts';
const js=fs.readFileSync(new URL('../src/prototype/source-tutorial.js',import.meta.url),'utf8');
const core=vm.runInNewContext(js.split('/* SOURCE_TUTORIAL_CORE_START */')[1].split('/* SOURCE_TUTORIAL_CORE_END */')[0]+';SourceTutorialCore');
const wait=async(fn:()=>Promise<any>)=>{for(let i=0;i<300;i++){const r=await fn();if(r.settled)return r;await new Promise(r=>setTimeout(r,20));}throw Error('real check did not settle')};
async function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-source-lesson-')),dev=new Development(dir,20000),requestId=randomUUID();const w:any=await dev.action({action:'practice',requestId,boardId:'board',projectId:'project'});return{dir,dev,w,requestId,close:async()=>{await dev.stopAll();fs.rmSync(dir,{recursive:true,force:true})}};}
test('everyone can run the actual read-edit-test-diff-rollback lesson using the running Node and no Git/npm or model',async()=>{
 const before=process.env.PATH;process.env.PATH='/nonexistent';const f=await fixture();try{
 const t:any={step:0,workspaceId:f.w.id,source:practiceSource,baselineHash:practiceHash,read:{},changes:[],checks:[]};
 const call=async(action:string,a:any={})=>{const args={workspaceId:f.w.id,...a},r:any=await f.dev.action({action,...args});core.observe(t,action,args,r);return r};
 assert.ok(core.done(t));t.step=1;await call('read',{path:'README.md'});assert.ok(core.done(t));t.step=2;const original=await call('read',{path:practiceSource});assert.equal(original.text,practiceOriginal);assert.ok(core.done(t));
 t.step=3;const edit=await call('write',{path:practiceSource,content:'export const title = '+JSON.stringify(practiceExpected)+';\n',expectedHash:original.hash,requestId:randomUUID()});assert.ok(core.done(t));assert.notEqual(fs.readFileSync(path.join(f.w.root,practiceSource),'utf8'),practiceOriginal);
 t.step=4;const check=await call('check',{command:'test',requestId:randomUUID()});assert.equal(core.done(t),false);const passed=await wait(()=>call('checkStatus',{runId:check.id}));assert.equal(passed.status,'passed');assert.match(passed.output,/pass 1/);assert.equal(passed.sourceHash,edit.afterHash);assert.ok(core.done(t));
 t.step=5;assert.equal(core.done(t),false);await call('diff',{changeId:edit.id});assert.ok(core.done(t));t.step=6;await call('revert',{changeId:edit.id});assert.equal(core.done(t),false);await call('read',{path:practiceSource});assert.equal(fs.readFileSync(path.join(f.w.root,practiceSource),'utf8'),practiceOriginal);assert.ok(core.done(t));
 t.step=7;assert.equal(core.done(t),false);const again=await call('check',{command:'test',requestId:randomUUID()});const failed=await wait(()=>call('checkStatus',{runId:again.id}));assert.equal(failed.status,'failed');assert.notEqual(failed.exitCode,0);assert.equal(failed.sourceHash,practiceHash);assert.ok(core.done(t));
 const syntax=await call('check',{command:'typecheck',requestId:randomUUID()});assert.equal((await wait(()=>call('checkStatus',{runId:syntax.id}))).status,'passed');assert.match(syntax.runner,/--check/);
 }finally{process.env.PATH=before;await f.close();}
});
test('practice creation is idempotent, persistent and scoped; it cannot fabricate Git diff or expand into arbitrary files',async()=>{
 const f=await fixture();try{const args={action:'practice',requestId:f.requestId,boardId:'board',projectId:'project'};assert.equal((await f.dev.action(args) as any).id,f.w.id);await assert.rejects(f.dev.action({...args,projectId:'other'}));const restarted=new Development(f.dir);assert.equal((await restarted.action({action:'list'}) as any).workspaces[0].kind,'practice');
 for(const name of ['../outside','.env.local','node_modules/x','new-secret.txt'])await assert.rejects(restarted.action({action:'write',workspaceId:f.w.id,path:name,content:'no',expectedHash:'missing',requestId:randomUUID()}));
 await assert.rejects(restarted.action({action:'gitDiff',workspaceId:f.w.id,path:practiceSource}),/没有 Git/);const list:any=await restarted.action({action:'files',workspaceId:f.w.id});assert.deepEqual(list.files,['README.md','package.json','src/welcome.mjs','tests/welcome.test.mjs']);
 const pkg:any=await restarted.action({action:'read',workspaceId:f.w.id,path:'package.json'});await restarted.action({action:'write',workspaceId:f.w.id,path:'package.json',content:pkg.text+'\n',expectedHash:pkg.hash,requestId:randomUUID()});await assert.rejects(restarted.action({action:'check',workspaceId:f.w.id,command:'test',requestId:randomUUID()}),/package.json 已变化/);
 }finally{await f.close();}
});
test('an actual long practice test can be stopped and never satisfies the success gate',async()=>{
 const f=await fixture();try{const r:any=await f.dev.action({action:'read',workspaceId:f.w.id,path:'tests/welcome.test.mjs'});await f.dev.action({action:'write',workspaceId:f.w.id,path:r.path,content:"console.log('PRACTICE-RUNNING');await new Promise(r=>setTimeout(r,20000));",expectedHash:r.hash,requestId:randomUUID()});const check:any=await f.dev.action({action:'check',workspaceId:f.w.id,command:'test',requestId:randomUUID()});await f.dev.action({action:'stop',workspaceId:f.w.id,runId:check.id});const stopped=await wait(()=>f.dev.action({action:'checkStatus',workspaceId:f.w.id,runId:check.id}));assert.equal(stopped.status,'stopped');const t:any={step:4,changes:[{afterHash:'new',status:'applied'}],checks:[{...stopped,sourceHash:'new'}]};assert.equal(core.done(t),false);
 }finally{await f.close();}
});
test('the lesson rejects stale checks, a fake rollback and missing rereads, and model entry points are blocked locally',()=>{
 const t:any={step:4,source:practiceSource,baselineHash:'base',changes:[{id:'real',afterHash:'new',status:'applied'}],checks:[{id:'old',status:'passed',exitCode:0,sourceHash:'old',startedAt:1}],read:{}};assert.equal(core.done(t),false);t.checks.push({status:'passed',exitCode:0,sourceHash:'new',startedAt:2});assert.ok(core.done(t));t.step=6;t.changes[0].status='reverted';assert.equal(core.done(t),false);t.read[practiceSource]={hash:'wrong'};assert.equal(core.done(t),false);t.read[practiceSource].hash='base';assert.ok(core.done(t));t.step=7;t.checks.push({status:'stopped',exitCode:null,sourceHash:'base',startedAt:3});assert.equal(core.done(t),false);
 const fetchBody=js.slice(js.indexOf('const dtFetchBase='),js.indexOf('\nfunction dtBegin('));let requests=0;const scope:any={window:{fetch:async()=>{requests++;return{ok:true}}},dtActive:()=>true,dtSession:()=>({boardId:'practice'}),state:{activeBoard:'practice'},B:()=>({sourcePractice:true})};const wrapped=vm.runInNewContext(fetchBody+';window.fetch',scope);
 return (async()=>{for(const [url,body] of [['/api/studio/assistant','{}'],['/api/studio/models','{"action":"run"}'],['/api/studio/collaboration','{"action":"resume"}']])await assert.rejects(wrapped(url,{body}),/不调用收费模型/);await wrapped('/api/studio/development',{body:'{"action":"read"}'});assert.equal(requests,1)})();
});
test('after a save opens the diff automatically the lesson points to Next, and clipped targets use only their visible area',()=>{
 const plan=vm.runInNewContext(js.slice(js.indexOf('function dtPlan('),js.indexOf('\nfunction dtExpose('))+';dtPlan',{dtSession:()=>({step:3,workspaceId:'w',source:practiceSource,changes:[]}),dwPanel:{hidden:false},dwWorkspace:()=>({id:'w'}),DW:{tab:'changes',settings:false,file:null},SourceTutorialCore:{done:()=>true},state:{},panK:'',document:{},$:()=>null});const ops=plan();assert.equal(ops.find((o:any)=>!o.done).selector,'#source-coach [data-dt-next]');
 const clip=vm.runInNewContext(js.slice(js.indexOf('function dtVisibleRect('),js.indexOf('\nfunction dtDraw('))+';dtVisibleRect',{innerWidth:900,innerHeight:700,getComputedStyle:()=>({overflowX:'visible',overflowY:'auto'})});const parent={parentElement:null,getBoundingClientRect:()=>({left:0,top:100,right:800,bottom:400})},el={parentElement:parent,getBoundingClientRect:()=>({left:50,top:300,right:550,bottom:600})};const box=clip(el);assert.equal(box.bottom,400);assert.equal(box.height,100);
});
