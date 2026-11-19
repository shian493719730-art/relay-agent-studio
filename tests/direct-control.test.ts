import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {CanvasRuns} from '../server/canvas-runs.ts';
import {ModelConnections} from '../server/model-connections.ts';
const file=new URL('../src/prototype/direct-control.js',import.meta.url);
async function core(){const src=await fs.readFile(file,'utf8'),part=src.split('/* DIRECT_CORE_START */')[1].split('/* DIRECT_CORE_END */')[0];return {src,core:vm.runInNewContext(part+';DirectCore')};}
test('circle and panel geometry clamps dimensions and keeps controls reachable in narrow windows',async()=>{
 const {core:c}=await core();assert.equal(c.radius(127),130);assert.equal(c.radius(5),88);assert.equal(c.radius(900),440);const b=c.box({x:999,y:-20,w:900,h:900},503,725);assert.ok(b.x>=8&&b.y>=8);assert.ok(b.x+b.w<=495&&b.y+b.h<=717);
 const p=[{space:{x:0,y:0,r:130}},{space:{x:400,y:0,r:90}}],circle=c.bounds(p);for(const x of p)assert.ok(Math.hypot(x.space.x-circle.x,x.space.y-circle.y)+x.space.r<circle.r);
});
test('project group connections expand actual project paths, exclude self edges and reject empty groups',async()=>{
 const {core:c}=await core(),state={projects:['a','b','c','d'].map(id=>({id})),clusters:[{id:'one',projectIds:['a','b']},{id:'two',projectIds:['c','d']}]};
 assert.equal(JSON.stringify(c.pairs(state,'cluster:one','cluster:two')),JSON.stringify([['a','c'],['a','d'],['b','c'],['b','d']]));assert.equal(JSON.stringify(c.pairs(state,'cluster:one','b')),JSON.stringify([['a','b']]));assert.throws(()=>c.pairs(state,'cluster:missing','a'),/有效/);
});
test('undo structural diff identifies removal but never layout changes or unrelated projects',async()=>{
 const {core:c}=await core(),p=(id:string)=>({id,boardId:'board',space:{x:0,y:0,r:130},coordinator:{id:id+'c'},members:[{id:id+'m'}]});const before={projects:[p('a'),p('b')]},after=structuredClone(before);after.projects[0].space={x:90,y:90,r:220};assert.equal(c.changedProjects(before,after).length,0);after.projects[1].members=[];assert.equal(JSON.stringify(c.changedProjects(before,after)),JSON.stringify(['b']));
});
test('real mutation owner stops only affected execution, then applies deletion without manual flow management',async()=>{
 const {src,core:c}=await core(),functionText=src.slice(src.indexOf('function dmMutation('),src.indexOf("for(const name of ['project.delete'"));const active={id:'active',status:'running',projects:[{data:{id:'a'}}]},other={id:'other',status:'paused',projects:[{data:{id:'b'}}]},calls:string[]=[],changes:string[]=[];
 const context:any={DirectCore:c,DM:{busy:false},CP:{runs:new Map([[active.id,active],[other.id,other]])},cpPractice:()=>false,cpApi:async(action:string,{id}:any)=>{calls.push(action+':'+id);return {id,status:'stopped'}},cpApply:(r:any)=>Object.assign(active,r),dmToast:()=>{},renderAll:()=>{},hint:()=>{}};vm.createContext(context);vm.runInContext(functionText+';this.mutate=dmMutation',context);
 assert.equal(context.mutate('move',{},()=>{changes.push('layout');return'layout'},[]),'layout');assert.equal(calls.length,0);context.mutate('delete',{},()=>{assert.equal(active.status,'stopped');changes.push('delete');return'deleted'},['a']);assert.equal(changes.length,1);while(context.DM.busy)await new Promise(r=>setTimeout(r,1));assert.deepEqual(calls,['stop:active']);assert.equal(other.status,'paused');assert.deepEqual(changes,['layout','delete']);
});
test('regression: old global lock blocks an unrelated removal while the new owner does not',async()=>{
 const {core:c}=await core(),r={status:'paused',projects:[{data:{id:'a'}}]};assert.equal(c.affectedRuns([r],['b']).length,0);assert.equal(c.affectedRuns([r],['a']).length,1);assert.equal(c.affectedRuns([{...r,status:'stopped'}],['a']).length,0);const html=await fs.readFile(new URL('../src/prototype/index.html',import.meta.url),'utf8');assert.ok(!html.includes('先停止正在运行的 API 请求，再撤销或移除成员/项目'));
});
test('undoing link settings and deletion restores backend edge metadata without creating or resuming a model run',async()=>{
 const {src,core:c}=await core(),edge={id:'edge',name:'shared',state:'on',trigger:'done',keyword:'',share:{summary:true,artifacts:true,documents:false,noteIds:[]}};
 assert.equal(c.linkPatches([edge],[{...edge}], [edge]).length,0);assert.equal(c.linkPatches([edge],[],[edge])[0].patch.state,'disconnected');const restored=c.linkPatches([],[edge],[edge]);assert.equal(restored.length,1);assert.equal(restored[0].patch.state,'on');assert.equal(restored[0].linkId,'edge');assert.equal(c.linkPatches([],[edge],[{...edge,id:'unrelated'}]).length,0);
 const r={id:'paused',boardId:'board',status:'paused',edges:[{...edge,state:'disconnected'}]},calls:any[]=[],context:any={DirectCore:c,DM:{linkSync:Promise.resolve()},CP:{runs:new Map([[r.id,r]])},state:{activeBoard:'board',links:[edge]},cpPractice:()=>false,cpApi:async(action:string,payload:any)=>{calls.push({action,payload});return r},cpApply:()=>{},hint:()=>{}};vm.createContext(context);vm.runInContext(src.slice(src.indexOf('function dmSyncRestoredLinks('),src.indexOf('const dmRestoreBase='))+';this.sync=dmSyncRestoredLinks',context);context.sync([]);await context.DM.linkSync;assert.equal(calls.length,1);assert.equal(calls[0].action,'link');assert.equal(calls[0].payload.patch.state,'on');assert.equal(r.status,'paused');
});
test('member removal aborts its independent API turn, preserves received output and leaves unrelated requests alone',async()=>{
 const {src,core:c}=await core(),functionText=src.slice(src.indexOf('function dmMutation('),src.indexOf("for(const name of ['project.delete'"));const liveTurns=new Map(),pendingTurns=new Map();let removed=false;
 const ac=new AbortController(),other=new AbortController(),message={text:'received partial output'},turn={pid:'a',ac,message};liveTurns.set('member-a',turn);liveTurns.set('member-b',{pid:'b',ac:other});ac.signal.addEventListener('abort',()=>setTimeout(()=>liveTurns.delete('member-a'),2));
 const context:any={DirectCore:c,DM:{busy:false},CP:{runs:new Map()},liveTurns,pendingTurns,Date,setTimeout,Promise,cpPractice:()=>false,dmToast:()=>{},renderAll:()=>{},hint:()=>{}};vm.createContext(context);vm.runInContext(functionText+';this.mutate=dmMutation',context);
 context.mutate('member.remove',{projectId:'a',memberId:'member-a'},()=>{removed=true;assert.ok(ac.signal.aborted);assert.ok(!liveTurns.has('member-a'));return'deleted'},['a']);while(context.DM.busy)await new Promise(r=>setTimeout(r,1));assert.ok(removed);assert.equal(message.text,'received partial output');assert.ok(!other.signal.aborted);assert.ok(liveTurns.has('member-b'));
});
test('actual group paths feed both complete upstream outputs into one downstream execution',async t=>{
 const {core:c}=await core(),root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-group-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const member=(id:string)=>({id,name:id,role:'fixture',connectionId:'official-anthropic',connectionRevision:'initial',model:'fixture'});
 const project=(id:string)=>({id,name:id,summary:id,coordinator:member(id+'-coord'),members:[member(id+'-worker')],msgs:[],files:[],artifacts:[],incoming:[]});
 const projects=['A','B','C'].map(project),pairs=c.pairs({projects,clusters:[{id:'source',projectIds:['A','B']}]},'cluster:source','C'),seen:{id:string;input:string}[]=[];
 const service=new CanvasRuns(path.join(root,'runs'),new ModelConnections(root,()=> 'fixture-only-key'),async(step,packet)=>{
  seen.push({id:step.agent.id,input:packet});
  if(packet.includes('仅输出JSON对象：{"projectTasks"'))return JSON.stringify({projectTasks:projects.map(p=>({projectId:p.id,task:p.id+' task'}))});
  const id=step.agent.id.split('-')[0];if(step.agent.role==='plan')return JSON.stringify({assignments:[{memberId:id+'-worker',task:id+' task',dependsOn:[]}],acceptance:'actual output'});
  return (step.agent.role==='work'?'BODY_':'FINAL_')+id;
 });
 const r=service.start({boardId:'board',request:'group flow',group:{id:'g',coordinator:member('group-coord')},projects,notes:[],links:pairs.map(([src,dst]:string[],i:number)=>({id:'edge'+i,src,dst,name:'group path',state:'on',trigger:'done',share:{summary:false,artifacts:true,documents:false,noteIds:[]}})),clientRequestId:crypto.randomUUID()});await service.settled(r.id);
 assert.equal(r.status,'completed');assert.equal(r.deliveries.length,2);assert.equal(seen.filter(s=>s.id==='C-worker').length,1);const plan=seen.find(s=>s.id==='C-coord')!.input;for(const body of ['BODY_A','FINAL_A','BODY_B','FINAL_B'])assert.ok(plan.includes(body));assert.equal(r.modelCalls,11);
});
test('document placement avoids covering another project circle',async()=>{const {core:c}=await core();const a={id:'a',space:{x:100,y:300,r:130}},b={id:'b',space:{x:500,y:300,r:130}},spot=c.readerSpot(a,[a,b]);const x=Math.max(spot.x,Math.min(spot.x+360,b.space.x)),y=Math.max(spot.y,Math.min(spot.y+320,b.space.y));assert.ok(Math.hypot(x-b.space.x,y-b.space.y)>b.space.r)});
