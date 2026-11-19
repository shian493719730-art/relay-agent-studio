// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pdfFixture} from '../tests/document-fixtures.ts';
const require=createRequire(import.meta.url),{backendEnvironment}=require('../desktop/runtime.cjs');
const binary=path.resolve(process.argv[2]||''),appRoot=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: npm run desktop:smoke -- <packaged binary> <Resources/app directory>');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-packaged-')),token=randomBytes(32).toString('hex'),runtime=path.join(appRoot,'desktop-runtime');
let stderr='';const child=spawn(binary,[path.join(runtime,'server/index.mjs')],{cwd:runtime,env:{...backendEnvironment(process.env,{runtimeRoot:runtime,dataRoot:root,token}),RELAY_WEEKLY_UPDATES:'0'},stdio:['ignore','pipe','pipe','ipc']});child.stderr.on('data',d=>{stderr+=d.toString().slice(0,8000)});
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Packaged backend timed out: '+stderr)),25000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Packaged backend exited '+code+': '+stderr))});child.on('message',m=>{if(m?.type==='relay-ready'){clearTimeout(timer);resolve(m)}})});
 const base='http://127.0.0.1:'+ready.port,headers={'X-Relay-Desktop':token};
 assert.equal((await fetch(base+'/health')).status,403);assert.equal((await fetch(base+'/health',{headers})).status,200);
 assert.equal((await fetch(base+'/api/bootstrap',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
 assert.match(await(await fetch(base+'/design-v2/',{headers})).text(),/Relay/);
 const info=await(await fetch(base+'/api/license',{headers})).json();assert.equal(info.license,'AGPL-3.0-only');assert.equal(info.bundledSource,true);assert.match(info.licenseText,/GNU AFFERO GENERAL PUBLIC LICENSE/);
 const sourceResponse=await fetch(base+'/api/license/source',{headers});assert.equal(sourceResponse.status,200);const source=new Uint8Array(await sourceResponse.arrayBuffer());assert.equal(Buffer.from(source.subarray(0,2)).toString(),'PK');
 const meta={fileId:'package-smoke',boardId:'package-board',name:'本地部署验证.pdf'};
 const up=await fetch(base+'/api/studio/documents/upload',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','X-Relay-File':encodeURIComponent(JSON.stringify(meta))},body:new Uint8Array(pdfFixture('PACKAGED-PDF-BODY-49K'))});assert.equal(up.status,201);const doc=await up.json();
 const action=async(a)=>{const response=await fetch(base+'/api/studio/documents',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:a,id:doc.id})});assert.equal(response.status,200);return response.json()};
 let parsed=await action('read');for(let i=0;i<250&&parsed.status==='reading';i++){await new Promise(r=>setTimeout(r,40));parsed=await action('status');}assert.equal(parsed.status,'ready',parsed.error);assert.ok(parsed.segments.some(s=>s.text.includes('PACKAGED-PDF-BODY-49K')));
 const connections=await(await fetch(base+'/api/studio/models',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})).json();assert.ok(connections.profiles.every(p=>!p.configured));
 const repository=path.join(root,'source-fixture');await fs.mkdir(repository);execFileSync('git',['init','-q',repository]);await fs.writeFile(path.join(repository,'package.json'),JSON.stringify({name:'packaged-source-fixture',scripts:{typecheck:'node check.cjs'}}));await fs.writeFile(path.join(repository,'check.cjs'),"console.log('PACKAGED-DEVELOPMENT-READY')");await fs.writeFile(path.join(repository,'main.ts'),'export const value = 1;\n');execFileSync('git',['-C',repository,'add','.']);
 const development=async(action,args={})=>{const response=await fetch(base+'/api/studio/development',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action,...args})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 const preview=await development('preview',{directory:repository}),workspace=await development('attach',{directory:repository,boardId:'packaged-board',projectId:'packaged-project',writable:true,allowChecks:true,scriptsHash:preview.scriptsHash});
 const read=await development('read',{workspaceId:workspace.id,path:'main.ts'}),change=await development('replace',{workspaceId:workspace.id,path:'main.ts',oldText:'value = 1',newText:'value = 2',expectedHash:read.hash,requestId:randomUUID()});assert.match(await fs.readFile(path.join(repository,'main.ts'),'utf8'),/value = 2/);await development('revert',{workspaceId:workspace.id,changeId:change.id});assert.equal(await fs.readFile(path.join(repository,'main.ts'),'utf8'),read.text);
 let check=await development('check',{workspaceId:workspace.id,command:'typecheck',requestId:randomUUID()});const checkDeadline=Date.now()+20000;while(!check.settled&&Date.now()<checkDeadline){await new Promise(r=>setTimeout(r,80));check=await development('checkStatus',{workspaceId:workspace.id,runId:check.id});}assert.equal(check.status,'passed',check.output);assert.match(check.output,/PACKAGED-DEVELOPMENT-READY/);
 const practice=await development('practice',{boardId:'offline-course-board',projectId:'offline-course-project',requestId:randomUUID()});assert.equal(practice.kind,'practice');
 const lesson=async(action,args={})=>development(action,{workspaceId:practice.id,...args});const originalLesson=await lesson('read',{path:practice.practice.source});const lessonEdit=await lesson('write',{path:originalLesson.path,content:'export const title = "我的 Relay 工作台";\n',expectedHash:originalLesson.hash,requestId:randomUUID()});
 const runLesson=async()=>{let c=await lesson('check',{command:'test',requestId:randomUUID()});for(let n=0;n<200&&!c.settled;n++){await new Promise(r=>setTimeout(r,40));c=await lesson('checkStatus',{runId:c.id});}assert.equal(c.settled,true);return c;};
 const green=await runLesson();assert.equal(green.status,'passed',green.output);assert.match(green.runner,/内置 Node/);assert.equal(green.sourceHash,lessonEdit.afterHash);await lesson('revert',{changeId:lessonEdit.id});assert.equal((await lesson('read',{path:originalLesson.path})).hash,originalLesson.hash);const red=await runLesson();assert.equal(red.status,'failed');assert.equal(red.exitCode,1);assert.match(red.output,/ERR_ASSERTION/);
 console.log(JSON.stringify({packagedBackend:'passed',platform:process.platform,arch:process.arch,authorizedLocalService:true,sourceArchive:true,actualPdfWorker:true,sourceDevelopment:true,offlineSourceTutorial:true,noInheritedKeys:true,paidModelCalls:0}));
}finally{
 if(child.exitCode===null&&!child.signalCode){const stopped=new Promise(resolve=>child.once('exit',resolve));if(child.connected)child.send({type:'relay-shutdown'});else child.kill();const timeout=setTimeout(()=>child.kill('SIGKILL'),6000);await stopped;clearTimeout(timeout);}
 await fs.rm(root,{recursive:true,force:true});
}
