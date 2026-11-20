// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import sync from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {createRequire} from 'node:module';
import {inspectDevelopmentPreview} from './development-preview.ts';
import {projectRoot} from './store.ts';
const require=createRequire(import.meta.url);

export class RuntimeError extends Error{constructor(message:string,public status=409){super(message)}}
export type RuntimeGrant={install:boolean;scripts:Record<string,string>};
export type RuntimeWorkspace={id:string;root:string;writable:boolean;kind?:string;runtime?:RuntimeGrant};
type Source={name:string;data:Buffer;hash:string;mode:number};
type Host={workspace:(id:string)=>RuntimeWorkspace;sources:(w:RuntimeWorkspace)=>Source[];read:(w:RuntimeWorkspace,p:string)=>{content:string|null;hash:string};lock:(w:RuntimeWorkspace,text:string,hash:string,checkpointId:string)=>unknown;revert:(w:RuntimeWorkspace,id:string)=>Promise<unknown>;restore:(w:RuntimeWorkspace,checkpointId:string)=>unknown;stopChecks:(id:string)=>Promise<void>};
type Environment={id:string;workspaceId:string;root:string;files:string[];dependencies:string;ready:boolean};
type Checkpoint={id:string;workspaceId:string;requestId:string;label:string;time:number;environmentId?:string;status:'active'|'restored'};
type Artifact={id:string;name:string;size:number;sha256:string;file:string};
type Task={outputBaseline?:Record<string,string>;observation?:{snapshot:string;imageId?:string};id:string;workspaceId:string;requestId:string;signature:string;kind:'install'|'run'|'serve'|'package';script?:string;previewPath?:string;mode?:'auto'|'ci'|'install';checkpointId:string;status:'preparing'|'running'|'ready'|'passed'|'failed'|'stopped'|'interrupted'|'rolledBack';phase:string;output:string;truncated:boolean;time:number;finishedAt?:number;exitCode?:number|null;environmentId?:string;previousEnvironmentId?:string;sourceHash?:string;url?:string;port?:number;artifacts:Artifact[];lockChange?:unknown};
const uuid=z.string().uuid(),script=z.string().regex(/^[a-zA-Z0-9:._-]{1,80}$/),base={workspaceId:uuid};
export const runtimeRequest=z.discriminatedUnion('action',[
 z.object({action:z.literal('runtimeStatus'),...base}),
 z.object({action:z.literal('inspectPreview'),...base,taskId:uuid}),
 z.object({action:z.literal('checkpoint'),...base,requestId:uuid,label:z.string().max(160).default('本轮开发')}),
 z.object({action:z.literal('restoreCheckpoint'),...base,checkpointId:uuid}),
 z.object({action:z.literal('install'),...base,requestId:uuid,checkpointId:uuid.optional(),mode:z.enum(['auto','ci','install']).default('auto')}),
 z.object({action:z.enum(['run','serve','package']),...base,requestId:uuid,checkpointId:uuid.optional(),script,path:z.string().max(400).regex(/^\/(?!\/)[^\r\n\\]*$/).default('/')}),
 z.object({action:z.enum(['taskStatus','pauseTask','resumeTask','rollbackTask']),...base,taskId:uuid,requestId:uuid.optional()}),
]);
const digest=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const alive=(t:Task)=>['preparing','running','ready'].includes(t.status);
const cleanEnv=()=>{const e={...process.env};for(const k of Object.keys(e))if(k.startsWith('RELAY_')||/^npm_/i.test(k)||/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(k)||['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','ELECTRON_RUN_AS_NODE'].includes(k))delete e[k];if(process.platform==='darwin')e.PATH=['/opt/homebrew/bin','/usr/local/bin',e.PATH||'/usr/bin:/bin'].join(path.delimiter);return e;};
const toolchainRoot=path.join(projectRoot,'toolchain'),bundledNode=path.join(toolchainRoot,'bin/node'),bundledNpm=path.join(toolchainRoot,'npm/bin/npm-cli.js');
const bundledTools=()=>sync.existsSync(bundledNode)&&sync.existsSync(bundledNpm);
export class DevelopmentRuntime{
 private tasks:Task[]=[];private environments:Environment[]=[];private checkpoints:Checkpoint[]=[];private current:Record<string,string>={};private children=new Map<string,ChildProcess>();private pending=new Set<string>();private stopping=false;private inspections=new Map<string,AbortController>();
 constructor(readonly storage:string,private host:Host,private timeout=30*60*1000){
  sync.mkdirSync(storage,{recursive:true,mode:0o700});try{const s=JSON.parse(sync.readFileSync(path.join(storage,'runtime.json'),'utf8'));this.tasks=s.tasks||[];this.environments=s.environments||[];this.checkpoints=s.checkpoints||[];this.current=s.current||{};}catch{}
  for(const t of this.tasks)if(alive(t)){t.status='interrupted';t.phase='服务中断；不会自动重启，请明确继续';t.finishedAt=Date.now();}this.save();
 }
 private save(){const p=path.join(this.storage,'runtime.json');sync.writeFileSync(p+'.tmp',JSON.stringify({tasks:this.tasks,environments:this.environments,checkpoints:this.checkpoints,current:this.current}),{mode:0o600});sync.renameSync(p+'.tmp',p);}
 private workspace(id:string){const w=this.host.workspace(id);if(w.kind==='practice')throw new RuntimeError('本地固定课程不能安装依赖或执行项目脚本，请连接自己的真实 Git 项目',403);return w;}
 private grant(w:RuntimeWorkspace,kind:Task['kind'],name?:string){if(!w.writable)throw new RuntimeError('开发环境需要已授权的源码写入范围',403);if(kind==='install'){if(!w.runtime?.install)throw new RuntimeError('请在连接设置中允许项目依赖安装',403);}else{const pkg=JSON.parse(this.host.read(w,'package.json').content||'{}');if(!name||!Object.hasOwn(w.runtime?.scripts||{},name)||pkg.scripts?.[name]!==w.runtime?.scripts[name])throw new RuntimeError('脚本未授权或内容已变化，请在连接设置中核对这条实际脚本',403);}}
 private append(t:Task,value:string){value=value.replace(/sk-[A-Za-z0-9_-]{16,}/g,'[已隐藏密钥]');if(t.output.length+value.length>200000)t.truncated=true;t.output=(t.output+value).slice(-200000);}
 private public(t:Task){const {outputBaseline,...meta}=t;return {...meta,artifacts:t.artifacts.map(({file,...a})=>({...a,archived:t.status==='rolledBack',url:'/api/studio/development/artifacts/'+t.id+'/'+a.id})),settled:!this.children.has(t.id)&&!this.pending.has(t.id)&&!this.inspections.has(t.id),message:t.phase,previewOpen:t.url?'/development-preview/'+t.id:undefined};}
 summary(id:string){const w=this.workspace(id),pkg=JSON.parse(this.host.read(w,'package.json').content||'{}');return{workspaceId:id,toolchain:{bundled:bundledTools(),node:bundledTools()?JSON.parse(sync.readFileSync(path.join(toolchainRoot,'info.json'),'utf8')).node:process.version,npm:bundledTools()?'bundled':'system',gitRequired:true},installAllowed:!!w.runtime?.install,scripts:Object.entries(w.runtime?.scripts||{}).map(([name,body])=>({name,body,allowed:pkg.scripts?.[name]===body})),environmentId:this.current[id]||null,checkpoints:this.checkpoints.filter(c=>c.workspaceId===id).slice(-50).reverse(),tasks:this.tasks.filter(t=>t.workspaceId===id).slice(-50).reverse().map(t=>this.public(t)),isolation:'独立开发副本；源码按差异回写。不是操作系统沙箱，不自动发布或替换安装包。'};}
 checkpoint(id:string,requestId:string,label:string){const w=this.workspace(id);if(!w.writable)throw new RuntimeError('只读项目不能建立开发回滚点',403);const old=this.checkpoints.find(c=>c.workspaceId===id&&c.requestId===requestId);if(old)return old;const c:Checkpoint={id:randomUUID(),workspaceId:id,requestId,label,time:Date.now(),environmentId:this.current[id],status:'active'};this.checkpoints.push(c);this.save();return c;}
 validateCheckpoint(id:string,cp:string){const c=this.checkpoints.find(c=>c.workspaceId===id&&c.id===cp&&c.status==='active');if(!c)throw new RuntimeError('开发回滚点不存在或已恢复，请为新的需求新建回滚点');return c;}
 private busy(id:string){return this.tasks.some(t=>t.workspaceId===id&&(alive(t)||this.children.has(t.id)||this.pending.has(t.id)));}
 private dependencies(w:RuntimeWorkspace){const pkg=JSON.parse(this.host.read(w,'package.json').content||'{}');return digest(JSON.stringify(Object.fromEntries(['dependencies','devDependencies','optionalDependencies','peerDependencies','overrides','workspaces','packageManager'].map(k=>[k,pkg[k]])))+this.host.read(w,'package-lock.json').hash);}
 private async mirror(t:Task,w:RuntimeWorkspace,e:Environment){
  const files=this.host.sources(w);if(sync.realpathSync(e.root)!==e.root)throw new RuntimeError('开发环境路径已变化，未继续写入');if(files.some(f=>/^(?:pnpm-lock\.yaml|yarn\.lock)$/.test(f.name)))throw new RuntimeError('当前正式开发环境支持 npm 项目；此项目使用其他锁文件，未混用包管理器');
  const wanted=new Set(files.map(f=>f.name));for(const old of e.files)if(!wanted.has(old))await fs.rm(path.join(e.root,old),{force:true});
  let n=0;for(const f of files){if(!alive(t))throw new RuntimeError('准备已暂停');const p=path.join(e.root,f.name);let cursor=e.root;for(const part of f.name.split('/')){cursor=path.join(cursor,part);try{if((await fs.lstat(cursor)).isSymbolicLink())throw new RuntimeError('开发副本包含符号链接冲突，未继续写入：'+f.name);}catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;}}await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,f.data,{mode:f.mode});if(++n%25===0){t.phase='准备实际源码 '+n+'/'+files.length;this.save();}}
  e.files=files.map(f=>f.name);t.sourceHash=digest(files.map(f=>f.name+':'+f.hash).join('\n'));this.append(t,'\n已同步 '+files.length+' 个实际源码文件，版本 '+t.sourceHash.slice(0,12)+'。\n');
  // Give build tools their own reviewed-source index without altering the user's Git index/history.
  if(!sync.existsSync(path.join(e.root,'.git')))execFileSync('git',['init','-q',e.root],{timeout:15000});
  execFileSync('git',['-C',e.root,'read-tree','--empty'],{timeout:15000});for(let i=0;i<files.length;i+=80)execFileSync('git',['-C',e.root,'add','-f','--',...files.slice(i,i+80).map(f=>f.name)],{timeout:15000});
 }
 private async port(){return new Promise<number>((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=typeof a==='object'&&a?a.port:0;s.close(()=>resolve(p));});});}
 private async begin(t:Task){
  this.pending.add(t.id);this.save();let e:Environment|undefined;
  try{
   const w=this.workspace(t.workspaceId);this.grant(w,t.kind,t.script);this.validateCheckpoint(w.id,t.checkpointId);
   if(t.kind==='install'){const id=randomUUID(),root=path.join(this.storage,'environments',id);await fs.mkdir(root,{recursive:true,mode:0o700});e={id,workspaceId:w.id,root:await fs.realpath(root),files:[],dependencies:'',ready:false};this.environments.push(e);t.environmentId=id;}
   else{e=this.environments.find(e=>e.id===this.current[w.id]&&e.ready);if(!e){const pkg=JSON.parse(this.host.read(w,'package.json').content||'{}');if(Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies}).length)throw new RuntimeError('该项目还没有可用依赖环境，请先调用安装依赖');const id=randomUUID(),root=path.join(this.storage,'environments',id);await fs.mkdir(root,{recursive:true,mode:0o700});e={id,workspaceId:w.id,root:await fs.realpath(root),files:[],dependencies:this.dependencies(w),ready:true};this.environments.push(e);this.current[w.id]=id;}if(e.dependencies!==this.dependencies(w))throw new RuntimeError('依赖声明或锁文件已变化，请安装对应版本后再运行');t.environmentId=e.id;}
   await this.mirror(t,w,e);if(!alive(t))return;
   const pkgBefore=this.host.read(w,'package.json'),lockBefore=this.host.read(w,'package-lock.json');
   if(t.kind==='install'){const pkg=JSON.parse(pkgBefore.content||'{}');for(const value of Object.values({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies})){if(typeof value==='string'&&/^(?:file:|link:)/.test(value)){const rel=value.replace(/^(?:file:|link:)/,'');if(path.isAbsolute(rel)||rel.split(/[\\/]/).includes('..'))throw new RuntimeError('本地依赖必须位于已连接仓库内，不访问外部目录');}}}
   const args=t.kind==='install'?[t.mode==='ci'||t.mode==='auto'&&lockBefore.content?'ci':'install','--ignore-scripts','--no-audit','--no-fund']:['run','--ignore-scripts',t.script!];
   const env=cleanEnv();if(bundledTools()){env.PATH=path.join(toolchainRoot,'bin')+path.delimiter+(env.PATH||'');env.RELAY_DEVELOPMENT_NODE=bundledNode;env.RELAY_DEVELOPMENT_NPM=bundledNpm;}env.NODE_ENV='development';env.INIT_CWD=e.root;env.npm_config_userconfig=path.join(this.storage,'empty.npmrc');env.npm_config_globalconfig=path.join(this.storage,'empty-global.npmrc');env.npm_config_cache=path.join(this.storage,'npm-cache');env.npm_config_registry='https://registry.npmjs.org/';env.npm_config_audit='false';env.npm_config_fund='false';
   await fs.writeFile(env.npm_config_userconfig,'',{mode:0o600});await fs.writeFile(env.npm_config_globalconfig,'',{mode:0o600});
   if(t.kind==='serve'){t.port=await this.port();env.PORT=String(t.port);env.HOST='127.0.0.1';env.RELAY_DATA_DIR=path.join(this.storage,'preview-data',t.id);env.RELAY_WEEKLY_UPDATES='0';env.RELAY_DEVELOPMENT_PREVIEW_ID=t.id;if(/(?:^|\s)vite(?:\s|$)/.test(w.runtime!.scripts[t.script!]))args.push('--','--host','127.0.0.1','--port',String(t.port),'--strictPort');else if(/(?:^|\s)next\s+(?:dev|start)/.test(w.runtime!.scripts[t.script!]))args.push('--','--hostname','127.0.0.1','--port',String(t.port));}
   if(!alive(t))return;t.outputBaseline=await this.outputStats(e);if(!alive(t))return;if(process.versions.electron)env.ELECTRON_RUN_AS_NODE='1';
   t.phase=t.kind==='install'?'正在安装项目依赖（禁用自动安装钩子）':t.kind==='serve'?'正在启动并检查本地预览':'正在执行 '+t.script;t.status='running';this.append(t,'\n$ npm '+args.join(' ')+'\n');
   const child=spawn(process.execPath,[fileURLToPath(new URL('./development-runner.mjs',import.meta.url)),...args],{cwd:e.root,env,stdio:['ignore','pipe','pipe','ipc']});this.children.set(t.id,child);this.pending.delete(t.id);this.save();
   child.stdout!.on('data',b=>this.append(t,b.toString()));child.stderr!.on('data',b=>this.append(t,b.toString()));
   const flush=setInterval(()=>this.save(),900);flush.unref();const limit=setTimeout(()=>{this.append(t,'\n达到本轮运行时限，已暂停。\n');this.pause(t);},this.timeout);limit.unref();
   let probing=false;const probe=t.kind==='serve'?setInterval(async()=>{if(probing||!['running','ready'].includes(t.status))return;probing=true;try{const r=await fetch('http://127.0.0.1:'+t.port+(t.previewPath||'/'),{redirect:'manual',signal:AbortSignal.timeout(1000)});await r.body?.cancel();if(r.status<400&&t.status==='running'){t.url='http://127.0.0.1:'+t.port+(t.previewPath||'/');t.status='ready';t.phase='本地应用预览已就绪（HTTP '+r.status+'）';this.save();}}catch{}finally{probing=false;}},350):undefined;probe?.unref();
   child.once('error',err=>{this.append(t,'\n'+err.message);if(t.status!=='stopped'){t.status='failed';t.phase='无法启动开发命令：'+err.message;}});
   child.once('close',code=>{void(async()=>{clearInterval(flush);clearTimeout(limit);if(probe)clearInterval(probe);this.children.delete(t.id);this.pending.add(t.id);t.exitCode=code;t.finishedAt=Date.now();
    try{if(t.status==='running'||t.status==='ready'){if(t.kind==='serve'){t.status='failed';t.phase='预览进程已退出';delete t.url;}else if(code===0){if(t.kind==='install'){
      if(this.host.read(w,'package.json').hash!==pkgBefore.hash)throw new RuntimeError('安装期间依赖声明有人工修改，已保留，不切换环境');
      let lock:string|undefined;try{lock=await fs.readFile(path.join(e!.root,'package-lock.json'),'utf8')}catch{}
      if(lock!==undefined&&lock!==lockBefore.content)t.lockChange=this.host.lock(w,lock,lockBefore.hash,t.checkpointId);
      if(!alive(t))throw new RuntimeError('安装已暂停');e!.dependencies=this.dependencies(w);e!.ready=true;this.current[w.id]=e!.id;
     }if(t.kind==='package'||t.kind==='run')await this.artifacts(t,e!);if(!alive(t))return;t.status='passed';t.phase=t.kind==='install'?'依赖安装完成，独立环境已接通':t.kind==='package'?t.artifacts.length?'打包完成，产物已保存':'脚本退出成功，但未找到可下载产物':'项目脚本执行通过';if(t.kind==='package'&&!t.artifacts.length)t.status='failed';}else{t.status='failed';t.phase='项目命令未通过，请查看实际日志';}}
    }catch(err){if(t.status!=='stopped')t.status='failed';t.phase=(err as Error).message;this.append(t,'\n'+t.phase+'\n');}finally{this.pending.delete(t.id);this.save();}})();});
  }catch(err){if(t.status!=='stopped'){t.status='failed';t.phase=(err as Error).message;this.append(t,'\n'+t.phase+'\n');}this.pending.delete(t.id);this.save();}
  finally{if(!this.children.has(t.id)){this.pending.delete(t.id);this.save();}}
 }
 private async outputFiles(e:Environment){
  const result:{file:string;name:string;stamp:string;size:number}[]=[];let count=0;
  const walk=async(p:string)=>{let entries;try{if((await fs.lstat(p)).isSymbolicLink())return;entries=await fs.readdir(p,{withFileTypes:true})}catch{return}for(const f of entries){if(++count>5000)throw new RuntimeError('构建输出超过5000项，请缩小归档范围');if(f.isSymbolicLink()||f.name.startsWith('.env')||['node_modules','.git','.data'].includes(f.name))continue;const file=path.join(p,f.name);if(f.isDirectory()){if(!/\.app$/i.test(f.name))await walk(file);}else if(f.isFile()){const a=await fs.stat(file);result.push({file,name:path.relative(e.root,file),stamp:[a.size,a.mtimeMs,a.ctimeMs].join(':'),size:a.size});}}};
  for(const root of ['dist','build','out','desktop-release','release'])await walk(path.join(e.root,root));return result;
 }
 private async outputStats(e:Environment){return Object.fromEntries((await this.outputFiles(e)).map(f=>[f.name,f.stamp]));}
 private async artifacts(t:Task,e:Environment){
  const dir=path.join(this.storage,'artifacts',t.id);await fs.mkdir(dir,{recursive:true,mode:0o700});const files=await this.outputFiles(e),changed=files.filter(f=>t.outputBaseline?.[f.name]!==f.stamp);
  const add=async(file:string,name:string)=>{const stat=await fs.stat(file);if(stat.size>1024*1024*1024)throw new RuntimeError('产物超过1GB，未自动归档');const id=randomUUID(),out=path.join(dir,id);await fs.copyFile(file,out);const sha=createHash('sha256');for await(const chunk of sync.createReadStream(out))sha.update(chunk);t.artifacts.push({id,name,file:out,size:stat.size,sha256:sha.digest('hex')});};
  for(const f of changed)if(/\.(?:zip|tgz|tar\.gz|dmg|appimage|deb|rpm|exe|msi)$/i.test(f.name))await add(f.file,f.name);
  if(t.kind==='package'&&!t.artifacts.length&&changed.length){const inputs=files.filter(f=>/^(?:dist|build|out)\//.test(f.name));if(!inputs.length)return;if(inputs.reduce((n,f)=>n+f.size,0)>1024*1024*1024)throw new RuntimeError('构建目录超过1GB，未自动归档');const zip=path.join(dir,'build.zip'),archive=require('archiver')('zip',{zlib:{level:6}}),output=sync.createWriteStream(zip,{mode:0o600});
   await new Promise<void>((resolve,reject)=>{const abort=()=>{archive.abort();output.destroy();reject(new RuntimeError('归档已暂停'));};const timer=setInterval(()=>{if(!alive(t))abort();},100);output.once('close',()=>{clearInterval(timer);resolve();});output.once('error',e=>{clearInterval(timer);reject(e)});archive.on('error',(e:Error)=>{clearInterval(timer);reject(e)});archive.on('warning',(e:Error)=>{clearInterval(timer);reject(e)});archive.pipe(output);for(const f of inputs)archive.file(f.file,{name:f.name});void archive.finalize().catch(reject);});if(!alive(t))return;await add(zip,'project-build.zip');
  }
 }
 private async inspect(t:Task){
  const url=this.previewUrl(t.id);if(this.inspections.has(t.id))throw new RuntimeError('正在检查这个应用预览');const ac=new AbortController();this.inspections.set(t.id,ac);t.phase='正在用独立浏览器读取实际页面并截图';this.save();try{const observed=await inspectDevelopmentPreview(url,ac.signal);ac.signal.throwIfAborted();if(t.status!=='ready')throw new RuntimeError('预览已停止');let imageId:string|undefined;if(observed.image){imageId=randomUUID();const file=path.join(this.storage,'artifacts',t.id,imageId);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,observed.image,{mode:0o600});t.artifacts.push({id:imageId,name:'preview.jpg',file,size:observed.image.length,sha256:digest(observed.image)});}t.observation={snapshot:observed.snapshot,imageId};t.phase='已读取实际应用页面并保存截图';this.save();return{...this.public(t),snapshot:observed.snapshot};}finally{this.inspections.delete(t.id);}}
 private pause(t:Task){this.inspections.get(t.id)?.abort();if(alive(t)){t.status='stopped';t.phase='已暂停；继续会从本步重新运行，已完成步骤保留';delete t.url;const child=this.children.get(t.id);if(child?.connected)child.send({type:'stop'});else child?.kill('SIGTERM');this.save();}return this.public(t);}
 async stopWorkspace(id:string){for(const t of this.tasks)if(t.workspaceId===id&&alive(t))this.pause(t);const end=Date.now()+4000;while(this.tasks.some(t=>t.workspaceId===id&&(this.children.has(t.id)||this.pending.has(t.id)))&&Date.now()<end)await new Promise(r=>setTimeout(r,30));if(this.tasks.some(t=>t.workspaceId===id&&(this.children.has(t.id)||this.pending.has(t.id))))throw new RuntimeError('进程仍在结束，请稍后继续');}
 async stopAll(){this.stopping=true;await Promise.allSettled([...new Set(this.tasks.map(t=>t.workspaceId))].map(id=>this.stopWorkspace(id)));}
 previewUrl(id:string){const t=this.tasks.find(t=>t.id===id);if(!t||t.status!=='ready'||!this.children.has(id)||!t.url)throw new RuntimeError('预览已停止或尚未就绪',404);return t.url;}
 artifact(taskId:string,id:string){const t=this.tasks.find(t=>t.id===taskId);if(!t)throw new RuntimeError('产物已回滚或不存在',404);this.workspace(t.workspaceId);const a=t.artifacts.find(a=>a.id===id);if(!a)throw new RuntimeError('产物不存在',404);return a;}
 async action(input:unknown):Promise<any>{const d=runtimeRequest.parse(input),w=this.workspace(d.workspaceId);
  if(d.action==='runtimeStatus')return this.summary(w.id);
  if(d.action==='checkpoint')return this.checkpoint(w.id,d.requestId,d.label);
  if(d.action==='restoreCheckpoint'){if(!w.writable)throw new RuntimeError('Readonly workspace cannot restore source',403);const c=this.validateCheckpoint(w.id,d.checkpointId);await this.stopWorkspace(w.id);await this.host.stopChecks(w.id);const restored=this.host.restore(w,c.id);if(c.environmentId)this.current[w.id]=c.environmentId;else delete this.current[w.id];for(const t of this.tasks)if(t.checkpointId===c.id){t.status='rolledBack';t.phase='本轮已恢复；下面保留历史日志和产物副本';delete t.url;}c.status='restored';this.save();return{checkpointId:c.id,restored,environmentId:this.current[w.id]||null,message:'本轮源码差异已恢复，开发环境已切回；没有启动任何模型或预览'};}
  if(['install','run','serve','package'].includes(d.action)){
   const a=d as Extract<typeof d,{action:'install'|'run'|'serve'|'package'}>;this.grant(w,a.action,a.action==='install'?undefined:a.script);const signature=digest(JSON.stringify({...a,requestId:undefined}));const prior=this.tasks.find(t=>t.workspaceId===w.id&&t.requestId===a.requestId);if(prior){if(prior.signature!==signature)throw new RuntimeError('请求ID已用于不同开发动作');return this.public(prior);}if(this.stopping||this.busy(w.id))throw new RuntimeError('本项目仍有运行或预览，请先暂停该步骤');
   const cp=a.checkpointId?this.validateCheckpoint(w.id,a.checkpointId):this.checkpoint(w.id,randomUUID(),'本次'+a.action);
   const t:Task={id:randomUUID(),workspaceId:w.id,requestId:a.requestId,signature,kind:a.action,...(a.action==='install'?{mode:a.mode}:{script:a.script,...(a.action==='serve'?{previewPath:a.path}:{})}),checkpointId:cp.id,status:'preparing',phase:'准备实际开发环境',output:'',truncated:false,time:Date.now(),previousEnvironmentId:this.current[w.id],artifacts:[]};this.tasks.push(t);this.pending.add(t.id);this.save();void this.begin(t);return this.public(t);
  }
  if(!('taskId'in d))throw new RuntimeError('不支持的开发动作');const t=this.tasks.find(t=>t.id===d.taskId&&t.workspaceId===w.id);if(!t)throw new RuntimeError('开发步骤不属于这个项目',404);
  if(d.action==='inspectPreview')return this.inspect(t);if(d.action==='taskStatus')return this.public(t);if(d.action==='pauseTask')return this.pause(t);
  if(d.action==='resumeTask'){if(!['stopped','interrupted','failed'].includes(t.status))throw new RuntimeError('仅能明确继续已停止或失败的步骤');if(!d.requestId)throw new RuntimeError('继续需要独立请求ID',400);return this.action({action:t.kind,workspaceId:w.id,requestId:d.requestId,checkpointId:t.checkpointId,...(t.kind==='install'?{mode:t.mode}:{script:t.script,...(t.kind==='serve'?{path:t.previewPath||'/'}:{})})});}
  if(t.status==='rolledBack')return this.public(t);if(t.kind==='install'){if(t.lockChange&&this.current[w.id]!==t.environmentId)throw new RuntimeError('A later dependency environment exists; restore it first');await this.stopWorkspace(w.id);if((t.lockChange as any)?.id)await this.host.revert(w,(t.lockChange as any).id);}else{this.pause(t);const end=Date.now()+4000;while((this.children.has(t.id)||this.pending.has(t.id))&&Date.now()<end)await new Promise(r=>setTimeout(r,30));if(this.children.has(t.id)||this.pending.has(t.id))throw new RuntimeError('The process is still stopping');}if(t.kind==='install'&&this.current[w.id]===t.environmentId){if(t.previousEnvironmentId)this.current[w.id]=t.previousEnvironmentId;else delete this.current[w.id];}t.status='rolledBack';t.phase='本步结果已回滚，日志与产物副本保留；源码差异用回滚点恢复';delete t.url;this.save();return this.public(t);
 }
}
