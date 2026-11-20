// SPDX-License-Identifier: AGPL-3.0-only
const path = require('node:path');
function isWorkspaceUrl(value) {
 try { const u=new URL(value);return u.protocol==='relay:'&&u.hostname==='workspace'&&!u.port&&!u.username&&!u.password; }catch{return false;}
}
function externalUrl(value) {
 try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null; }catch{return null;}
}
function backendEnvironment(original,{runtimeRoot,dataRoot,token}) {
 const env={...original};
 for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','NODE_OPTIONS','NODE_PATH','RELAY_DATA_DIR','RELAY_STATIC_DIR','RELAY_DESKTOP_TOKEN','PORT'])delete env[key];
 return {...env,ELECTRON_RUN_AS_NODE:'1',NODE_ENV:'production',PORT:'0',RELAY_DATA_DIR:dataRoot,RELAY_STATIC_DIR:path.join(runtimeRoot,'dist'),RELAY_DESKTOP_TOKEN:token,RELAY_WEEKLY_UPDATES:'1'};
}
async function proxyRequest(request,base,token,fetcher=fetch) {
 if(!isWorkspaceUrl(request.url))return new Response('Not found',{status:404});
 if(request.initiatorOrigin&&request.initiatorOrigin!=='relay://workspace')return new Response('Forbidden',{status:403});
 const u=new URL(request.url),target=new URL(u.pathname+u.search,base);
 if(target.origin!==new URL(base).origin)return new Response('Forbidden',{status:403});
 const headers=new Headers(request.headers);headers.delete('host');headers.delete('origin');headers.delete('cookie');headers.delete('authorization');headers.set('X-Relay-Desktop',token);
 const init={method:request.method,headers,redirect:'manual',signal:request.signal};
 if(!['GET','HEAD'].includes(request.method)){init.body=request.body;init.duplex='half';}
 return fetcher(target,init);
}
async function proxyDevelopmentPreview(request,base,token,fetcher=fetch){
 const u=new URL(request.url);if(u.protocol!=='relay-preview:'||!/^[-a-f0-9]{36}$/.test(u.hostname)||u.port||u.username||u.password)return new Response('Invalid preview',{status:403});
 if(request.initiatorOrigin&&!['relay://workspace','relay-preview://'+u.hostname].includes(request.initiatorOrigin))return new Response('Foreign preview origin',{status:403});
 const ready=await fetcher(base+'/development-preview/'+u.hostname,{headers:{'X-Relay-Desktop':token},redirect:'manual'});
 const origin=ready.headers.get('location');if(ready.status!==302||!origin||!/^http:\/\/127\.0\.0\.1:\d+\/(?!\/)/.test(origin))return new Response('Preview is stopped',{status:404});
 if(u.pathname==='/'&&!u.search&&new URL(origin).pathname!=='/')return new Response(null,{status:302,headers:{location:'relay-preview://'+u.hostname+new URL(origin).pathname+new URL(origin).search}});
 const target=new URL(u.pathname+u.search,origin);if(target.origin!==new URL(origin).origin)return new Response('Invalid preview',{status:403});
 const headers=new Headers(request.headers);for(const h of ['host','origin','cookie','authorization','x-relay-desktop'])headers.delete(h);
 const init={method:request.method,headers,redirect:'manual',signal:request.signal};if(!['GET','HEAD'].includes(request.method)){init.body=request.body;init.duplex='half';}
 const r=await fetcher(target,init),out=new Headers(r.headers);for(const h of ['set-cookie','content-encoding','content-length'])out.delete(h);
 if(out.has('location')){const next=new URL(out.get('location'),origin);if(next.origin!==new URL(origin).origin)return new Response('External preview redirect is not allowed',{status:403});out.set('location','relay-preview://'+u.hostname+next.pathname+next.search);}
 return new Response(r.body,{status:r.status,headers:out});
}
module.exports={isWorkspaceUrl,externalUrl,backendEnvironment,proxyRequest,proxyDevelopmentPreview};
