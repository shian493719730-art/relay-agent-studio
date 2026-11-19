/* DOCUMENT_FILES_START */
const DF={records:new Map(),uploads:new Map(),reading:new Map(),error:''};
const dfReadable=f=>/\.(docx?|xlsx?|pdf|txt|md|csv|json|log)$/i.test(f.name);
function dfFlow(fid){return [...CP.runs.values()].filter(r=>['running','paused','interrupted','failed','stopped'].includes(r.status)&&r.projects.some(p=>p.data.files.some(f=>f.id===fid)&&r.steps.some(s=>s.projectId===p.data.id&&s.phase==='read-files'&&s.status!=='completed'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];}
const dfStatus={stored:'待读取',reading:'正在读取',paused:'已暂停',ready:'正文已读取',failed:'读取未完成'};
async function dfApi(action,data={},signal){const response=await fetch('/api/studio/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'文件读取未完成');return value;}
function dfFiles(pid,atts=[]){const p=P(pid),ids=new Set([...(p?.pendingFiles||[]),...atts,...(p?.msgs||[]).filter(m=>m.from==='me'&&!m.to).flatMap(m=>m.attachmentIds||[])]);return state.files.filter(f=>f.boardId===p?.boardId&&(f.pid===pid||ids.has(f.id))&&dfReadable(f));}
async function dfUpload(f,signal){
 signal?.throwIfAborted();
 if(f.documentId){try{const r=await dfApi('status',{id:f.documentId},signal);if(r.boardId===f.boardId&&r.fileId===f.id&&r.name===f.name){DF.records.set(f.id,r);return r;}}catch(e){if(signal?.aborted)throw e;}delete f.documentId;}
 const blob=await idb('get',f.id);if(!blob)throw new Error('「'+f.name+'」原件不在本机，请重新拖入');signal?.throwIfAborted();
 const response=await fetch('/api/studio/documents/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Relay-File':encodeURIComponent(JSON.stringify({fileId:f.id,boardId:f.boardId,name:f.name}))},body:blob,signal});
 let r;try{r=await response.json()}catch{throw new Error('文件上传未完成，请检查大小后重试')}
 if(!response.ok)throw new Error(r.error||'文件上传未完成');f.documentId=r.id;save();DF.records.set(f.id,{...r,segments:[],characters:0});return r;
}
async function dfUploadRefs(refs,boardId,signal){const out=[];for(const ref of refs){signal?.throwIfAborted();const f=state.files.find(f=>f.id===ref.id&&f.boardId===boardId);if(!f)throw new Error('文件归属已变化，请重新发送');const r=await dfUpload(f,signal);out.push({id:f.id,name:f.name,documentId:r.id});}return out;}
const dfDelay=signal=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new DOMException('已暂停','AbortError'))},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},180);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();});
async function dfRead(f,signal){
 const uploaded=await dfUpload(f,signal);let record=await dfApi('read',{id:uploaded.id},signal);DF.records.set(f.id,record);dfPaint();
 try{while(record.status==='reading'){await dfDelay(signal);record=await dfApi('status',{id:uploaded.id},signal);DF.records.set(f.id,record);dfPaint();}if(record.status!=='ready')throw new Error(record.error||'文件读取尚未完成');return record;}
 catch(e){if(signal?.aborted){record=await dfApi('pause',{id:uploaded.id}).catch(()=>record);DF.records.set(f.id,record);dfPaint();}throw e;}
}
async function dfEnsureProjectFiles(p,signal){const files=dfFiles(p.id);for(const f of files)await dfRead(f,signal);return files;}
async function dfPreviewRead(fid){const f=state.files.find(f=>f.id===fid);if(!f||DF.reading.has(fid))return;if(B()?.tutorialSessionId)return hint('练习板仍使用本地示例，不上传原件');const ac=new AbortController();DF.reading.set(fid,ac);DF.error='';dfPaint();try{if(dfFlow(fid)){const r=await dfUpload(f,ac.signal);DF.records.set(fid,await dfApi('status',{id:r.id},ac.signal));}else await dfRead(f,ac.signal)}catch(e){DF.error=ac.signal.aborted?'读取已暂停，原件和已有正文保留':e.message;}finally{DF.reading.delete(fid);dfPaint();}}
function dfPaint(){
 if(panK!=='file')return;const f=state.files.find(f=>f.id===panId);if(!f||!dfReadable(f))return;const box=$('#pv');if(!box)return;const r=DF.records.get(f.id),busy=DF.reading.has(f.id),flow=dfFlow(f.id);
 const head=box.querySelector('[data-df-status]');if(!head){box.innerHTML='<div data-df-status></div><div class="row" data-df-controls></div><p class="lab" data-df-warning></p><pre data-df-body style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';}
 box.querySelector('[data-df-status]').textContent=(busy&&!r?'正在准备本机读取':dfStatus[r?.status]||'原件已保存，尚未读取正文')+(r?.characters?' · '+r.characters+' 字符':'');
 box.querySelector('[data-df-controls]').innerHTML=`<button data-df="${flow?'flow':busy?'pause':'read'}" data-df-id="${f.id}">${flow?(flow.status==='running'?'暂停所在流程':'继续所在流程'):busy?'暂停读取':r?.status==='ready'?'重新查看正文':r?.status==='paused'?'继续读取':'读取正文'}</button>`;
 box.querySelector('[data-df-warning]').textContent=[DF.error,r?.error,...(r?.warnings||[]),'本机读取不调用模型；发送任务才会把所选正文交给成员。'].filter(Boolean).join('\n');
 const body=box.querySelector('[data-df-body]'),text=(r?.segments||[]).map(s=>'['+s.location+']\n'+s.text).join('\n\n');if(body.textContent!==text)body.textContent=text;
}
const dfPan=renderPan;renderPan=function(){dfPan();dfPaint()};
const dfPreview=preview;preview=async function(fid){const f=state.files.find(f=>f.id===fid);if(!f||!dfReadable(f)||B()?.tutorialSessionId)return dfPreview(fid);openPan('file',fid);void dfPreviewRead(fid);return'正在打开正文读取';};
document.addEventListener('click',e=>{const b=e.target.closest('[data-df]');if(!b)return;const fid=b.dataset.dfId;if(b.dataset.df==='flow'){DF.reading.get(fid)?.abort();const flow=dfFlow(fid);if(flow)void cpControl(flow,flow.status==='running'?'pause':'resume');}else if(b.dataset.df==='pause')DF.reading.get(fid)?.abort();else void dfPreviewRead(fid);});
const dfMcApi=mcApi;mcApi=async function(action,data={},signal){if(action==='prepare'&&data.context){if(B()?.tutorialSessionId)throw new Error('练习板不启动真实文件读取');const selected=P(data.context.project.id);if(selected)data.context.files=dfFiles(selected.id).map(f=>({id:f.id,name:f.name,documentId:f.documentId}));}if(action==='prepare'&&data.context?.files?.length){const p=P(data.context.project.id);if(!p)throw new Error('项目已移除');data.context.boardId=p.boardId;const refs=await dfUploadRefs(data.context.files,p.boardId,signal);for(const ref of refs){const f=state.files.find(f=>f.id===ref.id);await dfRead(f,signal)}data.context.files=refs;}return dfMcApi(action,data,signal);};
setInterval(async()=>{if(panK!=='file'||!dfFlow(panId))return;const f=state.files.find(f=>f.id===panId);if(!f?.documentId)return;try{DF.records.set(f.id,await dfApi('status',{id:f.documentId}));dfPaint();}catch{}},800);
CAT.find(c=>c[0]==='file.preview')[1]='本机预览并读取Word、Excel、PDF正文，不调用模型';
CAT.push(['file.pauseReading','暂停文件读取或其所在流程，保留已读正文','fileId'],['file.resumeReading','继续文件读取或其所在流程','fileId']);
ACT['file.pauseReading']=a=>{if(B()?.tutorialSessionId)throw'练习板请使用教程控制';const f=fnd(state.files,a.fileId,'文件'),flow=dfFlow(f.id);if(!DF.reading.has(f.id)&&!flow)return'当前没有正在读取此文件的任务';DF.reading.get(f.id)?.abort();if(flow)void cpControl(flow,'pause');return'正在暂停读取，原件与已读正文保留'};
ACT['file.resumeReading']=a=>{if(B()?.tutorialSessionId)throw'练习板请使用教程控制';const f=fnd(state.files,a.fileId,'文件'),flow=dfFlow(f.id);if(flow)void cpControl(flow,'resume');else{openPan('file',f.id);void dfPreviewRead(f.id)}return'正在继续文件读取'};
/* DOCUMENT_FILES_END */
