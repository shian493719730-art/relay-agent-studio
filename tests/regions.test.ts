import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/prototype/regions.js',import.meta.url),'utf8');
const core=vm.runInNewContext(source.split('/* REGION_CORE_START */')[1].split('/* REGION_CORE_END */')[0]+';RegionCore');
const outline=[[100,100],[420,100],[390,200],[270,190],[260,390],[100,390],[100,100]];
test('freehand coordinates survive normalization, saving and reload instead of being replaced by a circle',()=>{
 const s=core.stroke(outline),d=core.dimensions(s);assert.equal(s.shape.type,'freehand');assert.equal(s.shape.hand.points.length,outline.length);
 const loaded=JSON.parse(JSON.stringify(s));loaded.shape.hand.points.forEach(([x,y]:number[],i:number)=>{assert.ok(Math.abs(x*d.rx+s.x-outline[i][0])<.001);assert.ok(Math.abs(y*d.ry+s.y-outline[i][1])<.001)});assert.equal(core.path(s),core.path(loaded));
});
test('hit testing includes a user-drawn concave region and excludes its empty bounding-box corner',()=>{
 const s=core.stroke(outline);assert.equal(core.contains(s,{x:150,y:350}),true);assert.equal(core.contains(s,{x:380,y:340}),false);
 const r=core.change(s,'rect');assert.equal(core.contains(r,{x:380,y:340}),true);
});
test('shape conversion and independent sizing preserve the original stroke, identity and user position',()=>{
 const s={...core.stroke(outline),id:'same',members:[{id:'m'}]},hand=JSON.stringify(s.shape.hand),circle=core.change(s,'circle');assert.equal(core.dimensions(circle).rx,core.dimensions(circle).ry);assert.equal(JSON.stringify(circle.shape.hand),hand);
 const resized=core.change(circle,'rect',700,240);assert.equal(core.dimensions(resized).rx*2,700);assert.equal(core.dimensions(resized).ry*2,240);assert.equal(resized.x,s.x);assert.equal(resized.id,s.id);assert.equal(resized.members,s.members);
 const restored=core.change(resized,'freehand');assert.equal(JSON.stringify(restored.shape.hand),hand);assert.equal(restored.shape.aspect,s.shape.aspect);
 assert.throws(()=>core.change({x:0,y:0,r:130},'freehand'),/没有手绘/);assert.throws(()=>core.change(s,'unknown'),/提供/);
});
test('all supported shapes place the connection on the actual boundary',()=>{
 for(const type of core.types){let s=core.stroke(outline);s=core.change(s,type);for(const dx of [-800,400]){const target={x:s.x+dx,y:s.y+260},p=core.edge(s,target),a=core.anchor(s.shape),d=core.dimensions(s),origin={x:s.x+a[0]*d.rx,y:s.y+a[1]*d.ry},len=Math.hypot(p.x-origin.x,p.y-origin.y),unit={x:(p.x-origin.x)/len,y:(p.y-origin.y)/len};assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.equal(core.contains(s,{x:p.x-unit.x*.1,y:p.y-unit.y*.1}),true,type);assert.equal(core.contains(s,{x:p.x+unit.x*2,y:p.y+unit.y*2}),false,type)}}
});
test('legacy circles retain their geometry and invalid traces cannot create tiny or empty projects',()=>{
 const s={x:20,y:40,r:130};assert.equal(core.contains(s,{x:150,y:40}),true);assert.equal(core.contains(s,{x:150,y:41}),false);assert.throws(()=>core.stroke([[1,1],[2,2],[3,3]]),/再大/);assert.throws(()=>core.stroke([[0,0],[100,100],[200,200]]),/面积/);assert.throws(()=>core.stroke([[0,0],[NaN,200],[300,100]]),/完整/);
});
test('shape edits are ordinary reversible layout changes and never touch execution',()=>{
 const state:any={projects:[{id:'p',space:core.stroke(outline),members:[{id:'m',st:'think'}]}]},before=JSON.stringify(state),after={...state.projects[0],space:core.change(state.projects[0].space,'diamond')};state.projects[0]=after;assert.equal(state.projects[0].members[0].st,'think');const saved=JSON.stringify(state);Object.assign(state,JSON.parse(before));assert.equal(state.projects[0].space.shape.type,'freehand');Object.assign(state,JSON.parse(saved));assert.equal(state.projects[0].space.shape.type,'diamond');assert.doesNotMatch(source.split('/* REGION_CORE_START */')[1].split('/* REGION_CORE_END */')[0],/fetch\(|cpApi\(|document\./);
});
test('the resize handle scales from the grabbed point without jumping or losing the original outline',()=>{const s=core.stroke(outline),d=core.dimensions(s),initial=Math.hypot(d.rx,d.ry);assert.equal(core.scaledRadius(s,initial,initial),s.r);assert.equal(core.scaledRadius(s,initial*1.5,initial),s.r*1.5);assert.equal(JSON.stringify(s.shape.hand),JSON.stringify(core.change({...s,r:s.r*1.5},'freehand').shape.hand))});
test('a self-crossing hand-drawn outline keeps its even-odd filled areas instead of cancelling to zero',()=>{const s=core.stroke([[0,0],[300,300],[0,300],[300,0],[0,0]]);assert.equal(s.shape.type,'freehand');assert.equal(core.contains(s,{x:150,y:30}),true);assert.equal(core.contains(s,{x:290,y:150}),false)});
