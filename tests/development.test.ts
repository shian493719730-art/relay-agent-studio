import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Development} from '../server/development.ts';
import vm from 'node:vm';
import {planAssistant} from '../server/studio-assistant.ts';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-dev-')),repo=path.join(dir,'repo');fs.mkdirSync(repo);
 execFileSync('git',['init','-q',repo]);
 fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'isolated-development-fixture',scripts:{test:'node check.cjs',typecheck:'node check.cjs',build:'node long.cjs'}}));
 fs.writeFileSync(path.join(repo,'check.cjs'),"console.log('CHECKED-REAL-CODE');console.log('noKeys='+['OPENAI_API_KEY','ANTHROPIC_API_KEY','GH_TOKEN','RELAY_DESKTOP_TOKEN'].every(k=>!process.env[k]));");
 fs.writeFileSync(path.join(repo,'long.cjs'),"const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',\"const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.writeFileSync('heartbeat.txt',String(Date.now())),30)\"],{stdio:'inherit'});console.log('CHILD-STARTED');setInterval(()=>{},1000);");
 fs.writeFileSync(path.join(repo,'source.ts'),'export const actual = 1;\n');fs.writeFileSync(path.join(repo,'.gitignore'),'ignored.txt\n');fs.writeFileSync(path.join(repo,'ignored.txt'),'private');fs.writeFileSync(path.join(repo,'.env.local'),'private');fs.writeFileSync(path.join(repo,'.envrc'),'private');
 execFileSync('git',['-C',repo,'add','.']);const store=path.join(dir,'records'),dev=new Development(store,20000);
 const attach=async(writable=true,allowChecks=true)=>{const p=dev.preview(repo);return await dev.action({action:'attach',directory:repo,boardId:'board',projectId:'project',writable,allowChecks,scriptsHash:p.scriptsHash}) as any;};
 return{dir,repo,store,dev,attach,async close(){await dev.stopAll();fs.rmSync(dir,{recursive:true,force:true});}};
}
async function wait(check:()=>Promise<any>,done:(s:any)=>boolean){const end=Date.now()+15000;for(;;){const s=await check();if(done(s))return s;if(Date.now()>end)throw Error('fixture did not settle: '+JSON.stringify(s));await new Promise(r=>setTimeout(r,35));}}
test('connected Git source supports actual reads, CAS writes, persisted per-edit rollback and reapply without touching other files',async()=>{
 const f=fixture();try{const w=await f.attach();const call=(action:string,args:any={})=>f.dev.action({action,workspaceId:w.id,...args}) as Promise<any>;
 const read=await call('read',{path:'source.ts'});assert.equal(read.text,'export const actual = 1;\n');
 const requestId=randomUUID(),change=await call('write',{path:'source.ts',content:'export const actual = 2;\n',expectedHash:read.hash,requestId});assert.equal(fs.readFileSync(path.join(f.repo,'source.ts'),'utf8'),'export const actual = 2;\n');assert.equal((await call('write',{path:'source.ts',content:'export const actual = 2;\n',expectedHash:read.hash,requestId})).id,change.id);
 await assert.rejects(call('write',{path:'source.ts',content:'stale overwrite',expectedHash:read.hash,requestId:randomUUID()}),/重新读取/);assert.match((await call('gitDiff',{path:'source.ts'})).diff,/\+export const actual = 2/);
 const restarted=new Development(f.store);await restarted.action({action:'revert',workspaceId:w.id,changeId:change.id});assert.equal(fs.readFileSync(path.join(f.repo,'source.ts'),'utf8'),read.text);
 await restarted.action({action:'reapply',workspaceId:w.id,changeId:change.id});assert.match(fs.readFileSync(path.join(f.repo,'source.ts'),'utf8'),/= 2/);
 fs.writeFileSync(path.join(f.repo,'source.ts'),'human edit');await assert.rejects(restarted.action({action:'revert',workspaceId:w.id,changeId:change.id}),/人工编辑/);assert.equal(fs.readFileSync(path.join(f.repo,'source.ts'),'utf8'),'human edit');assert.equal(fs.readFileSync(path.join(f.repo,'ignored.txt'),'utf8'),'private');
 }finally{await f.close();}
});
test('source bridge excludes secrets, ignored files, traversal and live or dangling symlinks; readonly permission is enforced',async()=>{
 const f=fixture();try{const w=await f.attach(false,false),call=(action:string,args:any={})=>f.dev.action({action,workspaceId:w.id,...args}) as Promise<any>;
 const listed=await call('files');assert.ok(listed.files.includes('source.ts'));assert.ok(!listed.files.includes('.env.local'));assert.ok(!listed.files.includes('.envrc'));assert.ok(!listed.files.includes('ignored.txt'));
 for(const name of ['../outside','/etc/passwd','.env.local','.git/config','ignored.txt','node_modules/example','dist/result'])await assert.rejects(call('read',{path:name}));
 fs.symlinkSync(path.join(f.dir,'not-created'),path.join(f.repo,'dangling'));fs.symlinkSync(f.dir,path.join(f.repo,'outside'));
 for(const name of ['dangling','outside/example'])await assert.rejects(call('read',{path:name}),/符号链接/);
 const current=await call('read',{path:'source.ts'});await assert.rejects(call('write',{path:'source.ts',content:'not allowed',expectedHash:current.hash,requestId:randomUUID()}),/只读/);
 await assert.rejects(call('check',{command:'test',requestId:randomUUID()}),/权限/);
 }finally{await f.close();}
});
test('unique replacements, new files and deletion keep exact recoverable content and reject conflicting request reuse',async()=>{
 const f=fixture();try{const w=await f.attach(),call=(action:string,args:any={})=>f.dev.action({action,workspaceId:w.id,...args}) as Promise<any>;
 const before=await call('read',{path:'source.ts'}),requestId=randomUUID();const change=await call('replace',{path:'source.ts',oldText:'actual = 1',newText:'actual = 3',expectedHash:before.hash,requestId});assert.equal((await call('replace',{path:'source.ts',oldText:'actual = 1',newText:'actual = 3',expectedHash:before.hash,requestId})).id,change.id);
 await assert.rejects(call('replace',{path:'source.ts',oldText:'actual = 1',newText:'actual = 99',expectedHash:before.hash,requestId}),/不一致/);
 const created=await call('write',{path:'new/tool.ts',content:'new file\n',expectedHash:'missing',requestId:randomUUID()});const del=await call('delete',{path:'new/tool.ts',expectedHash:created.afterHash,requestId:randomUUID()});assert.ok(!fs.existsSync(path.join(f.repo,'new/tool.ts')));
 await call('revert',{changeId:del.id});assert.equal(fs.readFileSync(path.join(f.repo,'new/tool.ts'),'utf8'),'new file\n');await call('revert',{changeId:created.id});assert.ok(!fs.existsSync(path.join(f.repo,'new/tool.ts')));
 }finally{await f.close();}
});
test('actual npm checks return logs and exit status, strip inherited keys, persist idempotency and invalidate script grants after manifest edits',async()=>{
 const f=fixture(),old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only-not-a-credential';try{const w=await f.attach(),requestId=randomUUID();const started:any=await f.dev.action({action:'check',workspaceId:w.id,command:'test',requestId});const result=await wait(()=>f.dev.action({action:'checkStatus',workspaceId:w.id,runId:started.id}),s=>s.settled);assert.equal(result.status,'passed');assert.equal(result.exitCode,0);assert.match(result.output,/CHECKED-REAL-CODE/);assert.match(result.output,/noKeys=true/);
 const restarted=new Development(f.store);assert.equal((await restarted.action({action:'check',workspaceId:w.id,command:'test',requestId}) as any).id,started.id);
 fs.appendFileSync(path.join(f.repo,'package.json'),'\n');await assert.rejects(f.dev.action({action:'check',workspaceId:w.id,command:'test',requestId:randomUUID()}),/package.json 已变化/);
 await assert.rejects(f.dev.action({action:'check',workspaceId:w.id,command:'start',requestId:randomUUID()}));
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;await f.close();}
});
test('stopping a real check terminates its descendant process group and preserves output, without starting another run',async()=>{
 const f=fixture();try{const w=await f.attach(),r:any=await f.dev.action({action:'check',workspaceId:w.id,command:'build',requestId:randomUUID()});await wait(async()=>({exists:fs.existsSync(path.join(f.repo,'heartbeat.txt'))}),s=>s.exists);
 await f.dev.action({action:'stop',workspaceId:w.id,runId:r.id});const stopped=await wait(()=>f.dev.action({action:'checkStatus',workspaceId:w.id,runId:r.id}),s=>s.settled);assert.equal(stopped.status,'stopped');assert.match(stopped.output,/CHILD-STARTED/);
 const stamp=fs.readFileSync(path.join(f.repo,'heartbeat.txt'),'utf8');await new Promise(r=>setTimeout(r,180));assert.equal(fs.readFileSync(path.join(f.repo,'heartbeat.txt'),'utf8'),stamp);
 }finally{await f.close();}
});
test('the built-in operator can use observed source hashes, execute a real change and check, then inspect the actual diff before reporting completion',async()=>{
 const f=fixture();try{
  const w=await f.attach(),source=fs.readFileSync(new URL('../src/prototype/assistant.js',import.meta.url),'utf8');
  const core=vm.runInNewContext(source.split('/* ASSISTANT_CORE_START */')[1].split('/* ASSISTANT_CORE_END */')[0]+';AssistantCore');
  const session:any={steps:[],cursor:0},names=['dev.read','dev.replace','dev.check','dev.diff'];let rounds=0;
  const plan=async()=>planAssistant({message:'Read the code, replace the value, check it and verify the diff',capabilities:names.map(name=>({name,description:name,params:'workspaceId'})),context:{projects:[],development:[{id:w.id,boardId:'board',projectId:'project',name:w.name,writable:true,checksAllowed:true}],nextStep:session.steps.length+1,execution:session.steps.map((s:any)=>({id:s.id,name:s.name,status:s.status,summary:s.name,resultJson:JSON.stringify(s.result)}))}},undefined,async(_s:any,u:any)=>{
   const data=JSON.stringify(u);assert.match(data,/development/);rounds++;
   const step=(id:string,name:string,args:any)=>({reply:'Fixture plan; no model request',question:'',finished:false,steps:[{id,label:name,name,argsJson:JSON.stringify(args)}]});
   if(rounds===1)return step('s1','dev.read',{workspaceId:w.id,path:'source.ts'});
   if(rounds===2){assert.equal(session.results.s1.text,'export const actual = 1;\n');return step('s2','dev.replace',{workspaceId:w.id,path:'source.ts',oldText:'actual = 1',newText:'actual = 7',expectedHash:{$ref:'s1.hash'}});}
   if(rounds===3)return step('s3','dev.check',{workspaceId:w.id,command:'test'});
   if(rounds===4){assert.equal(session.results.s3.status,'passed');assert.match(session.results.s3.output,/CHECKED-REAL-CODE/);return step('s4','dev.diff',{workspaceId:w.id,changeId:{$ref:'s2.id'}});}
   assert.match(session.results.s4.after,/actual = 7/);return{reply:'The actual edit and check have been verified',question:'',finished:true,steps:[]};
  });
  await core.operate(session,plan,async(name:string,args:any)=>{let r:any=await f.dev.action({action:name.slice(4),...args,...(name==='dev.replace'||name==='dev.check'?{requestId:randomUUID()}:{})});if(name==='dev.check')r=await wait(()=>f.dev.action({action:'checkStatus',workspaceId:w.id,runId:r.id}),s=>s.settled);return r;},async()=>{},new AbortController().signal);
  assert.equal(session.status,'completed');assert.equal(rounds,5);assert.match(fs.readFileSync(path.join(f.repo,'source.ts'),'utf8'),/actual = 7/);
 }finally{await f.close();}
});
test('the actual assistant adapter refuses to overwrite an unsaved manual source draft before sending a write request',async()=>{
 const source=fs.readFileSync(new URL('../src/prototype/development.js',import.meta.url),'utf8'),DW:any={drafts:{'scope|source.ts':{text:'manual draft'}}},w={id:'scope'};let requests=0;
 const context:any={DW,dwDraftId:(workspace:any,p:string)=>workspace.id+'|'+p,asWaiting:(s:string)=>new Error(s)};
 const clean=vm.runInNewContext(source.slice(source.indexOf('function dwAssertClean('),source.indexOf('\nasync function dwChanges('))+';dwAssertClean',context);
 const invoke=vm.runInNewContext(source.slice(source.indexOf('const dwInvokeBase='),source.indexOf("\nACT['dev.open']"))+';asInvoke',{asInvoke(){throw Error('unexpected fallback')},DW,dwRefresh:async()=>{},dwPanel:{},dwVisible:()=>[w],dwWorkspace:()=>w,asPersist(){},crypto:{randomUUID},dwAssertClean:clean,dwApi:async()=>{requests++;return{}},asContext:()=>({}),dwRender(){},AssistantCore:{public:(x:any)=>x}});
 await assert.rejects(invoke('dev.write',{workspaceId:'scope',path:'source.ts',content:'model replacement',expectedHash:'hash'},{signal:new AbortController().signal,step:{},session:{}}),/手动草稿/);assert.equal(requests,0);assert.equal(DW.drafts['scope|source.ts'].text,'manual draft');
});
test('pausing the actual frontend check adapter stops its real local process and waits for termination before returning',async()=>{
 const f=fixture();try{const w=await f.attach(),started:any=await f.dev.action({action:'check',workspaceId:w.id,command:'build',requestId:randomUUID()}),source=fs.readFileSync(new URL('../src/prototype/development.js',import.meta.url),'utf8'),ac=new AbortController();
 const follow=vm.runInNewContext(source.slice(source.indexOf('async function dwFollowCheck('),source.indexOf('\nasync function dwAttach('))+';dwFollowCheck',{DW:{current:w.id},dwRender(){},dwCheckPaint(){},P:()=>({id:'project'}),dwApi:(action:string,args:any)=>f.dev.action({action,...args}),setTimeout});
 const pending=follow(w,started,ac.signal);const rejection=assert.rejects(pending,(e:any)=>e.name==='AbortError');await wait(async()=>({ready:fs.existsSync(path.join(f.repo,'heartbeat.txt'))}),s=>s.ready);ac.abort();await rejection;
 const status:any=await f.dev.action({action:'checkStatus',workspaceId:w.id,runId:started.id});assert.equal(status.status,'stopped');assert.equal(status.settled,true);assert.match(status.output,/CHILD-STARTED/);
 }finally{await f.close();}
});
test('repeated visual-window clicks share one pending opening rather than race multiple browser sessions',async()=>{
 const source=fs.readFileSync(new URL('../src/prototype/browser-control.js',import.meta.url),'utf8'),VR:any={session:null,sent:new Set(),received:new Set()},AS={ac:null};let creates=0;
 const open=vm.runInNewContext(source.slice(source.indexOf('async function vrOpen('),source.indexOf('\nasync function vrPulse('))+';vrOpen',{VR,AS,asPause(){},hint(){},CP:{runs:new Map()},liveTurns:new Map(),pendingTurns:new Map(),undoS:[],redoS:[],state:{files:[]},vrState:()=>({}),sessionStorage:{setItem(){}},VR_KEY:'fixture',vrRender(){},vrSendFiles:async()=>{},vrStartPolling(){},setTimeout,vrApi:async(action:string)=>{if(action==='create'){creates++;await new Promise(r=>setTimeout(r,15));return{id:'actual-fixture',token:'fixture'}}return{ready:true};}});
 await Promise.all([open(true),open(true)]);assert.equal(creates,1);assert.equal(VR.session.id,'actual-fixture');assert.equal(VR.opening,false);
});
