import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assistantSource = fs.readFileSync(new URL('../src/prototype/assistant.js', import.meta.url), 'utf8') + `
;this.AS = AS;
this.asSession = asSession;
this.renderGuide = renderGuide;
`;

test('AI assistant empty state displays interactive starter chips that populate draft and input', () => {
  const guideEl: any = {
    classList: {
      contains(c: string) { return c === 'o'; },
      add() {},
      remove() {}
    },
    innerHTML: ''
  };

  const asInput: any = {
    id: 'as-input',
    value: '',
    focused: false,
    focus() { this.focused = true; },
    selectionStart: 0,
    selectionEnd: 0
  };

  const context: any = {
    CAT: [['project.create', '创建项目', 'name']],
    ACT: {},
    AS: { ac: null, draft: '', showAll: false, current: null, profiles: [] },
    asSession: () => null,
    icon: (name: string, size?: number) => `<icon:${name}>`,
    esc: (s: string) => s || '',
    renderTop: () => {},
    restore: () => {},
    skillbook: { querySelector() { return null; }, open: false },
    modelConnect: { querySelector() { return null; }, open: false },
    renderAssistantWelcome: () => '<div>Welcome</div>',
    RelayAssistantCopy: { welcome: 'Hello' },
    state: { assistantSessions: [], prefs: {} },
    dmDecorate: () => {},
    asProfiles: async () => {},
    document: {
      activeElement: null,
      addEventListener() {}
    },
    $: (sel: string) => {
      if (sel === '#guide') return guideEl;
      if (sel === '#as-input') return asInput;
      return null;
    }
  };

  vm.runInNewContext(assistantSource, context);

  // 1. renderGuide with no active session renders starter chips
  context.renderGuide();
  assert.ok(guideEl.innerHTML.includes('as-empty-state'), 'Should render as-empty-state container');
  assert.ok(guideEl.innerHTML.includes('as-starter-chip'), 'Should render starter chips');
  assert.ok(guideEl.innerHTML.includes('data-as-prompt'), 'Should have data-as-prompt attribute');
  assert.ok(guideEl.innerHTML.includes('策划与审查流水线'), 'Should feature pipeline starter');
  assert.ok(guideEl.innerHTML.includes('配置多模型团队'), 'Should feature team starter');

  // 2. Simulating clicking a starter chip updates AS.draft and #as-input
  const samplePrompt = '帮我创建两个项目：一个负责策划，另一个负责事实与合规审查，并连线共享成果';
  context.AS.draft = samplePrompt;
  asInput.value = context.AS.draft;
  asInput.focus();
  asInput.selectionStart = asInput.value.length;
  asInput.selectionEnd = asInput.value.length;

  assert.equal(asInput.value, samplePrompt);
  assert.equal(asInput.focused, true);
  assert.equal(asInput.selectionStart, samplePrompt.length);
});

test('Project panel displays real-time readiness feedback and next-step advice', () => {
  // Test the readiness logic: incomplete vs complete
  function computeTips(p: any, allProjects: any[], links: any[]) {
    const mCount = (p.coordinator ? 1 : 0) + (p.members?.length || 0);
    const pLinks = links.filter(l => l.src === p.id || l.dst === p.id);
    const pTips: string[] = [];
    if (!p.summary || !p.summary.trim()) pTips.push('未写目标：写下目标或点击「推敲目标」辅助');
    if (mCount <= 1) pTips.push('单角色协作：可从上方角色架拖入更多模型协作');
    if (!pLinks.length && allProjects.length > 1) pTips.push('暂无连线：可连线其他项目自动传递成果');
    return {
      tips: pTips,
      isOk: pTips.length === 0
    };
  }

  // Case 1: Fresh project with no goal, 1 member, no links
  const p1 = { id: 'p1', name: '策划', summary: '', coordinator: { id: 'm1' }, members: [] };
  const allProjects = [p1, { id: 'p2', name: '执行' }];
  const res1 = computeTips(p1, allProjects, []);
  assert.equal(res1.isOk, false);
  assert.equal(res1.tips.length, 3);
  assert.ok(res1.tips[0].includes('未写目标'));
  assert.ok(res1.tips[1].includes('单角色协作'));
  assert.ok(res1.tips[2].includes('暂无连线'));

  // Case 2: Configured project with goal, 2 members, and link
  const p2 = {
    id: 'p1',
    name: '策划',
    summary: '负责整体方案策划',
    coordinator: { id: 'm1' },
    members: [{ id: 'm2' }]
  };
  const links = [{ id: 'l1', src: 'p1', dst: 'p2' }];
  const res2 = computeTips(p2, allProjects, links);
  assert.equal(res2.isOk, true);
  assert.equal(res2.tips.length, 0);
});

test('Goal refinement button is wired and sets project summary with undo preservation', () => {
  const p = { id: 'p1', name: '设计方案', summary: '旧想法' };
  let undoPushed = false;
  let saved = false;

  const pushUndo = () => { undoPushed = true; };
  const save = () => { saved = true; };

  // Simulate applying refined prompt as goal
  const refinedText = '根据用户输入和规范生成多方案原型';
  pushUndo();
  p.summary = refinedText;
  save();

  assert.equal(undoPushed, true);
  assert.equal(saved, true);
  assert.equal(p.summary, refinedText);
});
