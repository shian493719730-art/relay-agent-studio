/* BROWSER_CONTROL_START */
// Playwright MCP is the input device. Existing actions remain the single owner of business state.
const VR={session:null,target:false,status:null,poll:null,pulsing:false,working:false,native:false,voice:false,lastSpoken:0,card:null,returning:false,error:'',delay:700,details:false,preview:false,frame:null,frameBusy:false,command:null,revision:-1,sent:new Set(),received:new Set(),pending:0};
const VR_KEY='relay_visual_window';
/* VISUAL_EXECUTION_CORE_START */
const VisualExecutionCore={
 key(kind,target){let hash=2166136261;for(const c of String(target)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}return kind+'-'+(hash>>>0).toString(36)},
 editDemoNote(session,text){if(!session?.visualDemo)throw new Error('当前不是本地演练');const step=session.steps.find(s=>s.name==='note.create'&&s.status!=='done');if(!step)throw new Error('说明笔记已完成，可以接手后直接编辑');step.args={...step.args,text};delete step.checkpoint;session.followups=session.followups||[];session.followups.push('手动修改待写说明笔记：'+text);session.reason='待写说明笔记已修改，点击继续后才执行';return step},
};
/* VISUAL_EXECUTION_CORE_END */
async function vrApi(action,data={}){const s=VR.session;if(!s&&action!=='create')throw new Error('可视窗口尚未连接');const r=await fetch('/api/studio/browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(s?{id:s.id,token:s.token}:{}),...data})});const d=await r.json();if(!r.ok)throw new Error(d.error||'浏览器操作未完成');return d}
function vrState(){return{...state,assistantVisualDraft:AS.draft}}
async function vrSendFiles(ids){for(const id of ids){const blob=await idb('get',id).catch(()=>null);if(!blob)continue;const r=await fetch('/api/studio/browser/blob/'+VR.session.id+'/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Relay-Visual':VR.session.token},body:blob});if(!r.ok)throw new Error((await r.json()).error||'文件同步未完成')}}
async function vrGetFiles(ids,files=state.files){for(const id of ids){const r=await fetch('/api/studio/browser/blob/'+VR.session.id+'/'+id,{headers:{'X-Relay-Visual':VR.session.token}});if(!r.ok)throw new Error('文件原件未能同步，尚未关闭工作窗口');const f=files.find(f=>f.id===id);await idb('put',new Blob([await r.arrayBuffer()],{type:f?.type||'application/octet-stream'}),id)}}
async function vrOpen(localOnly=false){
 if(VR.session||VR.opening)return;VR.opening=true;hint('正在准备可视工作窗口…');
 try{asPause();while(AS.ac)await new Promise(r=>setTimeout(r,30));
 if([...CP.runs.values()].some(r=>r.status==='running')||liveTurns.size||pendingTurns.size){hint('当前还有成员在输出，画板保持在原窗口；相应流程暂停后即可切换可视窗口');return false}
 VR.error='';VR.revision=-1;VR.sent.clear();VR.received.clear();const s=await vrApi('create',{state:vrState(),history:{undo:undoS,redo:redoS},localOnly});VR.session={id:s.id,token:s.token};sessionStorage.setItem(VR_KEY,JSON.stringify({...VR.session,target:false}));VR.status=s;vrRender();await vrSendFiles(state.files.map(f=>f.id));VR.status=await vrApi('open');vrStartPolling();for(let n=0;n<60&&!VR.status.ready;n++){await new Promise(r=>setTimeout(r,200));VR.status=await vrApi('status')}if(!VR.status.ready)throw new Error('工作窗口尚未就绪，请稍候或返回当前页面');return true;}
 catch(e){VR.error=e.message;vrRender();hint(e.message)}finally{VR.opening=false;}
}
async function vrPulse(){
 if(!VR.session||VR.pulsing||VR.returning)return;VR.pulsing=true;
 try{
  let d;if(VR.target){
   d=await vrApi('status');if(d.status!=='ai'&&AS.ac)asPause();
   const ack=!AS.ac&&!d.busy&&!VR.pending?d.epoch:(VR.status?.ack||0);
   d=await vrApi('heartbeat',{state:vrState(),history:{undo:undoS,redo:redoS},ack,commandAck:VR.command,viewport:{width:innerWidth,height:innerHeight}});
   const ids=state.files.filter(f=>!VR.sent.has(f.id)).map(f=>f.id);if(ids.length){await vrSendFiles(ids);ids.forEach(id=>VR.sent.add(id))}
  }else{d=await vrApi('status');if(d.revision>VR.revision){const frame=await vrApi('pull');await vrGetFiles(frame.files.filter(id=>!VR.received.has(id)),frame.state.files);frame.files.forEach(id=>VR.received.add(id));const controlBox=state.prefs.windowBoxes?.['visual-control'];state=StudioModel.prepare(WorkspaceModel.prepare(frame.state));if(controlBox)state.prefs.windowBoxes['visual-control']=controlBox;undoS=frame.history.undo;redoS=frame.history.redo;if(editHistoryReady)historyAcceptFrame();AS.draft=state.assistantVisualDraft||'';AS.current=state.assistantSessions?.at(-1)?.id;VR.revision=d.revision;localStorage.setItem(KEY,JSON.stringify(state));renderAll();renderGuide()}}VR.status=d;VR.error='';vrRender();
  if(VR.target&&d.command&&!VR.processing&&VR.command!==d.command.id){const command=d.command;VR.processing=command.id;void vrCommand(command,d.epoch).catch(e=>{VR.error=e.message;vrRender()}).finally(()=>{VR.command=command.id;VR.processing=null})}
  if(!VR.target&&VR.preview&&!VR.frameBusy){VR.frameBusy=true;void vrApi('frame').then(d=>{VR.frame=d.frame;vrRender()}).catch(()=>{}).finally(()=>VR.frameBusy=false)}
 }catch(e){VR.error=e.message;if(VR.target)asPause();vrRender()}finally{VR.pulsing=false}
}
function vrStartPolling(){clearInterval(VR.poll);VR.poll=setInterval(()=>void vrPulse(),600);void vrPulse()}
async function vrControl(action){
 if(VR.target)asPause();if(VR.voice&&window.speechSynthesis)window.speechSynthesis.cancel();
 try{VR.status=await vrApi(action);vrRender();return VR.status}catch(e){VR.error=e.message;vrRender();throw e}
}
async function vrReturn(){
 if(VR.returning)return;VR.returning=true;
 try{
  if(VR.target)asPause();VR.status=await vrApi('takeover');const epoch=VR.status.epoch;VR.returning=false;
  // Wait for the current physical gesture AND the controlled page to acknowledge its final state.
  VR.preview=false;for(let n=0;n<35;n++){await new Promise(r=>setTimeout(r,200));if(VR.target)await vrPulse();const d=await vrApi('status');VR.status=d;if(!d.busy&&(!d.ready||d.ack>=epoch))break;if(n===34)throw new Error('正在保存最后一个动作，请稍后再次返回；窗口和成果已保留')}
  VR.returning=true;const d=await vrApi('pull');await vrGetFiles(d.files,d.state.files);
  if(VR.target){VR.returning=false;VR.error='已停止自动操作。请在原页面点击“返回当前页面”，成果会同步回去。';vrRender();return}
  const controlBox=state.prefs.windowBoxes?.['visual-control'];state=StudioModel.prepare(WorkspaceModel.prepare(d.state));if(controlBox)state.prefs.windowBoxes['visual-control']=controlBox;AS.draft=state.assistantVisualDraft||'';delete state.assistantVisualDraft;undoS=d.history.undo;redoS=d.history.redo;if(editHistoryReady)historyAcceptFrame();AS.current=state.assistantSessions?.at(-1)?.id;for(const s of state.assistantSessions||[])if(['running','planning'].includes(s.status))s.status='paused';
  await vrApi('close');VR.session=null;VR.status=null;clearInterval(VR.poll);sessionStorage.removeItem(VR_KEY);const size=d.viewport||{width:1280,height:820};delete state.visualViewport;if(size.width!==innerWidth||size.height!==innerHeight)ACT['view.fit']();localStorage.setItem(KEY,JSON.stringify(state));renderAll();$('#guide').classList.remove('o');vrRender();hint('已回到原画板，成果、草稿和撤销记录已保留');return true;
 }catch(e){VR.error=e.message;vrRender()}finally{VR.returning=false}
}
function vrSpeak(d){const last=d?.events?.at(-1);if(!VR.voice||!last||last.seq===VR.lastSpoken||!window.speechSynthesis)return;VR.lastSpoken=last.seq;const voice=speechSynthesis.getVoices().find(v=>v.localService&&/^zh/.test(v.lang));if(!voice)return;const u=new SpeechSynthesisUtterance(last.label);u.lang='zh-CN';u.voice=voice;speechSynthesis.cancel();speechSynthesis.speak(u)}
function vrRender(){
 let el=$('#visual-control');if(!el){el=document.createElement('section');el.id='visual-control';el.className='fl';el.setAttribute('aria-label','可视执行控制');document.body.append(el)}
 for(const surface of document.querySelectorAll('#bd,#tl,#shelf,#gb,#tools,#guide'))surface.inert=!!VR.session&&!VR.target;
 if(!VR.session){el.hidden=true;$('#vr-source-shield')?.remove();return}el.hidden=false;
 const d=VR.status||{},last=d.events?.at(-1),live=!!AS.ac||d.busy||d.status==='ai',current=asSession(),progress=current?.visualDemo||current?.operator?current:null;
 const initial=!el.querySelector('.vr-head')||el.dataset.mode!==String(VR.target);if(initial){el.dataset.mode=String(VR.target);el.innerHTML=`<div class="vr-head"><b>${icon('pointer',15)} ${VR.target?'可视执行':'可视工作窗口'}</b><span>${d.localOnly?'本地演练 · 不调用模型':({ai:'AI正在操作',human:'你已接手',paused:'已暂停',opening:'正在打开',failed:'未连接'})[d.status]||'准备中'}</span></div><p class="vr-live" aria-live="polite">${esc(VR.error||last?.label||'正在准备浏览器…')}</p><div class="row"><button data-vr="pause">${icon('pause',14)}暂停</button><button data-vr="takeover">我来接手</button><button data-vr="continue" ${live?'disabled':''}>继续</button><button data-vr="steer">更改要求</button>${VR.target?'':'<button data-vr="return">返回当前页面</button><button data-vr="preview">实时画面</button>'}<button data-vr="details" aria-label="查看执行进度">${icon('layers',14)}</button></div>${!VR.target&&VR.preview?`<div class="vr-preview">${VR.frame?`<img src="${VR.frame}" alt="MCP受控浏览器实时画面">`:'正在读取浏览器实际画面…'}</div>`:''}<details class="vr-details" ${VR.details?'open':''}><summary>操作记录与播报</summary><label><input type="checkbox" data-vr-voice ${VR.voice?'checked':''}>语音播报（本机语音）</label><ol>${(d.events||[]).slice(-16).map(e=>`<li><span>${String(e.seq).padStart(2,'0')}</span>${esc(e.label)} <small>${({done:'完成',running:'执行中',failed:'未完成'})[e.status]||''}</small></li>`).join('')}</ol>${d.localOnly?'<button data-vr="demo">运行无模型演练</button>':''}</details>`;
 el.querySelector('details').addEventListener('toggle',e=>{VR.details=e.target.open});el.insertAdjacentHTML('beforeend','<form class="vr-request" hidden><label><span data-vr-request-label>补充或更改任务要求</span><textarea data-vr-request-text aria-label="更改执行要求" required maxlength="4000"></textarea></label><button type="submit">保存修改</button><button type="button" data-vr="cancel-edit">取消</button></form>');el.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const text=el.querySelector('[data-vr-request-text]').value.trim();if(!text)return;try{await vrApi('command',{name:VR.status?.localOnly?'edit-demo-note':'steer',text});el.querySelector('form').hidden=true;hint(VR.status?.localOnly?'待写笔记已交给窗口保存，点击继续后执行':'新要求已交给助手，使用最新状态继续分析')}catch(e){VR.error=e.message;vrRender()}});}
 const status=el.querySelector('.vr-head>span');status.textContent=d.localOnly?'本地演练 · 不调用模型':({ai:'AI正在操作',human:'你已接手',paused:'已暂停',opening:'正在打开',failed:'未连接'})[d.status]||'准备中';
 el.querySelector('.vr-live').textContent=VR.error||last?.label||'正在准备浏览器…';el.querySelector('[data-vr=continue]').disabled=live||progress?.status==='completed';
 const details=el.querySelector('details');details.open=VR.details;const list=el.querySelector('ol'),rows=(d.events||[]).slice(-16).map(e=>`<li><span>${String(e.seq).padStart(2,'0')}</span>${esc(e.label)} <small>${({done:'完成',running:'执行中',failed:'未完成'})[e.status]||''}</small></li>`).join('');if(list.innerHTML!==rows)list.innerHTML=rows;
 if(d.localOnly&&!el.querySelector('[data-vr=demo]'))details.insertAdjacentHTML('beforeend','<button data-vr=demo>运行无模型演练</button>');
 if(!VR.target&&VR.preview){let preview=el.querySelector('.vr-preview');if(!preview){preview=document.createElement('div');preview.className='vr-preview';preview.innerHTML='<img alt=\"MCP受控浏览器实时画面\">';el.insertBefore(preview,details)}if(VR.frame&&preview.querySelector('img').getAttribute('src')!==VR.frame)preview.querySelector('img').src=VR.frame}else el.querySelector('.vr-preview')?.remove();
 if(!VR.target){let shield=$('#vr-source-shield');if(!shield){shield=document.createElement('div');shield.id='vr-source-shield';shield.innerHTML='<div><b>已在可视工作窗口继续</b><p>同一画板的操作与成果会保留。暂停或接手可在两个窗口操作。</p><p>返回前会先保存正在结束的动作。</p></div>';document.body.append(shield)}if(VR.error&&/不存在|结束/.test(VR.error))shield.innerHTML='<div><b>工作窗口连接已结束</b><p>原页面已保存最近同步的画板，可以恢复手动操作。</p><button data-vr="recover">恢复原页面</button></div>'}
 const message=el.querySelector('.vr-live');if(!VR.error&&progress&&progress.status==='failed')message.textContent=progress.reason||'当前步骤未完成，请查看操作助手';else if(!VR.error&&VR.status?.ready&&progress?.status==='completed')message.textContent='已完成 '+progress.steps.filter(s=>s.status==='done').length+' 步，实际成果已保存';
 vrSpeak(d);if(typeof dmDecorate==='function')dmDecorate();
}
const vrWindowsBase=dmWindows;dmWindows=function(){return[...vrWindowsBase(),...($('#visual-control')&&!$('#visual-control').hidden?[$('#visual-control')]:[])]};
const vrGuideBase=renderGuide;renderGuide=function(){vrGuideBase();const el=$('#gl');if(!el||el.querySelector('[data-vr-entry]'))return;el.insertAdjacentHTML('afterbegin',`<div data-vr-entry class="vr-entry">${VR.target?'<span>操作通过 Playwright MCP 在当前窗口执行</span>':`<button data-vr="open">${icon('pointer',14)}可视执行窗口</button><button data-vr="local">无模型演练</button>`}</div>`)};
function vrHighlight(selector){document.querySelectorAll('.vr-target').forEach(e=>e.classList.remove('vr-target'));if(selector)try{$(selector)?.classList.add('vr-target')}catch(e){}}
async function vrGesture(g,label,ctx,key){
 const receipts=ctx.step.checkpoint.nativeReceipts=ctx.step.checkpoint.nativeReceipts||{};if(receipts[key])return receipts[key];
 ctx.signal.throwIfAborted();const s=await vrApi('status');VR.status=s;if(s.status!=='ai')throw new DOMException('已暂停或接手','AbortError');
 vrHighlight(g.target||g.startTarget);await asDelay(VR.delay,ctx.signal);VR.native=true;
 try{const r=await vrApi('gesture',{key:ctx.session.id+':'+ctx.step.id+':'+key,epoch:s.epoch,label,gesture:g});receipts[key]=r;asPersist();await vrPulse();ctx.signal.throwIfAborted();return r}finally{VR.native=false;vrHighlight(null)}
}
const vrOriginalInvoke=asInvoke;
async function vrNativeInvoke(name,a,ctx){
 const cp=ctx.step.checkpoint=ctx.step.checkpoint||{};if(cp.visualReceipt)return cp.visualReceipt;
 if(!cp.visualBefore){cp.visualBefore=Object.fromEntries(Object.entries(asBefore()).map(([k,v])=>[k,[...v]]));asPersist()}
 const before=Object.fromEntries(Object.entries(cp.visualBefore).map(([k,v])=>[k,new Set(v)]));
 const click=(target,label,doubleClick=false)=>vrGesture({kind:'click',target,doubleClick},label,ctx,VisualExecutionCore.key(/\.rt$|data-a="boards"|data-cl-edit|data-close|data-tool=/.test(target)?'navigate'+ctx.session.visualAttempt:'click',target+'|'+label));
 const fill=async(target,text,label)=>{await vrGesture({kind:'type',target,text:String(text)},label,ctx,VisualExecutionCore.key('type',target));await vrGesture({kind:'key',key:'Tab'},'提交字段修改',ctx,VisualExecutionCore.key('blur',target))};
 const select=(target,value,label)=>vrGesture({kind:'select',target,values:[value]},label,ctx,VisualExecutionCore.key('select',target));
 const drag=(startTarget,endTarget,label)=>vrGesture({kind:'drag',startTarget,endTarget},label,ctx,VisualExecutionCore.key('drag',startTarget+endTarget));
 const psel=id=>'.ring[data-pid="'+CSS.escape(id)+'"]';
 const dismissReport=async()=>{if($('#activity-report')&&!$('#activity-report').hidden)await click('#activity-report [data-activity-close]','收起近况，显示画板操作区')};
 const openProject=async id=>{if(state.room){await click('#room [data-act="room.leave"]','返回画板')}await dismissReport();await click(psel(id)+' .rt','展开项目面板')};
 $('#guide').classList.remove('o');
 await dismissReport();
 if(name==='board.create'||name==='board.rename'||name==='board.switch'||name==='board.list'){
  if(panK!=='boards')await click('#tl [data-a="boards"]','展开画板菜单');
  if(name==='board.create'){if(!state.boards.some(b=>!before.boards.has(b.id))){await click('#pan [data-act="board.create"]','点击新建画板');await click('#tl [data-a="boards"]','展开新画板菜单');}}
  const id=name==='board.create'?state.boards.find(b=>!before.boards.has(b.id))?.id:a.boardId;
  if(name==='board.create'&&!id)throw new Error('新画板尚未出现');
  if(name==='board.switch')await click('#pan [data-act="board.switch"][data-args='+CSS.escape(JSON.stringify({boardId:id}))+']','切换到指定画板');
  if(name==='board.rename'||name==='board.create'&&a.name){await click('#pan [data-cl-edit="'+CSS.escape(id)+'"]','展开画板名称编辑');await fill('#pan [data-cl-name]',a.name,'填写画板名称');await click('#pan [data-cl-rename-form] button[type="submit"]','保存画板名称');}
 }else if(name==='project.draw'){
  RegionCore.stroke(a.points);if(a.boardId&&a.boardId!==state.activeBoard)throw new Error('请先切换目标画板');
  if(!state.projects.some(p=>!before.projects.has(p.id))){await click('#tools [data-tool="pen"]','选择自由圈选画笔');const points=a.points.map(([x,y])=>[x*V().k+V().x,y*V().k+V().y]);if(points.some(([x,y])=>x<8||y<100||x>innerWidth-8||y>innerHeight-85))throw new Error('手绘轨迹超出当前可操作画板，请先调整视口');await vrGesture({kind:'draw',points},'在画板实际绘制手绘轮廓',ctx,'draw-region');}
  const p=state.projects.find(p=>!before.projects.has(p.id));if(!p)throw new Error('手绘选区尚未生成');if(a.name)await fill('#pan [data-pf="name"]',a.name,'填写手绘选区名称');
 }else if(name==='project.create'){
  if(a.boardId&&a.boardId!==state.activeBoard)throw new Error('请先切换目标画板，再通过可视控件新建项目');
  if(!state.projects.some(p=>!before.projects.has(p.id)))await click('#tools [data-act="project.create"]','点击新建项目');else if(panK!=='proj')await openProject(state.projects.find(p=>!before.projects.has(p.id)).id);const p=state.projects.find(p=>!before.projects.has(p.id));if(!p)throw new Error('新项目尚未出现');
  if(a.name!==undefined)await fill('#pan [data-pf="name"]',a.name,'填写项目名称');
  if(a.x!==undefined||a.y!==undefined)await vrCardInvoke('project.move',{projectId:p.id,x:a.x??p.space.x,y:a.y??p.space.y},ctx,'position');
 }else if(name==='project.open'){await openProject(a.projectId)}
 else if(name==='project.update'||name==='member.update'||name==='coord.update'){
  const p=rp(a.projectId);await openProject(p.id);
  if(name==='project.update'){
   if(a.name!==undefined)await fill('#pan [data-pf="name"]',a.name,'填写项目名称');
   if(a.summary!==undefined)await fill('#pan [data-pf="summary"]',a.summary,'填写项目目标');
   if(a.color!==undefined)await vrCardInvoke('project.update',{projectId:p.id,color:a.color},ctx,'color');
  }else{const id=p.id+'|'+(name==='coord.update'?p.coordinator.id:a.memberId),s=CSS.escape(id);if(a.name!==undefined)await fill('#pan [data-mn="'+s+'"]',a.name,'填写成员名称');if(a.role!==undefined)await fill('#pan [data-mr="'+s+'"]',a.role,'填写成员职责');if(a.agent)await select('#pan [data-ma="'+s+'"]',a.agent,'选择成员模型')}
 }else if(name==='member.add'){
  const p=rp(a.projectId);if(p.boardId!==state.activeBoard||state.room)throw new Error('请先返回成员所在画板');if($('#pan').classList.contains('o'))await click('#pan [data-close="pan"]','收起面板，显示项目选区');
  if(!p.members.some(m=>!before.members.has(m.id)))await drag('#shelf [data-model="'+CSS.escape(a.agent)+'"]',psel(p.id),'将模型头像拖入项目选区');
 }else if(name==='link.create'){
  if(state.room)throw new Error('请先返回画板再连接项目');if($('#pan').classList.contains('o'))await click('#pan [data-close="pan"]','收起面板，显示项目选区');
  await click('#tools [data-act="view.fit"]','显示当前画板全部项目');await click('#tools [data-tool="link"]','选择连线工具');await drag(psel(a.src)+' .rt',psel(a.dst)+' .rt','从源项目拖出连接到下游');await click('#tools [data-tool="pointer"]','返回选择工具');const l=state.links.find(l=>!before.links.has(l.id));if(!l)throw new Error('画板尚未出现项目连接');
  // Newly drawn UI links use the same conservative sharing default as planned links.
  for(const key of ['summary','artifacts','documents'])if($('#pan [data-ls="'+key+'"]')?.checked)await click('#pan [data-ls="'+key+'"]','默认暂不共享：'+key);
 }else if(name==='link.set'||name==='link.open'||['link.enable','link.pause','link.resume'].includes(name)){
  const l=fnd(state.links,a.linkId,'连接');if(state.room)await click('#room [data-act="room.leave"]','返回画板');if(panK!=='link'||panId!==l.id)await click('button[data-link="'+CSS.escape(l.id)+'"]','展开连接设置');
  if(name==='link.set'){
   for(const key of ['name','keyword'])if(a[key]!==undefined)await fill('#pan [data-lf="'+key+'"]',a[key],key==='name'?'填写连接名称':'填写触发关键词');
   if(a.trigger)await select('#pan [data-lf="trigger"]',a.trigger,'选择触发规则');
   for(const key of ['summary','artifacts','documents'])if(a[key]!==undefined){const sel='#pan [data-ls="'+key+'"]';if($(sel)?.checked!==(a[key]===true||a[key]==='true'))await click(sel,'设置共享范围：'+({summary:'摘要',artifacts:'成果',documents:'文件正文'})[key])}
   if(a.noteIds)for(const note of state.notes.filter(n=>n.pid===l.src)){const sel='#pan [data-lsn="'+CSS.escape(note.id)+'"]';if($(sel)?.checked!==a.noteIds.includes(note.id))await click(sel,'设置共享笔记')}
  }else if(name!=='link.open')await click('#pan [data-act="'+name+'"]','设置连接状态');
 }else if(name==='note.create'&&a.projectId||name==='note.update'&&Object.keys(a).every(k=>['noteId','text'].includes(k))){
  let id=a.noteId;if(name==='note.create'){id=state.notes.find(n=>!before.notes.has(n.id))?.id;if(!id){await openProject(a.projectId);await click('#pan [data-act="note.create"]','添加项目关联笔记');id=state.notes.find(n=>!before.notes.has(n.id))?.id;}}if(!id)throw new Error('笔记尚未出现');if(a.text!==undefined)await fill('[data-nt="'+CSS.escape(id)+'"]',a.text,'填写实际笔记正文');
 }else if(name==='assistant.draft'){
  if(state.room!==a.projectId){await openProject(a.projectId);await click('#pan [data-act="room.enter"]','进入项目对话')}
  await fill('#rin',a.text,'填写项目对话草稿，尚未发送');
 }else if(name==='room.enter'){await openProject(a.projectId);await click('#pan [data-act="room.enter"]','进入项目对话')}
 else if(name==='room.leave'){await click('#room [data-act="room.leave"]','返回画板')}
 else if(name==='view.fit'){await click('#tools [data-act="view.fit"]','显示全部项目')}
 else if(name==='undo'||name==='redo'){await click('#tools [data-act="'+name+'"]',name==='undo'?'撤销上一步编辑':'重做上一步编辑')}
 else return vrCardInvoke(name,a,ctx);
 const diff=asDiff(before);if(name==='member.add'&&!diff.memberId)throw new Error('模型未进入项目，请检查圆圈是否被面板遮挡');
 if(name==='project.update'){const p=rp(a.projectId);if(a.name!==undefined&&p.name!==a.name||a.summary!==undefined&&p.summary!==a.summary)throw new Error('项目字段没有保存，请检查实际控件')}
 if(diff.boardId)ctx.session.targetBoardId=diff.boardId;
 const result={...Object.fromEntries(Object.entries(a).filter(([k])=>/Id$/.test(k))),...diff,message:'已通过真实界面操作：'+ctx.step.label,execution:'Playwright MCP'};cp.visualReceipt=result;save();renderAll();return result;
}
async function vrCardInvoke(name,a,ctx,suffix='action'){
 const cp=ctx.step.checkpoint=ctx.step.checkpoint||{};cp.visualCards=cp.visualCards||{};if(cp.visualCards[suffix])return cp.visualCards[suffix];
 const describe=(key,value)=>{if(/Id$/.test(key)){const found=[...state.projects,...state.boards,...state.files,...state.links,...state.notes,...AS.profiles].find(x=>x.id===value);return found?.name||found?.text?.slice(0,60)||'已选择对象'}return String(typeof value==='object'?'已指定设置':value).slice(0,220)};
 const labels={projectId:'项目',boardId:'画板',fileId:'文件',memberId:'成员',connectionId:'模型连接',model:'模型',name:'名称',text:'内容',x:'横向位置',y:'纵向位置',width:'宽度',height:'高度'};
 const el=document.createElement('section');el.id='vr-action-card';el.className='fl';el.setAttribute('aria-label','本步软件操作');el.innerHTML=`<h3>${esc(CAT.find(c=>c[0]===name)?.[1]||name)}</h3><p class="lab">执行后会在软件中呈现实际结果，可随时暂停</p><dl>${Object.entries(a).map(([key,value])=>`<div><dt>${esc(labels[key]||'设置')}</dt><dd>${esc(describe(key,value))}</dd></div>`).join('')}</dl><details><summary>调整本步设置</summary><label>高级参数<textarea data-vr-args aria-label="本步操作参数">${esc(JSON.stringify(a,null,2))}</textarea></label></details><button data-vr-commit>执行这一步</button><p data-vr-card-status aria-live="polite"></p>`;document.body.append(el);
 let settled=false,result,error;const button=el.querySelector('[data-vr-commit]');
 button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;VR.pending++;el.querySelector('[data-vr-card-status]').textContent='正在执行并等待真实回执';try{ctx.signal.throwIfAborted();const args=JSON.parse(el.querySelector('[data-vr-args]').value);result=await vrOriginalInvoke(name,args,ctx);cp.visualCards[suffix]=result;el.querySelector('[data-vr-card-status]').textContent=result?.message||'实际操作已完成'}catch(e){error=e;el.querySelector('[data-vr-card-status]').textContent=e.message}finally{settled=true;VR.pending--;asPersist()}});
 try{
  await vrGesture({kind:'click',target:'#vr-action-card [data-vr-commit]'},'执行：'+ctx.step.label,ctx,suffix+'-commit-'+ctx.session.visualAttempt);
  while(!settled)await asDelay(120,ctx.signal);if(error)throw error;return result;
 }finally{el.remove()}
}
asInvoke=async function(name,a,ctx){if(!VR.target||!VR.session)return vrOriginalInvoke(name,a,ctx);VR.working=true;try{return await vrNativeInvoke(name,a,ctx)}finally{VR.working=false;vrHighlight(null)}};
const vrExecuteBase=asExecute;asExecute=async function(s,approve=false,epoch=VR.status?.epoch){if(VR.target){if(AS.ac)return;if(VR.pending)throw new Error('正在保留当前软件操作的结果，请稍候');s.visualPreferred=true;s.visualAttempt=(s.visualAttempt||0)+1;VR.status=await vrApi('resume',{epoch});vrRender();try{return await vrExecuteBase(s,approve)}finally{VR.status=await vrApi('settle',{epoch});await vrPulse()}}if(s.visualPreferred){if(!VR.session&&!await vrOpen(!!s.visualDemo))return;await vrApi('command',{name:'continue'});return}return vrExecuteBase(s,approve)};
async function vrCommand(command,epoch){if(command.name==='demo')return vrDemo();const s=asSession();if(!s)return;if(command.name==='continue')return asExecute(s,true,epoch);await vrControl('takeover');while(AS.ac)await new Promise(r=>setTimeout(r,30));if(command.name==='edit-demo-note'){VisualExecutionCore.editDemoNote(s,command.text);asPersist();return}if(command.name==='steer')return asSteer(command.text)}
async function vrDemo(){
 if(AS.ac||!VR.target||!VR.status?.localOnly)return;
 const b='浏览器实操 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
 const plans=[['board.create',{name:b},'新建独立演练画板'],['project.draw',{name:'手绘内容制作',points:[[170,280],[310,220],[485,245],[555,335],[525,485],[355,540],[190,470],[165,355],[170,280]]},'手绘创建内容制作项目'],['project.update',{projectId:{$ref:'s2.projectId'},summary:'为物流行业制作自媒体内容；本次仅验证浏览器操作，不生成或发布'},'填写真实项目目标'],['member.add',{projectId:{$ref:'s2.projectId'},agent:'gpt'},'拖入 GPT 成员'],['member.update',{projectId:{$ref:'s2.projectId'},memberId:{$ref:'s4.memberId'},name:'选题策划',role:'阅读材料，提出三个可核查的选题'},'填写成员名称和职责'],['project.create',{name:'审核接续',x:830,y:320},'创建独立下游项目'],['member.add',{projectId:{$ref:'s6.projectId'},agent:'gemini'},'拖入 Gemini 成员'],['link.create',{src:{$ref:'s2.projectId'},dst:{$ref:'s6.projectId'}},'在画板真实拖出项目连接'],['link.set',{linkId:{$ref:'s8.linkId'},trigger:'done',summary:true,artifacts:true,documents:false},'设置完成触发与共享范围'],['note.create',{projectId:{$ref:'s2.projectId'},text:'浏览器实操成果，尚未进行模型生成；可手动修改、撤销或删除。'},'保存本地成果说明'],['view.fit',{},'核对画板实际成果']];
 const s={id:'as'+uid(),demo:true,visualDemo:true,boardId:state.activeBoard,request:'无模型浏览器实操：展开、填写、点击、拖拽与项目连接',steps:plans.map(([name,args,label],i)=>({id:'s'+(i+1),name,args,label,effect:'local',status:'pending'})),cursor:0,status:'ready',createdAt:Date.now()};state.assistantSessions.push(s);AS.current=s.id;asPersist();await asExecute(s);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-vr]');if(!b)return;const a=b.dataset.vr;
 const report=e=>{VR.error=e.message;vrRender()};
 if(a==='open'||a==='local')void vrOpen(a==='local');
 else if(a==='recover'){VR.session=null;clearInterval(VR.poll);sessionStorage.removeItem(VR_KEY);renderAll();vrRender()}
 else if(a==='pause')void vrControl(a).catch(report);
 else if(a==='takeover'){if(VR.target)void vrControl(a).catch(report);else void vrReturn()}
 else if(a==='return')void vrReturn();
 else if(a==='continue'){if(!VR.target)void vrApi('command',{name:'continue'}).catch(report);else{const s=asSession();if(s)void asExecute(s,true).catch(report)}}
 else if(a==='steer'){void vrControl('takeover').catch(report);const form=$('#visual-control form');form.hidden=false;form.querySelector('[data-vr-request-label]').textContent=VR.status?.localOnly?'修改尚未执行的说明笔记（本地演练，不调用模型）':'更改任务要求（由操作模型重新分析并继续）';form.querySelector('button[type=submit]').textContent=VR.status?.localOnly?'保存待写笔记':'更新要求并继续';form.querySelector('textarea').focus()}
 else if(a==='cancel-edit')$('#visual-control form').hidden=true;
 else if(a==='preview'){VR.preview=!VR.preview;vrRender()}
 else if(a==='details'){VR.details=!VR.details;vrRender()}
 else if(a==='demo'){if(VR.target)void vrDemo();else void vrApi('command',{name:'demo'}).catch(report)}
});
document.addEventListener('change',e=>{if(e.target.hasAttribute('data-vr-voice')){VR.voice=e.target.checked;if(!VR.voice&&window.speechSynthesis)speechSynthesis.cancel()}});
document.addEventListener('keydown',e=>{if(VR.session&&!VR.target&&!e.target.closest('#visual-control'))e.stopImmediatePropagation()},true);
// Manual input between gestures immediately takes priority; dedicated pause/takeover works during any gesture.
for(const type of ['pointerdown','keydown'])document.addEventListener(type,e=>{if(!VR.target||VR.native||!AS.ac||e.target.closest('#visual-control,#guide,#vr-action-card'))return;void vrControl('takeover').catch(()=>{})},true);
async function vrBoot(){
 const match=location.hash.match(/^#relay-visual=([\w-]+)\.([\w-]+)$/);let saved;try{saved=JSON.parse(sessionStorage.getItem(VR_KEY)||'null')}catch(e){}
 if(match){saved={id:match[1],token:match[2],target:true};sessionStorage.setItem(VR_KEY,JSON.stringify(saved));history.replaceState(null,'',location.pathname+location.search)}
 if(!saved)return;VR.session={id:saved.id,token:saved.token};VR.target=!!saved.target;
 try{
  const d=await vrApi('pull');VR.status=d;
  if(VR.target){VR.command=d.command?.id||null;state=StudioModel.prepare(WorkspaceModel.prepare(d.state));AS.draft=state.assistantVisualDraft||'';delete state.assistantVisualDraft;undoS=d.history.undo;redoS=d.history.redo;if(editHistoryReady)historyAcceptFrame();AS.current=state.assistantSessions?.at(-1)?.id;for(const s of state.assistantSessions||[])if(['running','planning'].includes(s.status))s.status='paused';await vrGetFiles(d.files);localStorage.setItem(KEY,JSON.stringify(state));renderAll();
   d.files.forEach(id=>VR.sent.add(id));if(d.localOnly){const baseFetch=window.fetch.bind(window);window.fetch=(input,options={})=>{const url=String(input),body=typeof options.body==='string'?options.body:'';if(/\/api\/studio\/(assistant|refine)$/.test(url)||/\/api\/studio\/models$/.test(url)&&/"action":"(run|check)"/.test(body)||/\/api\/studio\/collaboration$/.test(url)&&/"action":"(start|resume)"/.test(body))return Promise.reject(new Error('本地浏览器演练不会调用收费模型'));return baseFetch(input,options)}}
  }vrStartPolling();renderGuide();
 }catch(e){VR.error=e.message;vrRender()}
}
void vrBoot();
/* BROWSER_CONTROL_END */
