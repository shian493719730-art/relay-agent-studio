import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.ts';
import {Workflow,type StepExecutor} from '../server/runner.ts';
import {Artifacts} from '../server/artifacts.ts';

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'relay-test-'));}
async function finish(workflow:Workflow,id:string){
  const deadline=Date.now()+3000;
  while(workflow.active.has(id)){if(Date.now()>deadline)throw new Error('Workflow did not finish');await new Promise(resolve=>setTimeout(resolve,5));}
  return workflow.store.get(id)!;
}
test('planner output reaches parallel workers and both outputs reach final; artifacts and records survive reload',async()=>{
  const root=temp();
  try{
    const calls:{id:string;input:string}[]=[];
    const execute:StepExecutor=async(step,input,ctx)=>{calls.push({id:step.id,input});ctx.artifacts.write(`proof-${step.id}.txt`,'tool proof');step.inputTokens=12;step.outputTokens=7;return `output-${step.id}`;};
    const store=new Store(root);const workflow=new Workflow(store,execute);
    const run=workflow.create('设计协作方案','约束：两周内交付','collaborate');await finish(workflow,run.id);
    assert.equal(run.status,'completed');
    assert.equal(calls[0].id,'planner');assert.equal(calls.at(-1)?.id,'editor');
    for(const id of ['specialist','reviewer'])assert.match(calls.find(c=>c.id===id)!.input,/output-planner/);
    assert.match(calls.at(-1)!.input,/output-specialist/);assert.match(calls.at(-1)!.input,/output-reviewer/);
    assert.equal(workflow.artifacts(run.id).read('final-result.md'),'output-editor');
    const reloaded=new Store(root);assert.equal(reloaded.get(run.id)?.result,'output-editor');assert.equal(reloaded.summaries()[0].tokens,76);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('independent comparison does not leak other agents output into their input',async()=>{
  const root=temp();try{
    const inputs:string[]=[];const workflow=new Workflow(new Store(root),async(step,input,ctx)=>{if(step.agent.role!=='final'){inputs.push(input);assert.deepEqual(ctx.artifacts.list(),[]);ctx.artifacts.write('private.txt',`private-${step.id}`);}else{assert.equal(ctx.artifacts.list().filter(f=>f.name.endsWith('-private.txt')).length,3);}return `private-output-${step.id}`;});
    const run=workflow.create('比较选项','独立分析','compare');await finish(workflow,run.id);
    assert.equal(run.status,'completed');assert.equal(inputs.length,3);for(const text of inputs)assert.doesNotMatch(text,/private-output-/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failed provider remains visible; available synthesis is not mislabeled successful',async()=>{
  const root=temp();try{
    const workflow=new Workflow(new Store(root),async(step)=>{if(step.id==='specialist')throw new Error('Provider rejected the request');return 'valid partial output';});
    const run=workflow.create('生成计划','','collaborate');await finish(workflow,run.id);
    assert.equal(run.status,'failed');assert.equal(run.steps.find(s=>s.id==='specialist')?.status,'failed');assert.ok(run.result);assert.match(run.error!,/部分 Agent/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('cancellation stops downstream execution and rejects overlapping runs',async()=>{
  const root=temp();try{
    const calls:string[]=[];const workflow=new Workflow(new Store(root),async(step,_input,ctx)=>{calls.push(step.id);await new Promise<void>((_resolve,reject)=>ctx.signal.addEventListener('abort',()=>reject(ctx.signal.reason),{once:true}));return 'unreachable';});
    const run=workflow.create('测试停止','','collaborate');assert.throws(()=>workflow.create('重复任务','','collaborate'),/已有任务/);
    assert.equal(workflow.cancel(run.id),true);await finish(workflow,run.id);
    assert.equal(run.status,'cancelled');assert.deepEqual(calls,['planner']);assert.equal(run.result,'');assert.ok(run.steps.every(s=>s.status==='cancelled'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('restarting a service marks unfinished work interrupted rather than running forever',()=>{
  const root=temp();try{
    const store=new Store(root);store.runs=[{id:'stale',title:'中断任务',prompt:'test',context:'',mode:'collaborate',status:'running',createdAt:new Date().toISOString(),settings:store.settings,steps:[],events:[],result:''}];store.save();
    assert.equal(new Store(root).get('stale')?.status,'interrupted');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('artifact tools reject traversal and symlinks and preserve Unicode filenames',()=>{
  const root=temp();try{
    const files=new Artifacts(root);files.write('中文报告.md','# 完成');assert.equal(files.read('中文报告.md'),'# 完成');
    for(const name of ['../.env.local','/etc/passwd','.env.local','foo/bar.md','foo\\bar.md'])assert.throws(()=>files.read(name));
    const external=path.join(root,'outside.txt');fs.writeFileSync(external,'private');fs.symlinkSync(external,path.join(root,'shortcut.txt'));
    assert.throws(()=>files.read('shortcut.txt'),/符号链接/);assert.throws(()=>files.write('shortcut.txt','changed'),/符号链接/);assert.equal(fs.readFileSync(external,'utf8'),'private');
    const missingTarget=path.join(root,'missing','outside.txt');fs.symlinkSync(missingTarget,path.join(root,'dangling.txt'));
    assert.throws(()=>files.write('dangling.txt','changed'),/符号链接/);assert.equal(fs.existsSync(missingTarget),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
