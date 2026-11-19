import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
async function core(file:string,marker:string,object:string){const src=await fs.readFile(new URL('../src/prototype/'+file,import.meta.url),'utf8');return vm.runInNewContext(src.split('/* '+marker+'_START */')[1].split('/* '+marker+'_END */')[0]+';'+object);}
const [editing,tutorial,history]=await Promise.all([core('tutorial-editing.js','TUTORIAL_EDITING_CORE','TutorialEditingCore'),core('tutorial.js','TUTORIAL_CORE','TutorialCore'),core('history-reports.js','HISTORY_CORE','HistoryCore')]);
function fixture(){const t=tutorial.session('lesson',{boardId:'original'});t.boardId='practice';t.ids={production:'a',review:'b',report:'c',scratch:'d'};const project=(id:string)=>({id,boardId:'practice',tutorialSessionId:t.id,name:id,coordinator:{id:id+'lead'},members:[],space:{r:130,shape:{type:'rounded'}},msgs:[],ui:{},artifacts:[]});const s:any={activeBoard:'practice',boards:[{id:'original',view:{}},{id:'practice',tutorialSessionId:t.id,view:{}}],projects:['a','b','c','d'].map(project),files:[],links:[],notes:[],groups:[],clusters:[],prefs:{}};t.editing.scratchFingerprint=tutorial.scratchFingerprint(s.projects[3]);return {t,s};}
test('new syllabus retains the original local course and adds progress, deletion, recovery and group lessons',()=>{
 assert.equal(tutorial.steps.length,19);assert.match(tutorial.steps[13][1],/进度/);assert.match(tutorial.steps[14][1],/删除/);assert.match(tutorial.steps[15][1],/撤销.*恢复/);assert.match(tutorial.steps[17][1],/恢复/);assert.equal(tutorial.chapters.at(-1).range,'19');
 const old:any={version:1,status:'complete',step:13,ids:{},flags:{}};editing.migrate(old,19);assert.equal(old.step,18);assert.equal(old.version,1);assert.deepEqual(old.ids,{});assert.ok(old.editing);
});
test('progress lesson requires real board and project observations, not merely reaching the lesson',()=>{
 const {s,t}=fixture();t.step=13;assert.equal(tutorial.done(s,t),false);t.flags.boardReportViewed=true;assert.equal(tutorial.done(s,t),false);t.flags.boardProgressViewed=true;assert.equal(tutorial.done(s,t),false);t.flags.projectRecentViewed=true;assert.equal(tutorial.done(s,t),true);
 const plan=editing.plan(t,s,{boardReportOpen:true});assert.ok(plan.every((op:any)=>!op.selector.includes('data-tut="action"')));assert.ok(plan.some((op:any)=>op.selector.includes('data-tutorial-progress')));
});
test('deletion and recovery require the same owned project through undo, redo and undo',()=>{
 const {s,t}=fixture();t.step=14;t.flags.scratchDeleted=true;assert.equal(tutorial.done(s,t),false);const scratch=s.projects.pop();assert.equal(tutorial.done(s,t),true);t.step=15;
 editing.recover(t,'redo',false,true);assert.equal(t.editing.recovery,undefined);s.projects.push(scratch);editing.recover(t,'undo',false,tutorial.scratchMatches(s,t));assert.equal(t.editing.recovery,1);assert.equal(tutorial.done(s,t),false);
 s.projects.pop();editing.recover(t,'redo',true,false);assert.equal(t.editing.recovery,2);s.projects.push({...scratch,id:'impostor'});editing.recover(t,'undo',false,tutorial.scratchMatches(s,t));assert.equal(t.editing.recovery,2);s.projects.pop();s.projects.push(scratch);editing.recover(t,'undo',false,tutorial.scratchMatches(s,t));assert.equal(tutorial.done(s,t),true);
});
test('group progress and recovery only accept owned children and preserve the workflow projects',()=>{
 const {s,t}=fixture();t.step=16;t.editing.groupId='g';const group={id:'g',boardId:'practice',tutorialSessionId:t.id,projectIds:['a','b']};s.clusters.push(group);assert.equal(tutorial.done(s,t),false);t.flags.groupProgressViewed=true;assert.equal(tutorial.done(s,t),true);group.projectIds.push('business');assert.equal(tutorial.done(s,t),false);group.projectIds.pop();t.step=17;s.clusters=[];editing.groupRecover(t,'cluster.delete',true,false,true);assert.equal(t.editing.groupRecovery,1);assert.equal(tutorial.done(s,t),false);s.clusters=[group];editing.groupRecover(t,'undo',false,true,true);assert.equal(tutorial.done(s,t),true);assert.equal(s.projects.length,4);
});
test('document undo preserves lesson step, verification flags and feature course independently of snapshot age',()=>{
 const {s,t}=fixture();s.tutorial=t;s.featureTour={step:4,status:'paused'};const before=JSON.stringify(s);t.step=15;t.flags.scratchDeleted=true;t.editing.recovery=1;const restored=history.resumedSnapshot(before,s);assert.equal(restored.tutorial,t);assert.equal(restored.tutorial.step,15);assert.equal(restored.tutorial.editing.recovery,1);assert.equal(restored.featureTour,s.featureTour);
});
test('recovery arrows point to real undo and redo controls and wait for each observed result',()=>{
 const {s,t}=fixture();t.step=15;let plan=editing.plan(t,s,{scratchMatches:false});assert.equal(plan.find((op:any)=>!op.done).selector,'#tools [data-act="undo"]');t.editing.recovery=1;plan=editing.plan(t,s,{scratchMatches:true});assert.equal(plan.find((op:any)=>!op.done).selector,'#tools [data-act="redo"]');t.editing.recovery=2;plan=editing.plan(t,s,{scratchMatches:false});assert.equal(plan.find((op:any)=>!op.done).selector,'#tools [data-act="undo"]');
});
test('undo replaces the state object: progress is recorded on the restored current lesson, not the detached old one',async()=>{
 const {s,t}=fixture(),scratch=s.projects.pop();t.step=15;t.editing.recovery=0;
 const ACT:any={'project.create':()=>{},'project.delete':()=>{},'cluster.create':()=>{},'cluster.delete':()=>{}};
 const context:any={state:s,ACT,TutorialCore:tutorial,TutorialEditingCore:editing,HA:{depth:0},historyCommit(){},save(){},renderAll(){},renderPan(){},renderBoard(){},fit(){},tutorialQueue(){}};
 context.tutorialEditingLocal=()=>editing.local(context.state,context.state.tutorial)?context.state.tutorial:null;context.state.tutorial=t;
 ACT.undo=()=>{context.state=structuredClone(context.state);context.state.projects.push(structuredClone(scratch))};ACT.redo=()=>{context.state=structuredClone(context.state);context.state.projects=context.state.projects.filter((p:any)=>p.id!=='d')};
 const src=await fs.readFile(new URL('../src/prototype/tutorial-editing.js',import.meta.url),'utf8'),start=src.indexOf('for(const name of'),end=src.indexOf('\nfunction tutorialEditingObserve');
 vm.runInNewContext('function tutorialEditingBatch(fn){return fn()}\nfunction tutorialEditingChildren(t){return true}\n'+src.slice(start,end),context);
 ACT.undo({});assert.equal(context.state.tutorial.editing.recovery,1);assert.equal(t.editing.recovery,0);ACT.redo({});assert.equal(context.state.tutorial.editing.recovery,2);ACT.undo({});assert.equal(context.state.tutorial.editing.recovery,3);
});
test('local course progress reports saved sample results without claiming real model completion',()=>{
 const {s,t}=fixture();s.projects[0].artifacts.push({id:'sample',done:true});const r=history.report(s,[],{kind:'project',id:'a'},new Map());assert.equal(r.local,true);assert.equal(r.projects[0].status,'local-result');assert.equal(r.completed,0);assert.equal(r.artifacts,1);
});
test('a group header outside the visible canvas first points to the real fit-view control',()=>{
 const {s,t}=fixture();t.step=17;t.editing.groupId='g';const hidden=editing.plan(t,s,{groupPanel:false,groupTitleVisible:false}),visible=editing.plan(t,s,{groupPanel:false,groupTitleVisible:true});assert.equal(hidden.find((op:any)=>!op.done).selector,'#tools [data-act="view.fit"]');assert.equal(visible.find((op:any)=>!op.done).selector,'[data-dm-cluster-drag="g"]');
});
test('course completion also requires opening the actual final report after all editing lessons',()=>{
 const {s,t}=fixture();t.step=18;t.flags={boardProgressViewed:true,projectRecentViewed:true,groupProgressViewed:true};t.editing.recovery=3;t.editing.groupRecovery=2;t.editing.groupId='g';s.clusters=[{id:'g',boardId:'practice',tutorialSessionId:t.id,projectIds:['a','b']}];s.projects[1].artifacts.push({id:'pub',tutorialKind:'publication',done:true});s.projects[2].artifacts.push({id:'report',tutorialKind:'report',done:true});s.links=[{id:'bc',src:'b',dst:'c',state:'on'}];s.deliveries=[{from:'b',to:'c',items:[{ref:'pub'}]}];assert.equal(tutorial.done(s,t),false);t.flags.finalReportViewed=true;assert.equal(tutorial.done(s,t),true);
});
