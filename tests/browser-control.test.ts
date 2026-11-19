import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BrowserControl,gestureSchema,mcpGesture} from '../server/browser-control.ts';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const origin='http://127.0.0.1:4323',state={boards:[{id:'b',name:'test'}],projects:[]},history={undo:[],redo:[]};
async function fixture(call?: (input:any)=>Promise<any>){const calls:any[]=[];const control=new BrowserControl(async()=>({callTool:async input=>{calls.push(input);return call?call(input):{content:[{type:'text',text:'ok'}]}},close:async()=>{}}));const s:any=await control.action({action:'create',state,history,localOnly:true},origin);const action=(action:string,rest:any={})=>control.action({action,id:s.id,token:s.token,...rest},origin);await action('open');await action('heartbeat',{state,history,ack:0});return{control,s,action,calls}}
test('native gestures use the real MCP tool names; arbitrary code and files are outside the API',()=>{
 assert.equal(mcpGesture(gestureSchema.parse({kind:'drag',startTarget:'#shelf',endTarget:'.ring'})).name,'browser_drag');assert.equal(mcpGesture({kind:'type',target:'#name',text:'actual'}).name,'browser_type');
 assert.equal(gestureSchema.safeParse({kind:'evaluate',function:'process.exit()'}).success,false);assert.equal(gestureSchema.safeParse({kind:'key',key:'Meta+L'}).success,false);
});
test('pause and takeover invalidate old queued gestures; a fresh explicit resume uses the new epoch',async()=>{
 const f=await fixture();await f.action('resume');await f.action('pause');await assert.rejects(()=>f.action('gesture',{key:'one',epoch:0,label:'click',gesture:{kind:'click',target:'#button'}}),/暂停或接手/);assert.equal(f.calls.length,1);
 await f.action('takeover');await f.action('resume');await f.action('gesture',{key:'one',epoch:2,label:'click',gesture:{kind:'click',target:'#button'}});assert.equal(f.calls[1].name,'browser_click');
});
test('lost HTTP replies and concurrent duplicate requests cannot execute a physical gesture twice',async()=>{
 let done!:()=>void;const f=await fixture(async input=>{if(input.name==='browser_click')await new Promise<void>(r=>done=r);return{content:[{type:'text',text:'ok'}]}});await f.action('resume');const args={key:'step-1',epoch:0,label:'one physical click',gesture:{kind:'click',target:'#create'}};
 const a=f.action('gesture',args),b=f.action('gesture',args);await Promise.resolve();await f.action('takeover');done();const results=await Promise.all([a,b]);assert.equal(results[0].completed,true);assert.deepEqual(results[0],results[1]);assert.equal(f.calls.filter(c=>c.name==='browser_click').length,1);await f.action('gesture',args);assert.equal(f.calls.length,2);
});
test('another native action is blocked while one is settling; close waits for the page acknowledgement',async()=>{
 let done!:()=>void;const f=await fixture(async input=>{if(input.name==='browser_drag')await new Promise<void>(r=>done=r);return{content:[]}});await f.action('resume');const task=f.action('gesture',{key:'drag',epoch:0,label:'dragging',gesture:{kind:'drag',startTarget:'#a',endTarget:'#b'}});await Promise.resolve();await assert.rejects(()=>f.action('gesture',{key:'other',epoch:0,label:'other',gesture:{kind:'click',target:'#c'}}),/另一动作/);await f.action('pause');await assert.rejects(()=>f.action('close'),/最后一个动作/);done();await task;await assert.rejects(()=>f.action('close'),/最后一个动作/);await f.action('heartbeat',{state,history,ack:1});await f.action('close');assert.equal(f.control.status().status,'disconnected');
});
test('state and file handoff remain session scoped, keep exact bytes, history and manual edits',async()=>{
 const f=await fixture(),body=Buffer.from('正文-actual-627');f.control.blob(f.s.id,f.s.token,'file1',body);assert.deepEqual(f.control.blob(f.s.id,f.s.token,'file1'),body);assert.throws(()=>f.control.blob(f.s.id,randomUUID(),'file1'),/不存在/);
 await f.action('heartbeat',{state:{...state,projects:[{id:'p',name:'user edit'}]},history:{undo:['original'],redo:[]},ack:0,viewport:{width:1280,height:820}});const d:any=await f.action('pull');assert.equal(d.state.projects[0].name,'user edit');assert.equal(d.history.undo[0],'original');assert.deepEqual(d.files,['file1']);assert.deepEqual(d.viewport,{width:1280,height:820});await assert.rejects(()=>f.control.action({action:'pull',id:f.s.id,token:f.s.token},'http://127.0.0.1:4317'),/来源不匹配/);
});
test('MCP errors are recorded as failed and never cached as successful gestures',async()=>{
 const f=await fixture(async input=>input.name==='browser_click'?{isError:true,content:[{type:'text',text:'element is covered'}]}:{content:[]});await f.action('resume');const args={key:'a',epoch:0,label:'click visible button',gesture:{kind:'click',target:'#a'}};await assert.rejects(()=>f.action('gesture',args),/covered/);await assert.rejects(()=>f.action('gesture',args),/covered/);assert.equal(f.calls.filter(c=>c.name==='browser_click').length,2);assert.equal((f.control.status() as any).events.at(-1).status,'failed');
});
test('live screenshots finish before a queued input and pause is rechecked after that wait',async()=>{
 let finish!:()=>void;const f=await fixture(async input=>{if(input.name==='browser_take_screenshot')await new Promise<void>(r=>finish=r);return{content:[]}});await f.action('resume');const frame=f.action('frame');await Promise.resolve();const click=f.action('gesture',{key:'a',epoch:0,label:'click after screenshot',gesture:{kind:'click',target:'#a'}});await f.action('pause');finish();await frame;await assert.rejects(()=>click,/暂停或接手/);assert.equal(f.calls.filter(c=>c.name==='browser_click').length,0);
 await f.action('resume');let end!:()=>void;const g=await fixture(async input=>{if(input.name==='browser_take_screenshot')await new Promise<void>(r=>end=r);return{content:[]}});await g.action('resume');const shot=g.action('frame');await Promise.resolve();const action=g.action('gesture',{key:'b',epoch:0,label:'wait and click',gesture:{kind:'click',target:'#b'}});end();await Promise.all([shot,action]);assert.equal(g.calls.at(-1).name,'browser_click');
});
test('commands are acknowledged once, paused commands are discarded and local mode refuses paid replanning',async()=>{
 const f=await fixture();await assert.rejects(()=>f.action('command',{name:'steer',text:'分析新目标'}),/本地演练/);
 const sent:any=await f.action('command',{name:'continue'});await f.action('heartbeat',{state,history,ack:0,commandAck:sent.command.id});assert.equal((f.control.status() as any).command,undefined);
 await f.action('command',{name:'continue'});await f.action('pause');assert.equal((f.control.status() as any).command,undefined);
});
test('an older continue cannot revoke a newer pause',async()=>{const f=await fixture();await f.action('pause');await assert.rejects(()=>f.action('resume',{epoch:0}),/后来的暂停/);assert.equal((f.control.status() as any).status,'paused')});
test('a stopping worker cannot erase the newer user correction or takeover',async()=>{const f=await fixture();await f.action('resume');await f.action('takeover');const sent:any=await f.action('command',{name:'edit-demo-note',text:'new user correction'});await f.action('settle',{epoch:0});const s:any=f.control.status();assert.equal(s.status,'human');assert.equal(s.command.id,sent.command.id);assert.equal(s.epoch,1)});
test('freehand input uses native MCP pointer events and releases the pointer on completion',async()=>{const f=await fixture();await f.action('resume');await f.action('gesture',{key:'stroke',epoch:0,label:'draw actual outline',gesture:{kind:'draw',points:[[100,100],[200,100],[200,200],[100,100]]}});assert.deepEqual(f.calls.slice(1).map(c=>c.name),['browser_mouse_move_xy','browser_mouse_down','browser_mouse_move_xy','browser_mouse_move_xy','browser_mouse_move_xy','browser_mouse_up']);});
test('pausing a native stroke cancels the unfinished region and always releases the held mouse',async()=>{let finish!:()=>void;let moves=0;const f=await fixture(async input=>{if(input.name==='browser_mouse_move_xy'&&++moves===2)await new Promise<void>(r=>finish=r);return{content:[]}});await f.action('resume');const task=f.action('gesture',{key:'stroke',epoch:0,label:'draw and pause',gesture:{kind:'draw',points:[[100,100],[200,100],[200,200],[100,100]]}});while(!finish)await new Promise(r=>setTimeout(r,1));await f.action('pause');finish();await assert.rejects(()=>task,/暂停/);assert.deepEqual(f.calls.slice(-2).map(c=>c.name),['browser_press_key','browser_mouse_up']);assert.equal(f.calls.at(-2).arguments.key,'Escape');assert.equal(f.calls.filter(c=>c.name==='browser_mouse_move_xy').length,2);});
test('manual changes to a pending demo step preserve completed work and invalidate only that step cache',async()=>{
 const src=await fs.readFile(new URL('../src/prototype/browser-control.js',import.meta.url),'utf8');const core=vm.runInNewContext(src.split('/* VISUAL_EXECUTION_CORE_START */')[1].split('/* VISUAL_EXECUTION_CORE_END */')[0]+';VisualExecutionCore');
 const done={id:'s1',name:'project.create',status:'done',result:{projectId:'actual'}},note={id:'s2',name:'note.create',status:'paused',args:{projectId:'actual',text:'old'},checkpoint:{nativeReceipts:{fill:true}}},s={visualDemo:true,steps:[done,note]};core.editDemoNote(s,'手动改成新的要求');assert.equal(done.result.projectId,'actual');assert.equal(note.args.projectId,'actual');assert.equal(note.args.text,'手动改成新的要求');assert.equal(note.checkpoint,undefined);note.status='done';assert.throws(()=>core.editDemoNote(s,'do not overwrite completed'),/已完成/);
 assert.equal(core.key('type','#name'),core.key('type','#name'));assert.notEqual(core.key('type','#name'),core.key('blur','#name'));
});

test('an unacknowledged correction cannot be silently replaced by continue',async()=>{
 const f=await fixture();const edit:any=await f.action('command',{name:'edit-demo-note',text:'preserve this correction'});
 await assert.rejects(()=>f.action('command',{name:'continue'}),/尚未确认/);assert.equal((f.control.status() as any).command.text,'preserve this correction');
 await f.action('heartbeat',{state,history,ack:0,commandAck:edit.command.id});const next:any=await f.action('command',{name:'continue'});assert.equal(next.command.name,'continue');
});
test('actual browser command dispatch waits for the running correction and acknowledges only after it settles',async()=>{
 const source=await fs.readFile(new URL('../src/prototype/browser-control.js',import.meta.url),'utf8');const VR:any={session:{},target:true,sent:new Set(),pending:0,revision:0};let command:any={id:'edit',name:'edit-demo-note'},finish!:()=>void;const seen:string[]=[],acks:any[]=[];
 const pulse=vm.runInNewContext(source.slice(source.indexOf('async function vrPulse('),source.indexOf('\nfunction vrStartPolling('))+';vrPulse',{VR,AS:{ac:null},state:{files:[]},undoS:[],redoS:[],innerWidth:1280,innerHeight:820,vrState:()=>({}),asPause(){},vrRender(){},vrApi:async(action:string,data:any)=>{if(action==='heartbeat')acks.push(data.commandAck);return{status:'human',epoch:1,command};},vrCommand:async(c:any)=>{seen.push(c.name);if(c.id==='edit')await new Promise<void>(r=>finish=r)}});
 await pulse();assert.deepEqual(seen,['edit-demo-note']);assert.equal(VR.command,undefined);command={id:'continue',name:'continue'};await pulse();assert.deepEqual(seen,['edit-demo-note']);assert.ok(acks.every(x=>x===undefined));finish();await new Promise(r=>setTimeout(r,0));assert.equal(VR.command,'edit');await pulse();assert.deepEqual(seen,['edit-demo-note','continue']);assert.equal(acks.at(-1),'edit');
});
