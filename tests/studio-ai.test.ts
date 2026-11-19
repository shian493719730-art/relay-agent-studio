import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explainStudio,refineWithSkills,loadSkillGuides,type ClaudeJson,type SkillGuide} from '../server/studio-ai.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('standalone install has bundled methods and an explicit local directory can override them',async()=>{
 const bundled=await loadSkillGuides();
 for(const id of ['request-clarity','implementation-review','document-analysis'])assert.ok(bundled.some(s=>s.id===id&&s.body.length>100));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'relay-guides-')),previous=process.env.RELAY_SKILL_DIRS;
 try{
  await fs.mkdir(path.join(dir,'request-clarity'));
  await fs.writeFile(path.join(dir,'request-clarity','SKILL.md'),'---\nname: Local clarity\ndescription: Explicit project method\n---\nKeep the original request.');
  process.env.RELAY_SKILL_DIRS=dir;
  const guides=await loadSkillGuides(),selected=guides.filter(s=>s.id==='request-clarity');
  assert.equal(selected.length,1);assert.equal(selected[0].title,'Local clarity');assert.equal(selected[0].source,path.join(dir,'request-clarity','SKILL.md'));
 }finally{if(previous===undefined)delete process.env.RELAY_SKILL_DIRS;else process.env.RELAY_SKILL_DIRS=previous;await fs.rm(dir,{recursive:true,force:true});}
});

test('guide only forwards entity metadata and returns allowlisted structured actions',async()=>{
 let forwarded:any;
 const generate:ClaudeJson=async(_system,user)=>{forwarded=user;return{reply:'可以创建。',actions:[{name:'board.create',argsJson:'{"name":"运营"}'}]};};
 const result=await explainStudio({message:'创建运营画板',context:{activeBoardId:'b',boards:[{id:'b',name:'原画板',secret:'never'}],files:[{id:'f',boardId:'b',pid:null,name:'附件.txt',body:'private document'}],chat:'private chat'},capabilities:[{name:'board.create',description:'新画板',params:'name:string'}]},undefined,generate);
 assert.deepEqual(result.actions,[{name:'board.create',args:{name:'运营'}}]);
 assert.doesNotMatch(JSON.stringify(forwarded),/private document|private chat|never/);
 await assert.rejects(()=>explainStudio({...forwarded},undefined,async()=>({reply:'unsafe',actions:[{name:'arbitrary.command',argsJson:'{}'}]})),/未提供/);
});

test('prompt refinement reads the semantically selected skill body in a separate pass without a prefab draft',async()=>{
 const guides:SkillGuide[]=[{id:'design',title:'交互设计',description:'界面设计',body:'# Real full skill\n先研究动作反馈和信息层次。',source:'/skills/design/SKILL.md'},{id:'writing',title:'短写作',description:'文字',body:'保留语气。',source:'/skills/writing/SKILL.md'}];
 const calls:{system:string,user:any}[]=[];
 const generate:ClaudeJson=async(system,user)=>{
  calls.push({system,user});
  return calls.length===1?{intent:'解释界面问题',selections:[{id:'design',reason:'需要考虑点击后反馈，而不只是文案'}]}:
   {text:'请检查点击后反馈是否清晰，保留现在的角色表达。',intent:'改进交互反馈',changes:['补充可观察反馈'],questions:[],application:[{id:'design',used:'围绕动作与反馈思考，没有套页面模板'}]};
 };
 const result=await refineWithSkills({text:'这个东西点了没反应，不要改它的角色形象'},undefined,generate,guides);
 assert.equal(calls.length,2);assert.equal(calls[0].user.original,calls[1].user.original);
 assert.equal(calls[0].user.candidates[0].instructions,undefined);
 assert.equal(calls[1].user.providedSkills[0].instructions,guides[0].body);
 assert.doesNotMatch(JSON.stringify(calls[1].user),/prepared_draft|保留语气/);
 assert.equal(result.skills[0].id,'design');assert.equal(result.stages,2);
});

test('prompt router rejects an invented skill before attempting the editing pass',async()=>{
 let calls=0;
 await assert.rejects(()=>refineWithSkills({text:'做一个设计'},undefined,async()=>{calls++;return{intent:'x',selections:[{id:'missing',reason:'x'}]};},[{id:'real',title:'真实',description:'已有',body:'read',source:'/real'}]),/未安装/);
 assert.equal(calls,1);
});

test('extra advisory questions do not discard a valid refinement or trigger another model request',async()=>{
 let calls=0;
 const output={text:'请检查现有发货清单中的重复单号，保留原表并单列异常，不补造缺失值。',intent:'核对已有表格',changes:[],questions:['单号在哪一列？','怎样处理空单号？','是否另存异常表？'],application:[]};
 const generate:ClaudeJson=async()=>{calls++;return output};
 const result=await refineWithSkills({text:'检查重复单号，保留原表',skillIds:[]},undefined,generate,[]);
 assert.equal(result.text,output.text);assert.deepEqual(result.questions,output.questions.slice(0,2));assert.equal(calls,1);
 await assert.rejects(()=>refineWithSkills({text:'检查重复',skillIds:[]},undefined,async()=>({...output,questions:['合法问题',12]}),[]));
});
