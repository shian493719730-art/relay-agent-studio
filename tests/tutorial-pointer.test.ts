import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/prototype/tutorial-pointer.js',import.meta.url),'utf8');
const core=vm.runInNewContext(source.split('/* TUTORIAL_POINTER_CORE_START */')[1].split('/* TUTORIAL_POINTER_CORE_END */')[0]+';TutorialPointerCore');
test('tutorial arrow advances from real board menu to real create button and never to the one-click example',()=>{
 const closed=core.initial(false,false),opened=core.initial(true,false),created=core.initial(false,true);
 assert.equal(closed[core.current(closed)].selector,'#tl [data-a="boards"]');
 assert.equal(opened[core.current(opened)].selector,'#pan .cl-board-footer [data-act="board.create"]');
 assert.equal(core.current(created),-1);assert.ok(closed.every((x:any)=>!x.selector.includes('data-tut')));
});
test('pointer geometry follows moved controls at normal and narrow widths, hiding offscreen targets',()=>{
 for(const width of [503,1280]){const r={left:width-180,right:width-20,top:20,bottom:60},a=core.anchor(r,width,725);assert.ok(a.sx>=18&&a.sx<=width-18);assert.ok(a.sy>=18&&a.sy<=707);assert.ok((a.tx===r.left-4&&a.ty===40)||(a.tx===width-100&&a.ty===64));}
 assert.equal(core.anchor({left:800,right:900,top:20,bottom:60},503,725),null);
});
test('native creation in the active lesson is adopted; normal boards and original projects remain untouched',()=>{
 const t:any={status:'active',step:0,boardId:null,id:'lesson',ids:{}},state:any={activeBoard:'original',boards:[{id:'original'}],projects:[{id:'business',boardId:'original',name:'keep'}]},original=JSON.stringify(state.projects);
 const ACT:any={'board.create':()=>{state.boards.push({id:'new'});state.activeBoard='new';return'created'},'project.create':()=>{},'member.add':()=>{},'file.pick':()=>{},'room.enter':()=>{},'link.deliver':()=>{}},context={ACT,state,tutorialSession:()=>t,TutorialCore:{ownedBoard:()=>false},B:()=>state.boards.find((b:any)=>b.id===state.activeBoard),uname:(s:string)=>s,save(){},tutorialQueue(){}};
 vm.runInNewContext(source.slice(source.indexOf('for(const name of'),source.indexOf('\nfunction tutorialPointerLocal')),context);
 ACT['board.create']({});assert.equal(t.boardId,'new');assert.equal(state.boards[1].tutorialSessionId,'lesson');assert.equal(JSON.stringify(state.projects),original);assert.equal(state.boards[0].tutorialSessionId,undefined);
 t.status='paused';state.activeBoard='original';ACT['board.create']({});assert.equal(t.boardId,'new');
});
test('starting a new lesson after a completed room repaints the restored board before positioning the arrow',async()=>{
 const text=await fs.readFile(new URL('../src/prototype/tutorial.js',import.meta.url),'utf8'),fn=text.slice(text.indexOf('function tutorialBegin()'),text.indexOf('\nfunction tutorialReturn'));
 const state:any={activeBoard:'lesson',room:'report'},calls:string[]=[],context:any={state,liveTurns:new Map(),pendingTurns:new Map(),refineAC:null,guideAC:null,canvasWorkActive:()=>false,tutorialSession:()=>({status:'complete',boardId:'lesson'}),tutorialCloseAux(){},tutorialReturn(){state.activeBoard='original';state.room=null},tutorialSavedUndo:null,undoS:[],redoS:[],TutorialCore:{session:()=>({})},uid:()=>'',tutorialRemember:()=>({}),tutorialError:'',tutorialPaintKey:'',tutorialHome:{close(){}},save(){},renderAll(){calls.push('render');assert.equal(state.room,null)},tutorialSync(){calls.push('pointer')}};
 vm.runInNewContext(fn+';tutorialBegin()',context);assert.deepEqual(calls,['render','pointer']);
});
test('completed connection setup points to next instead of asking for another duplicate link',()=>{
 const fn=source.slice(source.indexOf('function tutorialPointerPlan()'),source.indexOf('\nfunction tutorialPointerList'));
 const plan=vm.runInNewContext(fn+';tutorialPointerPlan()',{tutorialSession:()=>({step:7,boardId:'practice'}),state:{activeBoard:'practice'},TutorialCore:{project:()=>({id:'a'}),done:()=>true,edge:()=>({})}});
 assert.equal(plan[0].done,true);assert.equal(plan[1].selector,'#tutorial-coach [data-tut="next"]');
});
