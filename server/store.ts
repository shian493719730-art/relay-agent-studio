import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Settings, TaskRun, RunSummary } from '../src/types.ts';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataRoot = path.resolve(process.env.RELAY_DATA_DIR || path.join(projectRoot, '.data'));
export const defaultSettings: Settings = {
  maxOutputTokens: 1800,
  maxTurns: 5,
  agents: [
    { id: 'planner', name: '任务统筹', role: 'plan', provider: 'openai', model: 'gpt-5.4-mini', instructions: '把目标拆成具体、可执行的工作，明确约束和验收标准。为后续专家提供简洁任务说明，不要替他们完成全部工作。' },
    { id: 'specialist', name: '方案专家', role: 'work', provider: 'anthropic', model: 'claude-sonnet-4-6', instructions: '从专业执行者的角度给出具体方案、内容或实现。避免空泛建议，标注关键假设，尽量交付用户可以直接使用的内容。' },
    { id: 'reviewer', name: '独立审阅', role: 'work', provider: 'openai', model: 'gpt-5.4-mini', instructions: '独立解决问题并检查可能的风险、遗漏和逻辑错误。给出具体可验证的改进建议，区分事实与推测。' },
    { id: 'editor', name: '交付编辑', role: 'final', provider: 'openai', model: 'gpt-5.4-mini', instructions: '比较专家结论，处理分歧，修正遗漏，给出完整清晰且可直接使用的最终交付物。不要只描述其他 Agent 做了什么。' },
  ],
};

export class Store {
  settings: Settings;
  runs: TaskRun[];
  constructor(readonly root = dataRoot) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const file = path.join(root, 'state.json');
    let saved: { settings?: Settings; runs?: TaskRun[] } = {};
    if (fs.existsSync(file)) saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.settings = saved.settings || structuredClone(defaultSettings);
    this.runs = saved.runs || [];
    for (const run of this.runs) if (['running', 'queued'].includes(run.status)) {
      run.status = 'interrupted'; run.error = '服务重启使任务中断。可以复制目标重新执行。';
      run.finishedAt = new Date().toISOString();
      for (const step of run.steps) if (['running','waiting'].includes(step.status)) step.status = 'cancelled';
    }
    this.save();
  }
  save() {
    const tmp = path.join(this.root, 'state.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify({ settings: this.settings, runs: this.runs }), { mode: 0o600 });
    fs.renameSync(tmp, path.join(this.root, 'state.json'));
  }
  summaries(): RunSummary[] {
    return this.runs.map(r => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt, finishedAt: r.finishedAt, tokens: r.steps.reduce((sum,s) => sum+s.inputTokens+s.outputTokens,0) }));
  }
  get(id: string) { return this.runs.find(r => r.id === id); }
}
