// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawn,type ChildProcess} from 'node:child_process';
import {z} from 'zod';
import {dataRoot} from './store.ts';
import {practiceSource,practiceExpected,practiceHash,practiceCommands,practiceFiles} from './development-practice.ts';

export class DevelopmentError extends Error {constructor(message:string,public status=409){super(message);}}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const missing='missing';
const commands=['typecheck','test','build'] as const;
const blocked=new Set(['.git','.data','.env','.npmrc','.yarnrc','.netrc','.pypirc','.docker','.azure','.config','credentials.json','id_rsa','id_ed25519','node_modules','dist','desktop-runtime','desktop-release','.playwright-mcp','test-results','.ssh','.aws','.codex','.learning-loop']);
function relativePath(value:string){
 if(!value||value.length>600||value.includes('\\')||value.includes('\0')||path.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||blocked.has(p)||p.startsWith('.env')&&p!=='.env.example'||/\.(?:pem|key|p12|pfx)$/i.test(p)))throw new DevelopmentError('只能访问仓库内的源码路径；密钥、运行数据和依赖目录不可访问',400);
 return value;
}
type Workspace={id:string;root:string;name:string;boardId:string;projectId?:string;writable:boolean;scriptsHash?:string;active:boolean;kind?:'practice'};
type Change={id:string;requestId:string;workspaceId:string;path:string;before:string|null;after:string|null;beforeHash:string;afterHash:string;mode:number;status:'prepared'|'applied'|'reverted'|'conflicted';time:number};
type Check={id:string;requestId:string;workspaceId:string;command:string;status:'running'|'passed'|'failed'|'stopped'|'interrupted';output:string;truncated:boolean;startedAt:number;finishedAt?:number;exitCode?:number|null;sourceHash?:string;runner?:string};
const request=z.discriminatedUnion('action',[
 z.object({action:z.literal('list'),boardId:z.string().max(180).optional()}),
 z.object({action:z.literal('practice'),boardId:z.string().min(1).max(180),projectId:z.string().min(1).max(180),requestId:z.string().uuid()}),
 z.object({action:z.literal('preview'),directory:z.string().min(1).max(2000)}),
 z.object({action:z.literal('attach'),directory:z.string().min(1).max(2000),boardId:z.string().min(1).max(180),projectId:z.string().max(180).optional(),writable:z.boolean(),allowChecks:z.boolean(),scriptsHash:z.string().length(64)}),
 z.object({action:z.literal('files'),workspaceId:z.string().uuid(),query:z.string().max(200).default(''),page:z.number().int().min(1).default(1)}),
 z.object({action:z.literal('read'),workspaceId:z.string().uuid(),path:z.string(),start:z.number().int().min(0).default(0),length:z.number().int().min(1).max(20000).default(12000)}),
 z.object({action:z.literal('write'),workspaceId:z.string().uuid(),path:z.string(),content:z.string().max(180000),expectedHash:z.string(),requestId:z.string().uuid()}),
 z.object({action:z.literal('replace'),workspaceId:z.string().uuid(),path:z.string(),oldText:z.string().min(1).max(64000),newText:z.string().max(64000),expectedHash:z.string(),requestId:z.string().uuid()}),
 z.object({action:z.literal('delete'),workspaceId:z.string().uuid(),path:z.string(),expectedHash:z.string(),requestId:z.string().uuid()}),
 z.object({action:z.literal('diff'),workspaceId:z.string().uuid(),changeId:z.string().uuid().optional()}),
 z.object({action:z.literal('gitDiff'),workspaceId:z.string().uuid(),path:z.string()}),
 z.object({action:z.enum(['revert','reapply']),workspaceId:z.string().uuid(),changeId:z.string().uuid()}),
 z.object({action:z.literal('check'),workspaceId:z.string().uuid(),command:z.enum(commands),requestId:z.string().uuid()}),
 z.object({action:z.literal('checkStatus'),workspaceId:z.string().uuid(),runId:z.string().uuid()}),
 z.object({action:z.literal('stop'),workspaceId:z.string().uuid(),runId:z.string().uuid()}),
 z.object({action:z.literal('detach'),workspaceId:z.string().uuid()}),
]);
export class Development {
 private workspaces:Workspace[]=[];private changes:Change[]=[];private checks:Check[]=[];private children=new Map<string,ChildProcess>();private checkRequests=new Map<string,string>();
 constructor(readonly storage=path.join(dataRoot,'development'),private runTimeout=5*60*1000){
  fs.mkdirSync(storage,{recursive:true,mode:0o700});
  for(const [file,key] of [['workspaces.json','workspaces'],['changes.json','changes'],['checks.json','checks']] as const){try{const saved=JSON.parse(fs.readFileSync(path.join(storage,file),'utf8'));if(Array.isArray(saved))this[key]=saved as any;}catch{}}
  for(const c of this.checks){this.checkRequests.set(c.workspaceId+':'+c.requestId,c.id);if(c.status==='running'){c.status='interrupted';c.finishedAt=Date.now();}}
  // Recover a journal entry after a crash between atomic replacement and receipt persistence.
  for(const c of this.changes)if(c.status==='prepared'){try{const h=this.current(this.get(c.workspaceId),c.path).hash;c.status=h===c.afterHash?'applied':h===c.beforeHash?'reverted':'conflicted';}catch{c.status='conflicted';}}
  this.persist();
 }
 private save(file:string,value:unknown){const target=path.join(this.storage,file);fs.writeFileSync(target+'.tmp',JSON.stringify(value),{mode:0o600});fs.renameSync(target+'.tmp',target);}
 private persist(){this.save('workspaces.json',this.workspaces);this.save('changes.json',this.changes);this.save('checks.json',this.checks);}
 private git(root:string,args:string[]){return execFileSync('git',['-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:15000,stdio:['ignore','pipe','pipe']});}
 private get(id:string){const w=this.workspaces.find(w=>w.id===id&&w.active);if(!w)throw new DevelopmentError('源码工作区未连接或已断开',404);if(fs.realpathSync(w.root)!==w.root)throw new DevelopmentError('项目路径已变化，请重新连接');return w;}
 private summary(w:Workspace){let checksAllowed=false;try{checksAllowed=!!w.scriptsHash&&w.scriptsHash===this.manifest(w.root).scriptsHash;}catch{}const last=this.checks.filter(c=>c.workspaceId===w.id).at(-1);return{...w,checksAllowed,commands:w.kind==='practice'?Object.keys(practiceCommands):[...commands],practice:w.kind==='practice'?{source:practiceSource,baselineHash:practiceHash,expectedTitle:practiceExpected}:null,lastCheck:last?{id:last.id,command:last.command,status:last.status}:null,running:this.checks.filter(c=>c.workspaceId===w.id&&(c.status==='running'||this.children.has(c.id))).map(c=>({id:c.id,command:c.command,status:c.status}))};}
 private manifest(root:string){
  const file=path.join(root,'package.json');if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw new DevelopmentError('开发检查需要仓库中的普通 package.json 文件',400);
  const text=fs.readFileSync(file,'utf8'),pkg=JSON.parse(text);return{name:typeof pkg.name==='string'?pkg.name.slice(0,120):path.basename(root),scriptsHash:hash(text),scripts:Object.fromEntries(commands.filter(c=>typeof pkg.scripts?.[c]==='string').map(c=>[c,pkg.scripts[c]]))};
 }
 preview(directory:string){
  if(!path.isAbsolute(directory))throw new DevelopmentError('请填写 Git 仓库的绝对路径',400);
  const root=fs.realpathSync(directory),top=fs.realpathSync(this.git(root,['rev-parse','--show-toplevel']).trim());
  if(root!==top||root===path.parse(root).root)throw new DevelopmentError('请选择 Git 仓库根目录，不能选择上层目录',400);
  return{root,...this.manifest(root),warning:'检查会运行这个仓库的代码，使用你的本机账号权限，不是安全沙箱。密钥与运行目录不向 Agent 开放。'};
 }
 private target(w:Workspace,name:string){
  relativePath(name);const parts=name.split('/');let current=w.root;
  for(const p of parts){current=path.join(current,p);try{if(fs.lstatSync(current).isSymbolicLink())throw new DevelopmentError('不访问符号链接；请使用仓库内普通文件',400);}catch(e){if((e as any).code!=='ENOENT')throw e;}}
  if(w.kind==='practice'){if(!Object.hasOwn(practiceFiles,name))throw new DevelopmentError('练习只开放示例文件；请另行连接自己的仓库',400);return current;}
  const result=execFileSync('git',['-C',w.root,'check-ignore','--no-index','--',name],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});
  if(result.trim())throw new DevelopmentError('被 Git 忽略的文件不向源码工作区开放',400);
  return current;
 }
 private safeTarget(w:Workspace,name:string){try{return this.target(w,name);}catch(e){if((e as any).status===1)return path.join(w.root,relativePath(name));throw e;}}
 private current(w:Workspace,name:string){const file=this.safeTarget(w,name);if(!fs.existsSync(file))return{file,content:null,hash:missing,mode:0o644};const stat=fs.statSync(file);if(!stat.isFile()||stat.size>1024*1024)throw new DevelopmentError('仅支持不超过1MB的普通文本源码',400);const data=fs.readFileSync(file);if(data.includes(0))throw new DevelopmentError('二进制文件请用原应用处理',400);const content=data.toString('utf8');if(!Buffer.from(content).equals(data))throw new DevelopmentError('仅支持 UTF-8 源码',400);return{file,content,hash:hash(content),mode:stat.mode&0o777};}
 private replaceFile(w:Workspace,name:string,content:string|null,mode:number){const file=this.safeTarget(w,name);if(content===null){if(fs.existsSync(file))fs.unlinkSync(file);return;}fs.mkdirSync(path.dirname(file),{recursive:true});this.safeTarget(w,name);const temp=file+'.relay-'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,content,{mode});fs.chmodSync(temp,mode);fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 private changePublic(c:Change,body=false){return{id:c.id,workspaceId:c.workspaceId,path:c.path,kind:c.before===null?'create':c.after===null?'delete':'edit',beforeHash:c.beforeHash,afterHash:c.afterHash,status:c.status,time:c.time,...(body?{before:c.before,after:c.after}:{})};}
 private edit(w:Workspace,name:string,content:string|null,expectedHash:string,requestId:string){
  if(!w.writable)throw new DevelopmentError('此工作区为只读，请在连接设置中开启源码写入',403);
  if(content!==null&&Buffer.byteLength(content)>1024*1024)throw new DevelopmentError('修改后的源码不能超过1MB',400);
  const prior=this.changes.find(c=>c.requestId===requestId&&c.workspaceId===w.id);if(prior){if(prior.path!==name||prior.after!==content||prior.beforeHash!==expectedHash)throw new DevelopmentError('重复请求与原编辑内容不同');if(prior.status==='prepared'){const actual=this.current(w,name).hash;if(actual!==prior.afterHash){if(actual!==prior.beforeHash)throw new DevelopmentError('原编辑未完成，文件已由其他操作修改');this.replaceFile(w,name,content,prior.mode);}prior.status='applied';this.persist();}return this.changePublic(prior);}
  const current=this.current(w,name);if(current.hash!==expectedHash)throw new DevelopmentError('文件已被其他操作修改，请重新读取；没有覆盖你的修改');
  if(current.content===content)return{unchanged:true,path:name,hash:current.hash};
  const change:Change={id:randomUUID(),workspaceId:w.id,requestId,path:name,before:current.content,after:content,beforeHash:current.hash,afterHash:content===null?missing:hash(content),mode:current.mode,status:'prepared',time:Date.now()};
  this.changes.push(change);this.persist();this.replaceFile(w,name,content,current.mode);change.status='applied';this.persist();return this.changePublic(change);
 }
 private checkPublic(c:Check){return{...c,settled:!this.children.has(c.id),message:(c.status==='running'?'正在运行':c.status==='passed'?'检查通过':c.status==='stopped'?this.children.has(c.id)?'正在停止':'检查已停止':'检查未通过')+'：'+(c.runner||'npm run '+c.command)};}
 stop(id:string){const c=this.checks.find(c=>c.id===id);if(!c)throw new DevelopmentError('检查记录不存在',404);if(c.status==='running'){c.status='stopped';c.finishedAt=Date.now();const child=this.children.get(id);if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}const timer=setTimeout(()=>{if(this.children.get(id)!==child)return;try{process.kill(-child.pid!,'SIGKILL');}catch{}},2000);timer.unref();}this.persist();}return this.checkPublic(c);}
 async stopAll(){const children=[...this.children.values()];for(const c of this.checks)if(c.status==='running')this.stop(c.id);await Promise.all(children.map(child=>new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode){resolve();return;}const timer=setTimeout(resolve,2500);child.once('close',()=>{clearTimeout(timer);resolve();});})));}
 async action(input:unknown){
  const d=request.parse(input);
  if(d.action==='list')return{workspaces:this.workspaces.filter(w=>w.active&&(!d.boardId||w.boardId===d.boardId)).map(w=>this.summary(w))};
  if(d.action==='practice'){
   const previous=this.workspaces.find(w=>w.id===d.requestId);if(previous){if(previous.kind!=='practice'||previous.boardId!==d.boardId||previous.projectId!==d.projectId||!previous.active)throw new DevelopmentError('练习请求已被使用或断开，请新开一轮');return this.summary(previous);}
   const parent=path.join(this.storage,'practice');fs.mkdirSync(parent,{recursive:true,mode:0o700});const root=fs.realpathSync(fs.mkdtempSync(path.join(parent,'project-')));
   try{for(const [name,body] of Object.entries(practiceFiles)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body,{mode:0o600,flag:'wx'});}}catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
   const w:Workspace={id:d.requestId,root,name:'本地源码练习',boardId:d.boardId,projectId:d.projectId,writable:true,active:true,kind:'practice',scriptsHash:this.manifest(root).scriptsHash};this.workspaces.push(w);this.persist();return this.summary(w);
  }
  if(d.action==='preview')return this.preview(d.directory);
  if(d.action==='attach'){
   const p=this.preview(d.directory);if(p.scriptsHash!==d.scriptsHash)throw new DevelopmentError('检查脚本已变化，请重新查看后连接');
   let w=this.workspaces.find(w=>w.root===p.root&&w.boardId===d.boardId&&w.projectId===d.projectId);if(!w){w={id:randomUUID(),root:p.root,name:p.name,boardId:d.boardId,projectId:d.projectId,writable:d.writable,active:true};this.workspaces.push(w);}w.writable=d.writable;w.scriptsHash=d.allowChecks?p.scriptsHash:undefined;w.active=true;this.persist();return this.summary(w);
  }
  const w=this.get(d.workspaceId);
  if(d.action==='detach'){this.checks.filter(c=>c.workspaceId===w.id&&c.status==='running').forEach(c=>this.stop(c.id));w.active=false;this.persist();return{workspaceId:w.id,detached:true,message:'已断开源码工作区，原文件和差异记录保留'};}
  if(d.action==='files'){
   const names=(w.kind==='practice'?Object.keys(practiceFiles).filter(n=>fs.existsSync(path.join(w.root,n))):this.git(w.root,['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean)).filter(n=>{try{relativePath(n);return n.toLowerCase().includes(d.query.toLowerCase());}catch{return false;}});
   const unique=[...new Set(names)].sort();return{workspaceId:w.id,files:unique.slice((d.page-1)*60,d.page*60),page:d.page,total:unique.length};
  }
  if(d.action==='read'){const c=this.current(w,d.path);if(c.content===null)throw new DevelopmentError('文件不存在',404);const end=Math.min(c.content.length,d.start+d.length);return{workspaceId:w.id,path:d.path,hash:c.hash,start:d.start,text:c.content.slice(d.start,end),total:c.content.length,nextStart:end<c.content.length?end:null};}
  if(d.action==='write'||d.action==='delete')return this.edit(w,d.path,d.action==='delete'?null:d.content,d.expectedHash,d.requestId);
  if(d.action==='replace'){
   const prior=this.changes.find(c=>c.workspaceId===w.id&&c.requestId===d.requestId);if(prior){if(prior.path!==d.path||prior.beforeHash!==d.expectedHash||prior.before===null||prior.before.split(d.oldText).length!==2||prior.after!==prior.before.replace(d.oldText,()=>d.newText))throw new DevelopmentError('重复替换请求不一致');return this.edit(w,d.path,prior.after,d.expectedHash,d.requestId);}
   const c=this.current(w,d.path);if(c.hash!==d.expectedHash)throw new DevelopmentError('文件已变化，请重新读取');if(c.content===null||c.content.split(d.oldText).length!==2)throw new DevelopmentError('替换片段必须在当前文件中恰好出现一次');return this.edit(w,d.path,c.content.replace(d.oldText,()=>d.newText),d.expectedHash,d.requestId);
  }
  if(d.action==='diff'){
   if(d.changeId){const c=this.changes.find(c=>c.workspaceId===w.id&&c.id===d.changeId);if(!c)throw new DevelopmentError('差异记录不存在',404);return this.changePublic(c,true);}
   return{workspaceId:w.id,changes:this.changes.filter(c=>c.workspaceId===w.id).slice(-100).reverse().map(c=>this.changePublic(c)),gitStatus:w.kind==='practice'?'本地练习使用逐次差异记录；尚未创建 Git 仓库':this.git(w.root,['status','--short','--untracked-files=no']).slice(0,12000)};
  }
  if(d.action==='gitDiff'){if(w.kind==='practice')throw new DevelopmentError('练习工程没有 Git，请查看差异与回滚；自己的 Git 仓库仍可查看 Git diff');this.current(w,d.path);let base:string[]=[];try{this.git(w.root,['rev-parse','--verify','HEAD']);base=['HEAD'];}catch{}const diff=this.git(w.root,['diff','--no-ext-diff','--no-textconv',...base,'--',d.path]);return{workspaceId:w.id,path:d.path,diff:diff.slice(0,60000),truncated:diff.length>60000,base:base.length?'HEAD':'index'};}
  if(d.action==='revert'||d.action==='reapply'){
   if(!w.writable)throw new DevelopmentError('只读工作区不能回滚',403);const c=this.changes.find(c=>c.workspaceId===w.id&&c.id===d.changeId);if(!c)throw new DevelopmentError('差异记录不存在',404);
   const reverting=d.action==='revert',wanted=reverting?'reverted':'applied';if(c.status===wanted)return this.changePublic(c);
   const current=this.current(w,c.path),expected=reverting?c.afterHash:c.beforeHash;if(current.hash!==expected)throw new DevelopmentError('此文件已有后续修改；先处理后续差异，不能覆盖人工编辑');
   this.replaceFile(w,c.path,reverting?c.before:c.after,c.mode);c.status=wanted;this.persist();return this.changePublic(c);
  }
  if(d.action==='check'){
   const previous=this.checkRequests.get(w.id+':'+d.requestId);if(previous)return this.checkPublic(this.checks.find(c=>c.id===previous)!);
   const pkg=this.manifest(w.root);if(!w.scriptsHash||pkg.scriptsHash!==w.scriptsHash)throw new DevelopmentError('检查权限未开启或 package.json 已变化，请先在连接界面核对脚本');if(!pkg.scripts[d.command])throw new DevelopmentError('此项目没有该检查脚本',400);
   if(this.checks.some(c=>c.workspaceId===w.id&&(c.status==='running'||this.children.has(c.id))))throw new DevelopmentError('本项目已有检查在运行或停止中，请等待');
   const runner=w.kind==='practice'?practiceCommands[d.command]:null;
   const c:Check={...(runner?{sourceHash:this.current(w,practiceSource).hash,runner:'内置 Node · '+runner.join(' ')}:{}),id:randomUUID(),requestId:d.requestId,workspaceId:w.id,command:d.command,status:'running',output:'',truncated:false,startedAt:Date.now()};this.checks.push(c);this.checkRequests.set(w.id+':'+d.requestId,c.id);this.persist();
   const env={...process.env};for(const name of Object.keys(env))if(name.startsWith('RELAY_')||/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(name)||['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','ELECTRON_RUN_AS_NODE'].includes(name))delete env[name];
   if(process.platform==='darwin')env.PATH=['/opt/homebrew/bin','/usr/local/bin',env.PATH||'/usr/bin:/bin'].join(path.delimiter);
   if(runner&&process.versions.electron)env.ELECTRON_RUN_AS_NODE='1';
   const child=spawn(runner?process.execPath:'npm',runner||['run',d.command],{cwd:w.root,env,detached:true,stdio:['ignore','pipe','pipe']});this.children.set(c.id,child);
   const append=(buffer:Buffer)=>{const text=buffer.toString();if(c.output.length+text.length>200000)c.truncated=true;c.output=(c.output+text).slice(-200000);};child.stdout.on('data',append);child.stderr.on('data',append);
   const timer=setTimeout(()=>{append(Buffer.from('\n检查达到5分钟上限，已停止。\n'));this.stop(c.id);},this.runTimeout);timer.unref();
   child.once('error',e=>{append(Buffer.from(e.message));c.status='failed';});child.once('close',code=>{clearTimeout(timer);this.children.delete(c.id);if(c.status==='running')c.status=code===0?'passed':'failed';c.exitCode=code;c.finishedAt=Date.now();this.persist();});return this.checkPublic(c);
  }
  if(!('runId' in d))throw new DevelopmentError('不支持的开发动作',400);
  const check=this.checks.find(c=>c.workspaceId===w.id&&c.id===d.runId);if(!check)throw new DevelopmentError('检查记录不属于此工作区',404);return d.action==='stop'?this.stop(check.id):this.checkPublic(check);
 }
}
export const development=new Development();
