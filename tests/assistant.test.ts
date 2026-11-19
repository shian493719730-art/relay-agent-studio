import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {planAssistant,assistantEffect} from '../server/studio-assistant.ts';
import {AuthBridge} from '../server/auth-bridge.ts';
async function core(file:string,tag:string,name:string){const s=await fs.readFile(new URL('../src/prototype/'+file,import.meta.url),'utf8');return vm.runInNewContext(s.split('/* '+tag+'_START */')[1].split('/* '+tag+'_END */')[0]+';'+name)}
const request={message:'建两个项目，不开工',context:{activeBoardId:'b',boards:[{id:'b',name:'work'}],projects:[{id:'p',boardId:'b',name:'project',goal:'goal',coordinatorId:'coord',members:[],x:0,y:0}],files:[{id:'f',boardId:'b',pid:null,name:'brief.docx',body:'PRIVATE BODY'}],apiKey:'PRIVATE KEY'},capabilities:[{name:'project.create',description:'create',params:'name'},{name:'assistant.start',description:'start',params:'projectId,text'}]};
test('assistant plans real result references, strips private payloads and rejects invented or forward actions',async()=>{
 let sent:any;const output={reply:'将建立',question:'',steps:[{id:'s1',label:'新项目',name:'project.create',argsJson:'{"name":"new"}'},{id:'s2',label:'开工',name:'assistant.start',argsJson:'{"projectId":{"$ref":"s1.projectId"},"text":"task"}'}]};
 const d=await planAssistant(request,undefined,async(_s,u)=>{sent=u;return output});assert.equal(d.steps[1].effect,'model');assert.equal(d.steps[1].args.projectId.$ref,'s1.projectId');assert.doesNotMatch(JSON.stringify(sent),/PRIVATE BODY|PRIVATE KEY/);
 await assert.rejects(()=>planAssistant(request,undefined,async()=>({...output,steps:[{...output.steps[0],name:'shell.exec'}]})),/未提供/);
 await assert.rejects(()=>planAssistant(request,undefined,async()=>({...output,steps:[{...output.steps[0],argsJson:'{"projectId":{"$ref":"s2.projectId"}}'}]})),/前|完成/);
 await assert.rejects(()=>planAssistant(request,undefined,async()=>({...output,steps:[{...output.steps[0],argsJson:'{"__proto__":{"polluted":true}}'}]})),/字段/);
 assert.equal(assistantEffect('auth.request'),'authorization');
 const edit=await planAssistant({...request,capabilities:[{name:'undo',description:'undo',params:''},{name:'run.stopAll',description:'stop',params:'projectId'}]},undefined,async()=>({reply:'将撤销',question:'',steps:[{id:'s1',label:'撤销',name:'undo',argsJson:'{}'}]}));assert.equal(edit.steps[0].name,'undo');
});
test('actual assistant executor pauses after an atomic action and resumes without recreating completed objects',async()=>{
 const c=await core('assistant.js','ASSISTANT_CORE','AssistantCore'),s:any={steps:[{id:'s1',name:'create',args:{},effect:'local'},{id:'s2',name:'update',args:{projectId:{$ref:'s1.projectId'}},effect:'local'}]},calls:any[]=[],ac=new AbortController();
 const invoke=async(name:string,args:any)=>{calls.push({name,args});if(name==='create'){ac.abort();return{projectId:'ACTUAL-ID'}}return{updated:true}};
 await c.run(s,invoke,async()=>{},ac.signal);assert.equal(s.cursor,1);assert.equal(s.status,'paused');assert.equal(calls.length,1);
 await c.run(s,invoke,async()=>{},new AbortController().signal);assert.equal(s.status,'completed');assert.equal(calls.length,2);assert.equal(calls[1].args.projectId,'ACTUAL-ID');
});
test('model gates cannot execute without an explicit step grant; missing observations stop downstream actions',async()=>{
 const c=await core('assistant.js','ASSISTANT_CORE','AssistantCore'),s:any={steps:[{id:'s1',name:'paid',args:{},effect:'model'}]},ac=new AbortController();let calls=0;
 await c.run(s,async()=>{calls++;return{}},async()=>{},ac.signal);assert.equal(calls,0);assert.equal(s.status,'waiting');
 await c.run(s,async()=>{calls++;return{runId:'real'}},async()=>{},ac.signal,new Set(['s1']));assert.equal(calls,1);assert.equal(s.status,'completed');
 const bad:any={steps:[{id:'s1',name:'update',args:{projectId:{$ref:'absent.projectId'}},effect:'local'},{id:'s2',name:'next',args:{},effect:'local'}]};await c.run(bad,async()=>{calls++;return{}},async()=>{},ac.signal);assert.equal(bad.status,'failed');assert.equal(calls,1);
});
test('authorization bridge scopes tasks to this app, never grants permission and does not expose secrets',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'relay-auth-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const id=crypto.randomUUID(),foreign=crypto.randomUUID(),gate=crypto.randomUUID(),calls:any[]=[];let enabled=false;const rows:any[]=[{id:foreign,origin:'https://private.example/path?token=SECRET',checkpoint:'PRIVATE',password:'SECRET'}];
 const overview=async()=>({installed:true,connected:true,enabled,activeTasks:0,scope:['example.org'],smsPhase:'idle'});
 const bridge=new AuthBridge(path.join(dir,'owned.json'),async(route,body:any)=>{calls.push({route,body});if(route==='/api/status')return{tasks:rows,token:'SECRET',smsText:'OTP SECRET'};if(route==='/api/tool'){assert.equal(body.name,'auth_open');const task={id,origin:'https://example.org/private?token=SECRET',status:'needs_user',gateId:gate,checkpoint:body.arguments.checkpoint,password:'SECRET'};rows.push(task);return task}return{}},overview);
 const input={action:'request',url:'https://example.org/work',title:'work',clientRequestId:crypto.randomUUID()};await assert.rejects(()=>bridge.action(input),/暂停/);assert.equal(calls.length,0);enabled=true;
 const opened=await bridge.action(input);assert.equal(opened.id,id);await bridge.action(input);assert.equal(calls.filter(c=>c.route==='/api/tool').length,1);
 const status=await bridge.status();assert.equal(status.tasks.length,1);assert.equal(status.otherTaskCount,1);assert.doesNotMatch(JSON.stringify(status),/SECRET|PRIVATE|password|smsText|private\.example/);
 await assert.rejects(()=>bridge.action({action:'cancel',taskId:foreign}),/本软件/);assert.throws(()=>bridge.action({action:'enable',allHttps:true}));
 await bridge.action({action:'resume',taskId:id});assert.deepEqual(calls.at(-1).body,{gateId:gate});assert.ok(!calls.some(c=>/permission|grant|sms/.test(c.route)));
});
test('lost authorization replies are reconciled from the recorded nonce instead of replaying site opening',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'relay-auth-lost-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let opens=0;const rows:any[]=[];const id=crypto.randomUUID(),bridge=new AuthBridge(path.join(dir,'map.json'),async(route,body:any)=>{if(route==='/api/status')return{tasks:rows};opens++;rows.push({id,origin:'https://example.org',status:'running',checkpoint:body.arguments.checkpoint});throw new Error('lost reply')},async()=>({installed:true,connected:true,enabled:true,scope:[],activeTasks:0,smsPhase:'idle'}));const input={action:'request',url:'https://example.org',title:'work',clientRequestId:crypto.randomUUID()};await assert.rejects(()=>bridge.action(input),/lost/);const r=await bridge.action(input);assert.equal(r.id,id);assert.equal(opens,1);
});
test('new feature tour gates on visible work and the old tutorial guard blocks real assistant/auth calls',async()=>{
 const f=await core('feature-tour.js','FEATURE_CORE','FeatureCore'),t={step:0,projectId:'a',reviewId:'b',flags:{}},s={projects:[{id:'a'}]};assert.equal(f.done(s,t,{}),false);s.projects.push({id:'b'});assert.equal(f.done(s,t,{}),true);t.step=1;assert.equal(f.done(s,t,{status:'completed'}),false);t.flags={paused:true};assert.equal(f.done(s,t,{status:'completed'}),true);
 const tutorial=await core('tutorial.js','TUTORIAL_CORE','TutorialCore');assert.equal(tutorial.steps.length,19);assert.equal(tutorial.blocksRequest('/api/studio/assistant',{},true),true);assert.equal(tutorial.blocksRequest('/api/studio/auth',{action:'request'},true),true);assert.equal(tutorial.blocksRequest('/api/studio/auth',null,true),false);assert.equal(tutorial.blocksRequest('/api/studio/library',{action:'refresh'},true),true);
});
test('AI style patches preserve every hand positioned component and unspecified visual choice',async()=>{
 const c=await core('workspace-editor.js','WORKSPACE_CORE','WorkspaceCore'),before={appearance:{paperColor:'#ffffff',fontSize:16},layout:{shelf:{x:137,y:221,width:360},tools:{visible:false}}};const after=c.patch(before,{blur:8});assert.equal(after.appearance.blur,8);assert.equal(after.appearance.fontSize,16);assert.equal(JSON.stringify(after.layout),JSON.stringify(before.layout));assert.equal(Object.hasOwn(before.appearance,'blur'),false);
});
test('visual editing accepts bounded values and rejects CSS payloads or unknown components',async()=>{
 const c=await core('workspace-editor.js','WORKSPACE_CORE','WorkspaceCore');assert.throws(()=>c.appearance({paperColor:'url(https://evil.test)'}),/颜色/);assert.throws(()=>c.appearance({opacity:0}),/范围/);assert.throws(()=>c.appearance({position:'fixed'}),/字段/);assert.throws(()=>c.layout({},'__proto__',{x:20},800,600),/组件/);const b=c.layout({x:20,y:30,visible:true},'shelf',{width:9999},503,725);assert.equal(b.width,487);assert.equal(b.x,20);assert.equal(b.y,30);
});
test('assistant team pause and resume keeps one run and never pauses unrelated projects',async()=>{
 const source=await fs.readFile(new URL('../src/prototype/assistant.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function asStart('),source.indexOf('\nfunction asPause('));
 const project={id:'p',boardId:'b'},calls:any[]=[],step:any={},session:any={};let ac=new AbortController();
 const run:any={id:'owned',status:'running',steps:[],projects:[{status:'completed'}]};let pauses=0;
 const start=vm.runInNewContext(fn+';asStart',{
  state:{groups:[]},rp:()=>project,P:()=>project,asCloseAux(){},renderAll(){},asPersist(){},cpApply(){},crypto,
  cpSnapshot:()=>({projects:[{files:[]}]}),dfUploadRefs:async()=>[],
  cpApi:async(action:string,args:any)=>{calls.push({action,args});if(action==='list')return[{id:'other',clientRequestId:'other'}];if(action==='start'){run.clientRequestId=args.run.clientRequestId;return run}if(action==='pause'){pauses++;run.status='paused';return run}if(action==='resume'){run.status='running';return run}return run},
  asDelay:async()=>{if(!pauses){ac.abort();throw new DOMException('paused','AbortError')}run.status='completed'},
  asWaiting:(msg:string)=>new Error(msg)
 });
 await assert.rejects(()=>start({projectId:'p',text:'task'},{signal:ac.signal,step,session}),/paused/);
 assert.equal(step.checkpoint.runId,'owned');assert.equal(pauses,1);ac=new AbortController();
 const r=await start({projectId:'p',text:'task'},{signal:ac.signal,step,session});
 assert.equal(r.completedProjects,1);assert.equal(calls.filter(c=>c.action==='start').length,1);
 assert.deepEqual(calls.filter(c=>c.action==='pause'||c.action==='resume').map(c=>c.args.id),['owned','owned']);
 assert.equal(session.ownedRunIds[0],'owned');assert.equal(step.checkpoint.requestId,run.clientRequestId);
});
test('new connected groups expose the actual coordinator group reference for later model binding',async()=>{
 const source=await fs.readFile(new URL('../src/prototype/assistant.js',import.meta.url),'utf8'),fragment=source.slice(source.indexOf('function asDiff('),source.indexOf('function asWaiting('));
 const state:any=Object.fromEntries(['boards','projects','notes','links','clusters','bundleLinks','files','groups'].map(k=>[k,[]]));
 const api=vm.runInNewContext(fragment+';({asDiff,asBefore})',{state,P:()=>null});const before=api.asBefore();state.groups.push({id:'observed-group'});state.links.push({id:'observed-link'});const receipt=api.asDiff(before);assert.equal(receipt.groupId,'observed-group');assert.equal(receipt.linkId,'observed-link');
 assert.equal(assistantEffect('collaboration.resume'),'model');
});
