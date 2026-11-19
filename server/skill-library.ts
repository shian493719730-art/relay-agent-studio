import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {z} from 'zod';
import {projectRoot,dataRoot} from './store.ts';
import {claudeJson,refineWithSkills,loadSkillGuides,type ClaudeJson,type SkillGuide} from './studio-ai.ts';

export interface DiscoveryIndex {schema_version:number;revision:string;checked_on?:string;sources:Source[];cases:Case[];[key:string]:any}
export interface Source {id:string;url:string;title:string;branch?:string;maintenance?:string;license?:any;[key:string]:any}
export interface Case {id:string;source_id:string;path:string;title:string;kind:string;url:string;review:any;artifact?:any;[key:string]:any}
export const CATEGORIES=[
 {id:'development',title:'开发与调试',terms:['coding','code','debug','test','engineering','software','typescript','python','开发','编程','代码','调试','修复','测试','后端','前端','部署','接口']},
 {id:'design',title:'产品与设计',terms:['design','frontend','ui','ux','product','界面','设计','页面','产品','原型','交互']},
 {id:'documents',title:'Word 与 PDF',terms:['docx','document','pdf','word','文档','合同','报告','文件']},
 {id:'spreadsheets',title:'表格与报表',terms:['xlsx','spreadsheet','excel','formula','表格','报表','公式','财务']},
 {id:'slides',title:'演示与汇报',terms:['pptx','powerpoint','slide','presentation','ppt','幻灯片','演示文稿','汇报','路演']},
 {id:'writing',title:'写作与沟通',terms:['writing','editing','comms','email','content','营销','写作','邮件','周报','文案','内容','自媒体','沟通']},
 {id:'research',title:'研究与阅读',terms:['research','literature','review','evidence','学术','研究','论文','文献','综述','证据']},
 {id:'data',title:'数据与数据库',terms:['data','analysis','sql','postgres','database','数据','数据库','分析','统计','可视化']},
 {id:'automation',title:'自动化与工作流',terms:['workflow','automation','agent','mcp','integration','自动化','工作流','协作','定时','连接','货运','运营']},
 {id:'security',title:'安全与审计',terms:['security','audit','vulnerability','安全','审计','漏洞']},
 {id:'media',title:'图片与视频',terms:['image','video','remotion','animation','图片','视频','动画','封面','创意']},
 {id:'learning',title:'学习与知识管理',terms:['learning','study','lesson','memory','knowledge','context','学习','复习','知识库','记忆','上下文']},
];
const ALIASES:Record<string,string[]>={
 '办公':['document','spreadsheet','presentation','writing','comms','automation'],
 'Word':['docx','document'],'word':['docx','document'],'文档':['docx','document','pdf'],
 'Excel':['xlsx','spreadsheet'],'excel':['xlsx','spreadsheet'],'表格':['xlsx','spreadsheet','excel'],
 'PPT':['pptx','presentation','slides'],'ppt':['pptx','presentation','slides'],'汇报':['pptx','presentation','slides','comms'],
 '周报':['internal-comms','writing','communication','report'],'邮件':['email','comms','writing'],
 '调试':['debugging','debug'],'修复':['debugging','bug','test'],'测试':['testing','test-driven','verification'],
 '数据库':['postgres','sql','database'],'前端':['frontend','web','react'],'工作流':['workflow','automation'],
 '自媒体':['content','writing','marketing','video'],'运营':['marketing','automation','workflow','content'],
 '货运':['workflow','automation','integration','operations'],'文献':['literature','review','research'],
};
const OPEN=/^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|GPL-[23]\.0(?:-only|-or-later)?|AGPL-3\.0(?:-only|-or-later)?|CC-BY-4\.0|Unlicense)$/;
const today=()=>new Date().toISOString().slice(0,10);
const readJson=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
export async function atomicJson(file:string,data:unknown){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
}
export function validateIndex(d:DiscoveryIndex){
 if(d.schema_version!==1||!d.revision||!Array.isArray(d.sources)||!Array.isArray(d.cases))throw new Error('能力库格式无效。');
 const ids=new Set(d.sources.map(s=>s.id));if(ids.size!==d.sources.length)throw new Error('能力库来源重复。');
 const entries=new Set<string>();
 for(const c of d.cases){if(!ids.has(c.source_id)||entries.has(c.id)||!c.id||!c.path||!/^https:\/\//.test(c.url)||!['indexed','body-reviewed','section-reviewed'].includes(c.review?.stage))throw new Error('能力库条目或来源记录无效：'+c.id);entries.add(c.id);}
 return d;
}
export interface LibraryEntry {id:string;title:string;description:string;kind:string;url:string;sourceId:string;sourceTitle:string;categories:string[];tags:string[];review:string;reviewedOn:string|null;license:string|null;licenseStatus:string;historical:boolean;instructionAvailable:boolean;revision:string;path:string;[key:string]:any}
export const projectNeeds=z.object({id:z.string().max(180).optional(),name:z.string().max(240).default(''),goal:z.string().max(10000).default(''),roles:z.array(z.string().max(500)).max(40).default([]),fileTypes:z.array(z.string().max(20)).max(30).default([])});
type ProjectNeeds=z.infer<typeof projectNeeds>;
export class SkillLibrary {
 readonly directory:string;readonly resourceDir:string;private loaded?:{mtime:number;index:DiscoveryIndex};private receiptQueue:Promise<void>=Promise.resolve();
 constructor(options:{directory?:string;resourceDir?:string}={}){this.directory=options.directory||path.join(dataRoot,'library');this.resourceDir=options.resourceDir||path.join(projectRoot,'resources/library');}
 async index(){
  const file=path.join(this.directory,'catalog.json');
  try{const stat=await fs.stat(file);if(this.loaded?.mtime===stat.mtimeMs)return this.loaded.index;const d=validateIndex(await readJson(file));this.loaded={mtime:stat.mtimeMs,index:d};return d;}
  catch{const seed=validateIndex(await readJson(path.join(this.resourceDir,'discovery-index.json')));return seed;}
 }
 async entries():Promise<LibraryEntry[]>{
  const [index,highlights,methods,receipts]=await Promise.all([this.index(),readJson(path.join(this.resourceDir,'highlights.json')),this.methods(),readJson(path.join(this.directory,'read-receipts.json')).catch(()=>({}))]);
  const sources=new Map(index.sources.map(s=>[s.id,s]));
  const rows:LibraryEntry[]=index.cases.map(c=>{
   const source=sources.get(c.source_id)!,highlight=highlights[c.id];
   const content=[c.title,c.path,...(c.native_labels||[]),...(highlight?.tags||[])].join(' ').toLowerCase();
   const categories=CATEGORIES.filter(x=>x.terms.some(t=>containsTerm(content,t.toLowerCase()))).map(x=>x.id);
   const version=c.document?.sha||c.artifact?.sha||index.revision,receipt=receipts[c.id]?.version===version?receipts[c.id]:null;
   const license=receipt?.license||c.license?.reported_spdx||source.license?.reported_spdx||null;
   const historical=source.maintenance==='historical'||source.api_archived===true||c.unavailable===true;
   return{id:c.id,title:highlight?.title||c.title,description:highlight?.description||(/(?:^|\/)\.github\/workflows\//.test(c.path)?'仓库开发与 CI 自动化；需要对应执行环境。':`${c.native_category||c.kind} · ${source.title}`),kind:c.kind,url:c.url,sourceId:source.id,sourceTitle:source.title,categories:categories.length?categories:['automation'],tags:[...(c.native_labels||[]),...(highlight?.tags||[])],review:c.review.stage,reviewedOn:c.review.checked_on||null,bodyReadOn:receipt?.cachedOn||null,license,licenseStatus:OPEN.test(license||'')?'declared-open':license?'check-terms':'unknown',historical,instructionAvailable:!!receipt||c.local_body===true,revision:version,path:c.path};
  });
  for(const m of methods.methods){const domains=methods.domains.filter((d:any)=>d.methods.includes(m.id));rows.push({id:'method:'+m.id,title:m.title,description:domains.map((d:any)=>d.intent).join('；').slice(0,500),kind:'local-method',url:'https://github.com/shian493719730-art/snapper-assist',sourceId:'snapper-methods',sourceTitle:'Snapper 已有方法适配',categories:CATEGORIES.filter(c=>c.terms.some(t=>[m.title,...m.deliverables].join(' ').toLowerCase().includes(t))).map(c=>c.id),tags:domains.flatMap((d:any)=>[d.title,...d.keywords]),review:'adapted-method',reviewedOn:'2026-11-10',license:'MIT',licenseStatus:'local-adaptation',historical:false,instructionAvailable:true,revision:methods.revision,path:m.id});}
  return rows;
 }
 async methods(){try{const d=await readJson(path.join(this.directory,'methods.json'));if(d.schema_version===1&&Array.isArray(d.methods)&&Array.isArray(d.domains))return d;}catch{}return readJson(path.join(this.resourceDir,'domain-methods.json'));}
 async search(input:{query?:string;category?:string;kind?:string;page?:number;pageSize?:number;includeHistorical?:boolean;openOnly?:boolean}){
  const all=await this.entries(),terms=expandTerms(input.query||'');
  let rows=all.filter(e=>(input.includeHistorical||!e.historical)&&(!input.category||e.categories.includes(input.category))&&(!input.kind||e.kind===input.kind)&&(!input.openOnly||['declared-open','local-adaptation'].includes(e.licenseStatus)));
  if(terms.length)rows=rows.map(e=>({...e,score:entryScore(e,terms)})).filter(e=>e.score>0).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
  else rows.sort((a,b)=>(Number(b.instructionAvailable)-Number(a.instructionAvailable))||a.title.localeCompare(b.title));
  const page=Math.max(1,input.page||1),pageSize=Math.max(1,Math.min(60,input.pageSize||24)),index=await this.index();
  return {entries:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize,categories:CATEGORIES.map(c=>({id:c.id,title:c.title,count:all.filter(e=>e.categories.includes(c.id)).length})),kinds:[...new Set(all.map(e=>e.kind))],stats:{resources:all.length,upstreamEntries:index.cases.length,sources:index.sources.length,localMethods:all.filter(e=>e.kind==='local-method').length,revision:index.revision,checkedOn:index.checked_on||null}};
 }
 async recommend(input:unknown){
  const p=projectNeeds.parse(input),query=[p.name,p.goal,...p.roles,...p.fileTypes].join(' '),terms=expandTerms(query),entries=await this.entries();
  if(!p.goal.trim()&&!p.fileTypes.length)return{items:[],mode:'local',message:'先写下项目目标，推荐才有依据。',goalKey:goalKey(p)};
  const matchedCategories=CATEGORIES.filter(c=>c.terms.some(t=>containsTerm(query.toLowerCase(),t.toLowerCase())));
  const development=matchedCategories.some(c=>c.id==='development');
  const generic=new Set(['workflow','automation','integration','operations','agent','content','writing','data','analysis','工作流','自动化','协作','运营','连接']);
  const specific=terms.filter(t=>!generic.has(t));
  const candidates=entries.filter(e=>!e.historical&&(development||!/(?:^|\/)(?:\.github\/workflows|cicd-automation|kubernetes-operations|devops|gitops)(?:\/|$)/.test(e.path)))
   .map(e=>({...e,score:entryScore(e,terms)+matchedCategories.filter(c=>e.categories.includes(c.id)).length*3+(e.review==='body-reviewed'?2:0)}))
   .filter(e=>e.score>2&&(e.kind==='local-method'?entryScore(e,terms)>0:entryScore(e,specific)>0)).sort((a,b)=>b.score-a.score);
  const chosen:typeof candidates=[];const counts:Record<string,number>={};
  for(const e of candidates){if((counts[e.sourceId]||0)>=3)continue;chosen.push(e);counts[e.sourceId]=(counts[e.sourceId]||0)+1;if(chosen.length>=8)break;}
  return{mode:'local',goalKey:goalKey(p),message:'按目标、职责和文件类型进行本地初筛；可让统筹进一步判断。',items:chosen.map(e=>({entry:e,reason:'匹配 '+(matchedCategories.filter(c=>e.categories.includes(c.id)).map(c=>c.title).join('、')||terms.filter(t=>entryScore(e,[t])>0).slice(0,4).join('、')),adaptation:'加入项目后按本次目标取用，原项目要求优先。'}))};
 }
 async semanticRecommend(input:unknown,signal?:AbortSignal,generate:ClaudeJson=claudeJson){
  const p=projectNeeds.extend({goal:z.string().trim().min(1,'先填写项目目标。').max(10000)}).parse(input);
  const local=await this.recommend(p),searched=await this.search({query:[p.goal,...p.fileTypes].join(' '),pageSize:50});
  const candidates=[...new Map([...local.items.map(i=>i.entry),...searched.entries].map(e=>[e.id,e])).values()].slice(0,55);
  if(!candidates.length)return{...local,mode:'semantic',items:[],message:'当前库中没有合适候选，不强行推荐。'};
  const schema={type:'object',properties:{summary:{type:'string'},items:{type:'array',items:{type:'object',properties:{id:{type:'string',enum:candidates.map(e=>e.id)},reason:{type:'string'},adaptation:{type:'string'}},required:['id','reason','adaptation'],additionalProperties:false}}},required:['summary','items'],additionalProperties:false};
  const result=z.object({summary:z.string().max(1500),items:z.array(z.object({id:z.string(),reason:z.string().max(1500),adaptation:z.string().max(1500)})).max(8)}).parse(await generate(
   '你是多 Agent 工作台的项目方法推荐员。先理解真实项目目标、否定约束、职责和文件类型，再从给定候选按语义挑选0—8个必要 Skill/工作流。'+
   '不要按关键词套模板或为了凑数推荐；可以认为本次无需额外方法。说明为什么适用于此项目、怎样适配及不适用的部分。'+
   '候选只有索引或审读元数据，不能声称已执行、已安装、依赖已接通或读过未提供正文。原生要求和权限优先，不扩张支出、发布或数据范围。只引用给定ID，不生成虚构来源。',
   {project:p,candidates:candidates.map(e=>({id:e.id,title:e.title,description:e.description,kind:e.kind,categories:e.categories,review:e.review,licenseStatus:e.licenseStatus,instructionAvailable:e.instructionAvailable}))},schema,signal));
  const seen=new Set<string>();return{mode:'semantic',goalKey:goalKey(p),message:result.summary,items:result.items.map(i=>{const entry=candidates.find(e=>e.id===i.id);if(!entry||seen.has(i.id))throw new Error('推荐引用了未知或重复的条目。');seen.add(i.id);return{entry,reason:i.reason,adaptation:i.adaptation};})};
 }
 async status(){
  const index=await this.index();let update:any=null;try{update=await readJson(path.join(this.directory,'update-status.json'));}catch{}
  let schedule:any={id:'ai',state:'unknown',description:'每周五 17:00（伦敦时间）'};
  try{const file=await fs.readFile(path.join(os.homedir(),'.codex/automations/ai/automation.toml'),'utf8');schedule={...schedule,state:file.match(/^status\s*=\s*"([^"]+)"/m)?.[1]||'unknown',rule:file.match(/^rrule\s*=\s*"([^"]+)"/m)?.[1]||null,hostRequired:true};}catch{}
  if(process.env.RELAY_WEEKLY_UPDATES==='1'){try{const s=await readJson(path.join(dataRoot,'library-schedule.json'));schedule={kind:'desktop',state:s.enabled?'ACTIVE':'PAUSED',description:'每7天检查 · 应用运行时执行',hostRequired:true,canConfigure:true,nextCheck:s.nextCheck,lastCompleted:s.lastCompleted,lastResult:s.lastResult};}catch{schedule={kind:'desktop',state:'unknown',description:'正在准备本机每周检查',hostRequired:true};}}
  return{revision:index.revision,lastCatalogCheck:index.checked_on||null,update,schedule};
 }
 private versionFile(id:string,hash:string){if(!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash))throw new Error('指南版本无效。');return path.join(this.directory,'versions',crypto.createHash('sha256').update(id).digest('hex')+'-'+hash+'.json');}
 private async keepVersion(guide:SkillGuide&{bodyHash:string}){await atomicJson(this.versionFile(guide.id,guide.bodyHash),guide);}
 private async recordRead(guide:any){
  const work=this.receiptQueue.then(async()=>{const file=path.join(this.directory,'read-receipts.json');let receipts:any={};try{receipts=await readJson(file);}catch{}
   const license=/Apache License/i.test(guide.licenseText)?'Apache-2.0':/Permission is hereby granted/i.test(guide.licenseText)?'MIT':null;
   receipts[guide.id]={version:guide.version,bodyHash:guide.bodyHash,cachedOn:guide.cachedOn,license};await atomicJson(file,receipts);
  });this.receiptQueue=work.catch(()=>{});await work;
 }
 async pinnedGuide(id:string,hash:string):Promise<SkillGuide&{bodyHash:string}>{
  const guide=await readJson(this.versionFile(id,hash));if(guide.id!==id||guide.bodyHash!==hash)throw new Error('项目指南版本不匹配。');
  const actual=hash.length===40?crypto.createHash('sha1').update('blob '+Buffer.byteLength(guide.body)+'\0').update(guide.body).digest('hex'):crypto.createHash('sha256').update(guide.body).digest('hex');
  if(actual!==hash)throw new Error('项目指南缓存校验失败。');return guide;
 }
 async guide(id:string,options:{fetcher?:typeof fetch;signal?:AbortSignal}={}):Promise<SkillGuide&{licenseText:string,bodyHash:string,cachedOn:string,referenceOnly:boolean}>{
  const cacheFile=path.join(this.directory,'bodies',crypto.createHash('sha256').update(id).digest('hex')+'.json');
  if(id.startsWith('method:')){
   const d=await this.methods(),m=d.methods.find((v:any)=>'method:'+v.id===id);if(!m)throw new Error('未找到方法。');
   const sources=d.sources.filter((s:any)=>m.source_ids.includes(s.id));const body='# '+m.title+'\n\n'+m.deliverables.join('\n\n')+'\n\n检查：\n'+m.checks.join('\n')+'\n\n来源：\n'+sources.map((s:any)=>s.url).join('\n');
   const guide={id,title:m.title,description:m.source_note||m.title,body,source:'https://github.com/shian493719730-art/snapper-assist',licenseText:'MIT; independently adapted method, upstream sources separately attributed.',bodyHash:crypto.createHash('sha256').update(body).digest('hex'),cachedOn:today(),referenceOnly:true};await this.keepVersion(guide);return guide;
  }
  const index=await this.index(),item=index.cases.find(c=>c.id===id),source=item&&index.sources.find(s=>s.id===item.source_id);if(!item||!source)throw new Error('未找到此条目。');
  if(source.maintenance==='historical'||source.api_archived||item.unavailable)throw new Error('此来源已归档、迁移或条目已移除，请先查看来源记录。');
  const version=item.document?.sha||item.artifact?.sha||index.revision;
  try{const cached=await readJson(cacheFile);if(cached.id===id&&cached.version===version&&cached.bodyHash===crypto.createHash('sha1').update('blob '+Buffer.byteLength(cached.body)+'\0').update(cached.body).digest('hex')){await this.keepVersion(cached);await this.recordRead(cached);return cached;}}catch{}
  const repo=source.canonical_repo||source.id;if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('该条目是阅读参考，请从来源链接查看。');
  const file=item.document?.path||(item.artifact?.type==='tree'?item.path+'/SKILL.md':item.path);
  if(!/\.(md|txt)$/i.test(file)||file.split('/').includes('..'))throw new Error('此条目需要对应运行工具；请查看原工作流来源。');
  const branch=source.branch||'main',fetcher=options.fetcher||fetch,base=`https://raw.githubusercontent.com/${repo}/${branch}/`;
  const requestSignal=(timeout:number)=>options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
  const response=await fetcher(base+file,{signal:requestSignal(20000)});if(!response.ok)throw new Error('无法读取当前指南，请稍后重试或打开来源。');
  const body=await response.text();if(body.length>65000)throw new Error('指南过长，请打开来源按需阅读。');
  const expected=item.document?.sha||(item.artifact?.type==='blob'?item.artifact.sha:null);
  const gitHash=crypto.createHash('sha1').update('blob '+Buffer.byteLength(body)+'\0').update(body).digest('hex');
  if(expected&&expected!==gitHash)throw new Error('来源内容已变化，请更新资料库后再读取。');
  const parent=path.posix.dirname(file);let licenseText='';
  for(const candidate of [...new Set([parent+'/LICENSE.txt',parent+'/LICENSE',parent+'/LICENSE.md','LICENSE','LICENSE.txt','LICENSE.md'])]){
   options.signal?.throwIfAborted();
   try{const r=await fetcher(base+candidate,{signal:requestSignal(10000)});if(r.ok){const text=await r.text();if(text.length<50000){licenseText=text;break;}}}catch{options.signal?.throwIfAborted();}
  }
  if(!/Apache License|Permission is hereby granted|BSD|Mozilla Public License|GNU (?:GENERAL|AFFERO)|Creative Commons Attribution/i.test(licenseText))throw new Error('尚未核实可复用许可，请先从来源阅读。');
  const guide={id,title:item.title,description:(await this.entries()).find(e=>e.id===id)?.description||item.title,body,source:item.url,licenseText,bodyHash:gitHash,cachedOn:today(),referenceOnly:true,version};await atomicJson(cacheFile,guide);await this.keepVersion(guide);await this.recordRead(guide);return guide;
 }
}
function expandTerms(query:string){const lower=query.toLowerCase(),terms=new Set(lower.match(/[a-z][a-z0-9_-]{1,}/g)||[]);for(const [key,aliases] of Object.entries(ALIASES))if(lower.includes(key.toLowerCase())){terms.add(key.toLowerCase());aliases.forEach(a=>terms.add(a));}for(const c of CATEGORIES)for(const t of c.terms)if(lower.includes(t.toLowerCase()))terms.add(t.toLowerCase());return[...terms];}
function containsTerm(text:string,term:string){return /^[a-z0-9_-]+$/.test(term)?new RegExp('(?:^|[^a-z0-9])'+term+'(?=$|[^a-z0-9])','i').test(text):text.includes(term);}
function entryScore(e:LibraryEntry,terms:string[]){const title=e.title.toLowerCase(),tags=e.tags.join(' ').toLowerCase(),text=[e.description,e.path,e.sourceId].join(' ').toLowerCase();return terms.reduce((n,t)=>n+(containsTerm(title,t)?12:0)+(containsTerm(tags,t)?5:0)+(containsTerm(text,t)?3:0),0);}
function goalKey(p:ProjectNeeds){return crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,16);}
export const library=new SkillLibrary();
export async function refineProjectPrompt(input:unknown,signal?:AbortSignal,generate:ClaudeJson=claudeJson,options:{store?:SkillLibrary;guides?:SkillGuide[]}={}){
 const binding=z.object({id:z.string().max(600),bodyHash:z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).optional()});
 const data=z.object({text:z.string().trim().min(1).max(20000),libraryIds:z.array(z.string().max(600)).max(40).default([]),libraryBindings:z.array(binding).max(40).default([])}).parse(input);
 const store=options.store||library,local=options.guides||await loadSkillGuides();
 const bindings=[...new Map([...data.libraryIds.map(id=>({id,bodyHash:undefined})),...data.libraryBindings].map(b=>[b.id,b])).values()];
 if(!bindings.length)return refineWithSkills({text:data.text},signal,generate,local);
 const entries=await store.entries(),selected=await Promise.all(bindings.map(async b=>{if(b.bodyHash)return store.pinnedGuide(b.id,b.bodyHash);const entry=entries.find(e=>e.id===b.id);if(!entry||entry.historical)throw new Error('项目指南已迁移或不可用，请在能力库中核对。');return{id:entry.id,title:entry.title,description:entry.description,body:'',source:entry.url};}));
 const candidates=[...local,...selected];
 return refineWithSkills({text:data.text},signal,generate,candidates,async id=>{
  const installed=local.find(g=>g.id===id);if(installed)return installed;const b=bindings.find(b=>b.id===id);return b?.bodyHash?await store.pinnedGuide(id,b.bodyHash):await store.guide(id);
 });
}
