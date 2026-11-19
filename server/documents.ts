import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import {dataRoot} from './store.ts';

export const documentRef=z.object({id:z.string().min(1).max(180),name:z.string().max(240),documentId:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export type DocumentRef=z.infer<typeof documentRef>;
export type DocumentSegment={location:string;text:string};
export class DocumentError extends Error{constructor(message:string,readonly status=400){super(message)}}
export type DocumentRecord={version:1;id:string;fileId:string;boardId:string;name:string;kind:string;sha256:string;size:number;status:'stored'|'reading'|'paused'|'ready'|'failed';segments:DocumentSegment[];warnings:string[];characters:number;error?:string};
const uploadInput=z.object({fileId:z.string().min(1).max(180),boardId:z.string().min(1).max(180),name:z.string().min(1).max(240)});
export class Documents{
 readonly records=new Map<string,DocumentRecord>();readonly previewJobs=new Map<string,AbortController>();
 private activeReads=0;
 constructor(readonly directory=path.join(dataRoot,'documents')){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  for(const file of fs.readdirSync(directory).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){try{const r=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')) as DocumentRecord;if(r.version!==1)continue;if(r.status==='reading'){r.status='paused';r.error='服务中断，已有正文保留；点击继续读取。';}this.records.set(r.id,r);}catch{}}
 }
 private save(r:DocumentRecord){const file=path.join(this.directory,r.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(r),{mode:0o600});fs.renameSync(file+'.tmp',file)}
 upload(input:unknown,buffer:Buffer){
  const meta=uploadInput.parse(input);if(!buffer.length||buffer.length>25*1024*1024)throw new DocumentError('原件不能为空，单文件最多25MB');
  const ext=path.extname(meta.name).toLowerCase().slice(1),kind=['docx','xlsx','pdf','txt','md','csv','json','log'].includes(ext)?ext:null;
  if(!kind)throw new DocumentError('正文读取支持DOCX、XLSX、PDF及UTF-8文本；旧DOC/XLS请另存为DOCX/XLSX，图片需要OCR。原件仍保留。');
  if(['docx','xlsx'].includes(kind)&&buffer.subarray(0,2).toString()!=='PK')throw new DocumentError('文件格式与扩展名不一致，或Office原件已加密');
  if(kind==='pdf'&&!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new DocumentError('文件不是有效PDF原件');
  const sha256=crypto.createHash('sha256').update(buffer).digest('hex'),id=crypto.createHash('sha256').update(JSON.stringify([meta.boardId,meta.fileId,sha256])).digest('hex');
  const old=this.records.get(id);if(old){if(old.name!==meta.name)throw new DocumentError('文件名称已变化，请重新导入');return old;}
  const r:DocumentRecord={version:1,id,...meta,kind,sha256,size:buffer.length,status:'stored',segments:[],warnings:[],characters:0};
  fs.writeFileSync(path.join(this.directory,id+'.bin'),buffer,{mode:0o600});this.records.set(id,r);this.save(r);return r;
 }
 get(id:string){if(!/^[a-f0-9]{64}$/.test(id))throw new DocumentError('文件编号无效');const r=this.records.get(id);if(!r)throw new DocumentError('正文原件未上传或已移除，请重新选择文件',404);return r;}
 scoped(ref:DocumentRef,boardId:string){if(!ref.documentId)throw new DocumentError('「'+ref.name+'」仅有名称，尚未上传正文；请重新附加或读取原件');const r=this.get(ref.documentId);if(r.boardId!==boardId||r.fileId!==ref.id||r.name!==ref.name)throw new DocumentError('文件不属于当前画板或引用已变化',403);return r;}
 async read(id:string,signal:AbortSignal,onProgress:(r:DocumentRecord)=>void=()=>{}){
  const r=this.get(id);signal.throwIfAborted();if(r.status==='ready')return r;
  while(this.activeReads>=3){await new Promise(resolve=>setTimeout(resolve,25));signal.throwIfAborted();}if(this.get(id).status==='ready')return r;this.activeReads++;
  const worker=new Worker(new URL('./document-worker.mjs',import.meta.url),{execArgv:[],workerData:{file:path.join(this.directory,id+'.bin'),kind:r.kind,resume:r.segments},resourceLimits:{maxOldGenerationSizeMb:192}});
  r.status='reading';delete r.error;this.save(r);onProgress(r);
  return new Promise<DocumentRecord>((resolve,reject)=>{
   let done=false,last=0;let timeout:ReturnType<typeof setTimeout>|undefined;const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timeout);this.activeReads--;signal.removeEventListener('abort',abort);void worker.terminate();if(error){if(r.status!=='ready'){r.status=signal.aborted?'paused':'failed';r.error=signal.aborted?'读取已暂停，已提取正文保留。':error.message;this.save(r);onProgress(r);}reject(error);}else{r.status='ready';this.save(r);onProgress(r);resolve(r)}};
   const abort=()=>finish(new Error('文件读取已暂停'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();
   timeout=setTimeout(()=>finish(new Error('文件读取超过60秒，已中断解析进程；请拆分文件后重试')),60000);
   worker.on('message',message=>{
    if(done)return;
    if(message.type==='segment'){
     if(message.index===r.segments.length){r.segments.push(message.segment);r.characters+=message.segment.text.length;}
     if(Date.now()-last>120){last=Date.now();this.save(r);onProgress(r)}
    }else if(message.type==='done'){r.warnings=message.warnings;finish()}
    else if(message.type==='error')finish(new Error(message.message));
   });worker.on('error',e=>finish(new Error('解析进程未完成：'+(e instanceof Error?e.message:String(e)))));worker.on('exit',code=>{if(!done)finish(new Error('解析进程意外退出（'+code+'）'))});
  });
 }
 async readProject(refs:DocumentRef[],boardId:string,signal:AbortSignal,progress:(text:string)=>void=()=>{}){
  const records:DocumentRecord[]=[];
  for(const ref of refs){const r=this.scoped(ref,boardId);progress('正在读取「'+r.name+'」');records.push(await this.read(r.id,signal,p=>progress('「'+p.name+'」已读取 '+p.segments.length+' 段 / '+p.characters+' 字符')));}
  const body=this.context(records);if(body.length>70000)throw new DocumentError('本项目正文超过本轮7万字符阅读范围，请拆分文件后再发送；未开始模型生成。');return{records,body};
 }
 context(records:DocumentRecord[]){return records.map(r=>'文件：'+r.name+'\n内容指纹：'+r.sha256+'\n'+r.warnings.map(w=>'[读取说明] '+w).join('\n')+'\n'+r.segments.map(s=>'['+r.name+' · '+s.location+']\n'+s.text).join('\n\n')).join('\n\n')}
 startPreview(id:string){const r=this.get(id);if(this.previewJobs.has(id)||r.status==='ready')return r;const ac=new AbortController();this.previewJobs.set(id,ac);void this.read(id,ac.signal).catch(()=>{}).finally(()=>this.previewJobs.delete(id));return r;}
 pausePreview(id:string){const r=this.get(id);this.previewJobs.get(id)?.abort();return r;}
}
export const documents=new Documents();
