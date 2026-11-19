import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const apps={auth:'Auth Relay.app',snapper:'Snapper Assist.app'} as const;
export async function integrationAppPath(app:keyof typeof apps){
 for(const base of [path.join(os.homedir(),'Applications'),'/Applications']){
  const file=path.join(base,apps[app]);try{await fs.access(file);return file;}catch{}
 }
 return null;
}
export async function authRelayStatus(){
 const installed=!!await integrationAppPath('auth');
 try{
  const connection=JSON.parse(await fs.readFile(path.join(os.homedir(),'Library/Application Support/Auth Relay/connection.json'),'utf8')) as {port:number,token:string};
  if(!Number.isInteger(connection.port)||connection.port<1||connection.port>65535||typeof connection.token!=='string')throw new Error('invalid connection');
  const base=`http://127.0.0.1:${connection.port}`;
  const health=await fetch(base+'/health',{signal:AbortSignal.timeout(1800)});
  if(!health.ok||(await health.json() as {service?:string}).service!=='auth-relay')throw new Error('not connected');
  const response=await fetch(base+'/api/status',{headers:{'x-auth-relay-token':connection.token},signal:AbortSignal.timeout(1800)});
  if(!response.ok)throw new Error('not connected');
  const s=await response.json() as {permission?:{enabled?:boolean,grant?:{expiresAt?:string|null,origins?:string[],allHttps?:boolean}},tasks?:{status?:string}[],smsRelay?:{phase?:string}};
  // Deliberately return no token, task URL, account, event or SMS text.
  const grant=s.permission?.grant;
  return {installed,connected:true,enabled:s.permission?.enabled===true,expiresAt:grant?.expiresAt??null,
   scope:grant?.allHttps?['Auth Relay 管理的 HTTPS 网站任务']:Array.isArray(grant?.origins)?grant.origins.map(x=>{try{return new URL(x).hostname;}catch{return '当前范围';}}):[],
   activeTasks:(s.tasks||[]).filter(t=>['running','queued','needs_user'].includes(t.status||'')).length,
   smsPhase:typeof s.smsRelay?.phase==='string'?s.smsRelay.phase:'idle'};
 }catch{return{installed,connected:false,enabled:false,activeTasks:0,scope:[],smsPhase:'unknown'};}
}
export async function openIntegration(app:keyof typeof apps){
 const file=await integrationAppPath(app);if(!file)throw new Error('未找到已安装的 '+apps[app]);
 await run('/usr/bin/open',[file]);return{opened:true,app};
}
