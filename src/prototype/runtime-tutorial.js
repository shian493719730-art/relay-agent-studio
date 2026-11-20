/* RUNTIME_TUTORIAL_START */
/* RUNTIME_TUTORIAL_CORE_START */
const RuntimeTutorialCore={
 source:'src/page.json',requirement:'requirements.json',
 steps:[
 ['创建真实交付练习','独立 Git/npm 工程，附带本地依赖；不修改你的项目，不运行模型。'],
 ['读取项目说明','打开 README.md，了解本地依赖、页面、需求、测试和实际交付。'],
 ['建立本轮回滚点','修改和安装之前建立回滚点，保留原始源码及依赖环境。'],
 ['安装实际依赖','用正式安装按钮运行 npm。依赖来自练习工程，不下载第三方包。'],
 ['实现第一版要求','在项目需求表填写标题并应用，实际修改需求和页面源码；也可以亲手编辑两个 JSON 文件。'],
 ['运行第一版测试','选择 test 并运行。真正的测试会导入刚安装的依赖，核对当前需求。'],
 ['查看并操作真实预览','选择 preview，启动应用预览，在页面内点击“确认当前版本”。HTTP 成功本身不能过关。'],
 ['暂停运行中的应用','点击正式“暂停本步”，等待进程退出。日志和已完成源码保留。'],
 ['中途修改要求','换一个不同标题并应用。这里按明确字段修改本课文件，不进行 AI 推理；之前成果与记录保留。'],
 ['验证修改后的版本','重新运行 test，只认新版源码对应的真实测试结果，不沿用旧版通过记录。'],
 ['重新预览并确认新版','重新启动 preview，在实际页面中确认新标题；旧进程的页面不能验证新源码。'],
 ['打包当前成果','先暂停预览，再选择 package 并打包。实际生成网页和交付清单，归档为 ZIP。'],
 ['核对 ZIP 正文','从实际 ZIP 读取交付清单并核对新版标题。下载可在系统保存窗口完成；取消保存不伪称已下载。'],
 ['回滚并重读原文','恢复本轮源码和环境，再打开页面和需求文件。核对原文、锁文件和依赖环境确已恢复。']
 ],
 jobs(t){return t.jobs||[]},
 test(t,hash){return this.jobs(t).some(j=>j.kind==='run'&&j.script==='test'&&j.status==='passed'&&j.exitCode===0&&j.sourceHash===hash)},
 ack(t,hash){return this.jobs(t).find(j=>j.kind==='serve'&&j.sourceHash===hash&&t.acks?.[j.id]?.sourceHash===hash)},
 done(t){if(!t)return false;const s=t.sourceState,j=this.jobs(t);switch(t.step){
 case 0:return!!t.workspaceId;
 case 1:return!!t.read?.['README.md'];
 case 2:return!!t.checkpointId;
 case 3:return j.some(x=>x.kind==='install'&&x.status==='passed'&&x.exitCode===0&&x.settled);
 case 4:return!!t.firstHash&&s?.sourceHash===t.firstHash&&s.title===s.requiredTitle&&s.pageHash!==t.baselineHash;
 case 5:return!!t.firstHash&&this.test(t,t.firstHash);
 case 6:return!!t.firstHash&&!!this.ack(t,t.firstHash);
 case 7:{const p=this.ack(t,t.firstHash);return!!(p&&p.settled&&p.status==='stopped');}
 case 8:return!!t.secondHash&&t.secondHash!==t.firstHash&&s?.sourceHash===t.secondHash&&s.title===s.requiredTitle&&s.title!==t.firstTitle;
 case 9:return!!t.secondHash&&this.test(t,t.secondHash);
 case 10:return!!t.secondHash&&!!this.ack(t,t.secondHash);
 case 11:return!!t.secondHash&&j.some(x=>x.kind==='package'&&x.status==='passed'&&x.exitCode===0&&x.sourceHash===t.secondHash&&x.artifacts?.length);
 case 12:return!!t.delivery&&t.delivery.sourceHash===t.secondHash&&t.delivery.title===t.secondTitle;
 case 13:return!!(t.restored&&s?.pageHash===t.baselineHash&&s.requirementHash===t.baselineRequirementHash&&s.lockHash==='missing'&&t.environmentId===null&&t.read?.[this.source]?.hash===t.baselineHash&&t.read?.[this.requirement]?.hash===t.baselineRequirementHash);
 default:return false;}},
 track(t,r){if(!r?.id||!r.kind||!r.workspaceId||r.workspaceId!==t.workspaceId)return;const v={id:r.id,kind:r.kind,script:r.script,status:r.status,sourceHash:r.sourceHash,exitCode:r.exitCode,settled:r.settled,url:r.url,artifacts:r.artifacts};t.jobs=t.jobs||[];const i=t.jobs.findIndex(x=>x.id===v.id);if(i<0)t.jobs.push(v);else t.jobs[i]=v;},
 currentVersion(t,s){t.sourceState=s;if(!s)return;if([4,8].includes(t.step)&&s.title===s.requiredTitle&&s.pageHash!==t.baselineHash){if(t.step===4){t.firstHash=s.sourceHash;t.firstTitle=s.title;}else if(s.title!==t.firstTitle){t.secondHash=s.sourceHash;t.secondTitle=s.title;}}},
 fromPreview(t,event,task,frame,expectedOrigin){return!!task&&task.workspaceId===t.workspaceId&&task.status==='ready'&&event.source===frame?.contentWindow&&(event.origin===expectedOrigin||event.origin==='null'&&expectedOrigin.startsWith('relay-preview://'))&&event.data?.taskId===task.id;},
 accepts(t,event,task,frame,expectedOrigin){return this.fromPreview(t,event,task,frame,expectedOrigin)&&event.data?.type==='relay-runtime-lesson'&&event.data.title===t.sourceState?.title&&task.sourceHash===t.sourceState?.sourceHash;}
};
/* RUNTIME_TUTORIAL_CORE_END */
const RTT={previewRects:{},key:'',busy:false,creating:false,scheduled:0,error:'',pausing:false};
const rttCoach=document.createElement('section');rttCoach.id='runtime-coach';rttCoach.className='fl';rttCoach.hidden=true;rttCoach.setAttribute('aria-label','安装预览与交付教程');document.body.append(rttCoach);
const rttSession=()=>state.runtimeTutorial;
const rttActive=()=>rttSession()?.status==='active';
function rttQueue(){if(!RTT.scheduled)RTT.scheduled=requestAnimationFrame(()=>{RTT.scheduled=0;rttPaint()});}
const rttApiBase=dwApi;
async function rttSource(t){try{const s=await rttApiBase('runtimePracticeState',{workspaceId:t.workspaceId});RuntimeTutorialCore.currentVersion(t,s);return s;}catch(e){RuntimeTutorialCore.currentVersion(t,null);RTT.error='无法核对当前源码，请检查页面与需求 JSON：'+e.message;return null;}}
dwApi=async function(action,a={},signal){const r=await rttApiBase(action,a,signal),t=rttSession();if(!t?.workspaceId||a.workspaceId!==t.workspaceId)return r;const before=JSON.stringify(t);
 if(action==='read'&&r.start===0&&r.nextStart===null){t.read=t.read||{};t.read[r.path]={hash:r.hash};}
 if(action==='checkpoint'&&!t.checkpointId)t.checkpointId=r.id;
 if(action==='runtimeStatus'){r.tasks.forEach(j=>RuntimeTutorialCore.track(t,j));t.environmentId=r.environmentId;}
 if(['taskStatus','install','run','serve','package','resumeTask','pauseTask'].includes(action))RuntimeTutorialCore.track(t,r);
 if(['write','replace','revert','reapply'].includes(action)||action==='taskStatus'&&r.kind==='install'&&r.status==='passed'&&!t.syncedInstall?.[r.id]){await rttSource(t);if(r.kind==='install'){t.syncedInstall=t.syncedInstall||{};t.syncedInstall[r.id]=true;}}
 if(action==='restoreCheckpoint'&&a.checkpointId===t.checkpointId){t.restored=true;t.read={};await rttSource(t);const s=await rttApiBase('runtimeStatus',{workspaceId:t.workspaceId});t.environmentId=s.environmentId;s.tasks.forEach(j=>RuntimeTutorialCore.track(t,j));}
 if(before!==JSON.stringify(t)){save();rttQueue();}return r;
};
const rttFetchBase=window.fetch.bind(window);window.fetch=function(input,options={}){const u=typeof input==='string'?input:input?.url||String(input),b=typeof options.body==='string'?options.body:'';if((rttActive()||B()?.runtimePractice)&&(/\/api\/studio\/(assistant|guide|refine)(?:\?|$)/.test(u)||/\/api\/studio\/models(?:\?|$)/.test(u)&&/"action"\s*:\s*"(?:run|check)"/.test(b)||/\/api\/studio\/collaboration(?:\?|$)/.test(u)&&/"action"\s*:\s*"(?:start|resume)"/.test(b)))return Promise.reject(new Error('交付教程不运行模型；请暂停课程并返回自己的画板后再明确执行'));return rttFetchBase(input,options);};
async function rttBegin(fresh=false){
 if(RTT.creating||RTT.pausing)return;if(AS.ac||liveTurns.size||pendingTurns.size)return hint('请先处理当前执行，本地课程不会打断你的其他任务');
 if(aidActive())await aidLeave();if(dtActive())await dtPause();if(tutorialSession()?.status==='active')tutorialPause();if(featureActive())featurePause();
 tutorialHome.close();$('#guide').classList.remove('o');asCloseAux();const old=rttSession();
 if(!fresh&&old&&old.status!=='complete'&&(!old.boardId||state.boards.some(b=>b.id===old.boardId))){old.status='active';old.collapsed=false;if(old.boardId){state.activeBoard=old.boardId;state.room=null;state.sel=old.projectId;}DW.current=old.workspaceId;RTT.error='';save();renderAll();await dwOpen(old.projectId);if(old.workspaceId){DW.settings=false;DW.tab=old.step===1||old.step===13?'files':'runtime';await drRefresh();if(old.step===1||old.step===13)await dwFiles();dwRender();}rttExpose();return;}
 state.runtimeTutorial={id:'rtt'+uid(),status:'active',step:0,requestId:crypto.randomUUID(),read:{},jobs:[],acks:{},draft:'我的第一个发布页',original:{boardId:state.activeBoard,room:state.room,sel:state.sel,sourceOpen:!dwPanel.hidden,sourceId:DW.current,sourcePath:DW.file?.path,draft:AS.draft,report:HA.report?{...HA.report}:null}};
 RTT.error='';DW.file=null;DW.settings=true;save();renderAll();await dwOpen();rttExpose();
}
async function rttCreate(){const t=rttSession();if(!rttActive()||RTT.creating)return;RTT.creating=true;RTT.error='';try{
 if(!t.boardId||!state.boards.some(b=>b.id===t.boardId)){act('board.create',{name:'从依赖到交付 · 本地练习'});t.boardId=state.activeBoard;B().sourcePractice=true;B().runtimePractice=true;B().tutorialSessionId=t.id;}
 if(!P(t.projectId)){const before=new Set(state.projects.map(p=>p.id));ACT['project.create']({name:'我的交付练习'});const p=state.projects.find(p=>!before.has(p.id));t.projectId=p.id;p.summary='真实本地依赖、源码、测试、预览、修改要求、ZIP和回滚；不调用模型。';p.tutorialSessionId=t.id;}
 save();const w=await dwApi('runtimePractice',{boardId:t.boardId,projectId:t.projectId,requestId:t.requestId});Object.assign(t,{workspaceId:w.id,baselineHash:w.runtimeLesson.baselineHash,baselineRequirementHash:w.runtimeLesson.baselineRequirementHash});await rttSource(t);DW.current=w.id;DW.projectId=t.projectId;DW.settings=false;DW.file=null;DW.tab='runtime';DR.scripts[w.id]='test';DR.paths[w.id]='/';drStore();await dwRefresh();await drRefresh();await dwFiles();closePan();dwPanel.hidden=false;save();renderAll();dwRender();
 }catch(e){RTT.error=e.message;}finally{RTT.creating=false;rttExpose();}}
async function rttApply(){const t=rttSession(),w=dwWorkspace();if(!t||!w||w.id!==t.workspaceId||RTT.busy)return;drClean(w);const title=String(t.draft||'').trim();if(!title||title.length>100)throw new Error('请填写1至100字的标题');if(!t.checkpointId)throw new Error('先建立本轮回滚点');if(t.step===8&&title===t.firstTitle)throw new Error('请换一个标题，实际修改本轮要求');RTT.busy=true;RTT.error='';try{
 for(const name of [RuntimeTutorialCore.requirement,RuntimeTutorialCore.source]){if(t.status!=='active')throw new Error('修改要求已暂停，已完成的差异保留');const read=await dwApi('read',{workspaceId:w.id,path:name,length:20000});if(t.status!=='active')throw new Error('修改要求已暂停，已完成的差异保留');const body=JSON.parse(read.text);body.title=title;await dwApi('write',{workspaceId:w.id,path:name,content:JSON.stringify(body,null,2)+'\n',expectedHash:read.hash,checkpointId:t.checkpointId,requestId:crypto.randomUUID()});}if(t.status!=='active')return;await rttSource(t);await dwChanges();if(t.status!=='active')return;DW.tab='runtime';await drRefresh();dwRender();save();
 }finally{RTT.busy=false;rttExpose();}}
async function rttPause(finish=false){const t=rttSession();if(!t||RTT.pausing||RTT.creating)return;RTT.pausing=true;t.status='pausing';try{
 if(t.workspaceId){const s=await rttApiBase('runtimeStatus',{workspaceId:t.workspaceId});for(const task of s.tasks.filter(j=>!j.settled||j.status==='ready')){let r=await dwApi('pauseTask',{workspaceId:t.workspaceId,taskId:task.id});while(!r.settled){await new Promise(ok=>setTimeout(ok,80));r=await dwApi('taskStatus',{workspaceId:t.workspaceId,taskId:task.id});}}}
 t.status=finish?'complete':'paused';t.collapsed=false;dwClose();const o=t.original;if(state.boards.some(b=>b.id===o.boardId)){state.activeBoard=o.boardId;state.room=P(o.room)?o.room:null;state.sel=P(o.sel)?o.sel:null;}AS.draft=o.draft||'';DW.current=o.sourceId;DW.file=null;if(o.report)activityOpen(o.report,!!o.report.floating);else{activityPanel.hidden=true;HA.report=null;}save();renderAll();if(o.sourceOpen){await dwOpen(state.room||state.sel);const w=DW.list.find(w=>w.id===o.sourceId);if(w&&o.sourcePath)await dwRead(w,o.sourcePath);}if(finish)tutorialOpenHome();
 }finally{RTT.pausing=false;rttPaint();}}
function rttPlan(){const t=rttSession();if(!t)return[];const op=(text,selector,done=false)=>({text,selector,done}),same=dwWorkspace()?.id===t.workspaceId,tab=k=>same&&!DW.settings&&DW.tab===k,done=RuntimeTutorialCore.done(t),w=t.workspaceId;
 if(t.boardId&&state.activeBoard!==t.boardId)return[op('点击「返回交付练习」','#runtime-coach [data-rtt-resume]')];
 if(dwPanel.hidden)return[op('点击左上「画板」','#tl [data-a="boards"]',panK==='boards'&&$('#pan').classList.contains('o')),op('点击「源码开发」','#pan [data-dw-open]')];
 if(w&&!same)return[op('在工作区选择「我的交付练习」','#development [data-dw-workspace]')];
 if(w&&DW.settings)return[op('点击「连接设置」，返回已连接工程','#development [data-dw-settings]')];
 const runtime=op('点击「开发与预览」','#development [data-dw-tab="runtime"]',tab('runtime')),script=n=>op('在脚本菜单选择 '+n,'#development [data-dr-script]',tab('runtime')&&dwPanel.querySelector('[data-dr-script]')?.value===n),jobs=RuntimeTutorialCore.jobs(t),live=jobs.find(j=>j.status==='ready'||!j.settled),task=DR.status?.tasks.find(j=>j.id===DR.task)||DR.status?.tasks[0];let ops=[];
 switch(t.step){
 case 0:ops=[op('点击「创建交付练习工程」','#development [data-rtt-create]',!!w)];break;
 case 1:ops=[op('点击「文件」','#development [data-dw-tab="files"]',tab('files')),op('点击 README.md，读取真实说明','#development [data-dw-file="README.md"]',done)];break;
 case 2:ops=[runtime,op('点击「新建本轮回滚点」','#development [data-dr-checkpoint]',done)];break;
 case 3:ops=[runtime,op('点击「安装项目依赖」，观察 npm 实际日志','#development [data-dr-install]',done)];break;
 case 4:case 8:ops=[op('在本课需求表填写'+(t.step===8?'不同的新版':'第一版')+'标题','#development [data-rtt-title]',!!t.draft?.trim()&&(t.step!==8||t.draft!==t.firstTitle)),op('点击「保存要求并应用到本课源码」','#development [data-rtt-apply]',done)];break;
 case 5:case 9:ops=[runtime,script('test'),op('点击「运行脚本」，等待新版测试退出码0','#development [data-dr-run]',done)];break;
 case 6:case 10:ops=[runtime,script('preview'),op('点击「启动应用预览」','#development [data-dr-serve]',!!task&&task.kind==='serve'&&task.status==='ready'&&task.sourceHash===(t.step===6?t.firstHash:t.secondHash)),op('在实际页面点击「确认当前版本」','#development .dr-preview',done)];break;
 case 7:ops=[runtime,op('点击「暂停本步」，等待进程结束','#development [data-dr-pause]',done)];break;
 case 11:ops=[runtime,...(live?[op('点击「暂停本步」，先结束正在运行的预览','#development [data-dr-pause]',false)]:[]),script('package'),op('点击「打包并保存产物」，观察真实构建日志','#development [data-dr-package]',done)];break;
 case 12:ops=[runtime,op('点击「核对ZIP交付清单」，读取归档正文','#development [data-rtt-artifact]',done)];break;
 case 13:ops=[runtime,op('点击「恢复本轮源码与环境」','#development [data-dr-restore]',!!t.restored),op('点击「文件」','#development [data-dw-tab="files"]',!!t.restored&&tab('files')),op('重新打开 src/page.json，核对原始标题','#development [data-dw-file="src/page.json"]',t.read?.[RuntimeTutorialCore.source]?.hash===t.baselineHash),op('重新打开 requirements.json，核对原始要求','#development [data-dw-file="requirements.json"]',t.read?.[RuntimeTutorialCore.requirement]?.hash===t.baselineRequirementHash)];break;
 }
 if(done){ops.forEach(o=>o.done=true);ops.push(op(t.step===13?'点击「完成课程」，回到原工作区':'点击「下一步」','#runtime-coach [data-rtt-next]'));}return ops;
}
function rttDecorate(){const t=rttSession();if(!rttActive()||dwPanel.hidden)return;const body=dwPanel.querySelector('.dw-body');if(!body)return;if(!t.workspaceId){body.innerHTML='<p class="lab">从依赖到交付 · 本地实际 Git/npm 工程。桌面自带 Node/npm，另需本机 Git；本课本地依赖随软件提供，不下载第三方包、不运行模型。</p><button data-rtt-create>创建交付练习工程</button>';return;}
 if(dwWorkspace()?.id!==t.workspaceId)return;const location=dwPanel.querySelector('.dw-location');if(location)location.textContent=dwWorkspace().root+' · 本课正式开发脚本已预置 · 不运行模型';
 const signature=String(t.step);let controls=body.querySelector('.rtt-controls');if(controls?.dataset.stage!==signature){controls?.remove();controls=document.createElement('section');controls.className='rtt-controls';controls.dataset.stage=signature;
 if([4,8].includes(t.step))controls.innerHTML=`<h4>本课需求 · 实际文件</h4><p class="lab">本地字段练习：只把明确标题写入 requirements.json 和 src/page.json，不进行 AI 理解。其他源码可在「文件」手动编辑。</p><label>页面标题<input data-rtt-title aria-label="本课页面标题" maxlength="100" value="${esc(t.draft||'')}"></label><button data-rtt-apply>保存要求并应用到本课源码</button>`;
 if(t.step===12)controls.innerHTML='<p class="lab">核对会读取真实 ZIP 中的交付清单；下载链接仍在本步产物中。保存成功以系统结果为准。</p><button data-rtt-artifact>核对ZIP交付清单</button>';
 body.prepend(controls);}
 if(t.delivery&&t.step===12&&!controls.querySelector('[data-rtt-delivery]'))controls.insertAdjacentHTML('beforeend',`<p class="dt-ok" data-rtt-delivery>✓ ZIP 正文标题：${esc(t.delivery.title)}<br>SHA-256 ${esc(t.delivery.sha256)}</p>`);
}
function rttExpose(){rttPaint();const current=rttPlan().find(o=>!o.done),el=current?.selector?document.querySelector(current.selector):null;if(el?.closest('#development'))el.scrollIntoView({block:'nearest',inline:'nearest'});rttDraw();}
function rttPaint(){const t=rttSession(),active=rttActive();document.body.classList.toggle('runtime-tutorial-running',active);rttCoach.hidden=!active;if(!active){if(dmArrow.dataset.rttPointer){dmArrow.style.display='none';tutorialSpot.hidden=true;delete dmArrow.dataset.rttPointer;}return;}activityPanel.hidden=true;rttDecorate();rttCoach.classList.toggle('rtt-avoid-menu',dwPanel.hidden&&panK==='boards'&&$('#pan').classList.contains('o'));const plan=rttPlan(),done=RuntimeTutorialCore.done(t),away=t.boardId&&state.activeBoard!==t.boardId,key=JSON.stringify([t.step,plan,done,t.collapsed,away,RTT.error,RTT.busy,RTT.creating,RTT.pausing]);
 if(RTT.key!==key){RTT.key=key;rttCoach.innerHTML=`<h3><span>${t.step+1}/14 · 从依赖到交付</span><button data-rtt-collapse aria-label="收拢交付教程">${t.collapsed?'+':'–'}</button></h3><div class="rtt-body" ${t.collapsed?'hidden':''}><p class="lab">真实本地工具 · 不运行模型</p><h4>${esc(RuntimeTutorialCore.steps[t.step][0])}</h4><p>${esc(RuntimeTutorialCore.steps[t.step][1])}</p>${away?'<button data-rtt-resume>返回交付练习</button>':'<ol class="tutorial-operations" aria-label="本课操作顺序">'+plan.map((o,i)=>`<li ${o.done?'class="is-done"':''}><span>${i+1}</span><p>${esc(o.text)}</p>${o.done?'<b>✓</b>':''}</li>`).join('')+'</ol>'}${RTT.error?`<p class="dw-error" role="alert">${esc(RTT.error)}</p>`:''}${done?'<p class="dt-ok" role="status">✓ 已核对实际结果</p>':''}<div class="row"><button data-rtt-pause ${RTT.creating||RTT.pausing?'disabled':''}>暂停课程并返回</button><button data-rtt-next ${!done||RTT.busy||RTT.creating||RTT.pausing?'disabled':''}>${t.step===13?'完成课程':'下一步'}</button></div></div>`;}
 const inline=innerWidth<880&&!dwPanel.hidden&&!t.collapsed;rttCoach.classList.toggle('rtt-inline',inline);const host=inline?dwPanel.querySelector('.dw-body'):document.body;if(host&&rttCoach.parentElement!==host){if(inline)host.prepend(rttCoach);else host.append(rttCoach);}dmDecorate();rttDraw();}
function rttDraw(){if(!rttActive()||rttSession().collapsed||tutorialHome.open)return;dmArrow.style.display='none';tutorialSpot.hidden=true;const plan=rttPlan(),index=plan.findIndex(o=>!o.done),current=plan[index],target=current&&tutorialPointerTarget(current.selector);if(!target)return;let r=dtVisibleRect(target);if(!r)return;if(target.matches('.dr-preview')){const taskId=dwPanel.querySelector('[data-dr-current]')?.dataset.drCurrent,child=RTT.previewRects[taskId],f=target.getBoundingClientRect();if(!child)return;const b={left:f.left+target.clientLeft+child.left,top:f.top+target.clientTop+child.top,right:f.left+target.clientLeft+child.left+child.width,bottom:f.top+target.clientTop+child.top+child.height};r={left:Math.max(r.left,b.left),top:Math.max(r.top,b.top),right:Math.min(r.right,b.right),bottom:Math.min(r.bottom,b.bottom)};if(r.right-r.left<8||r.bottom-r.top<8)return;r.width=r.right-r.left;r.height=r.bottom-r.top;}const p=TutorialPointerCore.anchor(r,innerWidth,innerHeight);if(!p)return;Object.assign(tutorialSpot.style,{left:r.left-4+'px',top:r.top-4+'px',width:r.width+8+'px',height:r.height+8+'px'});tutorialSpot.hidden=false;dmArrow.dataset.rttPointer='true';dmArrow.dataset.guideTarget=current.selector;dmArrow.dataset.guideOperation=String(index+1);dmArrow.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);dmArrow.innerHTML=`<title>交付操作 ${index+1}：${esc(current.text)}</title><defs><marker id="rtt-head" viewBox="0 0 10 10" markerWidth="7" markerHeight="7" refX="9" refY="5" orient="auto"><path d="M1 1 L9 5 L1 9" fill="#F7C948" stroke="#1B2230"/></marker></defs><path d="M${p.sx} ${p.sy} L${p.tx} ${p.ty}" stroke="#1B2230" stroke-width="3" marker-end="url(#rtt-head)"/><circle cx="${p.sx}" cy="${p.sy}" r="15" fill="#F7C948" stroke="#1B2230"/><text x="${p.sx}" y="${p.sy}" dy=".35em" text-anchor="middle" font-family="system-ui" font-size="12" fill="#1B2230">${index+1}</text>`;dmArrow.style.display='block';}
const rttRenderBase=renderAll;renderAll=function(){rttRenderBase();rttQueue();};
const rttDwRenderBase=dwRender;dwRender=function(){if(rttCoach.parentElement!==document.body)document.body.append(rttCoach);rttDwRenderBase();rttDecorate();rttQueue();};
const rttPointerBase=tutorialPointerDraw;tutorialPointerDraw=function(){rttPointerBase();if(rttActive())rttDraw();};
const rttWindowsBase=dmWindows;dmWindows=()=>[...rttWindowsBase(),...(!rttCoach.classList.contains('rtt-inline')?[rttCoach]:[])];const rttWindowKeyBase=dmWindowKey;dmWindowKey=el=>el===rttCoach?'runtime-coach':rttWindowKeyBase(el);
const rttHomeBase=tutorialHomeMarkup;tutorialHomeMarkup=function(v){const t=rttSession();return rttHomeBase(v).replace('<div class="tm-acts">',`<section class="feature-entry"><h3>从依赖到交付</h3><p>14步：真实安装本地依赖、修改源码、测试、可点击的应用预览、暂停、更改要求、重新验证、ZIP和整轮回滚。独立工程，不调用模型。</p><button data-rtt-begin>${t&&t.status!=='complete'?'继续交付课程 '+(t.step+1)+'/14':'开始安装、预览与打包课程'}</button>${t?.status==='complete'?'<small>✓ 已完成本地真实交付与恢复</small><button data-rtt-fresh>重新练习</button>':''}</section><div class="tm-acts">`);};
window.addEventListener('message',e=>{const t=rttSession();if(!rttActive()||state.activeBoard!==t.boardId)return;const frame=dwPanel.querySelector('.dr-preview'),task=DR.status?.tasks.find(j=>j.id===dwPanel.querySelector('[data-dr-current]')?.dataset.drCurrent);if(!frame||!task?.url)return;const url=new URL(drPreviewUrl(task)),origin=url.protocol==='relay-preview:'?'relay-preview://'+url.hostname:url.origin;if(e.data?.type==='relay-runtime-lesson-layout'&&RuntimeTutorialCore.fromPreview(t,e,task,frame,origin)){const r=e.data.rect;if(r&&['left','top','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0){RTT.previewRects[task.id]=r;rttQueue();}return;}if(!RuntimeTutorialCore.accepts(t,e,task,frame,origin))return;t.acks=t.acks||{};t.acks[task.id]={sourceHash:task.sourceHash,title:e.data.title,time:Date.now()};save();rttQueue();});
document.addEventListener('input',e=>{if(e.target.matches('[data-rtt-title]')&&rttSession()){rttSession().draft=e.target.value;save();rttQueue();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-rtt-begin],[data-rtt-fresh],[data-rtt-create],[data-rtt-apply],[data-rtt-artifact],[data-rtt-next],[data-rtt-pause],[data-rtt-resume],[data-rtt-collapse]');if(!b)return;e.preventDefault();void(async()=>{
 RTT.error='';if(b.hasAttribute('data-rtt-begin')||b.hasAttribute('data-rtt-resume'))return rttBegin();if(b.hasAttribute('data-rtt-fresh'))return rttBegin(true);if(b.hasAttribute('data-rtt-create'))return rttCreate();if(b.hasAttribute('data-rtt-apply'))return rttApply();const t=rttSession();if(!t)return;
 if(b.hasAttribute('data-rtt-pause'))return rttPause();if(b.hasAttribute('data-rtt-collapse')){t.collapsed=!t.collapsed;save();rttPaint();return;}
 if(b.hasAttribute('data-rtt-artifact')){const j=RuntimeTutorialCore.jobs(t).filter(j=>j.kind==='package'&&j.status==='passed'&&j.sourceHash===t.secondHash).at(-1);if(!j?.artifacts?.[0])throw new Error('先对当前版本完成打包');t.delivery=await dwApi('runtimePracticeArtifact',{workspaceId:t.workspaceId,taskId:j.id,artifactId:j.artifacts[0].id});save();rttPaint();return;}
 if(b.hasAttribute('data-rtt-next')){if(!RuntimeTutorialCore.done(t))throw new Error('先完成并核对当前实际操作');if(t.step===13)return rttPause(true);t.step++;if(t.step===8)t.draft=t.firstTitle;save();rttDecorate();rttExpose();}
 })().catch(e=>{RTT.error=e.message;rttPaint();hint(e.message);});},true);
// A second course must first stop this course's own processes and restore its view.
const rttOldDtBegin=dtBegin;dtBegin=async function(...a){if(rttActive())await rttPause();return rttOldDtBegin(...a);};
const rttOldAidBegin=aidBegin;aidBegin=async function(...a){if(rttActive())await rttPause();return rttOldAidBegin(...a);};
const rttOldFeatureBegin=featureBegin;featureBegin=async function(...a){if(rttActive())await rttPause();return rttOldFeatureBegin(...a);};
const rttOldTutorialBegin=tutorialBegin;tutorialBegin=async function(...a){if(rttActive())await rttPause();return rttOldTutorialBegin(...a);};
const rttOldTutorialResume=tutorialResume;tutorialResume=async function(...a){if(rttActive())await rttPause();return rttOldTutorialResume(...a);};
const rttOldDrBegin=drBegin;drBegin=async function(...a){if(rttActive())await rttPause();return rttOldDrBegin(...a);};
document.addEventListener('scroll',rttQueue,true);document.addEventListener('change',rttQueue);setInterval(()=>{if(rttActive())rttQueue()},500);
/* RUNTIME_TUTORIAL_END */
