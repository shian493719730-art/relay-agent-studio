// SPDX-License-Identifier: AGPL-3.0-only
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
// Read-only, isolated browser inspection of a validated, running project preview.
// No shared profile, Relay credentials, arbitrary MCP tools or arbitrary navigation.
export async function inspectDevelopmentPreview(origin:string,signal:AbortSignal){
 if(!/^http:\/\/127\.0\.0\.1:\d+\/(?!\/)/.test(origin))throw new Error('只能检查当前项目实际启动的本地预览');
 const {createConnection}=await import('@playwright/mcp');
 const server=await createConnection({browser:{browserName:'chromium',isolated:true,launchOptions:{channel:'chrome',headless:false},contextOptions:{viewport:{width:1100,height:760}}},network:{allowedOrigins:[new URL(origin).origin]},capabilities:['vision'],timeouts:{action:4000,navigation:15000},snapshot:{mode:'none'},imageResponses:'allow'});
 const client=new Client({name:'relay-development-preview',version:'1.0.0'}),[left,right]=InMemoryTransport.createLinkedPair();let closing:Promise<void>|undefined;
 const close=()=>closing||(closing=(async()=>{await client.close().catch(()=>{});await server.close().catch(()=>{});})());
 const abort=()=>void close();signal.addEventListener('abort',abort,{once:true});
 try{signal.throwIfAborted();await server.connect(right);await client.connect(left);const options={signal,timeout:20000};
  const nav=await client.callTool({name:'browser_navigate',arguments:{url:origin}},undefined,options);if(nav.isError)throw new Error('应用预览导航失败：'+JSON.stringify(nav.content).slice(0,1800));
  const snap=await client.callTool({name:'browser_snapshot',arguments:{depth:6}},undefined,options);if(snap.isError)throw new Error('应用预览正文检查失败');
  const shot=await client.callTool({name:'browser_take_screenshot',arguments:{type:'jpeg'}},undefined,options);signal.throwIfAborted();
  const content=snap.content as any[],image=(shot.content as any[]).find(c=>c.type==='image');
  return{snapshot:content.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(0,26000),image:image?Buffer.from(image.data,'base64'):null};
 }finally{signal.removeEventListener('abort',abort);await close();}
}
