import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {atomicJson,library,SkillLibrary,validateIndex,type Source,type Case,type DiscoveryIndex} from './skill-library.ts';

export interface TreeItem {path:string;type:string;sha:string}
const stamp=()=>new Date().toISOString();
const date=()=>stamp().slice(0,10);
export function mergeSourceTree(index:DiscoveryIndex,source:Source,tree:TreeItem[],rootSha:string,reviewCandidates:Case[]=[]){
 const current=new Map(tree.map(t=>[t.path,t])),existing=index.cases.filter(c=>c.source_id===source.id),paths=new Set(existing.map(c=>c.path));
 let added=0,changed=0,removed=0;
 for(const c of existing){const t=current.get(c.path);if(!t){c.unavailable=true;removed++;continue;}
  if(c.artifact?.sha!==t.sha){c.review_history=[...(c.review_history||[]),{...c.review,artifact:c.artifact}];c.review={stage:'indexed',scope:'Source artifact changed; earlier body review retained in review_history only',checked_on:date()};changed++;}
  if(c.unavailable)delete c.unavailable;
  c.artifact={type:t.type==='tree'?'tree':'blob',sha:t.sha};
  c.url=`https://github.com/${source.canonical_repo||source.id}/${t.type==='tree'?'tree':'blob'}/${source.branch||'main'}/${c.path}`;
  const incoming=reviewCandidates.find(v=>v.id===c.id&&v.artifact?.sha===t.sha&&v.review?.stage!=='indexed');if(incoming)c.review=incoming.review;
  if(t.type==='tree'){const doc=current.get(c.path+'/SKILL.md');if(doc)c.document={path:doc.path,sha:doc.sha};}
  else if(/\.(md|txt)$/i.test(c.path))c.document={path:c.path,sha:t.sha};
 }
 for(const t of tree){
  let file=t.path,casePath=file,kind='';
  if(source.discovery==='platform-reference'){
   if(file!=='README.md'||t.type!=='blob')continue;kind='workflow-platform';
  }else if(t.type==='blob'&&/(?:^|\/)SKILL\.md$/.test(file)) {casePath=path.posix.dirname(file);kind='skill-entry';}
  else if(t.type==='blob'&&/(?:^|\/)(?:workflows|prompts|commands|instructions)\/.+\.(?:md|ya?ml|json)$/.test(file)&&!file.includes('/node_modules/'))kind=file.includes('workflows/')?'workflow':'instruction';
  else if(t.type==='blob'&&source.id==='github/awesome-copilot'&&/^agents\/.+\.md$/.test(file))kind='agent-role';
  else if(t.type==='blob'&&/cookbook/.test(source.id)&&/\.ipynb$/.test(file))kind='cookbook';
  else continue;
  if(paths.has(casePath))continue;const artifact=current.get(casePath)||t;
  const c:Case={id:source.id+':'+casePath,source_id:source.id,path:casePath,title:source.discovery==='platform-reference'?source.title:path.posix.basename(casePath).replace(/\.(md|ipynb)$/,''),kind,native_category:casePath.split('/')[0],native_labels:casePath.split('/').filter(Boolean),domain_hints:source.domain_hints||[],mapping_basis:'Directory metadata only; category mapping is revisable',url:`https://github.com/${source.canonical_repo||source.id}/${artifact.type==='tree'?'tree':'blob'}/${source.branch||'main'}/${casePath}`,artifact:{type:artifact.type==='tree'?'tree':'blob',sha:artifact.sha},review:{stage:'indexed',scope:'Directory entry only; body not reviewed or executed',checked_on:date()},execution:{status:'not-run'}};
  if(/\.(md|txt)$/i.test(file))c.document={path:file,sha:t.sha};index.cases.push(c);paths.add(casePath);added++;
 }
 source.root_tree_sha=rootSha;source.tree_checked_on=date();source.tree_deferred=false;
 return{added,changed,removed};
}
async function fetchJson(url:string,fetcher:typeof fetch,signal?:AbortSignal){const r=await fetcher(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'Relay-local-skill-catalog'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
export async function refreshSkillLibrary(options:{store?:SkillLibrary;fetcher?:typeof fetch;sharedRoot?:string;sourceIds?:string[];signal?:AbortSignal}={}){
 const store=options.store||library,fetcher=options.fetcher||fetch;await fs.mkdir(store.directory,{recursive:true,mode:0o700});
 const lock=path.join(store.directory,'refresh.lock');let lockFile;
 try{lockFile=await fs.open(lock,'wx',0o600);}catch{
  // Recover only a dead owner's lock (or an abandoned empty lock), never a live updater.
  let abandoned=false;
  try{const stat=await fs.stat(lock);let owner:any=null;try{owner=JSON.parse(await fs.readFile(lock,'utf8'));}catch{}
   if(Number.isInteger(owner?.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(e){abandoned=(e as NodeJS.ErrnoException).code==='ESRCH';}}
   else abandoned=Date.now()-stat.mtimeMs>600000;
  }catch{}
  if(!abandoned)throw new Error('资料库已有更新在进行，请稍后刷新状态。');
  await fs.rm(lock,{force:true});try{lockFile=await fs.open(lock,'wx',0o600);}catch{throw new Error('资料库已有更新在进行，请稍后刷新状态。');}
 }
 await lockFile.writeFile(JSON.stringify({pid:process.pid,startedAt:stamp()}));
 const startedAt=stamp(),status:any={state:'running',startedAt,completedSources:0,totalSources:0,results:[],automaticExecution:false};
 const statusFile=path.join(store.directory,'update-status.json');
 try{
  const index=structuredClone(await store.index());const extra=JSON.parse(await fs.readFile(path.join(store.resourceDir,'additional-sources.json'),'utf8'));
  for(const s of extra.sources)if(!index.sources.some(v=>v.id===s.id))index.sources.push(s);
  let sharedCases:Case[]=[];
  const sharedRoot=options.sharedRoot||path.join(os.homedir(),'.codex/skills/agent-learning-loop/references');
  try{const shared=validateIndex(JSON.parse(await fs.readFile(path.join(sharedRoot,'discovery-index.json'),'utf8')));sharedCases=shared.cases;for(const s of shared.sources)if(!index.sources.some(v=>v.id===s.id))index.sources.push(s);}catch{}
  const sources=options.sourceIds?index.sources.filter(s=>options.sourceIds!.includes(s.id)):index.sources;status.totalSources=sources.length;await atomicJson(statusFile,status);
  // Metadata is checked for every source first; directory retrieval follows.
  // This keeps an API limit from starving sources at the end of the collection.
  const repositories:Source[]=[];
  for(const source of sources){
   if(options.signal?.aborted)throw new Error('更新已停止，保留原有效目录。');
   try{
    if(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.id)){
     const meta=await fetchJson('https://api.github.com/repos/'+source.id,fetcher,options.signal);
     source.canonical_repo=meta.full_name;source.branch=meta.default_branch;source.api_archived=meta.archived===true;source.pushed_at=meta.pushed_at;source.checked_on=date();
     source.license={...source.license,reported_spdx:meta.license?.spdx_id||null,scope:'Repository metadata; per-item license checked when reading a guide'};
     if(meta.archived)source.maintenance='historical';else if(source.maintenance!=='historical')source.maintenance='not-archived-at-check';
     repositories.push(source);status.results.push({id:source.id,state:'metadata-checked',added:0,changed:0,removed:0});
    }else{
     const r=await fetcher(source.url,{signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});if(!r.ok)throw new Error('HTTP '+r.status);
     const text=await r.text();if(text.length>2000000)throw new Error('Page exceeds metadata check limit');
     source.web_content_sha256=crypto.createHash('sha256').update(text).digest('hex');source.checked_on=date();
     status.results.push({id:source.id,state:'page-retrieved',note:'Retrieval is not a semantic body review'});
    }
   }catch(e){status.results.push({id:source.id,state:'failed',error:(e as Error).message.slice(0,300)});}
   status.completedSources++;await atomicJson(statusFile,status);
  }
  for(const source of repositories){const result=status.results.find((r:any)=>r.id===source.id);
   if(options.signal?.aborted)throw new Error('更新已停止，保留原有效目录。');
   try{
    if(source.discovery==='platform-reference'){
     const tree=await fetchJson(`https://api.github.com/repos/${source.canonical_repo}/git/trees/${encodeURIComponent(source.branch||'main')}`,fetcher,options.signal);
     const changes=mergeSourceTree(index,source,tree.tree,tree.sha,sharedCases);Object.assign(result,changes,{state:'directory-checked'});
    }else{
     const tree=await fetchJson(`https://api.github.com/repos/${source.canonical_repo}/git/trees/${encodeURIComponent(source.branch||'main')}?recursive=1`,fetcher,options.signal);
     if(tree.truncated||!Array.isArray(tree.tree))throw new Error('Directory response incomplete; kept previous entries');
     const changes=mergeSourceTree(index,source,tree.tree,tree.sha,sharedCases);Object.assign(result,changes,{state:'directory-checked'});
    }
   }catch(e){source.tree_deferred=true;Object.assign(result,{state:'directory-deferred',error:(e as Error).message.slice(0,300)});}
   await atomicJson(statusFile,status);
  }
  options.signal?.throwIfAborted();index.revision=stamp();index.checked_on=date();validateIndex(index);
  const target=path.join(store.directory,'catalog.json');
  try{await fs.copyFile(target,path.join(store.directory,'catalog.previous.json'));}catch{}
  await atomicJson(target,index);
  try{const methods=JSON.parse(await fs.readFile(path.join(sharedRoot,'domain-methods.json'),'utf8'));if(methods.schema_version===1&&Array.isArray(methods.methods)&&methods.methods.length&&Array.isArray(methods.domains))await atomicJson(path.join(store.directory,'methods.json'),methods);}catch{}
  const failures=status.results.filter((r:any)=>r.state==='failed'||r.state==='directory-deferred').length;
  Object.assign(status,{state:failures?'partial':'completed',finishedAt:stamp(),revision:index.revision,entries:index.cases.length,sources:index.sources.length,unavailableSources:failures});await atomicJson(statusFile,status);return status;
 }catch(e){Object.assign(status,{state:options.signal?.aborted?'cancelled':'failed',finishedAt:stamp(),error:(e as Error).message.slice(0,600)});await atomicJson(statusFile,status);throw e;}
 finally{await lockFile.close();await fs.rm(lock,{force:true});}
}
export async function applyConnectorTrees(snapshots:any[],store:SkillLibrary=library){
 if(!Array.isArray(snapshots)||snapshots.length>100)throw new Error('目录补充格式无效。');
 const index=structuredClone(await store.index());
 let status:any;try{status=JSON.parse(await fs.readFile(path.join(store.directory,'update-status.json'),'utf8'));}catch{status={startedAt:stamp(),results:[]};}
 if(status.state==='running')throw new Error('先等待本轮目录刷新完成。');
 for(const tree of snapshots){
  const source=index.sources.find(s=>s.id===tree.sourceId);
  if(!source||tree.truncated||!Array.isArray(tree.tree)||!tree.sha?.match(/^[0-9a-f]{40}$/)||tree.tree.length>100000)throw new Error('目录来源未知或响应不完整。');
  for(const t of tree.tree)if(typeof t.path!=='string'||t.path.startsWith('/')||t.path.split('/').includes('..')||!['blob','tree','commit'].includes(t.type)||!t.sha?.match(/^[0-9a-f]{40}$/))throw new Error('目录条目无效。');
  const changes=mergeSourceTree(index,source,tree.tree,tree.sha);let result=status.results.find((r:any)=>r.id===source.id);
  if(!result){result={id:source.id};status.results.push(result);}if(result.error){result.previousError=result.error;delete result.error;}Object.assign(result,changes,{state:'directory-checked-via-connector'});
 }
 index.revision=stamp();index.checked_on=date();validateIndex(index);
 try{await fs.copyFile(path.join(store.directory,'catalog.json'),path.join(store.directory,'catalog.previous.json'));}catch{}
 await atomicJson(path.join(store.directory,'catalog.json'),index);
 const failures=status.results.filter((r:any)=>r.state==='failed'||r.state==='directory-deferred').length;
 Object.assign(status,{state:failures?'partial':'completed',finishedAt:stamp(),revision:index.revision,entries:index.cases.length,sources:index.sources.length,unavailableSources:failures});await atomicJson(path.join(store.directory,'update-status.json'),status);return status;
}
