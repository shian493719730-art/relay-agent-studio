import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const devSource = fs.readFileSync(new URL('../src/prototype/development.js', import.meta.url), 'utf8') + `
;this.DW = DW;
this.dwPanel = dwPanel;
this.dwEnterDevMode = dwEnterDevMode;
this.dwExitDevMode = dwExitDevMode;
this.dwOpen = dwOpen;
this.dwClose = dwClose;
this.dwDraftId = dwDraftId;
this.dwSaveDrafts = dwSaveDrafts;
this.renderPan = renderPan;
this.renderRoom = renderRoom;
`;

function createDOMContext(initialStorage: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStorage };
  const listeners: Record<string, Function[]> = {};

  const makeElement = (tag: string, id: string = '', className: string = '') => {
    const el: any = {
      tagName: tag.toUpperCase(),
      id,
      className,
      hidden: false,
      attributes: new Map<string, string>(),
      children: [] as any[],
      innerHTML: '',
      textContent: '',
      value: '',
      parentElement: null as any,
      setAttribute(name: string, value: string) { this.attributes.set(name, value); },
      getAttribute(name: string) { return this.attributes.get(name); },
      hasAttribute(name: string) { return this.attributes.has(name); },
      removeAttribute(name: string) { this.attributes.delete(name); },
      classList: {
        contains(c: string) { return el.className.split(/\s+/).includes(c); },
        add(c: string) { if (!this.contains(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c: string) { el.className = el.className.split(/\s+/).filter((x: string) => x && x !== c).join(' '); },
        toggle(c: string, force?: boolean) {
          const has = this.contains(c);
          const next = force !== undefined ? force : !has;
          if (next) this.add(c); else this.remove(c);
        }
      },
      append(...nodes: any[]) {
        for (const n of nodes) {
          n.parentElement = el;
          el.children.push(n);
        }
      },
      remove() {
        if (el.parentElement) {
          const idx = el.parentElement.children.indexOf(el);
          if (idx >= 0) el.parentElement.children.splice(idx, 1);
          el.parentElement = null;
        }
        el.innerHTML = '';
      },
      querySelector(selector: string): any {
        if (selector === '[data-dw-open]') return el.innerHTML.includes('data-dw-open') ? el : null;
        if (selector === '[data-dw-dev-toggle]') return el.innerHTML.includes('data-dw-dev-toggle') ? el : null;
        if (selector === '[data-dw-dev-exit]') return el.innerHTML.includes('data-dw-dev-exit') ? el : null;
        if (selector === '[data-dw-editor]') return el.querySelector ? el : null;
        return null;
      },
      querySelectorAll(selector: string): any[] {
        return [];
      },
      insertAdjacentHTML(position: string, html: string) {
        if (position === 'beforeend') this.innerHTML += html;
        else if (position === 'afterbegin') this.innerHTML = html + this.innerHTML;
        else this.innerHTML += html;
      }
    };
    return el;
  };

  const body = makeElement('body');
  const pan = makeElement('div', 'pan');
  const room = makeElement('div', 'room');
  const roomRt = makeElement('div', '', 'rt');
  room.append(roomRt);
  body.append(pan, room);

  const localStorage = {
    getItem(key: string) { return store[key] ?? null; },
    setItem(key: string, val: string) { store[key] = String(val); }
  };

  const hints: string[] = [];
  const context: any = {
    KEY: 'test-relay',
    localStorage,
    document: {
      body,
      createElement(tag: string) { return makeElement(tag); },
      append(...nodes: any[]) { body.append(...nodes); },
      addEventListener(event: string, fn: Function) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      }
    },
    $: (sel: string) => {
      if (sel === '#pan') return pan;
      if (sel === '#room .rt') return roomRt;
      if (sel === '#room') return room;
      return null;
    },
    dmWindows: () => [],
    dmWindowKey: () => '',
    state: { activeBoard: 'b1', room: 'p1', sel: 'p1', projects: [{ id: 'p1', boardId: 'b1', name: 'Project 1' }] },
    P: (id: string) => ({ id, name: 'Project 1', boardId: 'b1' }),
    renderPan: () => {},
    renderRoom: () => {},
    renderAll: () => {},
    closePan: () => {},
    dmDecorate: () => {},
    dwCheckPaint: () => {},
    dwPreviewPaint: () => {},
    hint: (msg: string) => hints.push(msg),
    icon: (name: string, size?: number) => `<svg data-icon="${name}"></svg>`,
    esc: (s: any) => String(s ?? ''),
    panK: 'boards',
    panId: 'b1',
    ACT: {},
    CAT: [],
    asContext: () => ({}),
    asPlanRound: async () => {},
    asInvoke: async () => {},
    AssistantCore: { public: (x: any) => x },
    fetch: async () => ({ ok: true, json: async () => ({ workspaces: [], files: [], total: 0 }) }),
    setTimeout,
    clearTimeout
  };

  return { context, pan, roomRt, hints, store };
}

test('developer mode is disabled by default and source panel is hidden', () => {
  const { context, pan, roomRt } = createDOMContext();
  vm.createContext(context);
  vm.runInContext(devSource, context);

  // 1. DW state defaults
  assert.equal(context.DW.devMode, false, 'devMode should default to false');
  assert.equal(context.dwPanel.hidden, true, 'dwPanel should be hidden by default');

  // 2. Room toolbar should NOT show source button in default mode
  context.renderRoom();
  assert.ok(!roomRt.innerHTML.includes('data-dw-open'), 'Ordinary user in project room should not see 源码 button');
  assert.ok(!roomRt.innerHTML.includes('源码'), 'Ordinary user should not see 源码 text');

  // 3. Pan in ordinary view shows 高级开发者模式 entry
  context.panK = 'boards';
  context.renderPan();
  assert.ok(pan.innerHTML.includes('data-dw-dev-toggle'), 'Pan should offer 高级开发者模式 toggle');
  assert.ok(pan.innerHTML.includes('高级开发者模式'), 'Pan should show 高级开发者模式 label');
  assert.ok(!pan.innerHTML.includes('data-dw-dev-exit'), 'Ordinary view should not show exit button');
});

test('entering developer mode reveals source controls and opens the development workspace', async () => {
  const { context, pan, roomRt, hints } = createDOMContext();
  vm.createContext(context);
  vm.runInContext(devSource, context);

  // Enter developer mode
  await context.dwEnterDevMode();
  assert.equal(context.DW.devMode, true, 'devMode should be true after entering');
  assert.equal(context.dwPanel.hidden, false, 'dwPanel should open');
  assert.ok(hints.some(h => h.includes('已进入高级开发者模式')));

  // In developer mode, room toolbar displays 源码
  context.renderRoom();
  assert.ok(roomRt.innerHTML.includes('data-dw-open'), 'Room toolbar should now have 源码 button');
  assert.ok(roomRt.innerHTML.includes('源码'), 'Room toolbar text should be 源码');

  // In developer mode, pan displays 源码开发 and 退出开发者模式
  pan.innerHTML = '';
  context.panK = 'boards';
  context.renderPan();
  assert.ok(pan.innerHTML.includes('源码开发'), 'Pan should show 源码开发 button');
  assert.ok(pan.innerHTML.includes('data-dw-dev-exit'), 'Pan should show 退出开发者模式 button');

  // In developer mode, dwPanel has badge and exit button
  assert.ok(context.dwPanel.innerHTML.includes('开发者模式'), 'dwPanel header should show 开发者模式 badge');
  assert.ok(context.dwPanel.innerHTML.includes('data-dw-dev-exit'), 'dwPanel header should show 退出开发者模式 button');
});

test('exiting developer mode restores clean normal user view and hides source panel', async () => {
  const { context, pan, roomRt, hints } = createDOMContext();
  vm.createContext(context);
  vm.runInContext(devSource, context);

  // Enter first
  await context.dwEnterDevMode();
  context.renderRoom();
  assert.ok(roomRt.innerHTML.includes('data-dw-open'));

  // Exit developer mode
  context.dwExitDevMode();
  assert.equal(context.DW.devMode, false, 'devMode should be false after exit');
  assert.equal(context.dwPanel.hidden, true, 'dwPanel should be closed');
  assert.ok(hints.some(h => h.includes('已恢复普通用户视图')));

  // Room toolbar should have 源码 removed
  context.renderRoom();
  assert.ok(!roomRt.innerHTML.includes('data-dw-open'), 'Room toolbar should no longer show 源码');

  // Pan restores to ordinary view
  pan.innerHTML = '';
  context.panK = 'boards';
  context.renderPan();
  assert.ok(pan.innerHTML.includes('高级开发者模式'));
  assert.ok(!pan.innerHTML.includes('data-dw-dev-exit'));
});

test('switching between modes preserves file drafts and editor content', async () => {
  const { context } = createDOMContext();
  vm.createContext(context);
  vm.runInContext(devSource, context);

  // Set workspace and file draft
  const fakeWorkspace = { id: 'ws1', root: '/tmp/repo' };
  context.DW.list = [fakeWorkspace];
  context.DW.current = 'ws1';
  await context.dwEnterDevMode();

  // Create an in-progress draft
  const draftKey = context.dwDraftId(fakeWorkspace, 'src/app.ts');
  context.DW.file = { path: 'src/app.ts', text: 'export const hello = "world";', dirty: true, total: 30 };
  context.DW.drafts[draftKey] = { ...context.DW.file };
  context.dwSaveDrafts();

  // Exit developer mode
  context.dwExitDevMode();
  assert.equal(context.DW.devMode, false);

  // Draft must NOT be deleted
  assert.ok(context.DW.drafts[draftKey], 'Drafts in DW.drafts must be preserved across mode exit');
  assert.equal(context.DW.drafts[draftKey].text, 'export const hello = "world";');

  // Re-enter developer mode
  await context.dwEnterDevMode();
  assert.equal(context.DW.devMode, true);
  assert.equal(context.DW.drafts[draftKey].text, 'export const hello = "world";', 'Drafts must be intact after re-entering dev mode');
});
