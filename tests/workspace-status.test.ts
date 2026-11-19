import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('tutorial repaint preserves the actual API warning on a bound work board and the local-only warning in practice',()=>{
 const html=fs.readFileSync(new URL('../src/prototype/index.html',import.meta.url),'utf8');
 const writes=[...html.matchAll(/\$\('#tag'\)\.textContent=([^;]+);/g)].map(m=>m[0]);
 assert.equal(writes.length,2,'exercise both installed status owners, in render order');
 const helper=html.match(/^function modelWorkspaceLabel[^\n]+/m)?.[0]||'';
 const repaint=new Function('$','onB','state','tutorialPractice','connected',helper+'\n'+writes.join('\n'));
 for(const [projects,practice,expected] of [
  [[{coordinator:{connectionId:'official-anthropic',model:'claude-model'},members:[]}],false,'多模型协作 · 发送才开始 API'],
  [[{coordinator:{},members:[{connectionId:'official-openai',model:'gpt-model'}]}],false,'1/2 位已绑定 · 团队按各自模型执行'],
  [[{coordinator:{},members:[]}],false,'0/1 位已绑定 · 团队按各自模型执行'],
  [[{coordinator:{connectionId:'official-anthropic'},members:[]}],true,'教程练习板 · 仅本地演练'],
 ] as const){
  const tag={textContent:''},connected=projects.some(p=>[p.coordinator,...p.members].some((m:any)=>m.connectionId));
  repaint(()=>tag,(p:any)=>p,{projects},()=>practice,connected);
  assert.equal(tag.textContent,expected);
 }
});
