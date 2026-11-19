import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {planAssistant} from '../server/studio-assistant.ts';
const source=await fs.readFile(new URL('../src/prototype/assistant.js',import.meta.url),'utf8'),software=await fs.readFile(new URL('../src/prototype/software-operator.js',import.meta.url),'utf8');
const c=vm.runInNewContext(source.split('/* ASSISTANT_CORE_START */')[1].split('/* ASSISTANT_CORE_END */')[0]+';AssistantCore');
const tools=vm.runInNewContext(software.split('/* SOFTWARE_TOOLS_CORE_START */')[1].split('/* SOFTWARE_TOOLS_CORE_END */')[0]+';SoftwareToolsCore',{TextEncoder,AssistantCore:c});
const step=(id:string,name:string,args:any={})=>({id,name,args,label:name,effect:'local'}),answer=(steps:any[],reply='将执行')=>({reply,question:'',steps,finished:!steps.length});
test('software operator reads actual content, reasons on observed results, writes a file and verifies before reporting completion',async()=>{
 const s:any={steps:[],cursor:0},nonce='OBSERVED-6b43',files:any[]=[];let calls=0;
 const plan=async()=>{calls++;if(calls===1)return answer([step('s1','read')]);if(calls===2){assert.equal(s.results.s1.text,nonce);return answer([step('s2','write',{text:s.results.s1.text})]);}assert.equal(files[0].text,nonce);return answer([],'文件已经保存并核对')};
 await c.operate(s,plan,async(name:string,args:any)=>{if(name==='read')return{text:nonce};files.push(args);return{fileId:'ACTUAL-FILE',message:'saved'}},async()=>{},new AbortController().signal);
 assert.equal(s.status,'completed');assert.equal(s.rounds,3);assert.equal(s.finalReply,'文件已经保存并核对');assert.equal(files.length,1);
});
test('pausing before post-action analysis preserves observations; continuing never rereads or recreates completed work',async()=>{
 const s:any={steps:[],cursor:0},ac=new AbortController();let reads=0,writes=0;
 const plan=async()=>!s.results.s1?answer([step('s1','read')]):!s.results.s2?answer([step('s2','write')]):answer([]);
 const invoke=async(name:string)=>{if(name==='read'){reads++;ac.abort();return{text:'actual input'}}writes++;return{fileId:'created'}};
 await c.operate(s,plan,invoke,async()=>{},ac.signal);assert.equal(s.status,'paused');assert.equal(s.cursor,1);
 await c.operate(s,plan,invoke,async()=>{},new AbortController().signal);assert.equal(s.status,'completed');assert.equal(reads,1);assert.equal(writes,1);
});
test('local failure is observed and pending dependent actions are replaced instead of blindly executed',async()=>{
 const s:any={steps:[],cursor:0},seen:string[]=[];let plans=0;
 const plan=async()=>{plans++;if(plans===1)return answer([step('s1','missing'),step('s2','unsafe-dependent')]);if(plans===2){assert.match(s.steps[0].error,/不存在/);return answer([step('s3','inspect-latest')]);}return answer([])};
 await c.operate(s,plan,async(name:string)=>{seen.push(name);if(name==='missing')throw new Error('旧对象不存在');return{message:'actual state'}},async()=>{},new AbortController().signal);
 assert.deepEqual(seen,['missing','inspect-latest']);assert.equal(s.steps[1].status,'replanned');assert.equal(s.steps[0].status,'failed');assert.equal(s.status,'completed');
});
test('observations preserve file pagination and redact credentials before returning data to the planner',()=>{
 const text='实际文件正文：'.repeat(1000);let start=0,result='';for(;;){const p=tools.page(text,start,777);result+=p.text;if(p.complete)break;start=p.nextStart;}assert.equal(result,text);assert.equal(tools.page(text,999999,777).range.start,text.length);
 const rows=tools.observations([{id:'s1',name:'inspect',status:'done',result:{text:'body',apiKey:'hidden-key',password:'hidden-password',nested:'sk-'+ 'a'.repeat(24)}}]);assert.match(rows[0].resultJson,/body/);assert.doesNotMatch(rows[0].resultJson,/hidden-key|hidden-password|sk-aaaa/);
});
test('updated requirements interrupt current work and preserve completed actions rather than start a replacement workspace',async()=>{
 const s:any={operator:true,steps:[{id:'s1',status:'done'},{id:'s2',status:'paused'}],cursor:1,request:'original goal'},AS:any={ac:null,draft:'new'},seen:any[]=[];
 const fn=software.slice(software.indexOf('async function asSteer('),software.indexOf('\nfor(const name of'));
 const steer=vm.runInNewContext(fn+';asSteer',{AS,asSession:()=>s,asPause:()=>seen.push('pause'),asPersist(){},asExecute:(session:any)=>seen.push(session),asAsk(){throw new Error('must not create another task')},setTimeout});
 await steer('只处理现有项目，不再创建新的');assert.equal(s.steps[0].status,'done');assert.equal(s.steps[1].status,'replanned');assert.equal(s.cursor,2);assert.equal(s.followups[0],'只处理现有项目，不再创建新的');assert.equal(seen[1],s);
});
test('planner can reference observed prior results, receives current user corrections, and never receives credential fields',async()=>{
 let received:any;const request={message:'根据文件继续整理',context:{projects:[],nextStep:2,followups:['保持我手动修改的职责'],execution:[{id:'s1',name:'assistant.read',status:'done',summary:'read',resultJson:JSON.stringify({fileId:'actual',text:'ACTUAL-BODY',apiKey:'PRIVATE-KEY'})}]},capabilities:[{name:'reader.open',description:'open',params:'fileId'}]};
 const result=await planAssistant(request,undefined,async(_s,u)=>{received=u;return{reply:'将打开真实文件',question:'',finished:false,steps:[{id:'s2',label:'展示',name:'reader.open',argsJson:'{"fileId":{"$ref":"s1.fileId"}}'}]}});
 assert.equal(result.steps[0].args.fileId.$ref,'s1.fileId');assert.match(JSON.stringify(received),/ACTUAL-BODY|保持我手动/);assert.doesNotMatch(JSON.stringify(received),/PRIVATE-KEY/);
 await assert.rejects(()=>planAssistant(request,undefined,async()=>({reply:'完成',question:'',finished:true,steps:[{id:'s2',label:'展示',name:'reader.open',argsJson:'{"fileId":"actual"}'}]})),/完成报告/);
});
test('each execution receives fresh step grants instead of inheriting another task with the same step ids',async()=>{
 const fn=source.slice(source.indexOf('async function asExecute('),source.indexOf('\nasync function asAsk(')),AS:any={ac:null,approved:new Set(['s1'])};let ran=0;
 const execute=vm.runInNewContext(fn+';asExecute',{AS,guideAC:null,AbortController,asPersist(){},asInvoke:async()=>{ran++;return{}},AssistantCore:c});
 const s:any={steps:[{...step('s1','paid'),effect:'model'}],cursor:0};await execute(s);assert.equal(ran,0);assert.equal(s.status,'waiting');await execute(s,true);assert.equal(ran,1);
});
test('saving a deliverable returns its actual file id and retrying a recorded save never creates a duplicate',async()=>{
 const fn=software.slice(software.indexOf('async function operatorWrite('),software.indexOf('\nfunction operatorWindow(')),state:any={activeBoard:'b',boards:[{id:'b'}],files:[]},ctx:any={signal:new AbortController().signal,step:{}},project={id:'p',boardId:'b',name:'project',space:{x:0,y:0,r:130}};let writes=0;
 const write=vm.runInNewContext(fn+';operatorWrite',{state,rp:()=>project,File,asPersist(){},save(){},addFiles:async(files:any[])=>{writes++;state.files.push({id:'ACTUAL-SAVED',name:files[0].name,boardId:'b'})}});
 const args={name:'交付.md',text:'实际的分析正文',projectId:'p'};const a=await write(args,ctx),b=await write(args,ctx);assert.equal(a.fileId,'ACTUAL-SAVED');assert.equal(b.fileId,'ACTUAL-SAVED');assert.equal(writes,1);await assert.rejects(()=>write({...args,name:'../secret.txt'},{signal:ctx.signal,step:{}}),/路径/);
});
test('software stop waits for its actual backend state and cancels only the selected project turns',async()=>{
 const fn=software.slice(software.indexOf('async function operatorStop('),software.indexOf('\nconst operatorInvokeBase=')),p={id:'p',coordinator:{id:'c'},members:[{id:'m'}]},liveTurns=new Map(),pendingTurns=new Map(),a=new AbortController(),b=new AbortController(),calls:any[]=[];
 liveTurns.set('m',{ac:a});liveTurns.set('foreign',{ac:b});a.signal.addEventListener('abort',()=>liveTurns.delete('m'));
 const stop=vm.runInNewContext(fn+';operatorStop',{state:{groups:[]},rp:()=>p,CP:{runs:new Map(),preparing:new Map()},cpCurrent:()=>({id:'own',status:'running'}),cpLive:()=>true,liveTurns,pendingTurns,halt(){},cpApi:async(action:string,args:any)=>{calls.push({action,args});return{id:'own',status:'stopped'}},cpApply(){},asDelay:async()=>{}});
 const r=await stop('run.stopAll',{projectId:'p'},new AbortController().signal);assert.equal(r.runId,'own');assert.match(r.message,/实际流程已停止/);assert.equal(calls.length,1);assert.equal(calls[0].args.id,'own');assert.ok(!b.signal.aborted);
});
