import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {dataRoot} from './store.ts';
import {authRelayStatus} from './studio-integrations.ts';
import {atomicJson} from './skill-library.ts';
type RelayRequest=(route:string,body?:unknown)=>Promise<any>;
type Overview=()=>Promise<{installed:boolean;connected:boolean;enabled:boolean;activeTasks:number;scope:string[];smsPhase:string;expiresAt?:string|null}>;
async function relayRequest(route:string,body?:unknown){
 const c=JSON.parse(await fs.readFile(path.join(os.homedir(),'Library/Application Support/Auth Relay/connection.json'),'utf8'));
 if(!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.token!=='string')throw new Error('授权服务未连接');
 const base='http://127.0.0.1:'+c.port;
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(1800),redirect:'error'});
 if(!health.ok||(await health.json() as any).service!=='auth-relay')throw new Error('授权服务未连接');
 const r=await fetch(base+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'x-auth-relay-token':c.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw new Error('授权服务未完成操作（HTTP '+r.status+'）');return r.json();
}
const request=z.discriminatedUnion('action',[
 z.object({action:z.literal('request'),url:z.string().url().max(4000),title:z.string().trim().min(1).max(120),checkpoint:z.string().max(2000).default(''),clientRequestId:z.string().uuid()}),
 z.object({action:z.enum(['focus','resume','cancel']),taskId:z.string().uuid()}),
]);
/** Local adapter only. No permission-grant, credential, SMS, DOM-fill or arbitrary tool proxy. */
export class AuthBridge{
 private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly file=path.join(dataRoot,'auth-relay-tasks.json'),readonly call:RelayRequest=relayRequest,readonly overview:Overview=authRelayStatus){}
 private async records(){try{return z.record(z.string(),z.string().uuid()).parse(JSON.parse(await fs.readFile(this.file,'utf8')))}catch{return{}}}
 private async pending(){try{return z.array(z.string().uuid()).parse(JSON.parse(await fs.readFile(this.file+'.pending','utf8')))}catch{return[]}}
 private task(t:any){let origin='';try{origin=new URL(t.origin).origin}catch{}return{id:String(t.id),origin,status:String(t.status||'unknown'),gateId:typeof t.gateId==='string'?t.gateId:null};}
 async status(){const base=await this.overview();if(!base.connected)return{...base,tasks:[],otherTaskCount:0};
  try{const [s,records]=await Promise.all([this.call('/api/status'),this.records()]),owned=new Set(Object.values(records));const tasks=(s.tasks||[]).filter((t:any)=>owned.has(t.id)).map((t:any)=>this.task(t));return{...base,tasks,otherTaskCount:Math.max(0,(s.tasks||[]).length-tasks.length)};}catch{return{...base,connected:false,tasks:[],otherTaskCount:0}}}
 action(input:unknown){const d=request.parse(input);const work=this.queue.catch(()=>{}).then(()=>this.perform(d));this.queue=work;return work;}
 private async perform(d:z.infer<typeof request>){
  const records=await this.records(),status=await this.overview();if(!status.connected)throw new Error('请先打开原生授权面板连接服务');
  if(d.action==='request'){
   const target=new URL(d.url);if(target.protocol!=='https:'||target.username||target.password)throw new Error('只接受不含凭据的HTTPS站点地址');
   if(records[d.clientRequestId]){const s=await this.call('/api/status'),t=s.tasks.find((x:any)=>x.id===records[d.clientRequestId]);if(!t)throw new Error('原任务记录已不可用，请检查授权面板');return this.task(t)}
   const pending=await this.pending(),marker='[Relay:'+d.clientRequestId+']';
   if(pending.includes(d.clientRequestId)){const s=await this.call('/api/status'),matches=(s.tasks||[]).filter((t:any)=>typeof t.checkpoint==='string'&&t.checkpoint.startsWith(marker));if(matches.length===1){records[d.clientRequestId]=z.string().uuid().parse(matches[0].id);await atomicJson(this.file,records);await atomicJson(this.file+'.pending',pending.filter(id=>id!==d.clientRequestId));return this.task(matches[0])}throw new Error('原接力请求结果待核对，请查看原生面板；不会重复建立任务')}
   if(!status.enabled)throw new Error('现有授权已暂停，请在原生面板明确开启本次范围');
   // Broker performs the authoritative scope/expiry check on every operation.
   await atomicJson(this.file+'.pending',[...pending,d.clientRequestId]);
   const t=await this.call('/api/tool',{name:'auth_open',arguments:{url:target.href,title:'Relay · '+d.title,checkpoint:marker+'\n'+d.checkpoint.slice(0,1900)}});
   const id=z.string().uuid().parse(t.id);records[d.clientRequestId]=id;await atomicJson(this.file,records);await atomicJson(this.file+'.pending',pending);return this.task(t);
  }
  if(!Object.values(records).includes(d.taskId))throw new Error('只能控制由本软件创建的授权任务');
  const s=await this.call('/api/status'),t=(s.tasks||[]).find((x:any)=>x.id===d.taskId);if(!t)throw new Error('授权任务不存在');
  if(d.action==='cancel'){await this.call('/api/cancel',{taskId:d.taskId});return{...this.task(t),status:'canceled'}}
  if(!status.enabled)throw new Error('现有授权已暂停，请在原生面板开启原范围');
  if(!t.gateId)throw new Error('此任务当前没有等待处理的验证断点');
  await this.call(d.action==='focus'?'/api/focus':'/api/resume',{gateId:t.gateId});return{...this.task(t),requested:d.action};
 }
}
export const authBridge=new AuthBridge();
