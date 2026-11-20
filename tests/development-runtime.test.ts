import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {Development} from '../server/development.ts';
import vm from 'node:vm';
import {planAssistant} from '../server/studio-assistant.ts';
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-runtime-')),repo=path.join(dir,'project');fs.mkdirSync(repo);execFileSync('git',['init','-q',repo]);
 const files:Record<string,string>={
  'package.json':JSON.stringify({name:'independent-runtime-check',version:'1.0.0',private:true,dependencies:{'local-tool':'file:./packages/tool'},scripts:{test:'node test.cjs',dev:'node serve.cjs',build:'node pack.cjs',package:'node pack.cjs',long:'node long.cjs',pretest:'node hook.cjs',postinstall:'node hook.cjs'}}),
  'source.cjs':'module.exports="ORIGINAL";\n',
  'test.cjs':"console.log(require('local-tool')+':'+require('./source.cjs')); console.log('noKeys='+['OPENAI_API_KEY','RELAY_DESKTOP_TOKEN','NODE_TEST_CONTEXT'].every(k=>!process.env[k]));",
  'serve.cjs':"require('http').createServer((q,s)=>s.end(require('./source.cjs'))).listen(Number(process.env.PORT),'127.0.0.1');console.log('SERVER-ACTUAL');",
  'pack.cjs':"const f=require('fs');f.mkdirSync('dist',{recursive:true});require('child_process').execFileSync('tar',['-czf','dist/project.tar.gz','source.cjs']);console.log('PACKAGED');",
  'hook.cjs':"require('fs').writeFileSync('UNEXPECTED-HOOK','ran');",
  'long.cjs':"require('child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>console.log('DESCENDANT-ALIVE'),50)\"],{stdio:'inherit'});setInterval(()=>{},1000);",
  'packages/tool/package.json':JSON.stringify({name:'local-tool',version:'1.0.0',main:'index.cjs'}),
  'packages/tool/index.cjs':'module.exports="DEPENDENCY-INSTALLED";',
  '.gitignore':'node_modules\ndist\n.env.local\n',
  '.env.local':'DO-NOT-COPY=fixture',
 };
 for(const[n,v]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(repo,n)),{recursive:true});fs.writeFileSync(path.join(repo,n),v);}execFileSync('git',['-C',repo,'add','.']);
 const dev=new Development(path.join(dir,'records'));let w:any;
 const attach=async(granted=true)=>{const p=dev.preview(repo);w=await dev.action({action:'attach',directory:repo,boardId:'b',projectId:'p',writable:true,allowChecks:false,scriptsHash:p.scriptsHash,runtime:{install:granted,scripts:granted?['test','dev','build','package','long']:[]}});return w;};await attach();
 const call=(action:string,args:any={})=>dev.action({action,workspaceId:w.id,...args}) as Promise<any>;
 return{dir,repo,dev,call,attach,get w(){return w},async close(){await dev.stopAll();fs.rmSync(dir,{recursive:true,force:true});}};
}
async function settled(f:Awaited<ReturnType<typeof fixture>>,r:any,preview=false){for(let n=0;n<1200;n++){r=await f.call('taskStatus',{taskId:r.id});if(preview?r.status==='ready'||r.settled:r.settled)return r;await new Promise(r=>setTimeout(r,25));}throw Error('runtime check timed out '+JSON.stringify(r));}
test('any connected npm project can actually install, edit, test, serve, package and restore its whole development checkpoint',async()=>{
 const f=await fixture(),old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-not-a-real-key';try{
  fs.mkdirSync(path.join(f.repo,'node_modules'));fs.writeFileSync(path.join(f.repo,'node_modules','human-owned'),'unchanged');
  const cp=await f.call('checkpoint',{requestId:randomUUID(),label:'Natural language request'}),read=await f.call('read',{path:'source.cjs'});
  await f.call('replace',{checkpointId:cp.id,requestId:randomUUID(),path:read.path,expectedHash:read.hash,oldText:'ORIGINAL',newText:'USER-REQUEST'});
  const install=await settled(f,await f.call('install',{checkpointId:cp.id,requestId:randomUUID()}));assert.equal(install.status,'passed',install.output);assert.ok(install.lockChange.id);assert.ok(fs.existsSync(path.join(f.repo,'package-lock.json')));
  const test=await settled(f,await f.call('run',{checkpointId:cp.id,script:'test',requestId:randomUUID()}));assert.equal(test.status,'passed',test.output);assert.match(test.output,/DEPENDENCY-INSTALLED:USER-REQUEST/);assert.match(test.output,/noKeys=true/);
  const preview=await settled(f,await f.call('serve',{checkpointId:cp.id,script:'dev',requestId:randomUUID()}),true);assert.equal(preview.status,'ready',preview.output);assert.equal(await(await fetch(preview.url)).text(),'USER-REQUEST');assert.match(f.dev.runtime.previewUrl(preview.id),/^http:\/\/127.0.0.1:/);
  await f.call('pauseTask',{taskId:preview.id});await settled(f,preview);assert.throws(()=>f.dev.runtime.previewUrl(preview.id),/停止/);
  const packaged=await settled(f,await f.call('package',{checkpointId:cp.id,script:'package',requestId:randomUUID()}));assert.equal(packaged.status,'passed',packaged.output);assert.equal(packaged.artifacts.length,1);const a=f.dev.runtime.artifact(packaged.id,packaged.artifacts[0].id);assert.equal(a.sha256,createHash('sha256').update(fs.readFileSync(a.file)).digest('hex'));assert.match(execFileSync('tar',['-xOzf',a.file],{encoding:'utf8'}),/USER-REQUEST/);
  assert.equal(fs.readFileSync(path.join(f.repo,'node_modules','human-owned'),'utf8'),'unchanged');assert.ok(!fs.existsSync(path.join(f.repo,'dist')));assert.ok(!fs.existsSync(path.join(f.repo,'UNEXPECTED-HOOK')));
  const summary=await f.call('runtimeStatus');for(const e of fs.readdirSync(path.join(f.dir,'records/runtime/environments')))assert.ok(!fs.existsSync(path.join(f.dir,'records/runtime/environments',e,'.env.local')));
  assert.equal(summary.tasks[0].kind,'package');await f.call('restoreCheckpoint',{checkpointId:cp.id});assert.equal(fs.readFileSync(path.join(f.repo,'source.cjs'),'utf8'),read.text);assert.ok(!fs.existsSync(path.join(f.repo,'package-lock.json')));assert.equal((await f.call('runtimeStatus')).environmentId,null);assert.equal(f.dev.runtime.artifact(packaged.id,a.id).sha256,a.sha256);assert.equal((await f.call('taskStatus',{taskId:packaged.id})).status,'rolledBack');
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;await f.close();}
});
test('runtime grants name actual scripts, dependency edits do not silently expand them, idempotency and restore preserve manual changes',async()=>{
 const f=await fixture();try{
  await f.attach(false);await assert.rejects(f.call('install',{requestId:randomUUID()}),/允许.*安装/);await f.attach();
  const cp=await f.call('checkpoint',{requestId:randomUUID()}),requestId=randomUUID();const r=await f.call('install',{checkpointId:cp.id,requestId});assert.equal((await f.call('install',{checkpointId:cp.id,requestId})).id,r.id);await assert.rejects(f.call('install',{checkpointId:cp.id,requestId,mode:'ci'}),/不同开发动作/);assert.equal((await settled(f,r)).status,'passed');
  const pkg=JSON.parse(fs.readFileSync(path.join(f.repo,'package.json'),'utf8'));pkg.scripts.test='node hook.cjs';fs.writeFileSync(path.join(f.repo,'package.json'),JSON.stringify(pkg));await assert.rejects(f.call('run',{script:'test',requestId:randomUUID()}),/脚本未授权/);
  const src=await f.call('read',{path:'source.cjs'});await f.call('write',{path:src.path,content:'module.exports="AI";',expectedHash:src.hash,requestId:randomUUID(),checkpointId:cp.id});fs.writeFileSync(path.join(f.repo,'source.cjs'),'MANUAL EDIT');await assert.rejects(f.call('restoreCheckpoint',{checkpointId:cp.id}),/人工修改/);assert.equal(fs.readFileSync(path.join(f.repo,'source.cjs'),'utf8'),'MANUAL EDIT');assert.ok(fs.existsSync(path.join(f.repo,'package-lock.json')));
 }finally{await f.close();}
});
test('pause terminates real descendant commands, explicit resume creates a new visible attempt, failed packaging cannot report a missing artifact as success',async()=>{
 const f=await fixture();try{
  const install=await settled(f,await f.call('install',{requestId:randomUUID()}));assert.equal(install.status,'passed');const r=await f.call('run',{script:'long',requestId:randomUUID()});let live;
  for(let n=0;n<500;n++){live=await f.call('taskStatus',{taskId:r.id});if(live.output.includes('DESCENDANT-ALIVE'))break;await new Promise(r=>setTimeout(r,25));}assert.match(live.output,/DESCENDANT-ALIVE/);
  await f.call('pauseTask',{taskId:r.id});const stop=await settled(f,r);assert.equal(stop.status,'stopped');const text=stop.output;await new Promise(r=>setTimeout(r,120));assert.equal((await f.call('taskStatus',{taskId:r.id})).output,text);
  const resumed=await f.call('resumeTask',{taskId:r.id,requestId:randomUUID()});assert.notEqual(resumed.id,r.id);await f.call('pauseTask',{taskId:resumed.id});await settled(f,resumed);
  const fake=await settled(f,await f.call('package',{script:'test',requestId:randomUUID()}));assert.equal(fake.status,'failed');assert.match(fake.message,/未找到/);assert.equal(fake.artifacts.length,0);
 }finally{await f.close();}
});
test('web builds become real ZIP downloads, and an old package cannot make a no-output command look successful',async()=>{
 const f=await fixture();try{
  fs.writeFileSync(path.join(f.repo,'pack.cjs'),"const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html','<h1>'+require('./source.cjs')+'</h1>');");
  assert.equal((await settled(f,await f.call('install',{requestId:randomUUID()}))).status,'passed');
  const p=await settled(f,await f.call('package',{script:'package',requestId:randomUUID()}));assert.equal(p.status,'passed',p.output);assert.equal(p.artifacts[0].name,'project-build.zip');const a=f.dev.runtime.artifact(p.id,p.artifacts[0].id);assert.match(execFileSync('unzip',['-p',a.file,'dist/index.html'],{encoding:'utf8'}),/<h1>ORIGINAL/);
  const old=await settled(f,await f.call('package',{script:'test',requestId:randomUUID()}));assert.equal(old.status,'failed');assert.equal(old.artifacts.length,0);assert.match(old.message,/未找到/);
 }finally{await f.close();}
});
test('the real planner/executor loop uses the general development tools on fresh source observations and returns actual package results without calling a model',async()=>{
 const f=await fixture();try{
  const js=fs.readFileSync(new URL('../src/prototype/assistant.js',import.meta.url),'utf8'),core=vm.runInNewContext(js.split('/* ASSISTANT_CORE_START */')[1].split('/* ASSISTANT_CORE_END */')[0]+';AssistantCore');
  const session:any={steps:[],cursor:0},names=['dev.checkpoint','dev.read','dev.replace','dev.install','dev.run','dev.serve','dev.pauseTask','dev.package','dev.diff'];let round=0;
  const message='Update source.cjs to REQUEST-OMEGA, install, test, preview and package it';
  const plan=()=>planAssistant({message,capabilities:names.map(name=>({name,description:name,params:'workspaceId'})),context:{projects:[],development:[{id:f.w.id,boardId:'b',projectId:'p',name:f.w.name,writable:true,checksAllowed:false,runtime:{installAllowed:true,scripts:['test','dev','package']}}],nextStep:session.steps.length+1,execution:session.steps.map((s:any)=>({id:s.id,name:s.name,status:s.status,summary:s.name,resultJson:JSON.stringify(s.result)}))}},undefined,async(_system,input:any)=>{
   assert.match(_system,/dev\.install/);round++;const step=(id:string,name:string,args:any)=>({id,label:name,name,argsJson:JSON.stringify({workspaceId:f.w.id,...args})}),ref=(id:string,key:string)=>({$ref:id+'.'+key});let steps:any[]=[];
   if(round===1)steps=[step('s1','dev.checkpoint',{label:input.message}),step('s2','dev.read',{path:'source.cjs'})];
   if(round===2){assert.match(session.results.s2.text,/ORIGINAL/);const goal=input.message.match(/to ([A-Z-]+)/)[1];steps=[step('s3','dev.replace',{path:'source.cjs',oldText:'ORIGINAL',newText:goal,expectedHash:ref('s2','hash'),checkpointId:ref('s1','id')}),step('s4','dev.install',{checkpointId:ref('s1','id')}),step('s5','dev.run',{script:'test',checkpointId:ref('s1','id')})];}
   if(round===3){assert.match(session.results.s5.output,/REQUEST-OMEGA/);steps=[step('s6','dev.serve',{script:'dev',checkpointId:ref('s1','id')})];}
   if(round===4){assert.equal(session.results.s6.status,'ready');assert.equal(await(await fetch(session.results.s6.url)).text(),'REQUEST-OMEGA');steps=[step('s7','dev.pauseTask',{taskId:ref('s6','id')}),step('s8','dev.package',{script:'package',checkpointId:ref('s1','id')})];}
   if(round===5){assert.equal(session.results.s8.status,'passed');assert.equal(session.results.s8.artifacts.length,1);steps=[step('s9','dev.diff',{changeId:ref('s3','id')})];}
   if(round===6){assert.match(session.results.s9.after,/REQUEST-OMEGA/);return{reply:'Observed source, real tests, HTTP and actual archive verified; fixture planner only',question:'',finished:true,steps:[]};}
   return{reply:'Fixture planning from actual results, no inference',question:'',finished:false,steps};
  });
  await core.operate(session,plan,async(name:string,args:any)=>{const action=name.slice(4);let r=await f.call(action,{...args,...(['checkpoint','replace','install','run','serve','package'].includes(action)?{requestId:randomUUID()}:{})});if(['install','run','serve','package','pauseTask'].includes(action))r=await settled(f,r,action==='serve');return r;},async()=>{},new AbortController().signal);
  assert.equal(session.status,'completed',session.reason);assert.equal(round,6);assert.equal(session.results.s8.artifacts.length,1);await f.call('restoreCheckpoint',{checkpointId:session.results.s1.id});assert.match(fs.readFileSync(path.join(f.repo,'source.cjs'),'utf8'),/ORIGINAL/);
 }finally{await f.close();}
});
test('the actual frontend adapter resumes a stopped development command once instead of repeatedly showing its old paused receipt',async()=>{
 const f=await fixture();try{
  const cp=await f.call('checkpoint',{requestId:randomUUID()}),old=await f.call('install',{checkpointId:cp.id,requestId:randomUUID()});await f.call('pauseTask',{taskId:old.id});await settled(f,old);
  const source=fs.readFileSync(new URL('../src/prototype/development-runtime.js',import.meta.url),'utf8'),adapter=source.slice(source.indexOf('const drInvokeBase=asInvoke;'),source.indexOf('const drPauseBase=asPause;'));
  const scope:any={asInvoke:()=>{throw Error('Unexpected fallback')},DW:{list:[f.w]},DR:{checkpoint:{}},dwVisible:()=>[f.w],dwRefresh:async()=>{},dwPanel:{hidden:true},drClean:()=>{},drSessionCheckpoint:()=>cp.id,drRefresh:async()=>{},dwRender:()=>{},asPersist:()=>{},dwApi:(a:string,b:any)=>f.call(a,b),drFollow:(_w:any,r:any)=>settled(f,r),crypto:{randomUUID},AssistantCore:{public:(x:any)=>x},asWaiting:(s:string)=>Error(s)};vm.runInNewContext(adapter,scope);
  const step:any={checkpoint:{runtimeTaskId:old.id}},session:any={};const r=await scope.asInvoke('dev.install',{workspaceId:f.w.id},{step,session,signal:new AbortController().signal});assert.equal(r.status,'passed',r.output);assert.notEqual(r.id,old.id);assert.equal(step.checkpoint.runtimeTaskId,r.id);assert.equal((await f.call('runtimeStatus')).tasks.length,2);
  const checked=await scope.asInvoke('dev.check',{workspaceId:f.w.id,command:'test'},{step:{},session,signal:new AbortController().signal});assert.equal(checked.kind,'run');assert.equal(checked.status,'passed');assert.match(checked.output,/DEPENDENCY-INSTALLED/);
 }finally{await f.close();}
});
test('opening the real-project or assistant preparation entry cannot fall through into starting a runtime command',()=>{
 const js=fs.readFileSync(new URL('../src/prototype/development-runtime.js',import.meta.url),'utf8'),start=js.indexOf("document.addEventListener('click',e=>{const t=e.target.closest('button')"),end=js.indexOf("document.addEventListener('click',e=>{const a=e.target.closest('[data-dr-download]')",start);let handler:any;let workspaces=0;
 vm.runInNewContext(js.slice(start,end),{document:{addEventListener:(_event:string,h:any)=>{handler=h}},dwWorkspace:()=>{workspaces++;throw Error('Preparation must not start a runtime command')}});
 for(const entry of ['data-dr-begin','data-dr-assistant'])handler({target:{closest:()=>({attributes:[{name:entry}],hasAttribute:(name:string)=>name===entry,matches:()=>false})}});assert.equal(workspaces,0);
});
