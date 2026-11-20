import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createDesktopAccess} from '../server/desktop-access.ts';
const require=createRequire(import.meta.url),{isWorkspaceUrl,externalUrl,backendEnvironment,proxyRequest,proxyDevelopmentPreview}=require('../desktop/runtime.cjs');
const token='desktop-fixture-session-'+ 'x'.repeat(40);
test('desktop previews resolve only a currently running task, use a separate origin and never forward Relay credentials',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls:any[]=[];
 const fetcher=async(url:any,options:any)=>{calls.push({url:String(url),options});return calls.length===1?new Response(null,{status:302,headers:{location:'http://127.0.0.1:45321/'}}):new Response('<h1>Actual application</h1>',{headers:{'set-cookie':'private=wrong','content-type':'text/html'}});};
 const r=await proxyDevelopmentPreview(new Request('relay-preview://'+id+'/assets/ui.js',{headers:{cookie:'main-cookie',authorization:'Bearer private','X-Relay-Desktop':'private'}}),'http://127.0.0.1:50000',token,fetcher);assert.equal(await r.text(),'<h1>Actual application</h1>');assert.equal(calls[1].url,'http://127.0.0.1:45321/assets/ui.js');for(const key of ['cookie','authorization','x-relay-desktop'])assert.equal(calls[1].options.headers.get(key),null);assert.equal(r.headers.get('set-cookie'),null);
 const denied=await proxyDevelopmentPreview(new Request('relay-preview://'+id+'/'),'http://127.0.0.1:50000',token,async()=>new Response(null,{status:302,headers:{location:'https://external.invalid/'}}));assert.equal(denied.status,404);
});
test('desktop service needs its process secret, accepts its isolated browser cookie, and does not weaken the CLI',()=>{
 const access=createDesktopAccess(token);assert.equal(access.allows({}),false);assert.equal(access.allows({'x-relay-desktop':'wrong'}),false);assert.equal(access.allows({'x-relay-desktop':token}),true);assert.equal(access.allows({cookie:'other=x; relay_local_session='+token}),true);assert.equal(access.allows({cookie:'relay_local_session='+token+'-extra'}),false);assert.equal(createDesktopAccess().allows({}),true);
 const state=access.storageState('http://127.0.0.1:12345');assert.equal(state.cookies[0].httpOnly,true);assert.equal(state.cookies[0].sameSite,'Strict');assert.throws(()=>access.storageState('https://example.com'));assert.throws(()=>createDesktopAccess('short'));
});
test('desktop launches an isolated data service without inheriting provider keys or source-workspace overrides',()=>{
 const env=backendEnvironment({PATH:'keep',OPENAI_API_KEY:'private-key',ANTHROPIC_API_KEY:'other-key',NODE_OPTIONS:'unsafe',RELAY_DATA_DIR:'private-workspace',PORT:'4317'},{runtimeRoot:'/app/runtime',dataRoot:'/user/service',token});assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.PORT,'0');assert.equal(env.RELAY_DATA_DIR,'/user/service');assert.equal(env.PATH,'keep');assert.equal(env.ELECTRON_RUN_AS_NODE,'1');
});
test('stable workspace protocol rejects foreign origins and external URL tricks while preserving streamed request bodies',async()=>{
 assert.equal(isWorkspaceUrl('relay://workspace/design-v2/'),true);assert.equal(isWorkspaceUrl('relay://evil/design-v2/'),false);assert.equal(isWorkspaceUrl('relay://name:pass@workspace/'),false);
 assert.equal(externalUrl('https://example.com/help'),'https://example.com/help');for(const url of ['file:///etc/passwd','javascript:alert(1)','https://name:pass@example.com'])assert.equal(externalUrl(url),null);
 let calls=0;const fetcher=async(url:URL,init:any)=>{calls++;assert.equal(url.href,'http://127.0.0.1:48765/api/test?q=1');assert.equal(init.headers.get('X-Relay-Desktop'),token);assert.equal(init.headers.has('origin'),false);assert.equal(await new Response(init.body).text(),'exact body');return new Response('stream result');};
 const req=new Request('relay://workspace/api/test?q=1',{method:'POST',headers:{Origin:'relay://workspace'},body:'exact body'});assert.equal(await(await proxyRequest(req,'http://127.0.0.1:48765',token,fetcher)).text(),'stream result');assert.equal(calls,1);
 const foreign=new Request('relay://workspace/api/test');Object.defineProperty(foreign,'initiatorOrigin',{value:'https://evil.example'});assert.equal((await proxyRequest(foreign,'http://127.0.0.1:48765',token,fetcher)).status,403);
 assert.equal((await proxyRequest(new Request('relay://workspace//evil.example/a'),'http://127.0.0.1:48765',token,fetcher)).status,403);assert.equal(calls,1);
});
