/* TUTORIAL_EDITING_START */
/* TUTORIAL_EDITING_CORE_START */
const TutorialEditingCore={
 migrate(t,total){if(!t)return;if(!t.syllabusVersion){if(t.status==='complete')t.step=total-1;t.syllabusVersion=2}t.editing=t.editing||{};t.flags=t.flags||{}},
 local(s,t){return!!t&&t.status==='active'&&s.activeBoard===t.boardId&&s.boards.some(b=>b.id===t.boardId&&b.tutorialSessionId===t.id)},
 recover(t,name,beforeExists,afterMatches){if(t.step!==15)return;const stage=t.editing.recovery||0;if(name==='undo'&&!beforeExists&&afterMatches&&(stage===0||stage===2))t.editing.recovery=stage+1;else if(name==='redo'&&beforeExists&&!afterMatches&&stage===1)t.editing.recovery=2},
 groupRecover(t,name,beforeExists,afterExists,childrenPresent){if(t.step!==17||!childrenPresent)return;if(name==='cluster.delete'&&beforeExists&&!afterExists)t.editing.groupRecovery=1;else if(name==='undo'&&!beforeExists&&afterExists&&t.editing.groupRecovery===1)t.editing.groupRecovery=2},
 plan(t,s,v){
  const op=(text,selector,done=false)=>({text,selector,done}),p=t.ids.production,group=t.editing.groupId,scope='[data-activity-scope="project:'+p+'"]';
  if(s.room)return[op('点击对话页左上「画板」返回','#room [data-act="room.leave"]')];
  switch(t.step){
   case 13:return[op('点击底部「近况」，打开当前画板回报','#tools [data-activity-board]',!!t.flags.boardReportViewed),op('展开回报里的「项目进度」','#activity-report [data-tutorial-progress]',!!t.flags.boardProgressViewed),op('关闭画板回报，查看项目选区','#activity-report [data-activity-close]',!!t.flags.boardProgressViewed&&!v.boardReportOpen||!!t.flags.projectReportViewed),op('单击「选题与制作」标题，查看项目回报','.ring[data-pid="'+p+'"] .rt',!!t.flags.projectReportViewed),op('展开项目回报里的「近期操作」','#pan '+scope+' .activity-recent > summary',!!t.flags.projectRecentViewed)];
   case 14:return[op('点击底部「项目」，新建可删除的临时练习','#tools [data-act="project.create"]',!!t.ids.scratch),op('单击「可恢复的练习项目」标题','.ring[data-pid="'+t.ids.scratch+'"] .rt',v.scratchPanel||!!t.flags.scratchDeleted),op('点击详情顶部「删除项目」','#pan .activity-edit-actions [data-act="project.delete"]',!!t.flags.scratchDeleted&&!v.scratchExists)];
   case 15:return[op('点击「撤销」，恢复刚删除的练习项目','#tools [data-act="undo"]',(t.editing.recovery||0)>=1),op('点击「重做」，再次删除该练习项目','#tools [data-act="redo"]',(t.editing.recovery||0)>=2),op('再次点击「撤销」，让项目保留在画板上','#tools [data-act="undo"]',t.editing.recovery===3&&v.scratchMatches)];
   case 16:{const g=v.groupExists;return[op('点击底部「项目组」','#tools [data-dm-create-cluster]',v.groupForm||g),op('勾选制作项目','#pan [data-dm-cluster-check][value="'+t.ids.production+'"]',g||v.checked.includes(t.ids.production)),op('勾选审核项目','#pan [data-dm-cluster-check][value="'+t.ids.review+'"]',g||v.checked.includes(t.ids.review)),op('点击「建立项目组」','#pan [data-dm-create-cluster-submit]',g),op('单击项目组标题，打开组内回报','[data-dm-cluster-drag="'+group+'"]',g&&v.groupPanel),op('展开组内的「项目进度」','#pan [data-tutorial-progress]',!!t.flags.groupProgressViewed)];}
   case 17:return[...((t.editing.groupRecovery||0)===0&&!v.groupPanel&&!v.groupTitleVisible?[op('点击底部「全图」，显示项目组','#tools [data-act="view.fit"]')]:[]),op('单击项目组标题，打开组设置','[data-dm-cluster-drag="'+group+'"]',v.groupPanel||(t.editing.groupRecovery||0)>=1),op('点击「解散项目组，保留子项目」','#pan [data-act="cluster.delete"]',(t.editing.groupRecovery||0)>=1),op('点击「撤销」，恢复同一个项目组','#tools [data-act="undo"]',t.editing.groupRecovery===2&&v.groupExists)];
   default:return[];
  }
 }
};
/* TUTORIAL_EDITING_CORE_END */
TutorialEditingCore.migrate(tutorialSession(),TutorialCore.steps.length);
function tutorialEditingLocal(){const t=tutorialSession();return TutorialEditingCore.local(state,t)?t:null}
function tutorialEditingBatch(fn){HA.depth++;try{return fn()}finally{HA.depth--;if(!HA.depth)historyCommit()}}
function tutorialEditingChildren(t){return['production','review','report'].every(k=>!!TutorialCore.project(state,t,k))}
for(const name of ['project.create','project.delete','cluster.create','cluster.delete','undo','redo']){
 const action=ACT[name];ACT[name]=a=>{const execute=()=>{
  let t=tutorialEditingLocal();const sessionId=t?.id,scratchBefore=!!(t&&TutorialCore.project(state,t,'scratch')),groupBefore=!!(t&&TutorialCore.editingGroup(state,t)),beforeProjects=new Set(state.projects.map(p=>p.id)),beforeGroups=new Set(state.clusters.map(c=>c.id));
  const result=action(a);t=tutorialEditingLocal();if(!t||t.id!==sessionId)return result;
  if(name==='project.create'&&t.step===14&&!t.ids.scratch){const p=state.projects.find(p=>!beforeProjects.has(p.id)&&p.boardId===t.boardId);if(p){p.tutorialSessionId=t.id;p.name='可恢复的练习项目';p.summary='用于练习删除、撤销、重做和恢复；不执行模型任务。';p.space.x=630;p.space.y=660;t.ids.scratch=p.id;t.editing.scratchFingerprint=TutorialCore.scratchFingerprint(p);t.editing.recovery=0;save();renderAll();fit(['production','review','report','scratch'].map(k=>TutorialCore.project(state,t,k)).filter(Boolean))}}
  if(name==='project.delete'&&t.step===14&&a.projectId===t.ids.scratch&&scratchBefore&&!TutorialCore.project(state,t,'scratch')){t.flags.scratchDeleted=true;t.editing.recovery=0;save()}
  if(name==='cluster.create'&&t.step===16){const c=state.clusters.find(c=>!beforeGroups.has(c.id)&&c.boardId===t.boardId&&c.projectIds.includes(t.ids.production)&&c.projectIds.includes(t.ids.review)&&c.projectIds.every(id=>state.projects.some(p=>p.id===id&&p.tutorialSessionId===t.id&&p.boardId===t.boardId)));if(c){c.tutorialSessionId=t.id;c.name='自媒体流程组';t.editing.groupId=c.id;t.editing.groupRecovery=0;save();renderPan();renderBoard();ACT['view.fit']({})}}
  TutorialEditingCore.recover(t,name,scratchBefore,TutorialCore.scratchMatches(state,t));
  TutorialEditingCore.groupRecover(t,name,groupBefore,!!TutorialCore.editingGroup(state,t),tutorialEditingChildren(t));
  save();tutorialQueue();return result;
 };return name==='undo'||name==='redo'?execute():tutorialEditingBatch(execute)};
}
function tutorialEditingObserve(){
 const t=tutorialEditingLocal();if(!t)return;let changed=false;const flag=key=>{if(!t.flags[key]){t.flags[key]=true;changed=true}};
 // Flags follow visible reports and expanded real controls, not the coach's sample button.
 for(const summary of document.querySelectorAll('.activity-inline details>summary,#activity-report details>summary'))if(summary.textContent.trim()==='项目进度')summary.dataset.tutorialProgress='1';
 const report=$('#activity-report'),boardOpen=report&&!report.hidden&&HA.report?.kind==='board'&&HA.report.id===t.boardId;
 if(t.step===13){if(boardOpen){flag('boardReportViewed');if(report.querySelector('[data-tutorial-progress]')?.parentElement.open)flag('boardProgressViewed')}if(panK==='proj'&&panId===t.ids.production&&$('#pan [data-activity-scope="project:'+t.ids.production+'"]')){flag('projectReportViewed');if($('#pan .activity-recent')?.open)flag('projectRecentViewed')}}
 if(t.step===16&&panK==='cluster'&&panId===t.editing.groupId&&TutorialCore.editingGroup(state,t)&&$('#pan [data-tutorial-progress]')?.parentElement.open)flag('groupProgressViewed');
 if(t.step===18&&state.room===t.ids.report&&$('#rm')?.textContent.includes('预设演示数据'))flag('finalReportViewed');
 if(changed){save();tutorialQueue()}
}
const editingSyncBase=tutorialSync;tutorialSync=function(){tutorialEditingObserve();editingSyncBase();tutorialEditingObserve()};
const editingPointerBase=tutorialPointerPlan;tutorialPointerPlan=function(){const t=tutorialSession();if(!t||t.step<13||t.step>17)return editingPointerBase();if(t.boardId!==state.activeBoard)return editingPointerBase();
 const list=TutorialEditingCore.plan(t,state,{boardReportOpen:!!$('#activity-report')&&!$('#activity-report').hidden,scratchExists:!!TutorialCore.project(state,t,'scratch'),scratchMatches:TutorialCore.scratchMatches(state,t),scratchPanel:panK==='proj'&&panId===t.ids.scratch,groupExists:!!TutorialCore.editingGroup(state,t),groupPanel:panK==='cluster'&&panId===t.editing.groupId,groupTitleVisible:!!tutorialPointerTarget('[data-dm-cluster-drag="'+t.editing.groupId+'"]'),groupForm:panK==='cluster-create',checked:[...document.querySelectorAll('[data-dm-cluster-check]:checked')].map(x=>x.value)});
 if(t.step>=14&&$('#activity-report')&&!$('#activity-report').hidden)list.unshift({text:'关闭近况回报，继续当前练习',selector:'#activity-report [data-activity-close]',done:false});
 if(TutorialCore.done(state,t)&&list.every(x=>x.done))list.push({text:'点击「下一步」继续',selector:'#tutorial-coach [data-tut="next"]',done:false});return list;
};
const editingActionBase=tutorialAction;tutorialAction=async function(){const t=tutorialSession();if(!t||t.step<13)return editingActionBase();tutorialAssert();if(state.room)tutorialCommand('room.leave',{});
 switch(t.step){
  case 13:tutorialCommand('activity.open',{kind:'board',id:t.boardId});break;
  case 14:if(!t.ids.scratch)tutorialCommand('project.create',{});else if(TutorialCore.project(state,t,'scratch'))tutorialCommand('project.open',{projectId:t.ids.scratch});break;
  case 15:closePan();hint('按编号点击底部撤销、重做，再撤销；练习项目会实际恢复。');break;
  case 16:openPan('cluster-create');break;
  case 17:if(TutorialCore.editingGroup(state,t))tutorialCommand('cluster.open',{clusterId:t.editing.groupId});break;
  case 18:tutorialOpenProject('report',true);break;
 }save();renderAll();tutorialSync();
};
const editingBeginBase=tutorialBegin;tutorialBegin=function(){if(typeof featureActive==='function'&&featureActive()){state.featureTour.status='paused';featurePaint()}editingBeginBase();TutorialEditingCore.migrate(tutorialSession(),TutorialCore.steps.length)};
function tutorialEditingReveal(){const t=tutorialEditingLocal(),selector=t?.step===17&&panK==='cluster'&&panId===t.editing.groupId?'#pan [data-act="cluster.delete"]':[4,18].includes(t?.step)&&panK==='proj'?'#pan [data-act="room.enter"]':null;if(selector)requestAnimationFrame(()=>{$(selector)?.scrollIntoView({block:'center',behavior:'instant'});tutorialQueue()})}
const editingNextBase=tutorialNext;tutorialNext=function(){editingNextBase();tutorialEditingReveal()};
const editingOpenPanBase=openPan;openPan=function(k,id){editingOpenPanBase(k,id);tutorialEditingReveal()};
document.addEventListener('toggle',e=>{if(e.target.closest?.('.activity-inline,#activity-report'))tutorialQueue()},true);
/* TUTORIAL_EDITING_END */
