import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LibrarySchedule,WEEK,DAY} from '../server/library-schedule.ts';
async function fixture(t:any){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'relay-schedule-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return path.join(dir,'schedule.json');}
test('desktop weekly checks follow the catalog date and run only once when due, without a Codex installation',async t=>{
 const file=await fixture(t);let now=Date.parse('2026-11-19'),calls=0;const schedule=new LibrarySchedule(file,{available:true,now:()=>now,catalogDate:async()=>'2026-11-17',refresh:async()=>{calls++;return{state:'completed'}}});const s=await schedule.init();assert.equal(s.nextCheck,Date.parse('2026-11-17')+WEEK);await schedule.tick();assert.equal(calls,0);now=s.nextCheck;await schedule.tick();await schedule.tick();await schedule.settled();assert.equal(calls,1);assert.equal(s.nextCheck,now+WEEK);assert.equal(s.lastCompleted,now);
 const reloaded=new LibrarySchedule(file,{available:true,now:()=>now});assert.equal((await reloaded.init()).lastCompleted,now);
});
test('pausing weekly checks persists, cancels an automatic update and never cancels an unrelated manual update',async t=>{
 const file=await fixture(t);let now=Date.parse('2026-12-01'),aborted=false;const schedule=new LibrarySchedule(file,{available:true,now:()=>now,catalogDate:async()=>'2026-11-01',refresh:signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'))}))});await schedule.init();await schedule.tick();await new Promise(r=>setTimeout(r,0));await schedule.setEnabled(false);await schedule.settled();assert.equal(aborted,true);const saved=await schedule.init();assert.equal(saved.enabled,false);assert.equal(saved.lastResult,'cancelled');assert.equal(saved.nextCheck,now+DAY);
 aborted=false;schedule.trigger(false);await new Promise(r=>setTimeout(r,0));await schedule.setEnabled(false);assert.equal(aborted,false);schedule.cancel();await schedule.settled();
});
test('failed updates keep a visible result and retry later instead of looping or claiming a completed refresh',async t=>{
 let calls=0;const now=Date.parse('2026-12-01'),schedule=new LibrarySchedule(await fixture(t),{available:true,now:()=>now,catalogDate:async()=>'2026-11-01',refresh:async()=>{calls++;throw new Error('offline')}});await schedule.tick();await schedule.settled();await schedule.tick();const s=await schedule.init();assert.equal(calls,1);assert.equal(s.lastResult,'failed');assert.equal(s.lastCompleted,undefined);assert.equal(s.nextCheck,now+DAY);
});
test('ordinary source installs do not silently acquire a background scheduler',async t=>{
 let calls=0;const schedule=new LibrarySchedule(await fixture(t),{available:false,catalogDate:async()=>null,refresh:async()=>{calls++;return{state:'completed'}}});await schedule.start();await schedule.tick();assert.equal(calls,0);await assert.rejects(()=>schedule.setEnabled(true),/未启用/);
});
