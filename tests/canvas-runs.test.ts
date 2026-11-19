import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {CanvasRuns,type CanvasTarget} from '../server/canvas-runs.ts';
import {ModelConnections} from '../server/model-connections.ts';
import type {StepExecutor} from '../server/runner.ts';

const member=(id:string)=>({id,name:id,role:'完成自己的分工',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture-claude'});
const project=(id:string)=>({id,name:id,summary:id+'公开目标',coordinator:member(id+'-coord'),members:[member(id+'-one'),member(id+'-two')],msgs:[],files:[],artifacts:[],incoming:[]});
const edge=(src:string,dst:string,extra:any={})=>({id:src+dst,src,dst,name:src+'→'+dst,state:'on',trigger:'done',keyword:'',share:{summary:false,artifacts:true,noteIds:[]},...extra});
const input=(extra:any={})=>({boardId:'board',rootProjectId:'A',request:'完成本轮工作',projects:[project('A'),project('B')],links:[edge('A','B')],notes:[],clientRequestId:crypto.randomUUID(),...extra});
const wait=async(check:()=>boolean)=>{for(let i=0;i<1000;i++){if(check())return;await new Promise(r=>setTimeout(r,2))}throw new Error('wait timed out')};
async function harness(t:any,hook?:(...args:Parameters<StepExecutor>)=>Promise<string|undefined>){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-runs-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const connections=new ModelConnections(root,()=> 'fixture-key');const calls:{id:string,input:string}[]=[];
 const execute:StepExecutor=async(step,packet,ctx)=>{calls.push({id:step.agent.id,input:packet});assert.equal(ctx.artifactTools,false);step.inputTokens=7;step.outputTokens=4;const custom=await hook?.(step,packet,ctx);if(custom!==undefined)return custom;
  if(packet.includes('仅输出JSON对象：{"projectTasks"'))return JSON.stringify({projectTasks:['A','B'].map(projectId=>({projectId,task:'组统筹给'+projectId+'的任务'}))});
  if(packet.includes('仅输出JSON对象：{"assignments"')){const pid=step.agent.id.split('-')[0];return JSON.stringify({assignments:[{memberId:pid+'-one',task:'PLAN_'+pid+'_TASK_ONE'},{memberId:pid+'-two',task:'PLAN_'+pid+'_TASK_TWO'}],acceptance:'VERIFY_'+pid})}
  if(step.agent.role==='work')return'REAL_WORK_'+step.agent.id;
  if(step.agent.id==='group-coord')return'GROUP_FINAL';
  return'PUBLIC_FINAL_'+step.agent.id.split('-')[0];
 };
 return{root,connections,calls,service:new CanvasRuns(path.join(root,'runs'),connections,execute)};
}

test('real pipeline uses planner assignments, both worker outputs, final synthesis, then shared downstream work',async t=>{
 const h=await harness(t),r=h.service.start(input());await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.length,8);
 assert.match(h.calls.find(c=>c.id==='A-one')!.input,/PLAN_A_TASK_ONE/);assert.doesNotMatch(h.calls.find(c=>c.id==='A-one')!.input,/PLAN_A_TASK_TWO/);
 const aFinal=h.calls.filter(c=>c.id==='A-coord').at(-1)!;assert.match(aFinal.input,/REAL_WORK_A-one/);assert.match(aFinal.input,/REAL_WORK_A-two/);
 const bPlan=h.calls.find(c=>c.id==='B-coord')!;assert.match(bPlan.input,/PUBLIC_FINAL_A/);assert.match(bPlan.input,/REAL_WORK_A-one/);assert.match(bPlan.input,/REAL_WORK_A-two/);assert.equal(r.deliveries[0].items.length,3);assert.deepEqual(r.deliveries[0].path,['A','B']);assert.equal(r.projects[1].result,'PUBLIC_FINAL_B');
 assert.ok(r.steps.every(s=>s.status==='completed'));assert.equal(new Set(r.steps.map(s=>s.id)).size,8);
});

test('shared context excludes private source requests/history, unselected notes and unfinished artifacts',async t=>{
 const h=await harness(t),d=input({request:'PRIVATE_REQUEST'});(d.projects[0].msgs as any[]).push({from:'me',text:'PRIVATE_CHAT'});(d.projects[0].artifacts as any[]).push({id:'draft',text:'PRIVATE_DRAFT',done:false});d.notes=[{id:'public',pid:'A',text:'ALLOWED_NOTE'},{id:'private',pid:'A',text:'PRIVATE_NOTE'}];d.links=[edge('A','B',{share:{summary:true,artifacts:false,noteIds:['public']}})];
 const r=h.service.start(d);await h.service.settled(r.id);assert.equal(r.status,'completed');const b=h.calls.filter(c=>c.id.startsWith('B-')).map(c=>c.input).join('\n');assert.match(b,/ALLOWED_NOTE/);assert.doesNotMatch(b,/PRIVATE_/);assert.doesNotMatch(b,/PUBLIC_FINAL_A/);
});

test('pause aborts active generation, preserves partial output, and resume does not repeat completed stages',async t=>{
 let attempts=0,started=false;const h=await harness(t,async(step,packet,ctx)=>{if(step.agent.id==='A-one'&&attempts++===0){step.text='KEPT_PARTIAL';ctx.update();started=true;await new Promise((_r,reject)=>ctx.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}return undefined});
 const r=h.service.start(input({projects:[project('A')],links:[]}));await wait(()=>started);await h.service.pause(r.id);await h.service.settled(r.id);assert.equal(r.status,'paused');assert.equal(r.steps.find(s=>s.member.id==='A-one')!.text,'KEPT_PARTIAL');
 const plannerCalls=h.calls.filter(c=>c.id==='A-coord').length;await h.service.resume(r.id);await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.filter(c=>c.id==='A-coord').length,plannerCalls+1);assert.equal(r.steps.find(s=>s.member.id==='A-one')!.attempts[0].text,'KEPT_PARTIAL');assert.match(h.calls.filter(c=>c.id==='A-one').at(-1)!.input,/KEPT_PARTIAL/);
});

test('paused link holds pending delivery until explicit flow continuation, and completed source never reruns',async t=>{
 const h=await harness(t),d=input();d.links[0].state='paused';const r=h.service.start(d);await h.service.settled(r.id);assert.equal(r.status,'blocked');assert.equal(r.deliveries.length,0);assert.equal(h.calls.filter(c=>c.id.startsWith('B-')).length,0);
 h.service.updateLink(r.id,'AB',{state:'on'});await new Promise(r=>setTimeout(r,10));assert.equal(h.calls.length,4);await h.service.resume(r.id);await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.filter(c=>c.id.startsWith('A-')).length,4);assert.equal(r.deliveries.length,1);
});

test('fan-in waits for both branches, executes destination once and cyclic edges never loop',async t=>{
 const h=await harness(t);const r=h.service.start(input({projects:['A','B','C','D'].map(project),links:[edge('A','B'),edge('A','C'),edge('B','D'),edge('C','D'),edge('D','A')]}));await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.filter(c=>c.id==='D-coord').length,2);const dPlan=h.calls.find(c=>c.id==='D-coord')!.input;assert.match(dPlan,/PUBLIC_FINAL_B/);assert.match(dPlan,/PUBLIC_FINAL_C/);assert.equal(r.deliveries.filter(d=>d.to==='A').length,0);
});

test('stop prevents downstream and server restart preserves an interrupted checkpoint without calls',async t=>{
 let started=false;const h=await harness(t,async(step,_p,ctx)=>{if(step.agent.id==='A-one'){step.text='STOP_PARTIAL';ctx.update();started=true;await new Promise((_r,reject)=>ctx.signal.addEventListener('abort',()=>reject(new Error('stop')),{once:true}));}return undefined});const r=h.service.start(input());await wait(()=>started);await h.service.stop(r.id);await h.service.settled(r.id);assert.equal(r.status,'stopped');assert.equal(h.calls.some(c=>c.id.startsWith('B-')),false);
 const file=path.join(h.root,'runs',r.id+'.json'),saved=JSON.parse(await fs.readFile(file,'utf8'));saved.status='running';await fs.writeFile(file,JSON.stringify(saved));let calls=0;const restored=new CanvasRuns(path.join(h.root,'runs'),h.connections,async()=>{calls++;return'bad'});assert.equal(restored.get(r.id).status,'interrupted');assert.equal(calls,0);assert.ok(restored.get(r.id).steps.some(s=>s.text==='STOP_PARTIAL'));
});

test('duplicate submissions are idempotent and conflicting project workflows are rejected',async t=>{
 let started=false;const h=await harness(t,async(step,_p,ctx)=>{if(step.agent.id==='A-one'){started=true;await new Promise((_r,reject)=>ctx.signal.addEventListener('abort',()=>reject(new Error('stop')),{once:true}));}return undefined});const d=input(),r=h.service.start(d);assert.equal(h.service.start(d).id,r.id);assert.throws(()=>h.service.start(input()),/已有协作/);await wait(()=>started);await h.service.stop(r.id);await h.service.settled(r.id);
});

test('manual handoff starts at destination with only selected source contents',async t=>{
 const h=await harness(t),d=input({rootProjectId:'B',manualLinkId:'AB'});d.projects[0].artifacts=[{id:'approved',text:'MANUAL_SHARED',done:true,executionSource:'api'}];const r=h.service.start(d);await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.some(c=>c.id.startsWith('A-')),false);assert.match(h.calls.find(c=>c.id==='B-coord')!.input,/MANUAL_SHARED/);assert.equal(r.deliveries[0].from,'A');
});

test('cross-project coordinator actually plans project work and synthesizes completed results',async t=>{
 const h=await harness(t),r=h.service.start(input({rootProjectId:undefined,group:{id:'g',coordinator:member('group-coord')}}));await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(h.calls.filter(c=>c.id==='group-coord').length,2);assert.match(h.calls.find(c=>c.id==='A-coord')!.input,/组统筹给A的任务/);assert.match(h.calls.filter(c=>c.id==='group-coord').at(-1)!.input,/PUBLIC_FINAL_B/);assert.equal(r.result,'GROUP_FINAL');
});

test('dependent workers wait for predecessors and read their actual completed output',async t=>{
 const h=await harness(t,async(step,packet)=>{
  if(step.agent.id==='A-coord'&&step.agent.role==='plan')return JSON.stringify({assignments:[{memberId:'A-one',task:'generate fresh code',dependsOn:[]},{memberId:'A-two',task:'review actual code',dependsOn:['A-one']}],acceptance:'same code'});
  if(step.agent.id==='A-one')return 'FRESH_SOURCE_UNKNOWN_IN_REQUEST';
  if(step.agent.id==='A-two'){assert.match(packet,/FRESH_SOURCE_UNKNOWN_IN_REQUEST/);return 'REVIEWED_FRESH_SOURCE_UNKNOWN_IN_REQUEST'}
 });
 const r=h.service.start(input({projects:[project('A')],links:[]}));await h.service.settled(r.id);assert.equal(r.status,'completed');assert.ok(h.calls.findIndex(c=>c.id==='A-one')<h.calls.findIndex(c=>c.id==='A-two'));assert.match(h.calls.at(-1)!.input,/REVIEWED_FRESH_SOURCE_UNKNOWN_IN_REQUEST/);
});

test('invalid or cyclic planner assignments fail visibly without executing workers',async t=>{
 for(const mode of ['invalid-json','cycle']){const h=await harness(t,async(step)=>{if(step.agent.role==='plan')return mode==='invalid-json'?'not a plan':JSON.stringify({assignments:[{memberId:'A-one',task:'one',dependsOn:['A-two']},{memberId:'A-two',task:'two',dependsOn:['A-one']}],acceptance:'validate'});});const r=h.service.start(input({projects:[project('A')],links:[]}));await h.service.settled(r.id);assert.equal(r.status,'failed');assert.equal(r.steps.some(s=>s.phase==='work'),false);assert.ok(r.error);}
});

const relayProfile=(connections:ModelConnections,name:string,protocol:'chat'|'responses'|'anthropic')=>connections.upsert({name,kind:'relay',vendor:'custom',baseUrl:'https://fixture.example/v1',protocol,apiKey:'fixture-'+name,riskAccepted:true,defaultModel:name});
const bind=(m:ReturnType<typeof member>,p:ReturnType<ModelConnections['upsert']>,model:string)=>({...m,connectionId:p.id,connectionRevision:p.revision,model});

test('every coordinator and worker uses its own frozen model, connection and protocol in a mixed team',async t=>{
 const seen:any[]=[];const h=await harness(t,async step=>{seen.push({...step.agent});});
 const gpt=relayProfile(h.connections,'gpt','responses'),gemini=relayProfile(h.connections,'gemini','chat');
 const a=project('A'),b=project('B'),g=bind(member('group-coord'),gemini,'group-gemini');
 a.coordinator.model='claude-planner';a.members[0]=bind(a.members[0],gpt,'gpt-writer');a.members[1]=bind(a.members[1],gemini,'gemini-review');
 b.coordinator=bind(b.coordinator,gpt,'gpt-downstream');b.members[0].model='claude-downstream';b.members[1]=bind(b.members[1],gemini,'gemini-archive');
 const d=input({rootProjectId:undefined,group:{id:'group',coordinator:g},projects:[a,b]}),expected=new Map([g,a.coordinator,...a.members,b.coordinator,...b.members].map(m=>[m.id,m]));
 const r=h.service.start(d);a.members[0].model='later-edit-must-not-affect-run';await h.service.settled(r.id);
 assert.equal(r.status,'completed');assert.equal(r.version,2);assert.equal(r.target,undefined);assert.equal(r.bindings?.length,7);
 for(const agent of seen){const m=expected.get(agent.id)!;const frozen:CanvasTarget=r.bindings!.find(x=>x.memberId===agent.id)!.target;assert.equal(agent.model,frozen.model);assert.equal(agent.connectionId,m.connectionId);assert.equal(agent.connectionRevision,m.connectionRevision);assert.equal(agent.provider,m.connectionId==='official-anthropic'?'anthropic':'openai');}
 assert.ok(r.steps.every(s=>s.target?.model&&s.target.connectionId));assert.doesNotMatch(JSON.stringify(r),/fixture-gpt|fixture-gemini/);
});

test('unbound or stale project and group bindings reject before any model call, while disconnected projects need no binding',async t=>{
 const h=await harness(t);
 for(const where of ['worker','downstream','group']){
  const d=input();if(where==='worker')delete(d.projects[0].members[0] as any).connectionId;
  if(where==='downstream')delete(d.projects[1].coordinator as any).model;
  if(where==='group'){d.rootProjectId=undefined as any;(d as any).group={id:'g',coordinator:{id:'group',name:'未绑定统筹'}};}
  assert.throws(()=>h.service.start(d),/尚未绑定模型/);assert.equal(h.calls.length,0);
 }
 const p=relayProfile(h.connections,'stale','chat'),d=input();d.projects[1].coordinator=bind(d.projects[1].coordinator,p,'stale-model');
 h.connections.upsert({...p,name:'changed',apiKey:'fixture-replacement'});assert.throws(()=>h.service.start(d),/连接设置已改变|线路设置已改变/);assert.equal(h.calls.length,0);
 const disconnected=project('C');delete(disconnected.coordinator as any).connectionId;disconnected.members.forEach(m=>delete(m as any).connectionId);
 const r=h.service.start(input({projects:[project('A'),disconnected],links:[]}));await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(r.projects.length,1);assert.ok(h.calls.every(c=>c.id.startsWith('A-')));
});

test('the same member id in different projects cannot pick another project model binding',async t=>{
 const h=await harness(t,async(step,packet)=>{
  if(step.agent.role==='plan'){const pid=step.agent.id[0];return JSON.stringify({assignments:[{memberId:'shared-id',task:'do '+pid},{memberId:pid+'-two',task:'review '+pid}],acceptance:'correct scope'});}
  if(step.agent.id==='shared-id'){assert.equal(step.agent.model,packet.includes('当前项目：A')?'scope-A-model':'scope-B-model');return'SCOPED_OUTPUT';}
 });
 const a=project('A'),b=project('B');a.members[0]={...a.members[0],id:'shared-id',model:'scope-A-model'};b.members[0]={...b.members[0],id:'shared-id',model:'scope-B-model'};
 const r=h.service.start(input({projects:[a,b]}));await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(r.steps.filter(s=>s.member.id==='shared-id').length,2);
});

test('paused workflow cannot silently adopt a changed connection revision or repeat completed work',async t=>{
 let started=false;const h=await harness(t,async(step,_packet,ctx)=>{if(step.agent.id==='A-one'){step.text='PINNED_PARTIAL';ctx.update();started=true;await new Promise((_r,reject)=>ctx.signal.addEventListener('abort',()=>reject(new Error('paused')),{once:true}));}});
 const p=relayProfile(h.connections,'pinned','chat'),a=project('A');a.members[0]=bind(a.members[0],p,'pinned-model');
 const r=h.service.start(input({projects:[a],links:[]}));await wait(()=>started);await h.service.pause(r.id);await h.service.settled(r.id);const count=h.calls.length;
 h.connections.upsert({...p,name:'settings changed',apiKey:'fixture-new-key'});
 await assert.rejects(()=>h.service.resume(r.id),/连接设置已改变或不可用/);assert.equal(h.calls.length,count);assert.equal(r.status,'paused');assert.equal(r.steps.find(s=>s.member.id==='A-one')?.text,'PINNED_PARTIAL');assert.equal(r.bindings?.find(b=>b.memberId==='A-one')?.target.connectionRevision,p.revision);
});

test('a provider failure remains a failure and explicit retry retains that members own model',async t=>{
 let failing=true;const attempts:any[]=[];const h=await harness(t,async(step)=>{if(step.agent.id==='A-one'){attempts.push({...step.agent});if(failing)throw new Error('fixture provider unavailable');}});
 const p=relayProfile(h.connections,'failure-target','chat'),a=project('A');a.members[0]=bind(a.members[0],p,'exact-failing-model');
 const r=h.service.start(input({projects:[a],links:[]}));await h.service.settled(r.id);assert.equal(r.status,'failed');assert.equal(attempts.length,1);failing=false;
 await h.service.resume(r.id);await h.service.settled(r.id);assert.equal(r.status,'completed');assert.equal(attempts.length,2);assert.ok(attempts.every(x=>x.model==='exact-failing-model'&&x.connectionId===p.id));
});

test('legacy persisted workflows retain their original explicitly recorded target instead of migrating on resume',async t=>{
 const h=await harness(t),r=h.service.start(input({projects:[project('A')],links:[]}));await h.service.settled(r.id);
 const old:any=JSON.parse(JSON.stringify(r));old.version=1;old.target={connectionId:'official-anthropic',connectionRevision:'initial',model:'legacy-frozen-model',name:'legacy'};delete old.bindings;old.status='paused';old.projects[0].status='running';
 for(const s of old.steps){delete s.target;if(s.phase==='work'&&s.member.id==='A-one'||s.phase==='final'){s.status='paused';s.text='';}}
 await fs.writeFile(path.join(h.root,'runs',r.id+'.json'),JSON.stringify(old));const calls:any[]=[];
 const restored=new CanvasRuns(path.join(h.root,'runs'),h.connections,async step=>{calls.push({...step.agent});return'LEGACY_RESULT';});await restored.resume(r.id);await restored.settled(r.id);
 assert.equal(restored.get(r.id).status,'completed');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.model==='legacy-frozen-model'));assert.equal(restored.get(r.id).version,1);
});
