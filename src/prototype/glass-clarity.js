/* GLASS_CLARITY_START */
// Component design: real Claude Opus 5.5. Engineering adapter follows.
function clarityBoardsMarkup(boards,projects,activeId,editingId){
  const list=Array.isArray(boards)?boards:[],ps=Array.isArray(projects)?projects:[],cnt=Object.create(null);
  for(const p of ps){if(p&&p.boardId!=null){const k=String(p.boardId);cnt[k]=(cnt[k]||0)+1;}}
  const act=activeId==null?'':String(activeId),ed=editingId==null?'':String(editingId);
  const rows=list.map(b=>{
    const id=String(b.id),raw=(b.name==null||String(b.name).trim()==='')?'未命名画板':String(b.name),nm=esc(raw),n=cnt[id]||0,on=id===act,args=esc(JSON.stringify({boardId:b.id}));
    if(id===ed)return `<div class="cl-board-row is-editing"><form class="cl-board-edit" data-cl-rename-form="${esc(id)}"><input data-cl-name name="name" value="${nm}" maxlength="160" required autocomplete="off" aria-label="画板名称"><button type="submit">${icon('check',14)}保存</button><button type="button" data-cl-cancel>取消</button></form></div>`;
    return `<div class="cl-board-row${on?' is-active':''}"><button type="button" class="cl-board-open" data-act="board.switch" data-args="${args}" aria-pressed="${on}" aria-label="${esc((on?'当前画板 ':'切换到画板 ')+raw+'，'+n+' 个项目')}"><span class="cl-board-name">${nm}</span><span class="cl-board-meta">${n} 个项目${on?' · 当前':''}</span></button><span class="cl-board-actions"><button type="button" data-cl-edit="${esc(id)}" aria-label="${esc('重命名 '+raw)}" title="重命名">${icon('pen',15)}</button><button type="button" data-act="board.delete" data-args="${args}" aria-label="${esc('删除 '+raw+'（可撤销）')}" title="删除（可撤销）">${icon('trash',15)}</button></span></div>`;
  }).join('');
  return `<h3>画板<button class="x" data-close="pan" aria-label="关闭">${icon('close',16)}</button></h3><p class="cl-board-count">共 ${list.length} 个画板</p><div class="cl-board-list" role="group" aria-label="画板列表">${rows||'<p class="cl-board-empty">还没有画板，先新建一个。</p>'}</div><div class="cl-board-footer">${B_('board.create',{},'新建画板','plus')}<button type="button" data-tut="menu" aria-label="新手教程与操作速查">${icon('board',15)}教程与速查</button><button type="button" data-legal-notice>版权与开源许可</button></div>`;
}
// Engineering adapter: existing actions, drafts and direct-control window handles remain authoritative.
const CL={editing:null};
const clarityPanBase=renderPan;
renderPan=function(){
 const el=$('#pan');el.classList.toggle('cl-boards',panK==='boards');
 if(panK!=='boards'){clarityPanBase();return}
 if(CL.editing&&!state.boards.some(b=>b.id===CL.editing))CL.editing=null;
 if(document.activeElement?.matches('[data-cl-name]')&&el.querySelector('[data-cl-rename-form]')?.dataset.clRenameForm===CL.editing)return;
 el.innerHTML=clarityBoardsMarkup(state.boards,state.projects,state.activeBoard,CL.editing);dmDecorate();
};
document.addEventListener('click',e=>{
 const edit=e.target.closest('[data-cl-edit]'),cancel=e.target.closest('[data-cl-cancel]');
 if(!edit&&!cancel)return;e.preventDefault();e.stopImmediatePropagation();
 CL.editing=edit?.dataset.clEdit||null;
 // Drop focus on the old edit field before repainting; no draft is committed on blur.
 if(document.activeElement?.matches('[data-cl-name]'))document.activeElement.blur();
 renderPan();const input=$('#pan [data-cl-name]');if(input){input.focus();input.select()}
},true);
document.addEventListener('submit',e=>{
 const form=e.target.closest('[data-cl-rename-form]');if(!form)return;
 e.preventDefault();e.stopImmediatePropagation();const input=form.querySelector('[data-cl-name]'),name=input.value.trim();
 if(!name){input.setCustomValidity('请填写画板名称');input.reportValidity();return}
 input.setCustomValidity('');CL.editing=null;act('board.rename',{boardId:form.dataset.clRenameForm,name});
},true);
document.addEventListener('input',e=>{if(e.target.matches('[data-cl-name]'))e.target.setCustomValidity('')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.matches('[data-cl-name]')){e.preventDefault();e.stopImmediatePropagation();CL.editing=null;e.target.blur();renderPan()}},true);

document.addEventListener('click',e=>{if(e.target.closest('[data-legal-notice]'))window.open('/license','_blank','noopener');});
/* GLASS_CLARITY_END */
