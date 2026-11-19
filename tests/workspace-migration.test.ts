import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../src/prototype/index.html',import.meta.url),'utf8');
const match=html.match(/\/\*\s*LAYOUT_MIGRATION_START\s*\*\/([\s\S]*?)\/\*\s*LAYOUT_MIGRATION_END\s*\*\//);
if(!match)throw new Error('Active workspace must expose its actual migration object');
const url='data:text/javascript;base64,'+Buffer.from(match[1]+'\nexport default WorkspaceModel;').toString('base64');
const model=(await import(url)).default;
const fixture=()=>({
 projects:[
  {id:'old-a',name:'内容项目',summary:'已有目标',x:932,y:514,rx:190,ry:150,members:[{id:'m1',agent:'claude',name:'编辑',role:'核查',st:'done'}],msgs:[{id:'msg-1',from:'m1',role:'核查',text:'已有完整正文\n下一行',st:'done'}],artifacts:[{id:'art-1',done:true,text:'已有产物'}],customProjectField:{retain:true}},
  {id:'old-b',name:'业务项目',x:1700,y:900,rx:150,ry:120,members:[],msgs:[],customProjectField:'extension'},
 ],
 notes:[{id:'n1',pid:'old-a',x:1200,y:700,text:'原始笔记'},{id:'n2',pid:null,x:77,y:88,text:'无归属笔记'}],
 links:[{id:'l1',src:'old-a',dst:'old-b',name:'已有暂停连接',state:'paused',trigger:'update',keyword:'确认',share:{summary:true,noteIds:['n1'],artifacts:false}}],
 deliveries:[{key:'r|old-b',root:'r',id:'d1',link:'l1',from:'old-a',to:'old-b',cause:'update',path:['old-a','old-b'],hop:1,items:[{type:'note',ref:'n1',text:'已交付版本'}],t:123}],
 inbox:[{id:'ib1',pid:'old-b',did:'d1',done:true}],
 drafts:{l1:{src:'old-a',dst:'old-b',name:'未保存名称',trigger:'update',keyword:'草稿条件',share:{summary:false,noteIds:['n1'],artifacts:false}}},
 view:{x:-358,y:66,k:.67},sel:'old-a',room:null,futureExtension:{retain:[1,2,3]},
});

function containsExisting(actual:any,expected:any,path='state'){
 if(Array.isArray(expected)){
  assert.ok(Array.isArray(actual),path+' array retained');assert.equal(actual.length,expected.length,path+' count retained');
  expected.forEach((value,index)=>containsExisting(actual[index],value,path+'['+index+']'));return;
 }
 if(expected&&typeof expected==='object'){
  for(const [key,value] of Object.entries(expected)){
   assert.ok(Object.hasOwn(actual,key),path+'.'+key+' retained');containsExisting(actual[key],value,path+'.'+key);
  }
 }else assert.deepEqual(actual,expected,path+' value retained');
}

test('actual workspace migration retains original projects, members, messages, notes, deliveries, drafts, coordinates and unknown data',()=>{
 const original=fixture(),result=model.prepare(structuredClone(original));
 containsExisting(result,original);
});

test('actual workspace migration is idempotent and does not append demonstration content on every load',()=>{
 const first=model.prepare(fixture()),snapshot=structuredClone(first);
 const second=model.prepare(structuredClone(first));
 assert.deepEqual(second,snapshot);
 assert.deepEqual(second.projects.map((p:any)=>p.id),['old-a','old-b']);
 assert.equal(second.notes.length,2);assert.equal(second.deliveries.length,1);
});

test('user project color and card positions remain stable after reloading the actual migration',()=>{
 const first=model.prepare(fixture());
 first.projects[0].ui={...first.projects[0].ui,x:77,y:123,color:'#12A594'};
 const result=model.prepare(structuredClone(first));
 assert.deepEqual(result.projects[0].ui,first.projects[0].ui);
 assert.deepEqual(result.workspaceView,first.workspaceView);
});

test('default connected projects receive distinct persistent identity colors',()=>{
 const result=model.prepare(fixture());
 assert.match(result.projects[0].ui.color,/^#[0-9a-f]{6}$/i);
 assert.match(result.projects[1].ui.color,/^#[0-9a-f]{6}$/i);
 assert.notEqual(result.projects[0].ui.color,result.projects[1].ui.color);
});

test('every supplied project palette color has a readable chosen foreground',()=>{
 const luminance=(hex:string)=>{const x=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*x[0]+.7152*x[1]+.0722*x[2]};
 for(const [color,name] of model.PALETTE){
  const chosen=model.foreground(color),a=luminance(color),b=luminance(chosen);
  assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,name+' chosen foreground contrast');
 }
});
