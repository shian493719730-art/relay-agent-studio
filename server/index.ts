import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Store,projectRoot } from './store.ts';
import { connections,checkConnections,safeError } from './providers.ts';
import { Workflow } from './runner.ts';
import {explainStudio,loadSkillGuides} from './studio-ai.ts';
import {authRelayStatus,openIntegration} from './studio-integrations.ts';
import {library,refineProjectPrompt,projectNeeds} from './skill-library.ts';
import {refreshSkillLibrary} from './library-refresh.ts';
import {modelConnections} from './model-connections.ts';
import {modelHandoffs} from './model-handoffs.ts';
import {canvasRuns,CanvasBindingError} from './canvas-runs.ts';
import {documents,DocumentError} from './documents.ts';
import {planAssistant,connectedStudioJson,defaultAssistantBinding} from './studio-assistant.ts';
import {authBridge} from './auth-bridge.ts';
import {browserControl,BrowserControlError} from './browser-control.ts';
import {desktopAccess} from './desktop-access.ts';
import {librarySchedule} from './library-schedule.ts';
import {legalInfo,legalPage,sourceArchive} from './legal.ts';
import {RuntimeError} from './development-runtime.ts';
import {development,DevelopmentError} from './development.ts';
import {developmentArtifactHandler} from './development-http.ts';

const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const host=req.headers.host?.split(':')[0];
  if(!['127.0.0.1','localhost','['].includes(host||''))return res.status(403).json({error:'仅允许本地访问。'});
  const origin=req.headers.origin;
  if(origin&&origin!==`http://${req.headers.host}`)return res.status(403).json({error:'拒绝跨站请求。'});
  try { if(decodeURIComponent(req.path).split('/').some(segment=>segment.startsWith('.')))return res.status(403).json({error:'不允许访问隐藏文件。'}); }
  catch { return res.status(400).json({error:'无效路径。'}); }
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  next();
});
app.use((req,res,next)=>{if(!desktopAccess.allows(req.headers))return res.status(403).json({error:'这是桌面应用的本机服务，请从 Relay 窗口打开。'});next();});
app.get('/license',(_req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");res.type('html').send(legalPage());});
app.get('/api/license',(_req,res)=>res.json(legalInfo()));
app.get('/api/license/source',(_req,res)=>{if(!fs.existsSync(sourceArchive))return res.status(404).json({error:'此源码部署未包含打包快照，请从项目仓库取得对应源码。'});res.download(sourceArchive,'Relay-source.zip',{dotfiles:'allow'});});
app.post('/api/studio/browser',express.json({limit:'12mb'}),async(req,res,next)=>{
 try{res.json(await browserControl.action(req.body,`http://${req.headers.host}`));}catch(e){next(e)}
});
app.put('/api/studio/browser/blob/:id/:fileId',express.raw({type:'application/octet-stream',limit:'25mb'}),(req,res,next)=>{
 try{if(!Buffer.isBuffer(req.body))throw new BrowserControlError('没有收到文件原件',400);browserControl.blob(String(req.params.id),req.get('X-Relay-Visual')||'',String(req.params.fileId),req.body);res.json({saved:true});}catch(e){next(e)}
});
app.get('/api/studio/browser/blob/:id/:fileId',(req,res,next)=>{
 try{res.type('application/octet-stream').send(browserControl.blob(String(req.params.id),req.get('X-Relay-Visual')||'',String(req.params.fileId)));}catch(e){next(e)}
});
app.get('/api/studio/development/artifacts/:task/:id',developmentArtifactHandler((task,id)=>development.runtime.artifact(task,id)));
app.get('/development-preview/:id',(req,res,next)=>{try{res.redirect(302,development.runtime.previewUrl(req.params.id));}catch(e){next(e);}});
app.post('/api/studio/development',express.json({limit:'2mb'}),async(req,res,next)=>{try{res.json(await development.action(req.body));}catch(e){next(e);}});
app.use(express.json({limit:'256kb'}));
app.post('/api/studio/documents/upload',express.raw({type:'application/octet-stream',limit:'25mb'}),(req,res,next)=>{
 try{const meta=JSON.parse(decodeURIComponent(req.get('X-Relay-File')||''));if(!Buffer.isBuffer(req.body))throw new Error('没有收到文件原件');const r=documents.upload(meta,req.body);res.status(201).json({id:r.id,name:r.name,status:r.status,sha256:r.sha256,size:r.size});}catch(e){next(e)}
});
app.post('/api/studio/documents',(req,res,next)=>{
 try{const action=z.enum(['status','read','pause']).parse(req.body.action),id=z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.id);res.json(action==='read'?documents.startPreview(id):action==='pause'?documents.pausePreview(id):documents.get(id));}catch(e){next(e)}
});
const store=new Store();const workflow=new Workflow(store);
const agentSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),name:z.string().trim().min(1).max(40),role:z.enum(['plan','work','final']),provider:z.enum(['openai','anthropic']),model:z.string().trim().min(1).max(100),instructions:z.string().trim().min(1).max(4000),connectionId:z.string().max(90).optional(),connectionRevision:z.string().max(90).optional()});
const settingsSchema=z.object({agents:z.array(agentSchema).min(3).max(8),maxOutputTokens:z.number().int().min(512).max(4096),maxTurns:z.number().int().min(1).max(8)}).superRefine((v,ctx)=>{
  if(v.agents.filter(a=>a.role==='plan').length!==1||v.agents.filter(a=>a.role==='final').length!==1||!v.agents.some(a=>a.role==='work'))ctx.addIssue({code:'custom',message:'团队需要恰好一位任务统筹、一位交付编辑，以及至少一位执行专家。'});
  if(new Set(v.agents.map(a=>a.id)).size!==v.agents.length)ctx.addIssue({code:'custom',message:'Agent ID 不能重复。'});
});
app.get('/health',(_req,res)=>res.json({status:'ok',app:'Relay'}));
let studioActive=0;
for(const [route,handler] of [['guide',explainStudio],['refine',async(input:unknown,signal?:AbortSignal)=>{const binding=defaultAssistantBinding();return{...await refineProjectPrompt(input,signal,connectedStudioJson(binding)),engine:binding.model}}],['assistant',planAssistant]] as const){
 app.post('/api/studio/'+route,async(req,res,next)=>{
  if(studioActive>=2)return res.status(429).json({error:'已有两条讲解或优化请求在进行，请先等待或停止。'});
  const controller=new AbortController();
  const abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);studioActive++;
  try{res.json(await handler(req.body,controller.signal));}
  catch(error){if(!controller.signal.aborted)next(error);}
  finally{studioActive--;res.off('close',abort);}
 });
}
app.get('/api/studio/skills',async(_req,res,next)=>{
 try{res.json((await loadSkillGuides()).map(({id,title,description})=>({id,title,description})));}catch(e){next(e);}
});
app.get('/api/studio/auth',async(_req,res,next)=>{try{res.json(await authBridge.status());}catch(e){next(e);}});
app.post('/api/studio/auth',async(req,res,next)=>{try{res.json(await authBridge.action(req.body));}catch(e){next(e);}});
app.post('/api/studio/open',async(req,res,next)=>{
 try{res.json(await openIntegration(z.enum(['auth','snapper']).parse(req.body.app)));}catch(e){next(e);}
});
const libraryRequest=z.discriminatedUnion('action',[
 z.object({action:z.literal('search'),query:z.string().max(300).optional(),category:z.string().max(60).optional(),kind:z.string().max(60).optional(),page:z.number().int().min(1).max(10000).optional(),pageSize:z.number().int().min(1).max(60).optional(),includeHistorical:z.boolean().optional(),openOnly:z.boolean().optional()}),
 z.object({action:z.enum(['recommend','semantic']),project:z.unknown(),binding:z.object({connectionId:z.string().min(1).max(90),model:z.string().min(1).max(180)}).optional()}),
 z.object({action:z.literal('guide'),id:z.string().min(1).max(600)}),
 z.object({action:z.enum(['status','refresh','cancel-refresh'])}),
 z.object({action:z.literal('set-schedule'),enabled:z.boolean()}),
]);

app.post('/api/studio/library',async(req,res,next)=>{
 const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
 let chargedSlot=false;
 try{
  const d=libraryRequest.parse(req.body);
  if(d.action==='search')return res.json(await library.search(d));
  if(d.action==='recommend')return res.json(await library.recommend(d.project));
  if(d.action==='semantic'){
   if(studioActive>=2)return res.status(429).json({error:'已有两条推敲请求在进行，请先等待或停止。'});
   const project=projectNeeds.parse(d.project);z.string().trim().min(1,'先填写项目目标。').parse(project.goal);
   const binding=d.binding||defaultAssistantBinding();
   studioActive++;chargedSlot=true;return res.json({...await library.semanticRecommend(project,AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),connectedStudioJson(binding)),binding});
  }
  if(d.action==='guide')return res.json(await library.guide(d.id,{signal:controller.signal}));
  if(d.action==='refresh'){
   librarySchedule.trigger();
   const status=await library.status(),active=librarySchedule.active;
   return res.status(202).json({...status,update:active?{...status.update,state:'running'}:status.update,started:active,cancellable:active});
  }
  if(d.action==='cancel-refresh'){const cancelled=librarySchedule.cancel();return res.json({...await library.status(),cancelled,cancellable:false});}
  if(d.action==='set-schedule'){await librarySchedule.setEnabled(d.enabled);return res.json({...await library.status(),cancellable:librarySchedule.active});}
  return res.json({...await library.status(),cancellable:librarySchedule.active});
 }catch(e){if(!controller.signal.aborted)next(e);}
 finally{if(chargedSlot)studioActive--;res.off('close',abort);}
});
app.post('/api/studio/models',async(req,res,next)=>{
 const ac=new AbortController(),abort=()=>{if(!res.writableEnded)ac.abort();};res.on('close',abort);
 try{
  const action=z.enum(['list','save','check','prepare','run','cancel','checkpoint']).parse(req.body.action);
  if(action==='list')return res.json(modelConnections.list());
  if(action==='save')return res.json(modelConnections.upsert(req.body.connection));
  if(action==='check')return res.json(await modelConnections.check(z.string().max(90).parse(req.body.id),{signal:ac.signal}));
  if(action==='prepare')return res.json(modelHandoffs.prepare(req.body.context));
  if(action==='cancel'||action==='checkpoint'){const d=z.object({projectId:z.string().min(1).max(180),memberId:z.string().min(1).max(180)}).parse(req.body);return res.json(action==='cancel'?{cancelled:modelHandoffs.cancel(d.projectId,d.memberId)}:await modelHandoffs.checkpoint(d.projectId,d.memberId));}
  const d=z.object({token:z.string().uuid(),fingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).parse(req.body);
  const write=(event:string,value:unknown)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);};
  // Validate stale previews before streaming headers. The service performs all final checks.
  await modelHandoffs.run(d.token,d.fingerprint,(event,value)=>{if(!res.headersSent){res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-store');res.flushHeaders();}write(event,value);},ac.signal);res.end();
 }catch(error){if(!ac.signal.aborted)next(error);}finally{res.off('close',abort);}
});
app.post('/api/studio/collaboration',async(req,res,next)=>{
 try{
  const action=z.enum(['start','list','get','pause','resume','stop','link']).parse(req.body.action);
  if(action==='start')return res.status(201).json(canvasRuns.start(req.body.run));
  if(action==='list')return res.json(canvasRuns.list(z.string().min(1).max(180).parse(req.body.boardId)));
  const id=z.string().uuid().parse(req.body.id);
  if(action==='get')return res.json(canvasRuns.get(id));
  if(action==='link')return res.json(canvasRuns.updateLink(id,z.string().min(1).max(180).parse(req.body.linkId),req.body.patch));
  const scope=z.object({projectId:z.string().min(1).max(180).optional(),memberId:z.string().min(1).max(180).optional()}).parse(req.body);
  return res.json(action==='pause'?await canvasRuns.pause(id,scope.projectId,scope.memberId):action==='resume'?await canvasRuns.resume(id,scope.projectId):await canvasRuns.stop(id));
 }catch(e){next(e)}
});
app.get('/api/studio/collaboration/:id/events',(req,res,next)=>{
 try{const r=canvasRuns.get(z.string().uuid().parse(req.params.id));res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-store');res.flushHeaders();const send=(value:typeof r)=>{if(!res.destroyed)res.write('data: '+JSON.stringify(value)+'\n\n')};send(r);const off=canvasRuns.subscribe(r.id,send),ping=setInterval(()=>res.write(': keepalive\n\n'),15000);res.on('close',()=>{off();clearInterval(ping)});}catch(e){next(e)}
});
app.get('/api/bootstrap',(_req,res)=>res.json({settings:store.settings,connections,runs:store.summaries()}));
app.post('/api/connections/check',async(_req,res)=>res.json(await checkConnections()));
app.put('/api/settings',(req,res)=>{store.settings=settingsSchema.parse(req.body);store.save();res.json(store.settings);});
app.get('/api/runs',(_req,res)=>res.json(store.summaries()));
app.post('/api/runs',(req,res)=>{
  const data=z.object({prompt:z.string().trim().min(2).max(20000),context:z.string().max(30000).default(''),mode:z.enum(['collaborate','compare']).default('collaborate')}).parse(req.body);
  if(workflow.active.size)return res.status(409).json({error:'已有任务正在执行，请等待或先停止。'});
  for(const agent of store.settings.agents){try{modelConnections.resolve(agent);}catch(e){return res.status(400).json({error:safeError(e)});}}
  res.status(201).json(workflow.create(data.prompt,data.context,data.mode));
});
app.get('/api/runs/:id',(req,res)=>{const run=store.get(req.params.id);if(!run)return res.status(404).json({error:'任务不存在。'});res.json(run);});
app.post('/api/runs/:id/cancel',(req,res)=>{if(!workflow.cancel(req.params.id))return res.status(409).json({error:'任务已经结束。'});res.json({ok:true});});
app.get('/api/runs/:id/events',(req,res)=>{
  const run=store.get(req.params.id);if(!run)return res.status(404).json({error:'任务不存在。'});
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Connection','keep-alive');res.flushHeaders();
  const send=(r:typeof run)=>res.write(`data: ${JSON.stringify(r)}\n\n`);
  send(run);const unsubscribe=workflow.subscribe(run.id,send);
  const ping=setInterval(()=>res.write(': keepalive\n\n'),15000);
  req.on('close',()=>{unsubscribe();clearInterval(ping);});
});
app.get('/api/runs/:id/artifacts',(req,res)=>{if(!store.get(req.params.id))return res.status(404).json({error:'任务不存在。'});res.json(workflow.artifacts(req.params.id).list());});
app.get('/api/runs/:id/artifacts/:name',(req,res)=>{
  if(!store.get(req.params.id))return res.status(404).json({error:'任务不存在。'});
  const p=workflow.artifacts(req.params.id).resolve(req.params.name);
  if(!fs.existsSync(p))return res.status(404).json({error:'产物不存在。'});
  res.download(p,req.params.name,{dotfiles:'allow'});
});
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在。'}));
app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{
  if(res.headersSent)return next(error);
  res.status(error instanceof DocumentError||error instanceof CanvasBindingError||error instanceof BrowserControlError||error instanceof DevelopmentError||error instanceof RuntimeError?error.status:error instanceof z.ZodError?400:500).json({error:error instanceof z.ZodError?error.issues.map(x=>x.message).join('；'):safeError(error)});
});
if(process.env.NODE_ENV==='production'){
  const staticRoot=path.resolve(process.env.RELAY_STATIC_DIR||path.join(projectRoot,'dist'));
  app.use(express.static(staticRoot));
  app.get('/{*path}',(_req,res)=>res.sendFile(path.join(staticRoot,'index.html')));
}else{
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}
const port=Number(process.env.PORT||4317);
const server=app.listen(port,'127.0.0.1',()=>{const bound=server.address();const actualPort=typeof bound==='object'&&bound?bound.port:port;console.log(`Relay is ready at http://127.0.0.1:${actualPort}`);process.send?.({type:'relay-ready',port:actualPort});void librarySchedule.start();});
server.on('error',error=>{console.error(safeError(error));process.exit(1);});
void checkConnections();

let stopping=false;const shutdown=async()=>{if(stopping)return;stopping=true;librarySchedule.stop();await development.stopAll();for(const ac of modelHandoffs.active.values())ac.abort();for(const ac of documents.previewJobs.values())ac.abort();for(const id of workflow.active.keys())workflow.cancel(id);await Promise.allSettled([...canvasRuns.runs.values()].filter(r=>r.status==='running').map(r=>canvasRuns.pause(r.id)));server.closeAllConnections();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),4000).unref();};process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());if(desktopAccess.enabled){process.on('message',m=>{if((m as any)?.type==='relay-shutdown')void shutdown();});process.once('disconnect',()=>void shutdown());}
