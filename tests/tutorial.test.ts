import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../src/prototype/index.html',import.meta.url),'utf8');
async function core(name:string,exported:string){const body=html.match(new RegExp('/\\*\\s*'+name+'_START\\s*\\*/([\\s\\S]*?)/\\*\\s*'+name+'_END\\s*\\*/'))?.[1];assert.ok(body);return(await import('data:text/javascript;base64,'+Buffer.from(body+';export default '+exported).toString('base64'))).default;}
const tutorial=await core('TUTORIAL_CORE','TutorialCore'),links=await core('LINK_CORE','LinkCore');
function fixture(){
 const t=tutorial.session('lesson',{boardId:'original',room:'original-project',sel:'original-project'});t.boardId='practice';
 t.ids={production:'A',review:'B',report:'C'};
 const p=(id:string)=>({id,boardId:'practice',tutorialSessionId:t.id,members:[{id:'m1',role:'策划'},{id:'m2',role:'编辑'}],msgs:[],artifacts:[] as any[]});
 const s={boards:[{id:'original',view:{x:7,y:8,k:.8}},{id:'practice',tutorialSessionId:t.id}],projects:[{id:'original-project',boardId:'original',msgs:[{text:'unsent original'}],ui:{composerDraft:'keep my draft'},apiKey:'PRIVATE'},p('A'),p('B'),p('C')],files:[],notes:[],links:[{id:'ab',src:'A',dst:'B',state:'on',trigger:'done',share:{summary:false,artifacts:true,noteIds:[]}},{id:'bc',src:'B',dst:'C',state:'paused',trigger:'done',share:{summary:false,artifacts:true,noteIds:[]}}],deliveries:[] as any[],inbox:[] as any[]};
 tutorial.project(s,t,'production').artifacts.push({id:'draft',tutorialKind:'draft',text:'Reviewed draft',done:true});
 return{s,t};
}
function approve(s:any,t:any){t.checks={title:true,facts:true,simulation:true};t.approvedText=tutorial.artifact(s,t,'draft').text;t.flags.pausedObserved=true;}

test('tutorial gates next steps and round-trips progress without automatically checking review items',()=>{
 const {s,t}=fixture();t.step=2;assert.equal(tutorial.advance(s,t).ok,true);assert.equal(t.step,3);
 assert.equal(tutorial.advance(s,t).ok,false);assert.equal(t.step,3);
 t.step=9;const restored=JSON.parse(JSON.stringify(t));assert.deepEqual(restored.checks,{});assert.equal(tutorial.done(s,restored),false);assert.equal(tutorial.steps.length,19);
});
test('tutorial ownership rejects an existing business project even when an ID is supplied',()=>{
 const {s,t}=fixture(),before=structuredClone(s.projects[0]);t.ids.review='original-project';approve(s,t);
 assert.equal(tutorial.project(s,t,'review'),null);assert.throws(()=>tutorial.publish(s,t));
 assert.throws(()=>tutorial.deliver(s,t,'done','original-project',null,'bad',links));assert.deepEqual(s.projects[0],before);
});
test('simulation publishing requires all human checks, matching reviewed text and the pause exercise',()=>{
 const {s,t}=fixture();assert.throws(()=>tutorial.publish(s,t),/审核/);
 t.checks={title:true,facts:true};t.approvedText='Reviewed draft';assert.throws(()=>tutorial.publish(s,t),/审核/);
 approve(s,t);tutorial.artifact(s,t,'draft').text='Changed after approval';assert.throws(()=>tutorial.publish(s,t),/审核/);
 t.approvedText='Changed after approval';s.links[1].state='on';assert.throws(()=>tutorial.publish(s,t),/暂停/);
 assert.equal(t.publication,undefined);
});
test('paused tutorial delivery remains blocked until explicit recovery; replay does not duplicate receipts',()=>{
 const {s,t}=fixture();approve(s,t);tutorial.publish(s,t);
 assert.equal(tutorial.deliver(s,t,'done','B','bc','publication',links).length,0);assert.equal(s.inbox.length,0);
 s.links[1].state='on';const first=tutorial.deliver(s,t,'done','B','bc','publication',links);assert.equal(first.length,1);assert.deepEqual(first[0].path,['B','C']);assert.equal(s.inbox.length,1);
 assert.equal(tutorial.deliver(s,t,'done','B','bc','publication',links).length,0);assert.equal(s.inbox.length,1);
 assert.doesNotMatch(JSON.stringify(first),/PRIVATE|unsent original|keep my draft/);
});
test('simulation publication is idempotent, explicitly labelled and preserves original messages, view and drafts',()=>{
 const {s,t}=fixture(),before=structuredClone(s);approve(s,t);const a=tutorial.publish(s,t),b=tutorial.publish(s,t);
 assert.equal(a.id,b.id);assert.equal(a.mode,'simulation');assert.equal(tutorial.project(s,t,'review').artifacts.length,1);
 assert.match(tutorial.artifact(s,t,'publication').text,/预设演示数据/);assert.deepEqual(s.projects[0],before.projects[0]);assert.deepEqual(s.boards[0],before.boards[0]);
});
test('the installed fetch guard never reaches the transport for paid or authorization operations in practice',async()=>{
 const guard=html.match(/^const tutorialRealFetch=window.fetch.bind\(window\);.*$/m)?.[0];assert.ok(guard);
 const mod=await import('data:text/javascript;base64,'+Buffer.from('let practice=true,calls=0;const TutorialCore='+JSON.stringify({})+';TutorialCore.blocksRequest=function '+tutorial.blocksRequest.toString()+';const tutorialPractice=()=>practice;const window={fetch:async()=>{calls++;return "transport"}};'+guard+';export {window};export const count=()=>calls;export const leave=()=>{practice=false};').toString('base64'));
 for(const [url,body] of [['/api/studio/documents/upload',{}],['/api/studio/documents',{action:'read'}],['/api/studio/refine',{}],['/api/studio/guide',{}],['/api/studio/open',{app:'auth'}],['/api/studio/library',{action:'semantic'}],...['save','check','prepare','run'].map(action=>['/api/studio/models',{action}]),...['start','resume','link'].map(action=>['/api/studio/collaboration',{action}])] as any[]){await assert.rejects(mod.window.fetch(url,{method:'POST',body:JSON.stringify(body)}),/本地练习板/);}
 assert.equal(mod.count(),0);await mod.window.fetch('/api/studio/library',{body:JSON.stringify({action:'search'})});assert.equal(mod.count(),1);
 mod.leave();await mod.window.fetch('/api/studio/models',{body:JSON.stringify({action:'run'})});assert.equal(mod.count(),2);
});
