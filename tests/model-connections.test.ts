import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {ModelConnections,normalizeEndpoint} from '../server/model-connections.ts';
import {ModelHandoffs,buildHandoff} from '../server/model-handoffs.ts';
import {createSdkStep} from '../server/runner.ts';
import {Artifacts} from '../server/artifacts.ts';
import {safeError} from '../server/providers.ts';
const relay=(extra:any={})=>({name:'Test gateway',kind:'relay',vendor:'custom',baseUrl:'https://relay.example/v1',apiKey:'fixture-gateway-token-A',protocol:'chat',riskAccepted:true,defaultModel:'fixture-model',...extra});
const input=(connectionId:string,extra:any={})=>({project:{id:'project-A',name:'Office A',goal:'必须保留原始目标与否定约束'},member:{id:'member-A',name:'统筹',role:'核对再汇总'},target:{connectionId,model:'fixture-model'},messages:[{id:'old',role:'user',text:'用户原话'},{id:'answer',role:'assistant',text:'已有的部分成果',state:'stop'}],files:[{id:'f',name:'材料.xlsx'}],request:'基于已有成果继续',...extra});
test('handoff includes only approved target receipts with provenance and rejects foreign-project receipts',()=>{
 const receipt={id:'delivery',from:'source',fromName:'上游',to:'project-A',path:['source','project-A'],items:[{type:'artifact',ref:'a',text:'ACTUAL_SHARED_OUTPUT'}]};
 const prepared=buildHandoff(input('official-anthropic',{shared:[receipt]}));assert.match(prepared.packet,/ACTUAL_SHARED_OUTPUT/);assert.match(prepared.packet,/来源项目：上游/);
 assert.throws(()=>buildHandoff(input('official-anthropic',{shared:[{...receipt,to:'other-project'}]})),/不属于/);
});
async function isolated(t:any){const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-connections-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return{root,connections:new ModelConnections(root,()=>undefined)};}
test('connections persist locally with restricted permissions and never expose keys in public data or errors',async t=>{
 const {root,connections}=await isolated(t),c=connections.upsert(relay());assert.equal(c.configured,true);assert.doesNotMatch(JSON.stringify(connections.list()),/fixture-gateway-token-A/);assert.doesNotMatch(safeError(new Error('failed fixture-gateway-token-A')),/fixture-gateway-token-A/);if(process.platform!=='win32')assert.equal((await fs.stat(connections.file)).mode&0o777,0o600);
 const restored=new ModelConnections(root,()=>undefined);assert.equal(restored.resolve({provider:'openai',connectionId:c.id}).apiKey,'fixture-gateway-token-A');
 assert.throws(()=>connections.upsert({...relay(),id:c.id,baseUrl:'https://other.example/v1',apiKey:undefined}),/地址已改变/);assert.equal(connections.get(c.id).baseUrl,'https://relay.example/v1');
});
test('official credentials cannot fall through into a custom gateway, or redirect to another host',async t=>{
 const {root}=await isolated(t),connections=new ModelConnections(root,()=> 'fixture-official-only');
 assert.throws(()=>connections.upsert(relay({apiKey:undefined,vendor:'openai'})),/自己的 API Key/);
 assert.throws(()=>connections.upsert(relay({kind:'official',vendor:'openai'})),/官方地址/);
 assert.throws(()=>connections.upsert(relay({riskAccepted:false})),/提示/);
 for(const value of ['https://user:token@relay.example/v1','https://relay.example/v1?key=secret','http://169.254.169.254/v1','https://relay.example/v1/chat/completions'])assert.throws(()=>normalizeEndpoint(value));
 assert.equal(normalizeEndpoint('http://127.0.0.1:9999/v1/'),'http://127.0.0.1:9999/v1');
 const c=connections.upsert(relay({routeScope:'own-scope'}));let request:any;
 const checked=await connections.check(c.id,{fetcher:async(url,options)=>{request={url,options};return Response.json({data:[{id:'custom-model'},{id:'fixture-gateway-token-A'}]});}});
 assert.equal(request.url,'https://relay.example/v1/models');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,'Bearer fixture-gateway-token-A');assert.equal(request.options.headers['X-Route-Scope'],'own-scope');assert.deepEqual(checked.models,['custom-model']);
});
test('handoff preview keeps goals, flags truncation, preserves partial state, and cannot be replayed or silently rerouted',async t=>{
 const {root,connections}=await isolated(t),c=connections.upsert(relay());let calls=0;const service=new ModelHandoffs(path.join(root,'handoffs'),connections,async(step,packet)=>{calls++;assert.match(packet,/必须保留原始目标/);assert.match(packet,/已有的部分成果/);step.inputTokens=5;return'real fixture reply';});
 const preview=service.prepare(input(c.id));assert.equal(calls,0);assert.match(preview.packet,/材料.xlsx/);assert.doesNotMatch(JSON.stringify(preview),/fixture-gateway-token-A/);
 await assert.rejects(()=>service.run(preview.token,'b'.repeat(64),()=>{}),/内容已改变/);assert.equal(calls,0);
 const result=await service.run(preview.token,preview.fingerprint,()=>{});assert.equal(result.status,'completed');assert.equal(calls,1);assert.equal((await service.checkpoint('project-A','member-A')).target.connectionId,c.id);assert.equal(await service.checkpoint('project-B','member-A'),null);
 await assert.rejects(()=>service.run(preview.token,preview.fingerprint,()=>{}),/过期/);assert.equal(calls,1);
 const folder=(await fs.readdir(path.join(root,'handoffs')))[0],checkpoint=path.join(root,'handoffs',folder,'checkpoint.json'),stored=JSON.parse(await fs.readFile(checkpoint,'utf8'));stored.status='running';await fs.writeFile(checkpoint,JSON.stringify(stored));assert.equal((await new ModelHandoffs(path.join(root,'handoffs'),connections).checkpoint('project-A','member-A')).status,'interrupted');assert.equal(calls,1);
 const stale=service.prepare(input(c.id));connections.upsert({...relay(),id:c.id,defaultModel:'new-model'});await assert.rejects(()=>service.run(stale.token,stale.fingerprint,()=>{}),/设置已改变/);assert.equal(calls,1);
 const long=buildHandoff(input(c.id,{messages:Array.from({length:20},(_,i)=>({id:String(i),role:'user',text:'x'.repeat(7900)}))}));assert.ok(long.omitted>0);assert.match(long.packet,/目标（始终保留）/);assert.match(long.packet,/省略更早/);
});
test('stopping a real handoff preserves partial text and does not send a second model request',async t=>{
 const {root,connections}=await isolated(t),c=connections.upsert(relay());let started!:()=>void;const ready=new Promise<void>(r=>started=r);let calls=0;
 const service=new ModelHandoffs(path.join(root,'handoffs'),connections,async(step,_input,ctx)=>{calls++;step.text='已有部分输出';ctx.update();started();await new Promise<void>((_r,reject)=>ctx.signal.addEventListener('abort',()=>reject(ctx.signal.reason),{once:true}));return'unreachable';});
 const p=service.prepare(input(c.id)),running=service.run(p.token,p.fingerprint,()=>{});await ready;assert.throws(()=>service.prepare(input(c.id)),/还在工作/);assert.equal(service.cancel('project-A','member-A'),true);const result=await running;assert.equal(result.status,'stopped');assert.equal(result.text,'已有部分输出');assert.equal(calls,1);assert.equal((await service.checkpoint('project-A','member-A')).text,'已有部分输出');
});
test('actual canvas context excludes other members private conversations and other project files',async()=>{
 const source=await fs.readFile(new URL('../src/prototype/model-connections.js',import.meta.url),'utf8'),core=source.match(/\/\* MODEL_CONTEXT_CORE_START \*\/([\s\S]+?)\/\* MODEL_CONTEXT_CORE_END \*\//)![1];
 const model=(await import('data:text/javascript;base64,'+Buffer.from(core+';export default ModelContextCore;').toString('base64'))).default;
 const m={id:'a',name:'Agent A',role:'work'},p={id:'P',name:'P',summary:'goal',msgs:[{id:'one',from:'me',text:'public goal'},{id:'two',from:'me',to:'b',text:'private for B'},{id:'three',from:'b',text:'B reply'},{id:'four',from:'a',text:'demo reply'}],artifacts:[]};
 const context=model.snapshot(p,m,[{id:'f1',pid:'P',name:'own.xlsx'},{id:'f2',pid:'Q',name:'other-private.docx'}],'conn','model','continue');assert.doesNotMatch(JSON.stringify(context),/private for B|B reply|other-private/);assert.match(JSON.stringify(context),/本地演示记录/);const before=model.stamp(p,m,[],'conn','model','continue');p.msgs.push({id:'new',from:'me',text:'new instruction'});assert.notEqual(model.stamp(p,m,[],'conn','model','continue'),before);
});
test('the real SDK sends a custom chat-compatible request to the chosen local endpoint only',async t=>{
 const {root,connections}=await isolated(t),requests:any[]=[];
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({path:req.url,auth:req.headers.authorization,scope:req.headers['x-route-scope'],body:JSON.parse(body)});res.writeHead(200,{'Content-Type':'text/event-stream'});const base={id:'fixture-completion',object:'chat.completion.chunk',created:1,model:'fixture-model'};res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'fixture SDK response'},finish_reason:null}]})+'\n\n');res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');res.end('data: [DONE]\n\n');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));const port=(server.address() as any).port;
 const c=connections.upsert(relay({baseUrl:`http://127.0.0.1:${port}/v1`,routeScope:'fixture-scope'})),agent={id:'fixture',name:'fixture',role:'work' as const,provider:'openai' as const,model:'fixture-model',instructions:'test',connectionId:c.id,connectionRevision:c.revision};const step:any={id:'fixture',agent,status:'running',text:'',inputTokens:0,outputTokens:0};
 const result=await createSdkStep(connections)(step,'fixture input',{signal:AbortSignal.timeout(10000),artifacts:new Artifacts(path.join(root,'artifacts')),emit:()=>{},update:()=>{},settings:{agents:[agent],maxOutputTokens:512,maxTurns:2}});assert.equal(result,'fixture SDK response');assert.equal(requests.length,1);assert.equal(requests[0].path,'/v1/chat/completions');assert.equal(requests[0].auth,'Bearer fixture-gateway-token-A');assert.equal(requests[0].scope,'fixture-scope');assert.equal(requests[0].body.model,'fixture-model');
});

test('actual SDK rejects length-truncated and unterminated gateway streams while retaining partial output',async t=>{
 const {root,connections}=await isolated(t);let calls=0;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls++;
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const frame=(delta:any,reason:any)=>'data: '+JSON.stringify({id:'partial',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:reason}]})+'\n\n';
  res.write(frame({role:'assistant',content:'REAL_PARTIAL_OUTPUT'},null));
  setTimeout(()=>{if(body.model==='length-case'){const end=frame({},'length');res.write(end.slice(0,31));res.write(end.slice(31));}res.end('data: [DONE]\n\n');},40);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));
 const c=connections.upsert(relay({baseUrl:`http://127.0.0.1:${(server.address() as any).port}/v1`}));
 for(const model of ['length-case','missing-end-case']){
  const agent={id:model,name:model,role:'work' as const,provider:'openai' as const,model,instructions:'fixture',connectionId:c.id,connectionRevision:c.revision};
  const step:any={id:model,agent,status:'running',text:'',inputTokens:0,outputTokens:0};
  await assert.rejects(()=>createSdkStep(connections)(step,'fixture input',{signal:AbortSignal.timeout(10000),artifacts:new Artifacts(path.join(root,model)),emit:()=>{},update:()=>{},settings:{agents:[agent],maxOutputTokens:128,maxTurns:2},artifactTools:false}),model==='length-case'?/token 上限/:/完整完成标记/);
  assert.equal(step.text,'REAL_PARTIAL_OUTPUT');
 }
 assert.equal(calls,2);
});
