/* CANVAS_RUNS_START */
const CP={runs:new Map(),pending:new Set(),polling:false,error:'',loadedBoard:null,preparing:new Map()};
ST.paused='‖暂停';ST.failed='!失败';
const cpPractice=()=>!!B()?.tutorialSessionId;
const cpLive=r=>['running','paused','blocked','interrupted'].includes(r.status);
const cpCurrent=pid=>[...CP.runs.values()].filter(r=>r.projects.some(p=>p.data.id===pid)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
const cpPhase={ 'read-files':'本机读取文件', 'group-plan':'跨项目分工',plan:'统筹分工',work:'成员执行',final:'统筹汇总','group-final':'跨项目汇总'};
const cpStepStatus={waiting:'等待分工或前置成果',running:'正在生成',completed:'已完成',paused:'已暂停',failed:'未完成',skipped:'本轮未触发'};
const cpStatus={running:'正在协作',paused:'已暂停',blocked:'等待连接恢复',stopped:'已停止',interrupted:'服务中断，等待继续',failed:'未完成',completed:'已完成'};
function canvasWorkActive(){return CP.pending.size>0||DF.reading.size>0||[...CP.runs.values()].some(r=>r.status==='running')}
function cpScopeRun(pid){return pid?.startsWith('group:')?[...CP.runs.values()].filter(r=>'group:'+r.group?.id===pid).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]:cpCurrent(pid)}
function canvasMemberBusy(pid,mid){const r=cpScopeRun(pid);return !!r&&r.status==='running'&&r.steps.some(s=>(s.projectId===pid||s.projectId===null&&pid==='group:'+r.group?.id)&&s.member.id===mid&&s.status==='running')}
function canvasBindingLocked(pid,mid){const r=cpScopeRun(pid);return !!r&&['running','paused','blocked','interrupted','failed'].includes(r.status)&&(pid==='group:'+r.group?.id?r.group.coordinator.id===mid:r.projects.some(p=>p.data.id===pid&&[p.data.coordinator,...p.data.members].some(m=>m.id===mid)))}
const cpTeamLabel=r=>r?.version===1?'旧流程 · 原固定线路':'成员绑定模型';
const cpStepTarget=(r,s)=>s.target||r.target;
async function cpApi(action,data={}){const response=await fetch('/api/studio/collaboration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const text=await response.text();let value;try{value=JSON.parse(text)}catch{throw new Error(response.status===413?'本次材料太多，请减少共享范围后重试。':'协作服务未返回有效结果（'+response.status+'）')}if(!response.ok)throw new Error(value.error||'协作未完成');return value;}
function cpStepText(s,text,status){if(!s.phase.includes('plan'))return text;try{const d=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(d.assignments)return '本轮分工\n'+d.assignments.map(a=>'· '+(P(s.projectId)?.members.find(m=>m.id===a.memberId)?.name||a.memberId)+'：'+a.task+((a.dependsOn||[]).length?'（等待 '+a.dependsOn.map(id=>P(s.projectId)?.members.find(m=>m.id===id)?.name||id).join('、')+' 的成果）':'')).join('\n')+'\n验收：'+d.acceptance;if(d.projectTasks)return '跨项目分工\n'+d.projectTasks.map(a=>'· '+(P(a.projectId)?.name||a.projectId)+'：'+a.task).join('\n')}catch{}return status==='completed'?text:status==='running'?'正在整理本轮分工…':'分工已中断，收到的内容已保存，可继续。'}
function cpApply(r){
 const preparing=[...CP.preparing.entries()].find(([key,p])=>p.requestId===r.clientRequestId);if(preparing){const [key,p]=preparing;if(p.ac.signal.aborted&&r.status==='running'){if(!p.pauseIssued){p.pauseIssued=true;void cpApi('pause',{id:r.id}).then(cpApply).catch(e=>hint('暂停未确认：'+e.message));}return;}CP.preparing.delete(key);}
 const previous=CP.runs.get(r.id);if(previous&&previous.revision>=r.revision)return;CP.runs.set(r.id,r);
 for(const pr of r.projects){const p=P(pr.data.id);if(!p||cpCurrent(p.id)?.id!==r.id)continue;for(const m of [p.coordinator,...p.members])if(!r.steps.some(s=>s.projectId===p.id&&s.member.id===m.id&&s.attempt))m.st=r.status==='running'?'queue':['paused','blocked','interrupted'].includes(r.status)?'paused':'idle';}
 const put=(msgs,m)=>{const old=msgs.find(x=>x.id===m.id);if(old)Object.assign(old,m);else msgs.push(m)};
 if(r.group){const g=[...state.groups,...state.groupHistory].find(g=>g.id===r.group.id);if(g)put(g.msgs,{id:'cp-user-'+r.id,from:'me',text:r.request,executionSource:'canvas'});}
 else for(const pid of r.rootIds){const p=P(pid);if(p)put(p.msgs,{id:'cp-user-'+r.id,from:'me',text:r.request,executionSource:'canvas'});}
 for(const s of r.steps){if(!s.attempt)continue;const p=s.projectId&&P(s.projectId),g=r.group&&[...state.groups,...state.groupHistory].find(g=>g.id===r.group.id),msgs=p?p.msgs:g?.msgs;if(!msgs)continue;
  for(const attempt of [...s.attempts,{attempt:s.attempt,text:s.text,status:s.status,target:s.target}]){const status=attempt.status==='completed'?'done':attempt.status==='running'?'stream':attempt.status==='failed'?'error':'stop',route=attempt.target||cpStepTarget(r,s);put(msgs,{id:'cp-'+r.id+'-'+s.id+'-'+attempt.attempt,from:s.member.id,fromName:s.member.name,text:cpStepText(s,attempt.text,attempt.status),st:status,executionSource:s.phase==='read-files'?'document':'canvas',model:s.phase==='read-files'?'':route?.model||'',connectionId:route?.connectionId,connectionName:s.phase==='read-files'?'本机解析':route?.name||'未绑定',phase:cpPhase[s.phase],canvasRunId:r.id,attempt:attempt.attempt,error:s.error});}
  if(p&&s.phase==='work'&&s.status==='completed'&&!p.artifacts.some(a=>a.id==='cp-work-'+r.id+'-'+s.id))p.artifacts.push({id:'cp-work-'+r.id+'-'+s.id,memberId:s.member.id,done:true,text:s.text,executionSource:'canvas',canvasRunId:r.id});
  const m=p?[p.coordinator,...p.members].find(m=>m.id===s.member.id):g?.coordinator,current=p?cpCurrent(p.id):g?cpScopeRun('group:'+g.id):null;if(m&&current?.id===r.id)m.st=s.status==='running'?'think':s.status==='completed'?'done':s.status==='failed'?'error':'paused';
 }
 for(const pRun of r.projects){const p=P(pRun.data.id);if(!p)continue;if(pRun.status==='waiting'&&cpCurrent(p.id)?.id===r.id)p.coordinator.st=['paused','blocked','interrupted','stopped'].includes(r.status)?'paused':'queue';if(pRun.status==='completed'&&pRun.result){const id='cp-final-'+r.id+'-'+p.id;let a=p.artifacts.find(a=>a.id===id);if(!a){a={id,memberId:p.coordinator.id,done:true,executionSource:'canvas',canvasRunId:r.id};p.artifacts.push(a)}a.text=pRun.result;}}
 for(const d of r.deliveries){const id='cp-delivery-'+d.id;if(!P(d.to)||state.deliveries.some(old=>old.id===id))continue;state.deliveries.push({...d,id,key:id,root:r.id,link:d.linkId||r.edges.find(e=>e.src===d.from&&e.dst===d.to)?.id,hop:d.path.length-1,cause:'真实协作',t:Date.now()});state.inbox.push({id:'cp-inbox-'+d.id,pid:d.to,did:id,done:false});}
 save();renderBoard();if(state.room)renderMsgs();if(panK==='group'){renderMsgs();cpPaintGroup()}cpPaintRoom();
 if(panK==='collaboration')renderPan();
}
function cpEnsureTeam(p){if(!p.members.length)throw new Error(p.name+' 还没有执行成员，请拖入 Agent 并在“模型 / 接手”中绑定模型。');}
function cpSnapshot(pid,text,group,manualLinkId){
 let ps=onB(state.projects);const links=state.links.filter(l=>ps.some(p=>p.id===l.src)&&ps.some(p=>p.id===l.dst));
 const executionIds=new Set(group?group.pids:[pid]);let manualSource;
 if(manualLinkId){const l=links.find(l=>l.id===manualLinkId);if(!l)throw new Error('找不到交付连接');executionIds.add(l.dst);manualSource=l.src;}
 for(let changed=true;changed;){changed=false;for(const l of links)if(l.state!=='disconnected'&&executionIds.has(l.src)&&!executionIds.has(l.dst)){executionIds.add(l.dst);changed=true}}
 const ids=new Set(executionIds);if(manualSource)ids.add(manualSource);
 ps=ps.filter(p=>ids.has(p.id));if(executionIds.size>8)throw new Error('本轮最多接续8个项目，请分组运行。');
 const participants=ps.filter(p=>executionIds.has(p.id));participants.forEach(p=>{cpEnsureTeam(p);if(typeof mcAutoAssignTeamModels==='function')mcAutoAssignTeamModels(p,false);});
 if(group&&(!group.coordinator.connectionId||!group.coordinator.model)){
  const conn=typeof mcGetActiveConnection==='function'?mcGetActiveConnection():null;
  if(conn){group.coordinator.connectionId=conn.id;group.coordinator.connectionRevision=conn.revision;group.coordinator.model=typeof mcPickModelForRole==='function'?mcPickModelForRole(conn,group.coordinator.name||'跨项目统筹',0):conn.defaultModel;save();}
 }
 const missing=participants.flatMap(p=>[p.coordinator,...p.members].filter(m=>!m.connectionId||!m.model).map(m=>p.name+' / '+m.name));
 if(group&&(!group.coordinator.connectionId||!group.coordinator.model))missing.unshift('跨项目统筹 / '+group.coordinator.name);
 if(missing.length)throw new Error('请先在“模型 / 接手”绑定：'+missing.slice(0,6).join('、')+(missing.length>6?'等 '+missing.length+' 位':''));
 const snapshot={boardId:state.activeBoard,request:text,rootProjectId:group?undefined:pid,manualLinkId,group:group?{id:group.id,coordinator:group.coordinator}:undefined,clientRequestId:crypto.randomUUID(),projects:ps.map(p=>({id:p.id,name:p.name,summary:p.summary||'',coordinator:p.coordinator,members:p.members,msgs:p.msgs.slice(-35).map(m=>({from:m.from,to:m.to,text:String(m.text||'').slice(0,12000),st:m.st,executionSource:m.executionSource})),files:dfFiles(p.id).map(f=>({id:f.id,name:f.name,documentId:f.documentId})),artifacts:p.artifacts.slice(-50).map(a=>({id:a.id,text:a.text,done:!!a.done,memberId:a.memberId,executionSource:a.executionSource||(a.memberId?'api':undefined)})),incoming:mcSharedReceipts(p.id)})),links:links.filter(l=>ids.has(l.src)&&ids.has(l.dst)),notes:state.notes.filter(n=>ids.has(n.pid)).map(n=>({id:n.id,pid:n.pid,text:n.text}))};
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>240000)throw new Error('本次共享材料太多，请减少共享范围或分组运行；原材料保留。');return snapshot;
}
async function cpStart(pid,text,atts=[],group=null,manualLinkId){
 if(cpPractice())throw new Error('教程练习板只运行本地演练');if(CP.pending.has(pid||group?.id))throw new Error('正在准备协作，请稍候');
 const key=pid||group?.id;CP.pending.add(key);const prep={pid,text,atts,group,manualLinkId,ac:new AbortController(),status:'running'};CP.preparing.set(key,prep);cpPaintRoom();cpPaintGroup();
 try{prep.phase='binding';const request=cpSnapshot(pid,text,group,manualLinkId);prep.phase='files';for(const p of request.projects)p.files=await dfUploadRefs(p.files,request.boardId,prep.ac.signal);prep.ac.signal.throwIfAborted();prep.requestId=request.clientRequestId;let r=await cpApi('start',{run:request});if(prep.ac.signal.aborted)r=await cpApi('pause',{id:r.id});CP.preparing.delete(key);
  const p=pid&&P(pid);if(p&&!manualLinkId){const msg={id:'cp-user-'+r.id,from:'me',text,attachmentIds:atts,executionSource:'canvas'};const old=p.msgs.find(m=>m.id===msg.id);if(old)Object.assign(old,msg);else p.msgs.push(msg);if((p.ui.composerDraft||'').trim()===text)p.ui.composerDraft='';p.pendingFiles=p.pendingFiles.filter(id=>!atts.includes(id));}
  if(group&&(group.composerDraft||'').trim()===text){group.composerDraft='';if(panK==='group'&&panId===group.id&&$('#gin')?.value.trim()===text)$('#gin').value='';}cpApply(r);renderAll();hint(r.status==='paused'?'流程已暂停，原件和正文保留':'已开始读取文件并按成员模型协作 · 可暂停或停止');
 }catch(e){if(prep.phase==='binding')CP.preparing.delete(key);prep.status=prep.ac.signal.aborted?'paused':'failed';CP.error=prep.ac.signal.aborted?'文件准备已暂停，草稿和原件保留':e.message;const p=pid&&P(pid);if(p){p.msgs.push({id:'err-'+uid(),from:'system',text:'⚠️ 协作未能启动：'+CP.error+'。请在右上角「模型 / 接手」绑定模型，或由 AI 操作助手自动配置。',st:'error'});save();if(state.room===p.id)renderMsgs();}hint(CP.error)}finally{CP.pending.delete(key);cpPaintRoom();cpPaintGroup()}
}
async function cpControl(r,action,scope={}){try{cpApply(await cpApi(action,{id:r.id,...scope}));hint(action==='pause'?'已暂停，保留输出':action==='stop'?'已停止流程，成果保留':'已继续，完成阶段不会重跑')}catch(e){hint(e.message)}}
function cpPaintRoom(){const p=P(state.room);if(!p||cpPractice())return;const r=cpCurrent(p.id),prep=CP.preparing.get(p.id),rh=$('#room .rh');if(!rh)return;
 let prepare=rh.querySelector('[data-cp-prepare]');if(prep&&!prepare){prepare=document.createElement('button');prepare.dataset.cpPrepare=p.id;rh.append(prepare)}if(prepare){if(!prep)prepare.remove();else prepare.textContent=prep.status==='running'?'暂停文件准备':'继续文件准备';}
 let button=rh.querySelector('[data-cp-control]');if(r&&!button){button=document.createElement('button');button.dataset.cpControl='pause';rh.append(button)}
 if(button){button.dataset.cpRun=r.id;button.dataset.cpControl=r.status==='running'?'pause':'resume';button.textContent=r.status==='running'?'暂停流程':'继续流程';button.disabled=r.status==='completed';button.title='暂停会中断当前请求并保留输出；继续只运行未完成阶段。';}
 if(r&&!rh.querySelector('[data-cp-record]')){const b=document.createElement('button');b.dataset.cpRecord=r.id;b.textContent='流程记录';rh.append(b)}
 const label=$('#cmp .row:last-child>.lab');if(label&&!target)label.textContent=r?.status==='running'?'多模型团队协作中 · 刷新可重连 · 可暂停/停止':'发送读取项目正文 → 按成员绑定模型分工、执行与汇总';
 const row=$('#cmp>.row');if(row&&!row.querySelector('[data-cp-mode]')){const b=document.createElement('span');b.dataset.cpMode='1';b.className='lab';b.style.margin='0 0 0 auto';b.title='统筹与成员各用自己的绑定模型；开始前核验全部绑定，执行和恢复使用同一份线路快照。';row.append(b)}
 const mode=row?.querySelector('[data-cp-mode]');if(mode)mode.textContent=target?'单独对话':r?cpStatus[r.status]+' · '+cpTeamLabel(r):'多模型团队';
}
async function cpPoll(){if(CP.polling)return;CP.polling=true;try{const board=state.activeBoard,runs=await cpApi('list',{boardId:board});for(const r of runs)cpApply(r);const others=[...CP.runs.values()].filter(r=>r.boardId!==board&&r.status==='running');for(const r of await Promise.all(others.map(r=>cpApi('get',{id:r.id}))))cpApply(r);CP.error='';CP.loadedBoard=board}catch(e){CP.error=e.message}finally{CP.polling=false}}
const cpRoom=renderRoom;renderRoom=function(){cpRoom();cpPaintRoom()};
const cpTop=renderTop;renderTop=function(){cpTop();if(CP.loadedBoard!==state.activeBoard)void cpPoll()};
const cpSend=sendProject;sendProject=function(p,text,toId,atts){
 if(cpPractice())return cpSend(p,text,toId,atts);
 if(toId){
  if(canvasMemberBusy(p.id,toId))return'此成员正在协作，可先暂停或停止';
  const m=mem(p,toId);
  if(!m.connectionId||!m.model){
   if(typeof mcAutoAssignMember==='function'&&mcAutoAssignMember(m)){
    // auto-bound
   }else{
    return'此成员尚未绑定模型，请在“模型 / 接手”中选择连接和确切型号';
   }
  }
  return cpSend(p,text,toId,atts);
 }
 if(!text.trim()&&!(atts||[]).length)return'先写下任务或附加文件';
 const participants=[p.coordinator,...p.members];
 const missing=participants.filter(m=>!m.connectionId||!m.model).map(m=>m.name);
 if(missing.length){
  if(typeof mcAutoAssignTeamModels==='function'&&mcAutoAssignTeamModels(p,true)){
   // auto-bound
  }else{
   return'无法启动协作：请先在“模型 / 接手”为 '+missing.slice(0,3).join('、')+' 绑定模型';
  }
 }
 if(!text.trim())text='请读取附加文件正文，按项目职责分工处理并汇总，引用文件中的实际内容与来源。';
 void cpStart(p.id,text,atts);
 return'正在准备按成员绑定模型协作';
};
sendGroup=function(g,text){if(cpPractice())return'练习板请按教程操作';if(!text.trim())return'先写下跨项目目标';void cpStart(null,text,[],g);return'正在准备跨项目真实分工与汇总';};
const cpStopAll=ACT['run.stopAll'];ACT['run.stopAll']=a=>{const pid=rp(a.projectId).id;CP.preparing.get(pid)?.ac.abort();const r=cpCurrent(pid);if(r&&cpLive(r))void cpControl(r,'stop');return cpStopAll(a)};
const cpStop=ACT['run.stop'];ACT['run.stop']=a=>{const p=rp(a.projectId),r=cpCurrent(p.id);if(r&&cpLive(r)){void cpControl(r,'pause',{projectId:p.id,memberId:a.memberId});return'正在停止此成员，暂停项目后续阶段并保留输出'}return cpStop(a)};
const cpGroupStop=ACT['group.stop'];ACT['group.stop']=a=>{const r=[...CP.runs.values()].find(r=>r.group?.id===a.groupId&&cpLive(r));if(r){void cpControl(r,'stop');return'正在停止跨项目流程'}return cpGroupStop(a)};
// Direct manipulation owns scoped cancellation; layout and unrelated edits never lock globally.
const cpDeliver=ACT['link.deliver'];ACT['link.deliver']=a=>{if(cpPractice())return cpDeliver(a);const l=fnd(state.links,a.linkId,'连接');if(l.state!=='on')throw'连接未启用，交付已阻断';void cpStart(l.dst,'请读取按连接共享的内容，并依据本项目职责继续完成工作。',[],null,l.id);return'正在交付并启动下游多模型团队协作';};
for(const name of ['link.set','link.enable','link.pause','link.resume','link.delete']){const old=ACT[name];ACT[name]=a=>{const result=old(a);if(cpPractice())return result;const l=state.links.find(l=>l.id===a.linkId);for(const r of CP.runs.values())if(r.edges.some(e=>e.id===a.linkId)&&r.status!=='completed'){const patch=l?{name:l.name,state:l.state,trigger:l.trigger,keyword:l.keyword,share:l.share}:{state:'disconnected'};void cpApi('link',{id:r.id,linkId:a.linkId,patch}).then(cpApply).catch(e=>hint('流程连接更新未确认：'+e.message));}return result};}
function cpPaintGroup(){if(panK!=='group')return;const g=state.groups.find(g=>g.id===panId);if(!g)return;const input=$('#gin');if(input&&document.activeElement!==input)input.value=g.composerDraft||'';const prep=CP.preparing.get(panId);let preparing=$('#pan [data-cp-prepare]');if(prep&&!preparing){preparing=document.createElement('button');preparing.dataset.cpPrepare=panId;$('#pan').append(preparing)}if(preparing){if(!prep)preparing.remove();else preparing.textContent=prep.status==='running'?'暂停文件准备':'继续文件准备';}const r=[...CP.runs.values()].filter(r=>r.group?.id===panId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];let row=$('#pan [data-cp-group-controls]');if(!row){row=document.createElement('div');row.className='row';row.dataset.cpGroupControls='1';$('#pan').append(row)}row.innerHTML=`<button data-mc-handoff="${esc('group:'+g.id)}">模型 / 接手</button><span class="lab">${r?cpStatus[r.status]+' · '+cpTeamLabel(r):esc(g.coordinator.model||'统筹尚未绑定模型')}</span>${r?`<button data-cp-run="${r.id}" data-cp-control="${r.status==='running'?'pause':'resume'}" ${r.status==='completed'?'disabled':''}>${r.status==='running'?'暂停流程':'继续流程'}</button><button data-cp-record="${r.id}">流程记录</button>`:''}`;}

const cpPan=renderPan;renderPan=function(){if(panK!=='collaboration'){const result=cpPan();cpPaintGroup();return result;}const r=CP.runs.get(panId);if(!r)return closePan();$('#pan').innerHTML=`<h3>真实协作流程<button class="x" data-close="pan" aria-label="关闭">${icon('close')}</button></h3><div class="lab">${cpStatus[r.status]} · ${cpTeamLabel(r)}</div><p>${esc(r.request)}</p>${r.error?`<p class="err">${esc(r.error)}</p>`:''}<div class="row"><button data-cp-run="${r.id}" data-cp-control="${r.status==='running'?'pause':'resume'}" ${r.status==='completed'?'disabled':''}>${r.status==='running'?'暂停流程':'继续流程'}</button><button data-cp-run="${r.id}" data-cp-control="stop" ${r.status==='completed'?'disabled':''}>停止流程</button></div>${r.projects.map(p=>`<div class="ac"><b>${esc(p.data.name)}</b> · ${esc(({waiting:'等待上游',running:'正在执行',completed:'已完成',skipped:'本轮未触发'})[p.status]||p.status)}${r.steps.filter(s=>s.projectId===p.data.id).map(s=>`<div class="lab">${esc(s.member.name)} · ${cpPhase[s.phase]} · ${esc(cpStepStatus[s.status]||s.status)}${s.phase==='read-files'?'':' · '+esc(cpStepTarget(r,s)?.model||'未绑定')}</div>`).join('')}</div>`).join('')}<details><summary>共享来源与内容</summary>${r.deliveries.map(d=>`<div class="ac">${esc(d.fromName)} → ${esc(P(d.to)?.name||d.to)}<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(d.items.map(i=>i.text).join('\n\n'))}</pre></div>`).join('')||'<p>尚无交付</p>'}</details><p class="lab">刷新只重连记录。暂停/停止会中断生成；恢复会重新请求未完成阶段，已完成成果保留。</p>`;};
CAT.find(c=>c[0]==='chat.send')[1]='按成员各自绑定模型启动团队协作，或单独发消息';
CAT.push(['collaboration.pause','暂停当前项目所在真实流程','projectId'],['collaboration.resume','继续当前项目所在真实流程','projectId'],['collaboration.stop','停止当前项目所在真实流程','projectId']);
for(const [name,action]of [['pause','pause'],['resume','resume'],['stop','stop']])ACT['collaboration.'+name]=a=>{const r=cpCurrent(rp(a.projectId).id);if(!r)throw'此项目尚无真实流程';void cpControl(r,action);return'正在'+({pause:'暂停',resume:'继续',stop:'停止'})[name]+'真实流程'};
document.addEventListener('click',e=>{const b=e.target.closest('[data-cp-control],[data-cp-record],[data-cp-prepare]');if(!b)return;if(b.dataset.cpPrepare){const prep=CP.preparing.get(b.dataset.cpPrepare);if(!prep)return;if(prep.status==='running')prep.ac.abort();else void cpStart(prep.pid,prep.text,prep.atts,prep.group,prep.manualLinkId);return}if(b.dataset.cpRecord){openPan('collaboration',b.dataset.cpRecord);return}const r=CP.runs.get(b.dataset.cpRun);if(r)void cpControl(r,b.dataset.cpControl);});
setInterval(cpPoll,800);

document.addEventListener('input',e=>{if(e.target.id==='gin'&&panK==='group'){const g=state.groups.find(g=>g.id===panId);if(g){g.composerDraft=e.target.value;save()}}});
/* CANVAS_RUNS_END */
