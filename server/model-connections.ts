import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dataRoot} from './store.ts';
import {credential,setCredentialOverride} from './providers.ts';
import {registerSecret} from './secret-redaction.ts';
import type {AgentConfig} from '../src/types.ts';
export const RELAY_WARNING='中转站提供的模型效果可能不如官方渠道，且存在不稳定、限流或中断风险。模型名称由线路提供方声明，不能据此确认与官方模型完全一致。';
export const VENDORS=[
 {id:'openai',name:'OpenAI',brand:'gpt',baseUrl:'https://api.openai.com/v1',protocol:'responses',keyUrl:'https://platform.openai.com/api-keys',docsUrl:'https://developers.openai.com/api/docs/quickstart'},
 {id:'anthropic',name:'Claude',brand:'claude',baseUrl:'https://api.anthropic.com/v1',protocol:'anthropic',keyUrl:'https://platform.claude.com/settings/keys',docsUrl:'https://platform.claude.com/docs/en/manage-claude/authentication'},
 {id:'gemini',name:'Gemini',brand:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',protocol:'chat',keyUrl:'https://aistudio.google.com/apikey',docsUrl:'https://ai.google.dev/gemini-api/docs/openai'},
 {id:'deepseek',name:'DeepSeek',brand:'deepseek',baseUrl:'https://api.deepseek.com/v1',protocol:'chat',keyUrl:'https://platform.deepseek.com/',docsUrl:'https://api-docs.deepseek.com/'},
 {id:'qwen',name:'Qwen',brand:'qwen',baseUrl:'',protocol:'chat',keyUrl:'https://bailian.console.aliyun.com/',docsUrl:'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope'},
 {id:'grok',name:'Grok',brand:'grok',baseUrl:'https://api.x.ai/v1',protocol:'chat',keyUrl:'https://console.x.ai/',docsUrl:'https://docs.x.ai/developers/rest-api-reference/inference'},
] as const;
export const connectionInput=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/).optional(),name:z.string().trim().min(1).max(80),kind:z.enum(['official','relay']),vendor:z.enum(['openai','anthropic','gemini','deepseek','qwen','grok','custom']),baseUrl:z.string().trim().min(1).max(1000),protocol:z.enum(['responses','chat','anthropic']),apiKey:z.string().trim().min(1).max(4096).regex(/^[^\r\n]+$/).optional(),defaultModel:z.string().trim().max(180).default(''),routeScope:z.string().trim().max(200).regex(/^[^\r\n]*$/).default(''),riskAccepted:z.boolean().default(false)});
export type ModelConnection=z.infer<typeof connectionInput>&{id:string;revision:string;models:string[];status:'missing'|'configured'|'connected'|'error';checkedAt?:string;error?:string};
export function normalizeEndpoint(value:string){
 let u:URL;try{u=new URL(value);}catch{throw new Error('请填写完整的 API Base URL。');}
 if(u.username||u.password||u.search||u.hash)throw new Error('API 地址不能包含账号、密钥、查询参数或片段。');
 if(!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('请使用 HTTPS；本机模型服务可使用 localhost HTTP。');
 if(/^(169\.254\.|0\.0\.0\.0$)/.test(u.hostname)||u.hostname==='metadata.google.internal')throw new Error('此地址不能用作模型线路。');
 if(/\/(?:chat\/completions|responses|messages|models)\/?$/.test(u.pathname))throw new Error('请填写 Base URL，不包含 /chat/completions、/responses、/messages 或 /models。');
 return u.href.replace(/\/+$/,'');
}
function validateOfficial(c:z.infer<typeof connectionInput>){
 const vendor=VENDORS.find(v=>v.id===c.vendor);if(!vendor)throw new Error('请选择官方厂商，或改用自定义中转站。');
 if(c.vendor==='qwen'){
  const u=new URL(c.baseUrl);if(u.protocol!=='https:'||!(/^(?:[a-zA-Z0-9-]+\.)*(?:maas\.aliyuncs\.com|dashscope\.aliyuncs\.com)$/.test(u.hostname))||!u.pathname.endsWith('/compatible-mode/v1'))throw new Error('Qwen 官方线路请从控制台复制本工作空间和区域对应的兼容接口地址。');
 }else if(c.baseUrl!==vendor.baseUrl)throw new Error('官方连接使用厂商官方地址；其他地址请单独添加中转站。');
 if(c.protocol!==vendor.protocol)throw new Error('官方连接请使用预设协议。');
}
export class ModelConnections{
 readonly file:string;private profiles:ModelConnection[];
 constructor(readonly directory=dataRoot,readonly envLookup=credential){
  this.file=path.join(directory,'model-connections.json');let saved:any=[];try{saved=JSON.parse(fs.readFileSync(this.file,'utf8')).profiles;}catch{}
  this.profiles=Array.isArray(saved)?saved:[];
  for(const v of VENDORS)if(!this.profiles.some(p=>p.id==='official-'+v.id))this.profiles.push({id:'official-'+v.id,name:v.name,kind:'official',vendor:v.id,baseUrl:v.baseUrl,protocol:v.protocol,defaultModel:'',routeScope:'',riskAccepted:false,revision:'initial',models:[],status:'missing'});
  for(const p of this.profiles){if(p.apiKey)registerSecret(p.apiKey);if(p.kind==='official'&&['openai','anthropic'].includes(p.vendor)&&p.apiKey)setCredentialOverride(p.vendor as 'openai'|'anthropic',p.apiKey);}
 }
 private key(p:ModelConnection){return p.apiKey||(p.kind==='official'&&['openai','anthropic'].includes(p.vendor)?this.envLookup(p.vendor as 'openai'|'anthropic'):undefined);}
 get(id:string){const p=this.profiles.find(p=>p.id===id);if(!p)throw new Error('找不到此模型连接。');return p;}
 list(){return{vendors:VENDORS,warning:RELAY_WARNING,profiles:this.profiles.map(p=>{const {apiKey,...publicFields}=p;return{...publicFields,configured:!!this.key(p),status:this.key(p)?p.status==='missing'?'configured':p.status:'missing',keySource:apiKey?'本机连接配置':this.key(p)?'已有本机环境配置':'尚未填写'};})};}
 save(){fs.mkdirSync(this.directory,{recursive:true,mode:0o700});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({schemaVersion:1,profiles:this.profiles},null,2),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,this.file);}
 upsert(input:unknown){
  const d=connectionInput.parse(input);d.baseUrl=normalizeEndpoint(d.baseUrl);if(d.kind==='official')validateOfficial(d);else if(!d.riskAccepted)throw new Error('请先阅读并确认中转站的质量与稳定性提示。');
  const old=d.id?this.get(d.id):null;
  if(old&&(old.kind!==d.kind||old.vendor!==d.vendor))throw new Error('改变厂商或连接类型时，请新增独立连接。');
  if(old&&old.baseUrl!==d.baseUrl&&!d.apiKey)throw new Error('地址已改变，请重新填写此地址专用的密钥。');
  const apiKey=d.apiKey||old?.apiKey;if(d.kind==='relay'&&!apiKey)throw new Error('请填写中转站自己的 API Key。');
  const p:ModelConnection={...d,id:old?.id||'conn-'+randomUUID(),apiKey,revision:randomUUID(),models:old?.baseUrl===d.baseUrl&&old.protocol===d.protocol?old.models:[],status:'configured'};
  if(apiKey)registerSecret(apiKey);this.profiles=this.profiles.filter(v=>v.id!==p.id).concat(p);this.save();
  if(p.kind==='official'&&['openai','anthropic'].includes(p.vendor)&&apiKey)setCredentialOverride(p.vendor as 'openai'|'anthropic',apiKey);
  return this.list().profiles.find(v=>v.id===p.id)!;
 }
 resolve(config:Pick<AgentConfig,'provider'|'connectionId'|'connectionRevision'>){
  const p=this.get(config.connectionId||'official-'+config.provider);if(config.connectionRevision&&p.revision!==config.connectionRevision)throw new Error('这条线路设置已改变，请重新选择或生成接手预览。');
  const key=this.key(p);if(!key)throw new Error(p.name+' 尚未设置 API Key。');if(p.kind==='relay'&&!p.riskAccepted)throw new Error('请先确认中转站提示。');
  return{...p,baseUrl:normalizeEndpoint(p.baseUrl),apiKey:key};
 }
 async check(id:string,options:{fetcher?:typeof fetch;signal?:AbortSignal}={}){
  const p=this.get(id),key=this.key(p);if(!key)throw new Error('先填写并保存 API Key。');const revision=p.revision;
  try{
   const base=normalizeEndpoint(p.baseUrl);const r=await(options.fetcher||fetch)(base+'/models'+(p.protocol==='anthropic'?'?limit=100':''),{headers:{Authorization:'Bearer '+key,...(p.protocol==='anthropic'?{'anthropic-version':'2023-06-01'}:{}),...(p.routeScope?{'X-Route-Scope':p.routeScope}:{})},redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
   if(!r.ok)throw new Error(r.status===401?'认证失败，请核对这条线路的密钥。':r.status===429?'线路限流或额度不足，请稍后重试。':`无法读取模型目录（HTTP ${r.status}）。可按服务商文档手动填写模型名称。`);
   const d=await r.json() as {data?:{id?:string}[]};if(!Array.isArray(d.data))throw new Error('此线路没有返回兼容的模型目录，可手动填写模型名称。');
   if(this.get(id).revision!==revision)return this.list().profiles.find(v=>v.id===id)!;
   p.models=[...new Set(d.data.map(v=>v.id).filter((s):s is string=>typeof s==='string'&&s.length>0&&s.length<180&&!s.includes(key)))].slice(0,5000).sort();p.status='connected';delete p.error;
  }catch(e){if(options.signal?.aborted)throw e;p.status='error';p.error=e instanceof Error&&/认证失败|线路限流|模型目录|HTTP/.test(e.message)?e.message:'暂时无法连接此线路，请核对地址与协议后重试。';}
  p.checkedAt=new Date().toISOString();this.save();return this.list().profiles.find(v=>v.id===id)!;
 }
}
export const modelConnections=new ModelConnections();
