import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('rehydrating older runs preserves history without overwriting the latest member and group status',async()=>{
 const source=await fs.readFile(new URL('../src/prototype/canvas-runs.js',import.meta.url),'utf8');
 const current=source.match(/const cpCurrent=[^\n]+/)![0],scope=source.match(/function cpScopeRun[^\n]+/)![0];
 const apply=source.slice(source.indexOf('function cpApply('),source.indexOf('function cpEnsureTeam('));
 const p:any={id:'p',coordinator:{id:'coord'},members:[{id:'worker'}],msgs:[],artifacts:[]},g:any={id:'g',coordinator:{id:'group'},msgs:[]};
 const context:any={CP:{runs:new Map(),preparing:new Map()},state:{groups:[g],groupHistory:[],room:null,deliveries:[],inbox:[]},P:(id:string)=>id==='p'?p:null,panK:null,cpStepText:(_s:any,text:string)=>text,cpStepTarget:(_r:any,s:any)=>s.target,cpPhase:{work:'成员执行','group-plan':'跨项目分工'},save:()=>{},renderBoard:()=>{},cpPaintRoom:()=>{}};
 vm.createContext(context);vm.runInContext(current+'\n'+scope+'\n'+apply+'\nthis.apply=cpApply;',context);
 const run=(id:string,date:string,status:string,phaseStatus:string)=>({id,revision:1,createdAt:date,status,projects:[{data:{id:'p'},status:'running'}],rootIds:[],group:{id:'g'},deliveries:[],steps:[{id:'s'+id,projectId:'p',member:{id:'worker',name:'worker'},phase:'work',status:phaseStatus,attempt:1,attempts:[],text:'history '+id,target:{model:'fixture'}},{id:'g'+id,projectId:null,member:{id:'group',name:'group'},phase:'group-plan',status:phaseStatus,attempt:1,attempts:[],text:'group history '+id,target:{model:'fixture'}}]});
 context.apply(run('new','2026-11-18','paused','paused'));context.apply(run('old','2026-11-17','completed','completed'));
 assert.equal(p.members[0].st,'paused');assert.equal(g.coordinator.st,'paused');assert.equal(p.msgs.length,2);assert.equal(g.msgs.filter((m:any)=>m.from==='group').length,2);
 const next=run('new','2026-11-18','running','running');next.revision=2;context.apply(next);assert.equal(p.members[0].st,'think');assert.equal(g.coordinator.st,'think');
});
