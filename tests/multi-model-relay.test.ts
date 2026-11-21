import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('smart role-based multi-model allocation distributes diverse models across team roles', () => {
  const modelConnectionsJs = fs.readFileSync(path.resolve('src/prototype/model-connections.js'), 'utf8');
  assert.ok(modelConnectionsJs.includes('function mcPickModelForRole'), 'mcPickModelForRole must be defined');
  assert.ok(modelConnectionsJs.includes('function mcAutoAssignTeamModels'), 'mcAutoAssignTeamModels must be defined');
  assert.ok(modelConnectionsJs.includes('function mcAutoAssignMember'), 'mcAutoAssignMember must be defined');

  // Evaluate the picking logic in isolation
  const mockConn = {
    id: 'conn-test-yinzi',
    name: '银子中转站',
    revision: 'rev-1',
    defaultModel: 'claude-fable-5-1',
    models: [
      'claude-opus-5-5',
      'claude-3-5-sonnet-20241022',
      'deepseek-v4.1-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gpt-5.4'
    ]
  };

  // Extract function logic to test
  const fnMatch = modelConnectionsJs.match(/function mcPickModelForRole\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'Extracted mcPickModelForRole implementation');
  const pickFn = new Function('conn', 'roleName', 'memberIndex', `${fnMatch[0]}; return mcPickModelForRole(conn, roleName, memberIndex);`);

  // 1. Coordinator role
  const coordModel = pickFn(mockConn, '求职统筹', 0);
  assert.equal(coordModel, 'claude-opus-5-5');

  // 2. Analyst role
  const analystModel = pickFn(mockConn, '职位分析', 1);
  assert.equal(analystModel, 'deepseek-v4.1-flash');

  // 3. Creator/Customizer role
  const customModel = pickFn(mockConn, '简历定制', 2);
  assert.equal(customModel, 'claude-3-5-sonnet-20241022');

  // 4. Tracker/QA role
  const trackerModel = pickFn(mockConn, '进度跟踪', 3);
  assert.equal(trackerModel, 'gemini-2.5-flash');

  // All 4 models are diverse!
  const assigned = [coordModel, analystModel, customModel, trackerModel];
  assert.equal(new Set(assigned).size, 4, 'All 4 roles should get distinct, specialized models from the relay');
});

test('visual distinction between close (cross ×) and minimize (fold chevron ⌄)', () => {
  const css = fs.readFileSync(path.resolve('src/prototype/glass-clarity.css'), 'utf8');

  // Minimize must be a downward chevron / fold indicator, NOT a simple minus dash line
  assert.match(css, /\.cl-ctrl--min::before[\s\S]*?rotate\(45deg\)/, 'cl-ctrl--min must use a fold chevron (rotate 45deg border)');
  assert.match(css, /\.cl-ctrl--min:hover[\s\S]*?rgba\(0,\s*144,\s*255/, 'cl-ctrl--min hover must use subtle cool blue');

  // Close must be a cross × and hover with soft warning red
  assert.match(css, /\.cl-ctrl--close::before[\s\S]*?rotate\(45deg\)/, 'cl-ctrl--close must cross lines');
  assert.match(css, /\.cl-ctrl--close::after[\s\S]*?rotate\(-45deg\)/, 'cl-ctrl--close must cross lines');
  assert.match(css, /\.cl-ctrl--close:hover[\s\S]*?rgba\(229,\s*72,\s*77/, 'cl-ctrl--close hover must use subtle red');
  assert.match(css, /button\.x:hover[\s\S]*?rgba\(229,\s*72,\s*77/, 'button.x hover must use subtle red');
});

test('draggable panels implementation is initialized on headers and dialogs', () => {
  const js = fs.readFileSync(path.resolve('src/prototype/glass-clarity.js'), 'utf8');
  assert.ok(js.includes('clInitDraggable'), 'clInitDraggable must be implemented');
  assert.ok(js.includes('clActiveDrag'), 'clActiveDrag must be tracked');
  assert.ok(js.includes('model-connect'), 'model-connect dialog must be registered for dragging');
  assert.ok(js.includes('pan'), 'pan must be registered for dragging');
  assert.ok(js.includes('guide'), 'guide must be registered for dragging');
});
