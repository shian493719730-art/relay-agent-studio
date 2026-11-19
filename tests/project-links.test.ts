import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Test the actual pure core embedded in the shipped prototype, without a DOM.
const html=fs.readFileSync(process.env.RELAY_LINK_CORE_FILE||new URL('../src/prototype/index.html',import.meta.url),'utf8');
const match=html.match(/\/\*\s*LINK_CORE_START\s*\*\/([\s\S]*?)\/\*\s*LINK_CORE_END\s*\*\//);
if(!match)throw new Error('The active prototype must contain its real LinkCore');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(match[1]+'\nexport default LinkCore;').toString('base64');
const core=(await import(moduleUrl)).default;
const projects=[
  {id:'A',name:'自媒体',summary:'A 公开摘要',privateData:'PRIVATE_A',msgs:[{text:'PRIVATE_CHAT'}],artifacts:[{id:'done-a',done:true,text:'已完成产物'},{id:'draft-a',done:false,text:'PRIVATE_DRAFT'}]},
  {id:'B',name:'货运',summary:'B 业务摘要',privateData:'PRIVATE_B'},
  {id:'C',name:'客服',summary:'C 客服摘要'},
];
const notes=[{id:'a1',pid:'A',text:'选定的有效咨询'},{id:'a2',pid:'A',text:'PRIVATE_UNSELECTED'},{id:'b1',pid:'B',text:'PRIVATE_OTHER_PROJECT'}];
const link=(id='ab',src='A',dst='B',overrides:Record<string,unknown>={})=>({id,src,dst,name:id,state:'on',trigger:'manual',keyword:'',share:{summary:false,noteIds:['a1'],artifacts:false},...overrides});
const event=(overrides:Record<string,unknown>={})=>({root:'root-1',id:'event-1',at:'A',kind:'manual',link:'ab',text:'有效咨询',...overrides});

test('link validation rejects missing endpoints, self links and foreign notes',()=>{
  assert.equal(core.validate(link(),projects,notes).length,0);
  assert.ok(core.validate(link('bad','missing','B'),projects,notes).length);
  assert.ok(core.validate(link('bad','A','A'),projects,notes).length);
  assert.ok(core.validate(link('bad','A','B',{share:{noteIds:['b1']}}),projects,notes).length);
  assert.ok(core.validate(link('bad','A','B',{share:{}}),projects,notes).length);
});
test('selected content excludes unselected notes, other projects, chats, private fields and unfinished artifacts',()=>{
  const l=link('ab','A','B',{share:{summary:true,noteIds:['a1'],artifacts:true}});
  const items=core.pick(l,projects[0],notes);
  assert.deepEqual(items.map((item:any)=>item.type).sort(),['artifact','note','summary']);
  assert.match(JSON.stringify(items),/选定的有效咨询/);assert.match(JSON.stringify(items),/已完成产物/);
  assert.doesNotMatch(JSON.stringify(items),/PRIVATE_/);
});
test('draft and paused links block manual and automatic delivery',()=>{
  for(const state of ['draft','paused']){
    const l=link('ab','A','B',{state,trigger:'update'});
    assert.deepEqual(core.propagate(event(),[l],projects,notes,[]),[]);
    assert.deepEqual(core.propagate(event({kind:'update'}),[l],projects,notes,[]),[]);
  }
});
test('enabled three-project chain creates provenance and respects each downstream share selection',()=>{
  const links=[link(),link('bc','B','C',{trigger:'upstream',share:{summary:true,noteIds:[],artifacts:false}})];
  const delivered=core.propagate(event(),links,projects,notes,[]);
  assert.equal(delivered.length,2);
  assert.deepEqual(delivered.map((d:any)=>d.to),['B','C']);
  assert.deepEqual(delivered[1].path,['A','B','C']);assert.equal(delivered[1].root,'root-1');
  assert.equal(delivered[0].items[0].text,'选定的有效咨询');
  assert.equal(delivered[1].items[0].text,'B 业务摘要');
  assert.doesNotMatch(JSON.stringify(delivered),/PRIVATE_/);
});
test('one source can dispatch to multiple destinations',()=>{
  const links=[link('ab','A','B',{trigger:'update'}),link('ac','A','C',{trigger:'update',share:{summary:true,noteIds:[],artifacts:false}})];
  const delivered=core.propagate(event({kind:'update'}),links,projects,notes,[]);
  assert.deepEqual(delivered.map((d:any)=>d.to).sort(),['B','C']);
});
test('replayed event roots are not delivered again and fresh roots remain eligible',()=>{
  const first=core.propagate(event(),[link()],projects,notes,[]);
  const seen=first.map((d:any)=>d.key);
  assert.deepEqual(core.propagate(event({id:'replay'}),[link()],projects,notes,seen),[]);
  assert.equal(core.propagate(event({root:'new-root'}),[link()],projects,notes,seen).length,1);
});
test('keyword conditions and source update/done trigger matching affect delivery',()=>{
  const l=link('ab','A','B',{trigger:'done',keyword:'已确认'});
  assert.equal(core.propagate(event({kind:'update',text:'已确认'}),[l],projects,notes,[]).length,0);
  assert.equal(core.propagate(event({kind:'done',text:'未核实'}),[l],projects,notes,[]).length,0);
  assert.equal(core.propagate(event({kind:'done',text:'客户已确认'}),[l],projects,notes,[]).length,1);
});
test('a circular route cannot revisit its origin',()=>{
  const links=[link(),link('ba','B','A',{trigger:'upstream',share:{summary:true,noteIds:[],artifacts:false}})];
  const delivered=core.propagate(event(),links,projects,notes,[]);
  assert.deepEqual(delivered.map((d:any)=>d.to),['B']);
});
test('long chains stop after eight hops',()=>{
  const nodes=Array.from({length:12},(_,i)=>({id:'p'+i,name:'项目'+i,summary:'公开摘要'+i}));
  const links=nodes.slice(0,-1).map((p,i)=>link('l'+i,p.id,nodes[i+1].id,{trigger:i===0?'manual':'upstream',share:{summary:true,noteIds:[],artifacts:false}}));
  const delivered=core.propagate(event({at:'p0',link:'l0'}),links,nodes,[],[]);
  assert.equal(delivered.length,8);assert.equal(delivered.at(-1).hop,8);assert.equal(delivered.at(-1).to,'p8');
});
