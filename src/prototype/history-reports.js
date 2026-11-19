/* HISTORY_REPORTS_START */
/* HISTORY_CORE_START */
const HistoryCore={
 member(m){if(!m)return null;const {id,agent,name,role,model,connectionId,connectionRevision}=m;return{id,agent,name,role,model,connectionId,connectionRevision}},
 document(s){
  const arrays=(key,fn)=>(s[key]||[]).map(fn||((x)=>x));
  return {boards:arrays('boards',b=>({id:b.id,name:b.name,interface:b.interface})),projects:arrays('projects',p=>({id:p.id,boardId:p.boardId,name:p.name,summary:p.summary,space:p.space,coordinator:this.member(p.coordinator),members:p.members.map(m=>this.member(m)),pendingFiles:p.pendingFiles||[],ui:{color:p.ui?.color,composerDraft:p.ui?.composerDraft},artifacts:(p.artifacts||[]).map(a=>({id:a.id,done:a.done}))})),notes:arrays('notes'),files:arrays('files',f=>{const{documentId,...metadata}=f;return metadata}),links:arrays('links'),clusters:arrays('clusters'),bundleLinks:arrays('bundleLinks'),readers:arrays('readers'),groups:arrays('groups',g=>({id:g.id,pids:g.pids,coordinator:this.member(g.coordinator),rules:g.rules})),prefs:{reduceMotion:s.prefs?.reduceMotion,windowBoxes:s.prefs?.windowBoxes}};
 },
 signature(s){return JSON.stringify(this.document(typeof s==='string'?JSON.parse(s):s))},
 key(scope){return scope.kind+':'+scope.id},
 ids(s,scope){if(scope.kind==='project')return[scope.id];if(scope.kind==='cluster')return(s.clusters||[]).find(c=>c.id===scope.id)?.projectIds||[];if(scope.kind==='group')return(s.groups||[]).find(g=>g.id===scope.id)?.pids||[];return(s.projects||[]).filter(p=>p.boardId===scope.id).map(p=>p.id)},
 events(before,after,at=Date.now()){
  const out=[],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),add=(label,kind,entity,old)=>{
   const ps=[...new Set([entity.pid,old?.pid,...(kind==='projects'?[entity.id]:[]),...(entity.projectIds||old?.projectIds||[]),...(entity.pids||old?.pids||[]),entity.src,entity.dst].filter(Boolean))];
   const boardId=entity.boardId||old?.boardId||(kind==='boards'?entity.id:null)||after.projects.find(p=>ps.includes(p.id))?.boardId||before.projects.find(p=>ps.includes(p.id))?.boardId||after.activeBoard;
   const clusters=[...(before.clusters||[]),...(after.clusters||[])].filter(c=>c.projectIds.some(id=>ps.includes(id))).map(c=>c.id);
   out.push({at,kind,label,boardId,projectIds:ps,clusterIds:[...new Set([...clusters,...(kind==='clusters'?[entity.id]:[])])],entityId:entity.id});
  };
  for(const [key,title]of Object.entries({boards:'画板',projects:'项目',notes:'笔记',files:'文件',links:'连接',clusters:'项目组',groups:'跨项目统筹',bundleLinks:'整组连接',readers:'阅读框'})){
   const a=before[key]||[],b=after[key]||[],am=new Map(a.map(x=>[x.id,x])),bm=new Map(b.map(x=>[x.id,x]));
   for(const item of b){const old=am.get(item.id),name=item.name?'「'+String(item.name).slice(0,60)+'」':'';if(!old){add('新建'+title+name,key,item);continue}
    let label='';
    if(key==='projects'){
     if(!same(old.space,item.space))label='调整项目'+name+'的形状、大小或位置';
     else if(!same([this.member(old.coordinator),old.members.map(m=>this.member(m))],[this.member(item.coordinator),item.members.map(m=>this.member(m))]))label='调整项目'+name+'的成员或模型';
     else if(!same([old.name,old.summary,old.ui?.color],[item.name,item.summary,item.ui?.color]))label='编辑项目'+name;
     else if(old.ui?.composerDraft!==item.ui?.composerDraft)label='修改项目'+name+'的草稿';
     else if(!same(old.pendingFiles,item.pendingFiles))label='调整项目'+name+'的待发附件';
     else if(!same((old.artifacts||[]).map(x=>[x.id,x.done]),(item.artifacts||[]).map(x=>[x.id,x.done])))label='更新项目'+name+'的成果';
    }else if(key==='boards'){if(!same([old.name,old.interface],[item.name,item.interface]))label='编辑画板'+name}
    else if(key==='groups'){if(!same([old.pids,this.member(old.coordinator),old.rules],[item.pids,this.member(item.coordinator),item.rules]))label='调整跨项目统筹或共享规则'}
    else if(key==='files'){const{documentId:oldId,...oldMeta}=old,{documentId:newId,...meta}=item;if(!same(oldMeta,meta))label='编辑文件'+name}
    else if(!same(old,item))label=(key==='readers'?'调整':'编辑')+title+name;
    if(label)add(label,key,item,old);
   }
   for(const item of a)if(!bm.has(item.id))add('删除'+title+(item.name?'「'+String(item.name).slice(0,60)+'」':''),key,item);
  }
  if(!same(before.boards?.map(b=>b.interface),after.boards?.map(b=>b.interface))&&!out.some(e=>e.kind==='boards'))add('调整画板布局或样式','interface',{id:after.activeBoard,boardId:after.activeBoard});
  if(!same(before.prefs?.windowBoxes,after.prefs?.windowBoxes))add('调整面板位置、大小或收拢状态','interface',{id:after.activeBoard,boardId:after.activeBoard});
  if(before.prefs?.reduceMotion!==after.prefs?.reduceMotion)add('调整动效偏好','interface',{id:after.activeBoard,boardId:after.activeBoard});
  return out;
 },
 relevant(e,s,scope){if(scope.kind==='board')return e.boardId===scope.id;if(scope.kind==='project')return e.projectIds?.includes(scope.id);if(scope.kind==='cluster'&&e.clusterIds?.includes(scope.id))return true;return this.ids(s,scope).some(id=>e.projectIds?.includes(id))},
 report(s,runs,scope,records,seen=0){
  const ids=this.ids(s,scope),projects=s.projects.filter(p=>ids.includes(p.id)),flows=[...runs].filter(r=>r.projects.some(p=>ids.includes(p.data.id))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest=new Map();for(const r of flows)for(const p of r.projects)if(ids.includes(p.data.id)&&!latest.has(p.data.id))latest.set(p.data.id,{run:r,project:p});
  const local=!!s.boards.find(b=>b.id===(scope.kind==='board'?scope.id:projects[0]?.boardId))?.tutorialSessionId;
  const statuses=projects.map(p=>{const last=latest.get(p.id),practice=local?(p.artifacts||[]).length?'local-result':(p.msgs||[]).some(m=>m.executionSource==='tutorial'&&['stream','queue'].includes(m.st))?'local-running':'local-idle':'not-started';return{id:p.id,name:p.name,status:last?(last.project.status==='completed'?'completed':last.run.status==='running'?last.project.status:last.run.status):practice}});
  const steps=flows.flatMap(r=>r.steps.filter(step=>ids.includes(step.projectId)&&latest.get(step.projectId)?.run.id===r.id));
  const files=s.files.filter(f=>scope.kind==='board'?f.boardId===scope.id:ids.includes(f.pid)),members=projects.flatMap(p=>[p.coordinator,...p.members]);
  const recent=(s.activityLog||[]).filter(e=>this.relevant(e,s,scope)).slice(-30).reverse(),unread=(s.inbox||[]).filter(i=>ids.includes(i.pid)&&!i.done).length;
  return {ids,projects:statuses,total:projects.length,completed:statuses.filter(p=>p.status==='completed').length,running:statuses.filter(p=>p.status==='running').length,paused:statuses.filter(p=>['paused','blocked','interrupted'].includes(p.status)).length,steps:{done:steps.filter(x=>x.status==='completed').length,total:steps.length},members:members.length,unbound:members.filter(m=>!m.model||!m.connectionId).length,files:files.length,filesRead:files.filter(f=>records.get(f.id)?.status==='ready').length,filesUnknown:files.filter(f=>f.documentId&&(!records.has(f.id)||records.get(f.id)?.status==='unavailable')).length,artifacts:projects.reduce((n,p)=>n+(p.artifacts||[]).length,0),unread,recent,newCount:recent.filter(e=>e.at>seen).length,latestRun:flows[0],local:!!s.boards.find(b=>b.id===(scope.kind==='board'?scope.id:projects[0]?.boardId))?.tutorialSessionId};
 },
 target(stack,current){const sig=this.signature(current);for(let i=stack.length-1;i>=0;i--)try{if(this.signature(stack[i])!==sig)return i}catch{}return-1},
 trim(undo,redo,limit=1600000){while(undo.length+redo.length>1&&(undo.length+redo.length>80||JSON.stringify({undo,redo}).length>limit)){if(undo.length>1)undo.shift();else redo.shift()}},
 resumedSnapshot(snapshot,current){
  const o=JSON.parse(snapshot);o.activityLog=current.activityLog;o.activityVisits=current.activityVisits;o.assistantSessions=current.assistantSessions;o.tutorial=current.tutorial;o.featureTour=current.featureTour;o.developmentTutorial=current.developmentTutorial;o.aiDevelopmentTutorial=current.aiDevelopmentTutorial;
  // Navigation is not an edit. Stay on the same canvas/room when it survives.
  if(o.boards.some(b=>b.id===current.activeBoard)){o.activeBoard=current.activeBoard;o.room=o.projects.some(p=>p.id===current.room)?current.room:null;o.sel=o.projects.some(p=>p.id===current.sel)||o.links.some(l=>l.id===current.sel)?current.sel:null;for(const b of o.boards){const now=current.boards.find(x=>x.id===b.id);if(now)b.view=now.view}}
  for(const p of o.projects)for(const m of [p.coordinator,...p.members])if(!current.projects.some(q=>[q.coordinator,...q.members].some(n=>n.id===m.id)))if(['think','queue','tool','stream','running'].includes(m.st))m.st='paused';
  for(const p of o.projects)if(!current.projects.some(q=>q.id===p.id))for(const m of p.msgs||[])if(['stream','queue','think'].includes(m.st))m.st='stop';
  for(const f of o.files||[]){const now=(current.files||[]).find(x=>x.id===f.id);if(now?.documentId&&now.boardId===f.boardId)f.documentId=now.documentId}
  return o;
 }
};
/* HISTORY_CORE_END */
const HA={ready:false,pending:null,last:null,lastSignature:null,travel:null,recording:false,depth:0,dirty:true,report:null,seen:0,coalesce:null,timer:null};
const HISTORY_KEY=KEY+':edit-history-v1';
state.activityLog=state.activityLog||[];state.activityVisits=state.activityVisits||{};
const historySnapBase=snap;snap=()=>{const s=JSON.parse(historySnapBase());delete s.activityLog;delete s.activityVisits;return JSON.stringify(s)};
function historyPersist(){if(!HA.ready||!HA.dirty)return;HistoryCore.trim(undoS,redoS);try{localStorage.setItem(HISTORY_KEY,JSON.stringify({version:1,anchor:HistoryCore.signature(state),undo:undoS,redo:redoS}));HA.dirty=false}catch{hint('本机存储空间不足，部分撤销记录尚未保存；当前窗口仍可撤销')}}
function historyCommit(){
 if(!HA.ready||HA.recording||HA.depth)return;HA.recording=true;
 try{const signature=HistoryCore.signature(state);if(signature!==HA.lastSignature){const current=snap();
   const before=HA.pending&&HistoryCore.signature(HA.pending)!==signature?HA.pending:HA.last;
   const old=JSON.parse(HA.last),events=HistoryCore.events(old,state),focus=document.activeElement,field=focus?.matches('textarea,input')?focus.id||focus.dataset.nt||focus.dataset.pf||focus.dataset.mn||focus.dataset.mr:null;
   if(!HA.travel){if(!field||HA.coalesce?.key!==field||Date.now()-HA.coalesce.at>1500)undoS.push(before);redoS=[];HA.coalesce=field?{key:field,at:Date.now()}:null}
   const label=HA.travel==='undo'?'撤销 · ':HA.travel==='redo'?'重做 · ':'';
   for(const e of events){e.id='ev'+uid();if(label)e.label=label+(HA.travel==='undo'?e.label.replace(/^新建/,'恢复'):e.label);const last=state.activityLog.at(-1);if(field&&last?.entityId===e.entityId&&last.label===e.label&&e.at-last.at<1500)Object.assign(last,e);else state.activityLog.push(e)}
   state.activityLog=state.activityLog.slice(-300);HA.last=current;HA.lastSignature=signature;HA.pending=null;HA.dirty=true;HistoryCore.trim(undoS,redoS);
  }
 }finally{HA.recording=false}queueMicrotask(activityRefresh);
}
// Record actual edits at their saving boundary. Closing a panel creates no phantom step.
pushUndo=function(s){if(!HA.ready)return;HA.pending=s||snap()};
const historyRestoreBase=restore;restore=function(str){const o=HistoryCore.resumedSnapshot(str,state);o.interfaceState=dmUiState();if(o.interfaceState.panK==='proj'&&!o.projects.some(p=>p.id===o.interfaceState.panId)||o.interfaceState.panK==='cluster'&&!(o.clusters||[]).some(c=>c.id===o.interfaceState.panId)||o.interfaceState.panK==='link'&&!o.links.some(l=>l.id===o.interfaceState.panId)){o.interfaceState.panK=null;o.interfaceState.panId=null}historyRestoreBase(JSON.stringify(o));historyCommit()};
function historyTravel(kind){
 // On macOS a mouse click on a toolbar need not blur the textarea. Commit it
 // before choosing a history target so both state and the visible editor rewind.
 const editing=document.activeElement;if(editing?.matches('input,textarea,[contenteditable="true"]'))editing.blur();historyCommit();
 const stack=kind==='undo'?undoS:redoS,index=HistoryCore.target(stack,state);if(index<0){hint('暂无可'+(kind==='undo'?'撤销':'重做')+'的编辑');return'暂无可恢复的编辑'}
 const targetState=JSON.parse(stack[index]),ids=DirectCore.changedProjects(state,targetState);
 return dmMutation(kind,{targetState},()=>{HA.pending=null;HA.coalesce=null;stack.splice(index+1);HA.travel=kind;try{(kind==='undo'?undo:redo)();historyPersist();renderAll();return kind==='undo'?'已撤销上一步编辑，已有成果保留':'已重做上一步编辑'}finally{HA.travel=null}},ids);
}
ACT.undo=()=>historyTravel('undo');ACT.redo=()=>historyTravel('redo');
const historyToastBase=dmToast;dmToast=function(text){historyToastBase(text);const button=$('#dm-toast [data-act]');if(button&&String(text).startsWith('已撤销')){button.dataset.act='redo';button.setAttribute('aria-label','重做刚才撤销的编辑');button.innerHTML=icon('redo',14)+'重做'}};
ACT['cluster.remove']=a=>{const c=fnd(state.clusters,a.clusterId,'项目组'),ids=c.projectIds.slice();return dmMutation('cluster.remove',a,()=>{
 pushUndo();for(const p of state.projects.filter(p=>ids.includes(p.id)))[p.coordinator,...p.members].forEach(m=>halt(m.id));
 state.projects=state.projects.filter(p=>!ids.includes(p.id));state.links=state.links.filter(l=>!ids.includes(l.src)&&!ids.includes(l.dst));state.notes.forEach(n=>{if(ids.includes(n.pid))n.pid=null});state.files.forEach(f=>{if(ids.includes(f.pid))f.pid=null});state.clusters=state.clusters.filter(x=>x.id!==c.id);dmRebuildBundles();closePan();if(ids.includes(state.room))state.room=null;save();return'已删除项目组及子项目，文件保留在画板，可撤销';
 },ids)};
CAT.push(['cluster.remove','删除项目组及其子项目（可撤销，文件保留在画板）','clusterId'],['activity.open','查看画板、项目、项目组的近期操作与实际进度','kind?,id?']);
ACT['activity.open']=a=>{if(a.kind&&!['board','project','cluster','group'].includes(a.kind))throw'请选择画板、项目或项目组';activityOpen({kind:a.kind||'board',id:a.id||state.activeBoard},true);return'已打开近期操作与进度'};
const historyFileDelete=ACT['file.delete'];ACT['file.delete']=a=>{DF.reading.get(a.fileId)?.abort();return historyFileDelete(a)};
function activityTitle(scope){const object=(scope.kind==='board'?state.boards:scope.kind==='project'?state.projects:scope.kind==='cluster'?state.clusters:state.groups).find(x=>x.id===scope.id);return object?.name||object?.coordinator?.name||'工作区'}
function activityOpen(scope,floating=false){HA.report={...scope,floating};const key=HistoryCore.key(scope);HA.seen=state.activityVisits[key]||0;state.activityVisits[key]=Date.now();save();activityRefresh();void activityLoadFileStatus(scope)}
async function activityLoadFileStatus(scope){const ids=HistoryCore.ids(state,scope);await Promise.all(state.files.filter(f=>f.documentId&&!DF.records.has(f.id)&&(scope.kind==='board'?f.boardId===scope.id:ids.includes(f.pid))).map(async f=>{try{const record=await dfApi('status',{id:f.documentId});if(record.fileId===f.id&&record.boardId===f.boardId)DF.records.set(f.id,record)}catch{DF.records.set(f.id,{status:'unavailable'})}}));activityRefresh()}
function activityTime(time){return new Date(time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}
function activityMarkup(scope,compact=false){
 const r=HistoryCore.report(state,CP.runs.values(),scope,DF.records,HA.seen),status={running:'执行中',waiting:'等待上游',completed:'已完成',paused:'已暂停',blocked:'等待连接',interrupted:'已中断',failed:'待处理',stopped:'已停止',skipped:'未触发','not-started':'尚未开工','local-result':'练习成果已保存','local-running':'本地演示中','local-idle':'尚未开始练习'};
 const loading=CP.loadedBoard!==state.activeBoard&&!r.local&&!CP.error;
 return `<div class="activity-summary" role="status"><b>${r.local?'本地练习':loading?'正在读取已有流程':r.running?'正在工作':r.paused?'已暂停，成果保留':r.completed?'已有完成项目':'工作区已就绪'}</b><span>${r.total} 个项目 · ${r.members} 位成员 · ${r.artifacts} 份成果</span>${r.steps.total?`<span>当前任务 ${r.steps.done}/${r.steps.total} 步完成</span><progress max="${r.steps.total}" value="${r.steps.done}" aria-label="当前任务完成步骤"></progress>`:''}</div><div class="activity-chips">${r.files?`<span>${r.filesUnknown?'正文状态 '+r.filesUnknown+' 项待核对':'正文 '+r.filesRead+'/'+r.files+' 已读取'}</span>`:''}${r.unread?`<span>${r.unread} 项待查看交付</span>`:''}${r.unbound?`<span>${r.unbound} 位尚未绑定模型</span>`:''}</div>${CP.error&&!r.local?'<p class="activity-warning">流程记录暂未读到：'+esc(CP.error)+'</p>':''}${r.latestRun?.error?'<p class="activity-warning">待处理：'+esc(String(r.latestRun.error).slice(0,200))+'</p>':''}<details ${compact?'':'open'} class="activity-recent"><summary>近期操作${r.newCount?' · '+r.newCount+' 条新变化':''}</summary><ol>${r.recent.slice(0,compact?3:5).map(e=>`<li><time>${activityTime(e.at)}</time><span>${esc(e.label)}</span></li>`).join('')||'<li class="activity-empty">从这一版开始记录操作。还没有新的编辑。</li>'}</ol></details>${scope.kind!=='project'&&r.total?`<details><summary>项目进度</summary><ul class="activity-projects">${r.projects.map(p=>`<li><button data-act="room.enter" data-args='${esc(JSON.stringify({projectId:p.id}))}'>${esc(p.name)}</button><span>${esc(status[p.status]||p.status)}</span></li>`).join('')}</ul></details>`:''}<p class="activity-footnote">${r.local?'练习状态，不代表真实模型执行。':'进度来自已有流程与本机文件记录。'} 编辑可以撤销；已生成成果保留。</p>`;
}
function activityButtons(){const canUndo=HistoryCore.target(undoS,state)>=0,canRedo=HistoryCore.target(redoS,state)>=0;return `<button data-act="undo" ${canUndo?'':'disabled'}>${icon('undo',14)}撤销</button><button data-act="redo" ${canRedo?'':'disabled'}>${icon('redo',14)}重做</button>`}
function activityRefresh(){
 if(!HA.ready)return;for(const name of ['undo','redo']){const stack=name==='undo'?undoS:redoS,index=HistoryCore.target(stack,state);document.querySelectorAll('button[data-act="'+name+'"]').forEach(b=>{b.disabled=index<0;b.title=index<0?'暂无可'+(name==='undo'?'撤销':'重做')+'的编辑':(name==='undo'?'撤销上一步编辑':'重做上一步编辑');if(b.closest('#tools')&&!b.querySelector('.memphis-label'))b.insertAdjacentHTML('beforeend','<span class="memphis-label">'+(name==='undo'?'撤销':'重做')+'</span>')})}
 const scope=HA.report;if(!scope)return;
 const floating=$('#activity-report');if(scope.floating){if(!floating)return;const title=activityTitle(scope),head=floating.querySelector('[data-activity-title]');if(head&&head.textContent!==title)head.textContent=title;const body=floating.querySelector('[data-activity-body]'),markup=activityMarkup(scope);activityReplace(body,markup)}
 else{floating?.setAttribute('hidden','');const box=document.querySelector('[data-activity-scope="'+HistoryCore.key(scope)+'"]');if(box)activityReplace(box,activityMarkup(scope,true))}
}
function activityReplace(el,markup){if(!el||el.dataset.markup===markup||(el.contains(document.activeElement)&&document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')))return;const open=[...el.querySelectorAll('details')].map(d=>d.open);el.innerHTML=markup;el.dataset.markup=markup;el.querySelectorAll('details').forEach((d,i)=>{if(i<open.length)d.open=open[i]})}
const activityPanel=document.createElement('section');activityPanel.id='activity-report';activityPanel.hidden=true;activityPanel.className='activity-report';activityPanel.setAttribute('aria-label','近期操作与项目进度');activityPanel.innerHTML=`<h3>${icon('activity',16)}<span data-activity-title></span><button class="x" data-activity-close aria-label="关闭近况">${icon('close',15)}</button></h3><div data-activity-body></div>`;document.body.append(activityPanel);
const activityWindows=dmWindows;dmWindows=()=>[...activityWindows(),activityPanel];
const activityOpenBase=activityOpen;activityOpen=function(scope,floating=false){activityPanel.hidden=!floating;if(floating)activityPanel.classList.add('o');activityOpenBase(scope,floating);dmDecorate()};
const activityTopBase=renderTop;renderTop=function(){activityTopBase();if(!$('#tools [data-activity-board]'))$('#tools').insertAdjacentHTML('beforeend',`<button data-activity-board aria-label="画板近况">${icon('activity',16)}<span class="memphis-label">近况</span></button>`);activityRefresh()};
const activityPanBase=renderPan;renderPan=function(){activityPanBase();if(!['proj','cluster','group','file','link','bundle','boards'].includes(panK)||!$('#pan').classList.contains('o'))return;
 const kind={proj:'project',cluster:'cluster',group:'group'}[panK];if(kind){const scope={kind,id:panId};if(!$('#pan [data-activity-scope]'))$('#pan>h3')?.insertAdjacentHTML('afterend',`<section class="activity-inline" data-activity-scope="${HistoryCore.key(scope)}">${activityMarkup(scope,true)}</section>`)}
 if(!$('#pan .activity-edit-actions')){let remove='';if(panK==='proj')remove=B_('project.delete',{projectId:panId},'删除项目','trash');if(panK==='cluster')remove=B_('cluster.remove',{clusterId:panId},'删除组及子项目','trash');if(panK==='file')remove=B_('file.delete',{fileId:panId},'移除文件','trash');if(panK==='link')remove=B_('link.delete',{linkId:panId},'断开连接','trash');$('#pan>h3')?.insertAdjacentHTML('afterend',`<div class="activity-edit-actions">${activityButtons()}${remove}</div>`)}activityRefresh();dmDecorate();
};
const activityOpenPanBase=openPan;openPan=function(k,id){const kind={proj:'project',cluster:'cluster',group:'group'}[k];if(kind&&!DM.restoring)activityOpen({kind,id});else if(k!=='boards')activityPanel.hidden=true;activityOpenPanBase(k,id)};
const activityRoomBase=renderRoom;renderRoom=function(){activityRoomBase();const p=P(state.room);if(!p)return;const scope={kind:'project',id:p.id};if(!$('#room [data-activity-scope]'))$('#rm')?.insertAdjacentHTML('beforebegin',`<section class="activity-inline activity-room"><details open><summary>项目近况</summary><div data-activity-scope="${HistoryCore.key(scope)}">${activityMarkup(scope,true)}</div></details></section>`);if(!$('#room [data-activity-project]'))$('#room .rh')?.insertAdjacentHTML('beforeend',`<button data-activity-project="${p.id}">${icon('activity',14)}近况</button>`);activityRefresh()};
for(const name of ['board.switch','board.create','board.delete','room.enter','room.leave']){const base=ACT[name];ACT[name]=a=>{const result=base(a);activityOpen(state.room?{kind:'project',id:state.room}:{kind:'board',id:state.activeBoard},!state.room);return result}}
document.addEventListener('click',e=>{if(e.target.closest('[data-activity-close]')){activityPanel.hidden=true;HA.report=null}if(e.target.closest('[data-activity-board]')){activityOpen({kind:'board',id:state.activeBoard},true)}const project=e.target.closest('[data-activity-project]');if(project)openPan('proj',project.dataset.activityProject)},true);
// Attachment removal used to bypass history; it now enters the same edit boundary.
document.addEventListener('click',e=>{if(e.target.closest('[data-unatt]'))pushUndo()},true);
document.addEventListener('focusout',()=>{HA.coalesce=null});
function historyAcceptFrame(){if(!HA.ready)return;state.activityLog=state.activityLog||[];state.activityVisits=state.activityVisits||{};HA.pending=null;HA.coalesce=null;HA.last=snap();HA.lastSignature=HistoryCore.signature(state);HA.dirty=true;historyPersist()}
// One visible software action is one undo step, even when an adapter saves defaults twice.
for(const name of Object.keys(ACT)){if(['undo','redo'].includes(name))continue;const action=ACT[name];ACT[name]=function(a){if(!HA.depth)HA.pending=snap();HA.depth++;try{return action(a)}finally{HA.depth--;if(!HA.depth)historyCommit()}}}
try{const stored=JSON.parse(localStorage.getItem(HISTORY_KEY)||'null');if(stored?.version===1&&stored.anchor===HistoryCore.signature(state)&&Array.isArray(stored.undo)&&Array.isArray(stored.redo)){undoS=stored.undo.filter(s=>{try{return!!JSON.parse(s).projects}catch{return false}});redoS=stored.redo.filter(s=>{try{return!!JSON.parse(s).projects}catch{return false}})}}catch{}
const activityApplyBase=cpApply;cpApply=function(r){const prior=HA.travel;HA.travel='external';try{activityApplyBase(r)}finally{HA.travel=prior}};
HA.last=snap();HA.lastSignature=HistoryCore.signature(state);HA.ready=true;editHistoryReady=true;
activityOpen(state.room&&P(state.room)?{kind:'project',id:state.room}:{kind:'board',id:state.activeBoard},!state.room);
setInterval(activityRefresh,1200);
addEventListener('pagehide',()=>{historyCommit();try{localStorage.setItem(KEY,JSON.stringify(state));historyPersist()}catch{}});
/* HISTORY_REPORTS_END */
