/* GLASS_CLARITY_START */
// Component design: real Claude Opus 5.5 (v34 Harmonized Glass).
function clarityBoardsMarkup(boards, projects, activeId, editingId) {
  const list = Array.isArray(boards) ? boards : [], ps = Array.isArray(projects) ? projects : [], cnt = Object.create(null);
  for (const p of ps) { if (p && p.boardId != null) { const k = String(p.boardId); cnt[k] = (cnt[k] || 0) + 1; } }
  const act = activeId == null ? '' : String(activeId), ed = editingId == null ? '' : String(editingId);
  const rows = list.map(b => {
    const id = String(b.id), raw = (b.name == null || String(b.name).trim() === '') ? '未命名画板' : String(b.name), nm = esc(raw), n = cnt[id] || 0, on = id === act, args = esc(JSON.stringify({ boardId: b.id }));
    if (id === ed) return `<div class="cl-board-row is-editing"><form class="cl-board-edit" data-cl-rename-form="${esc(id)}"><input data-cl-name name="name" value="${nm}" maxlength="160" required autocomplete="off" aria-label="画板名称"><button type="submit">${icon('check', 14)}保存</button><button type="button" data-cl-cancel>取消</button></form></div>`;
    return `<div class="cl-board-row${on ? ' is-active' : ''}"><button type="button" class="cl-board-open" data-act="board.switch" data-args="${args}" aria-pressed="${on}" aria-label="${esc((on ? '当前画板 ' : '切换到画板 ') + raw + '，' + n + ' 个项目')}"><span class="cl-board-name">${nm}</span><span class="cl-board-meta">${n} 个项目${on ? ' · 当前' : ''}</span></button><span class="cl-board-actions"><button type="button" data-cl-edit="${esc(id)}" aria-label="${esc('重命名 ' + raw)}" title="重命名">${icon('pen', 15)}</button><button type="button" data-act="board.delete" data-args="${args}" aria-label="${esc('删除 ' + raw + '（可撤销）')}" title="删除（可撤销）">${icon('trash', 15)}</button></span></div>`;
  }).join('');

  return `<header class="cl-panel-head">
    <span class="cl-panel-head__icon">${icon('board', 18)}</span>
    <span class="cl-panel-head__title">画板</span>
    <span class="cl-tag">${list.length} 个画板</span>
    <div class="cl-panel-ctrl">
      <button type="button" class="cl-ctrl cl-ctrl--min" data-cl-action="minimize" data-cl-target="pan" aria-label="折叠" title="折叠"></button>
      <button type="button" class="cl-ctrl cl-ctrl--max" data-cl-action="maximize" data-cl-target="pan" aria-label="放大/还原" title="放大/还原"></button>
      <button type="button" class="cl-ctrl cl-ctrl--close" data-cl-action="close" data-cl-target="pan" aria-label="关闭" title="关闭"></button>
    </div>
  </header>
  <div class="cl-panel-body">
    <div class="cl-board-list" role="group" aria-label="画板列表">${rows || '<p class="cl-board-empty">还没有画板，先新建一个。</p>'}</div>
    <div class="cl-board-footer">${B_('board.create', {}, '新建画板', 'plus')}<button type="button" data-tut="menu" aria-label="新手教程与操作速查">${icon('board', 15)}教程与速查</button><button type="button" data-legal-notice>版权与开源许可</button></div>
  </div>
  <div class="cl-resize" data-resize-panel="pan"></div>`;
}

// Harmonize any arbitrary view rendered into #pan
function clarityHarmonizePan(el) {
  if (!el || !el.classList.contains('o')) return;
  el.classList.add('cl-panel-glass');
  document.body.dataset.panOpen = 'true';

  if (el.querySelector('.cl-panel-head')) return;

  const h3 = el.querySelector('h3');
  let title = '详情', ic = 'target';
  if (h3) {
    title = h3.textContent.replace(/×/g, '').trim() || '详情';
    const svg = h3.querySelector('svg');
    if (h3.innerHTML.includes('icon-')) ic = '';
    h3.remove();
  }

  const existingHtml = el.innerHTML;
  el.innerHTML = `<header class="cl-panel-head">
    <span class="cl-panel-head__icon">${icon(ic || 'target', 18)}</span>
    <span class="cl-panel-head__title">${esc(title)}</span>
    <div class="cl-panel-ctrl">
      <button type="button" class="cl-ctrl cl-ctrl--min" data-cl-action="minimize" data-cl-target="pan" aria-label="折叠" title="折叠"></button>
      <button type="button" class="cl-ctrl cl-ctrl--max" data-cl-action="maximize" data-cl-target="pan" aria-label="放大/还原" title="放大/还原"></button>
      <button type="button" class="cl-ctrl cl-ctrl--close" data-cl-action="close" data-cl-target="pan" aria-label="关闭" title="关闭"></button>
    </div>
  </header>
  <div class="cl-panel-body">${existingHtml}</div>
  <div class="cl-resize" data-resize-panel="pan"></div>`;
}

const CL = { editing: null };
const clarityPanBase = renderPan;
renderPan = function () {
  const el = $('#pan');
  el.classList.toggle('cl-boards', panK === 'boards');
  if (panK !== 'boards') {
    clarityPanBase();
    clarityHarmonizePan(el);
    return;
  }
  if (CL.editing && !state.boards.some(b => b.id === CL.editing)) CL.editing = null;
  if (document.activeElement?.matches('[data-cl-name]') && el.querySelector('[data-cl-rename-form]')?.dataset.clRenameForm === CL.editing) return;
  el.innerHTML = clarityBoardsMarkup(state.boards, state.projects, state.activeBoard, CL.editing);
  clarityHarmonizePan(el);
  dmDecorate();
};

const clarityOpenPanBase = openPan;
openPan = function (k, id) {
  clarityOpenPanBase(k, id);
  document.body.dataset.panOpen = 'true';
  const el = $('#pan');
  if (el) clarityHarmonizePan(el);
};

const clarityClosePanBase = closePan;
closePan = function () {
  document.body.dataset.panOpen = 'false';
  clarityClosePanBase();
};

// Panel resize dragging
let activeResize = null;
document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.cl-resize[data-resize-panel]');
  if (!handle) return;
  e.preventDefault();
  const panelId = handle.dataset.resizePanel;
  const panel = document.getElementById(panelId);
  if (!panel) return;
  handle.classList.add('is-dragging');
  activeResize = {
    panelId,
    panel,
    handle,
    startX: e.clientX,
    startW: panel.offsetWidth
  };
});

document.addEventListener('pointermove', e => {
  if (!activeResize) return;
  const { panelId, startX, startW } = activeResize;
  if (panelId === 'pan') {
    const delta = e.clientX - startX;
    const newW = Math.max(260, Math.min(window.innerWidth - 380, startW + delta));
    document.documentElement.style.setProperty('--cl-pan-w', newW + 'px');
  } else if (panelId === 'guide') {
    const delta = startX - e.clientX;
    const newW = Math.max(380, Math.min(window.innerWidth - 300, startW + delta));
    document.documentElement.style.setProperty('--cl-guide-w', newW + 'px');
  }
});

document.addEventListener('pointerup', () => {
  if (activeResize) {
    activeResize.handle.classList.remove('is-dragging');
    activeResize = null;
  }
});

// Double click resize handle to toggle size
document.addEventListener('dblclick', e => {
  const handle = e.target.closest('.cl-resize[data-resize-panel]');
  if (!handle) return;
  const panel = document.getElementById(handle.dataset.resizePanel);
  if (panel) {
    const expanded = panel.getAttribute('data-size') === 'expanded' || panel.classList.contains('as-expanded');
    if (expanded) {
      panel.removeAttribute('data-size');
      panel.classList.remove('as-expanded');
    } else {
      panel.setAttribute('data-size', 'expanded');
      panel.classList.add('as-expanded');
    }
  }
});

// Unified window controls (min, max, close)
document.addEventListener('click', e => {
  const ctrl = e.target.closest('.cl-ctrl[data-cl-action]');
  if (!ctrl) return;
  e.preventDefault();
  const act = ctrl.dataset.clAction;
  const targetId = ctrl.dataset.clTarget;
  const panel = document.getElementById(targetId);
  if (!panel) return;
  if (act === 'close') {
    if (targetId === 'pan') closePan();
    else if (targetId === 'guide') {
      panel.classList.remove('o');
      document.body.dataset.guideOpen = 'false';
      if (typeof renderTop === 'function') renderTop();
    }
  } else if (act === 'maximize') {
    const isExp = panel.getAttribute('data-size') === 'expanded' || panel.classList.contains('as-expanded');
    if (isExp) {
      panel.removeAttribute('data-size');
      panel.classList.remove('as-expanded');
    } else {
      panel.setAttribute('data-size', 'expanded');
      panel.classList.add('as-expanded');
      panel.classList.remove('is-collapsed');
    }
  } else if (act === 'minimize') {
    panel.classList.toggle('is-collapsed');
  }
});

document.addEventListener('click', e => {
  const edit = e.target.closest('[data-cl-edit]'), cancel = e.target.closest('[data-cl-cancel]');
  if (!edit && !cancel) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  CL.editing = edit?.dataset.clEdit || null;
  if (document.activeElement?.matches('[data-cl-name]')) document.activeElement.blur();
  renderPan();
  const input = $('#pan [data-cl-name]');
  if (input) { input.focus(); input.select(); }
}, true);

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-cl-rename-form]');
  if (!form) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const input = form.querySelector('[data-cl-name]'), name = input.value.trim();
  if (!name) { input.setCustomValidity('请填写画板名称'); input.reportValidity(); return; }
  input.setCustomValidity('');
  CL.editing = null;
  act('board.rename', { boardId: form.dataset.clRenameForm, name });
}, true);

document.addEventListener('input', e => { if (e.target.matches('[data-cl-name]')) e.target.setCustomValidity(''); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.matches('[data-cl-name]')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    CL.editing = null;
    e.target.blur();
    renderPan();
  }
}, true);

document.addEventListener('click', e => { if (e.target.closest('[data-legal-notice]')) window.open('/license', '_blank', 'noopener'); });
/* GLASS_CLARITY_END */