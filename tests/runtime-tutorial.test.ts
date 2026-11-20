import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {Development} from '../server/development.ts';
import {runtimeLessonSource,runtimeLessonRequirement,runtimeLessonFirst,runtimeLessonOriginal} from '../server/runtime-lesson.ts';
const js=fs.readFileSync(new URL('../src/prototype/runtime-tutorial.js',import.meta.url),'utf8');
const core=vm.runInNewContext(js.split('/* RUNTIME_TUTORIAL_CORE_START */')[1].split('/* RUNTIME_TUTORIAL_CORE_END */')[0]+';RuntimeTutorialCore');
test('the onboarding project really installs its local dependency, changes requirements, tests, serves, packages a verified ZIP and restores source/lock/environment',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-delivery-course-')),dev=new Development(dir);
 try{const w:any=await dev.action({action:'runtimePractice',requestId:randomUUID(),boardId:'lesson-board',projectId:'lesson-project'});assert.equal(w.kind,'runtime-practice');const call=(action:string,a:any={})=>dev.action({action,workspaceId:w.id,...a}) as Promise<any>;
 const cp=await call('checkpoint',{requestId:randomUUID()}),original=await call('read',{path:runtimeLessonSource}),goal=await call('read',{path:runtimeLessonRequirement});
 const settle=async(r:any,preview=false)=>{for(let n=0;n<1000;n++){r=await call('taskStatus',{taskId:r.id});if(preview?r.status==='ready'||r.settled:r.settled)return r;await new Promise(ok=>setTimeout(ok,20));}throw Error('course command timed out');};
 assert.equal((await settle(await call('install',{requestId:randomUUID(),checkpointId:cp.id}))).status,'passed');assert.equal(fs.existsSync(path.join(w.root,'node_modules')),false);
 const apply=async(title:string)=>{for(const name of [runtimeLessonRequirement,runtimeLessonSource]){const r=await call('read',{path:name}),v=JSON.parse(r.text);v.title=title;await call('write',{path:name,content:JSON.stringify(v,null,2)+'\n',expectedHash:r.hash,checkpointId:cp.id,requestId:randomUUID()});}};
 await apply(runtimeLessonFirst);const first=await call('runtimePracticeState');const green=await settle(await call('run',{script:'test',requestId:randomUUID(),checkpointId:cp.id}));assert.equal(green.status,'passed',green.output);assert.equal(green.sourceHash,first.sourceHash);
 const preview=await settle(await call('serve',{script:'preview',requestId:randomUUID(),checkpointId:cp.id}),true);assert.equal(preview.status,'ready',preview.output);const html=await(await fetch(preview.url)).text();assert.match(html,/确认当前版本/);assert.ok(html.includes(preview.id));assert.ok(html.includes(runtimeLessonFirst));assert.match(html,/relay-runtime-lesson-layout/);
 await call('pauseTask',{taskId:preview.id});assert.equal((await settle(preview)).status,'stopped');
 await apply('我亲手更新的发布中心');const second=await call('runtimePracticeState');assert.notEqual(second.sourceHash,first.sourceHash);assert.equal((await settle(await call('run',{script:'test',requestId:randomUUID(),checkpointId:cp.id}))).status,'passed');
 const packed=await settle(await call('package',{script:'package',requestId:randomUUID(),checkpointId:cp.id}));assert.equal(packed.status,'passed',packed.output);const a=packed.artifacts[0],receipt=await call('runtimePracticeArtifact',{taskId:packed.id,artifactId:a.id});assert.equal(receipt.title,'我亲手更新的发布中心');assert.equal(receipt.sha256,a.sha256);assert.equal(receipt.sourceHash,second.sourceHash);
 await apply('后续人工标题');await assert.rejects(call('runtimePracticeArtifact',{taskId:packed.id,artifactId:a.id}),/旧版|当前源码/);
 await call('restoreCheckpoint',{checkpointId:cp.id});assert.equal((await call('read',{path:runtimeLessonSource})).hash,original.hash);assert.equal((await call('read',{path:runtimeLessonRequirement})).hash,goal.hash);const restored=await call('runtimePracticeState');assert.equal(restored.lockHash,'missing');assert.equal(restored.title,runtimeLessonOriginal);assert.equal((await call('runtimeStatus')).environmentId,null);
 }finally{await dev.stopAll();fs.rmSync(dir,{recursive:true,force:true});}
});
test('course creation is idempotent and cannot expand access or change test/build/dependency code',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-course-grants-')),dev=new Development(dir);try{const a={action:'runtimePractice',requestId:randomUUID(),boardId:'b',projectId:'p'},w:any=await dev.action(a);assert.equal((await dev.action(a) as any).id,w.id);await assert.rejects(dev.action({...a,projectId:'another'}),/其他工作区/);
 for(const name of ['package.json','tests/page.test.cjs','scripts/preview.cjs']){const r:any=await dev.action({action:'read',workspaceId:w.id,path:name});await assert.rejects(dev.action({action:'write',workspaceId:w.id,path:name,content:'unreviewed',expectedHash:r.hash,requestId:randomUUID()}),/只读/);}
 await assert.rejects(dev.action({action:'read',workspaceId:w.id,path:'../../.env.local'}));const p=dev.preview(w.root);await assert.rejects(dev.action({action:'attach',directory:w.root,boardId:'b',projectId:'p',writable:true,allowChecks:true,scriptsHash:p.scriptsHash,runtime:{install:true,scripts:['test']}}),/不能扩大/);
 }finally{await dev.stopAll();fs.rmSync(dir,{recursive:true,force:true});}
});
test('lesson gates reject stale tests, bare HTTP, old previews, stops masquerading as success and incomplete rollback',()=>{
 const t:any={step:5,workspaceId:'w',firstHash:'v1',secondHash:'v2',jobs:[{id:'test',kind:'run',script:'test',status:'passed',exitCode:0,sourceHash:'old'}],sourceState:{sourceHash:'v2',title:'New',requiredTitle:'New'},acks:{}};assert.equal(core.done(t),false);t.jobs[0].sourceHash='v1';assert.equal(core.done(t),true);t.step=6;t.jobs.push({id:'p',workspaceId:'w',kind:'serve',status:'ready',sourceHash:'v1'});assert.equal(core.done(t),false);t.acks.p={sourceHash:'v1'};assert.equal(core.done(t),true);t.step=7;assert.equal(core.done(t),false);t.jobs[1].status='stopped';t.jobs[1].settled=true;assert.equal(core.done(t),true);
 t.step=9;assert.equal(core.done(t),false);t.jobs[0].sourceHash='v2';t.jobs[0].status='stopped';assert.equal(core.done(t),false);t.jobs[0].status='passed';assert.equal(core.done(t),true);
 t.step=13;t.restored=true;t.baselineHash='page-original';t.baselineRequirementHash='goal-original';t.environmentId=null;t.sourceState={pageHash:'page-original',requirementHash:'goal-original',lockHash:'missing'};assert.equal(core.done(t),false);t.read={'src/page.json':{hash:'page-original'},'requirements.json':{hash:'goal-original'}};assert.equal(core.done(t),true);
});
test('preview confirmation accepts only the current actual iframe, origin, task, title and source version',()=>{
 const win={},frame={contentWindow:win},task={id:'p',workspaceId:'w',status:'ready',sourceHash:'v2'},t={workspaceId:'w',sourceState:{title:'New',sourceHash:'v2'}},event={source:win,origin:'http://127.0.0.1:50123',data:{type:'relay-runtime-lesson',taskId:'p',title:'New'}};
 assert.equal(core.accepts(t,event,task,frame,event.origin),true);for(const e of [{...event,source:{}},{...event,origin:'https://foreign.example'},{...event,data:{...event.data,taskId:'old'}},{...event,data:{...event.data,title:'Old'}}])assert.equal(core.accepts(t,e,task,frame,event.origin),false);assert.equal(core.accepts(t,event,{...task,sourceHash:'old'},frame,event.origin),false);assert.equal(core.accepts(t,event,{...task,status:'stopped'},frame,event.origin),false);
});

test('the actual coach re-enables Next after the asynchronous requirement write finishes',()=>{
 const body:any={classList:{toggle(){}},append(){}},coach:any={classList:{toggle(){}},parentElement:body,innerHTML:''};
 const t:any={status:'active',step:4,workspaceId:'w',firstHash:'v1',sourceState:{sourceHash:'v1',title:'New',requiredTitle:'New',pageHash:'changed'},baselineHash:'original'};
 const scope:any={RTT:{busy:true,key:'',error:''},rttSession:()=>t,rttActive:()=>true,rttCoach:coach,document:{body},rttDecorate(){},rttPlan:()=>[],RuntimeTutorialCore:core,activityPanel:{},state:{},innerWidth:1280,dwPanel:{hidden:false},dmDecorate(){},rttDraw(){},esc:(s:any)=>s,icon:()=>''};
 vm.runInNewContext(js.slice(js.indexOf('function rttPaint()'),js.indexOf('function rttDraw()'))+';rttPaint();',scope);assert.match(coach.innerHTML,/data-rtt-next disabled/);
 scope.RTT.busy=false;vm.runInNewContext('rttPaint()',scope);assert.doesNotMatch(coach.innerHTML,/data-rtt-next disabled/);
});
