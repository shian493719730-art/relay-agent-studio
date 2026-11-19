import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../src/prototype/index.html',import.meta.url),'utf8');
const match=html.match(/\/\*\s*STUDIO_MODEL_START\s*\*\/([\s\S]*?)\/\*\s*STUDIO_MODEL_END\s*\*\//)!;
const model=(await import('data:text/javascript;base64,'+Buffer.from('let n=0;const uid=()=>String(++n);'+match[1]+';export default StudioModel;').toString('base64'))).default;
const p=(id:string,boardId?:string)=>({id,name:id,boardId,members:[],msgs:[{id:'msg'+id,text:'existing'}],ui:{x:20,y:30,color:'#3E63DD'},x:999,y:555});
const fixture=()=>({projects:[p('A'),p('B'),p('C')],notes:[],links:[] as any[],deliveries:[],inbox:[],drafts:{},future:{retain:true}});
test('actions with only optional fields do not report an empty required parameter',async()=>{
 const source=html.match(/^const need=([^;]+);/m)![0];
 const need=(await import('data:text/javascript;base64,'+Buffer.from(source+'export default need;').toString('base64'))).default;
 assert.deepEqual(need({},''),[]);assert.deepEqual(need({},'projectId'),['缺少 projectId']);
});
test('existing projects gain distinct idle coordinators and one board without altering old content',()=>{
 const original=fixture(),s=model.prepare(structuredClone(original));
 assert.equal(s.boards.length,1);assert.equal(new Set(s.projects.map((p:any)=>p.coordinator.id)).size,3);
 s.projects.forEach((p:any)=>{assert.equal(p.coordinator.st,'idle');assert.equal(p.x,999);assert.equal(p.msgs[0].text,'existing');assert.equal(p.members.length,0);});
 const saved=structuredClone(s);assert.deepEqual(model.prepare(s),saved);
});
test('three connected projects have one group coordinator, including paused and draft edges',()=>{
 const s=model.prepare(fixture());s.links=[{id:'ab',src:'A',dst:'B',state:'paused'},{id:'bc',src:'B',dst:'C',state:'draft'}];
 model.sync(s);assert.equal(s.groups.length,1);assert.deepEqual(s.groups[0].pids,['A','B','C']);
 const id=s.groups[0].coordinator.id;model.sync(s);assert.equal(s.groups[0].coordinator.id,id);assert.equal(s.groupHistory.length,0);
});
test('board isolation prevents a cross-board edge from creating a collaboration group',()=>{
 const s=model.prepare(fixture());s.boards.push({id:'other',name:'other',view:{x:9,y:8,k:1}});s.projects[2].boardId='other';
 s.links=[{id:'ac',src:'A',dst:'C',state:'on'}];model.sync(s);assert.equal(s.groups.length,0);
});
test('disconnect recomputes groups and archives a dissolved coordinator conversation',()=>{
 const s=model.prepare(fixture());s.links=[{id:'ab',src:'A',dst:'B'}];model.sync(s);const g=s.groups[0];g.msgs.push({id:'gmsg',text:'keep this'});
 s.links=[];model.sync(s);assert.equal(s.groups.length,0);assert.equal(s.groupHistory[0].msgs[0].text,'keep this');
});
test('merge and split preserve surviving group identity and retired group history without duplicate coordinators',()=>{
 const s=model.prepare(fixture());s.projects.push(p('D',s.boards[0].id));s.projects[3].coordinator=model.coord();
 s.links=[{id:'ab',src:'A',dst:'B'},{id:'cd',src:'C',dst:'D'}];model.sync(s);assert.equal(s.groups.length,2);const old=s.groups.map((g:any)=>g.id);
 s.groups[1].msgs.push({text:'archived branch'});s.links.push({id:'bc',src:'B',dst:'C'});model.sync(s);assert.equal(s.groups.length,1);assert.ok(old.includes(s.groups[0].id));assert.equal(s.groupHistory.length,1);assert.equal(s.groupHistory[0].msgs[0].text,'archived branch');
 s.links=s.links.filter((l:any)=>l.id!=='bc');model.sync(s);assert.equal(s.groups.length,2);assert.equal(new Set(s.groups.map((g:any)=>g.coordinator.id)).size,2);
});
