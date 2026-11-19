// SPDX-License-Identifier: AGPL-3.0-only
import {timingSafeEqual} from 'node:crypto';
import {registerSecret} from './secret-redaction.ts';
export const LOCAL_COOKIE='relay_local_session';
export function createDesktopAccess(secret='') {
 if(secret&&secret.length<32)throw new Error('桌面会话密钥长度不足');
 registerSecret(secret);
 const match=(value:string|undefined)=>{if(!value)return false;const a=Buffer.from(value),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b)};
 return {
  enabled:!!secret,
  allows(headers:{get?(name:string):string|null;[key:string]:unknown}) {
   if(!secret)return true;
   const get=(key:string)=>typeof headers.get==='function'?headers.get(key):headers[key.toLowerCase()];
   if(match(String(get('x-relay-desktop')||'')))return true;
   const cookie=String(get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(LOCAL_COOKIE+'='));
   return !!cookie&&match(cookie.slice(LOCAL_COOKIE.length+1));
  },
  storageState(origin:string) {
   const url=new URL(origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('桌面浏览器只接受本机来源');
   return {cookies:secret?[{name:LOCAL_COOKIE,value:secret,domain:url.hostname,path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Strict' as const}]:[],origins:[]};
  },
 };
}
export const desktopAccess=createDesktopAccess(process.env.RELAY_DESKTOP_TOKEN||'');
