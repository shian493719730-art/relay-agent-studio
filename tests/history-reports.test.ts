import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/prototype/history-reports.js',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../src/prototype/index.html',import.meta.url),'utf8');
const coreSource=source.split('/* HISTORY_CORE_START */')[1].split('/* HISTORY_CORE_END */')[0];
const c=vm.runInNewContext(coreSource+';HistoryCore');
function project(id:string,boardId='b') {return {id,boardId,name:id,summary:'',space:{x:100,y:100,r:100},ui:{color:'#123456'},pendingFiles:[],coordinator:{id:id+'c',name:'统筹',agent:'claude',st:'idle'},members:[],msgs:[],artifacts:[]};}
function state(){return {activeBoard:'b',sel:null,room:null,boards:[{id:'b',name:'画板',view:{x:0,y:0,k:1}},{id:'other',name:'其他',view:{x:0,y:0,k:1}}],projects:[project('p'),project('q')],notes:[],files:[],links:[],clusters:[],bundleLinks:[],readers:[],groups:[],groupHistory:[],prefs:{windowBoxes:{}}};}
function runtime(){
 const storage=new Map<string,string>(),s=state();
 const context:any={initial:s,KEY:'test',localStorage:{setItem:(k:string,v:string)=>storage.set(k,v)},queueMicrotask:()=>{},Date,console,editHistoryReady:true,runs:{},RUN:['think','queue','tool'],halt:()=>{},syncGroups:()=>{},save:()=>{},renderAll:()=>{},activityRefresh:()=>{},hint:()=>{},uid:()=>Math.random().toString(36),document:{activeElement:null,querySelectorAll:()=>[]},dmUiState:()=>({panK:null}),dmToast:()=>{},DirectCore:{changedProjects:(a:any,b:any)=>a.projects.filter((p:any)=>!b.projects.some((q:any)=>q.id===p.id)).map((p:any)=>p.id)},dmMutation:(_n:any,_a:any,fn:any)=>fn(),ACT:{}};
 vm.createContext(context);
 const base=html.slice(html.indexOf('let snap=()=>'),html.indexOf('let hT;'));
 const integration=source.slice(source.indexOf('const HA='),source.indexOf("ACT['cluster.remove']="));
 vm.runInContext(`let state=initial,undoS=[],redoS=[];${coreSource}\n${base}\n${integration}\nHA.last=snap();HA.lastSignature=HistoryCore.signature(state);HA.ready=true;this.api={state:()=>state,push:pushUndo,commit:historyCommit,undo:ACT.undo,redo:ACT.redo,persist:historyPersist,stacks:()=>({undo:undoS,redo:redoS}),external(fn){HA.travel='external';try{fn();historyCommit()}finally{HA.travel=null}}};`,context);
 return {api:context.api,storage,document:context.document,context};
}
test('navigation, selection and closing a panel do not consume an editing undo or invalidate persisted history',()=>{
 const s:any=state(),signature=c.signature(s);s.activeBoard='other';s.sel='p';s.room='q';s.interfaceState={panK:'proj',panId:'p'};s.boards[0].view={x:500,y:30,k:.4};s.projects[0].coordinator.st='think';s.projects[0].msgs.push({text:'new output'});assert.equal(c.signature(s),signature);
 const {api}=runtime();api.push();api.state().projects[0].name='改名';api.commit();api.push();api.state().interfaceState={panK:null};api.commit();assert.equal(api.stacks().undo.length,1);api.undo();assert.equal(api.state().projects[0].name,'p');assert.equal(api.stacks().redo.length,1);api.push();api.commit();assert.equal(api.stacks().redo.length,1);api.redo();assert.equal(api.state().projects[0].name,'改名');
});
test('a deleted hand region, members, attachments and connections recover as one edit and remain redoable',()=>{
 const {api,storage}=runtime(),s=api.state();s.projects[0].space.shape={type:'freehand',hand:{points:[[0,0],[1,1],[-1,1]]}};s.projects[0].members.push({id:'worker',name:'GPT',st:'think'});s.files.push({id:'f',pid:'p',boardId:'b'});s.links.push({id:'l',src:'p',dst:'q'});api.commit();api.push();s.projects=s.projects.filter((p:any)=>p.id!=='p');s.links=[];s.files[0].pid=null;api.commit();api.persist();
 const saved=JSON.parse(storage.get('test:edit-history-v1')!);assert.equal(saved.anchor,c.signature(api.state()));assert.ok(saved.undo.length>=1);
 api.undo();const p=api.state().projects.find((p:any)=>p.id==='p');assert.equal(p.space.shape.type,'freehand');assert.equal(p.members[0].st,'paused');assert.equal(api.state().files[0].pid,'p');assert.equal(api.state().links[0].id,'l');api.redo();assert.equal(api.state().projects.some((p:any)=>p.id==='p'),false);
});
test('undo preserves newly generated results but can reverse a local completion checkbox',()=>{
 const {api}=runtime(),s=api.state();s.projects[0].artifacts.push({id:'result',text:'retained actual output',done:false});api.commit();api.push();s.projects[0].artifacts[0].done=true;api.commit();api.external(()=>{s.projects[0].artifacts.push({id:'later',text:'new generation',done:true})});const count=api.stacks().undo.length;api.undo();assert.equal(api.state().projects[0].artifacts.find((a:any)=>a.id==='result').done,false);assert.equal(api.state().projects[0].artifacts.find((a:any)=>a.id==='later').text,'new generation');assert.equal(api.stacks().undo.length,count-1);
});
test('activity scope includes deleted children of a group and excludes unrelated boards',()=>{
 const before:any=state();before.clusters=[{id:'g',boardId:'b',projectIds:['p','q']}];const after=structuredClone(before);after.projects=after.projects.filter((p:any)=>p.id!=='p');after.clusters[0].projectIds=['q'];after.activityLog=c.events(before,after,123);
 const deleted=after.activityLog.find((e:any)=>e.label==='删除项目「p」');assert.ok(deleted.clusterIds.includes('g'));assert.equal(c.relevant(deleted,after,{kind:'cluster',id:'g'}),true);assert.equal(c.relevant(deleted,after,{kind:'board',id:'other'}),false);assert.equal(c.relevant(deleted,after,{kind:'project',id:'q'}),false);
});
test('reports distinguish actual execution, local practice, file bodies, binding gaps and unread deliveries',()=>{
 const s:any=state();s.boards[0].tutorialSessionId='tutorial';s.files=[{id:'f',pid:'p',boardId:'b'}];s.inbox=[{pid:'q',done:false}];s.activityLog=[{id:'e',boardId:'b',projectIds:['p'],at:150,label:'编辑项目'}];
 const run={id:'r',createdAt:'2026-11-19',status:'paused',projects:[{data:{id:'p'},status:'running'},{data:{id:'q'},status:'waiting'}],steps:[{projectId:'p',status:'completed'},{projectId:'p',status:'paused'},{projectId:'q',status:'waiting'}]};
 const r=c.report(s,[run],{kind:'board',id:'b'},new Map([['f',{status:'ready'}]]),100);assert.equal(r.local,true);assert.equal(r.completed,0);assert.equal(r.paused,2);assert.equal(r.steps.done,1);assert.equal(r.steps.total,3);assert.equal(r.filesRead,1);assert.equal(r.unbound,2);assert.equal(r.unread,1);assert.equal(r.newCount,1);
 const p=c.report(s,[run],{kind:'project',id:'p'},new Map(),200);assert.equal(p.total,1);assert.equal(p.steps.total,2);assert.equal(p.unread,0);assert.equal(p.newCount,0);
});
test('history restore keeps the current viewport and audit log, and never restarts a removed running member',()=>{
 const before:any=state(),now:any=state();before.projects[0].members.push({id:'removed',st:'think'});now.boards[0].view={x:500,y:200,k:.6};now.activityLog=[{id:'retained'}];now.room='q';const restored=c.resumedSnapshot(JSON.stringify(before),now);assert.equal(restored.room,'q');assert.equal(restored.boards[0].view.x,500);assert.equal(restored.activityLog[0].id,'retained');assert.equal(restored.projects[0].members[0].st,'paused');
});
test('undo commits and blurs a focused editor before choosing the snapshot, so the visible note can repaint',()=>{
 const {api,document}=runtime();api.state().notes.push({id:'n',pid:'p',boardId:'b',text:'原文',ui:{x:10,y:20}});api.commit();let blurred=false;document.activeElement={matches:()=>true,blur(){blurred=true;document.activeElement=null;api.commit()}};api.push();api.state().notes[0].text='修改后';api.undo();assert.equal(api.state().notes[0].text,'原文');assert.equal(blurred,true);assert.equal(document.activeElement,null);
});
test('internal document parsing metadata is not an editing action and survives unrelated undo',()=>{
 const s:any=state();s.files.push({id:'f',pid:'p',boardId:'b',name:'file.md'});const before=structuredClone(s),signature=c.signature(s);s.files[0].documentId='parsed-body';assert.equal(c.signature(s),signature);assert.equal(c.events(before,s).length,0);assert.equal(c.resumedSnapshot(JSON.stringify(before),s).files[0].documentId,'parsed-body');
});
test('one visible action saving adapter defaults twice remains a single atomic undo',()=>{
 const {api,context}=runtime();context.save=api.commit;
 const batch=source.slice(source.indexOf('// One visible software action'),source.indexOf('try{const stored='));
 vm.runInContext(`ACT.multi=()=>{pushUndo();state.projects[0].name='新名称';save();state.projects[0].space.r=250;save()};${batch};this.multi=ACT.multi;`,context);
 context.multi({});assert.equal(api.stacks().undo.length,1);api.undo();assert.equal(api.state().projects[0].name,'p');assert.equal(api.state().projects[0].space.r,100);api.redo();assert.equal(api.state().projects[0].name,'新名称');assert.equal(api.state().projects[0].space.r,250);
});
