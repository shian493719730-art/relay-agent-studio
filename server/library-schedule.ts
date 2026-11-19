// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import {dataRoot} from './store.ts';
import {atomicJson,library} from './skill-library.ts';
import {refreshSkillLibrary} from './library-refresh.ts';
export const WEEK=7*24*60*60*1000,DAY=24*60*60*1000;
type State={version:1;enabled:boolean;nextCheck:number;lastAttempt?:number;lastCompleted?:number;lastResult?:string};
export class LibrarySchedule {
 readonly available:boolean;private state?:State;private controller?:AbortController;private task?:Promise<void>;private timer?:ReturnType<typeof setInterval>;private scheduled=false;
 constructor(readonly file=path.join(dataRoot,'library-schedule.json'),private options:{available?:boolean;now?:()=>number;catalogDate?:()=>Promise<string|null>;refresh?:(signal:AbortSignal)=>Promise<{state:string}>}={}){this.available=options.available??process.env.RELAY_WEEKLY_UPDATES==='1';}
 private now(){return(this.options.now||Date.now)();}
 async init(){if(this.state)return this.state;try{const s=JSON.parse(await fs.readFile(this.file,'utf8'));if(s.version===1&&typeof s.enabled==='boolean'&&Number.isFinite(s.nextCheck))this.state=s;}catch{}
  if(!this.state){const checked=await(this.options.catalogDate||(async()=>((await library.index()).checked_on||null)))();const stamp=checked?Date.parse(checked):NaN;this.state={version:1,enabled:this.available,nextCheck:(Number.isFinite(stamp)?stamp:this.now())+WEEK};if(this.available)await atomicJson(this.file,this.state);}return this.state;}
 async start(){if(!this.available)return;await this.init();await this.tick();this.timer=setInterval(()=>void this.tick(),15*60*1000);this.timer.unref();}
 get active(){return!!this.controller;}
 async setEnabled(enabled:boolean){if(!this.available)throw new Error('当前服务未启用本机每周调度');const s=await this.init();s.enabled=enabled;if(!enabled&&this.scheduled)this.cancel();await atomicJson(this.file,s);return s;}
 async tick(){const s=await this.init();if(this.available&&s.enabled&&s.nextCheck<=this.now()&&!this.active)this.trigger(true);}
 trigger(scheduled=false){if(this.active)return false;const controller=this.controller=new AbortController();this.scheduled=scheduled;
  this.task=(async()=>{const s=await this.init();s.lastAttempt=this.now();try{const result=await(this.options.refresh||((signal)=>refreshSkillLibrary({signal})))(controller.signal);s.lastResult=result.state;if(result.state==='completed')s.lastCompleted=this.now();s.nextCheck=this.now()+(result.state==='completed'?WEEK:DAY);}catch{s.lastResult=controller.signal.aborted?'cancelled':'failed';s.nextCheck=this.now()+DAY;}finally{if(this.available)await atomicJson(this.file,s);if(this.controller===controller)this.controller=undefined;this.scheduled=false;}})();void this.task.catch(()=>{});return true;}
 cancel(){if(!this.controller)return false;this.controller.abort();return true;}
 async settled(){await this.task;}
 stop(){clearInterval(this.timer);this.cancel();}
}
export const librarySchedule=new LibrarySchedule();
