import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {Store,projectRoot} from '../server/store.ts';
import {Artifacts} from '../server/artifacts.ts';
import {pdfFixture} from './document-fixtures.ts';

test('real HTTP server downloads artifacts from hidden data folders and blocks secret paths and cross-origin requests',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'.relay-http-'));
  const store=new Store(root);const id='http-fixture';
  store.runs.push({id,title:'HTTP 验证',prompt:'fixture',context:'',mode:'collaborate',status:'completed',createdAt:new Date().toISOString(),settings:store.settings,steps:[],events:[],result:'# 已交付'});store.save();
  new Artifacts(path.join(root,'runs',id,'artifacts')).write('final-result.md','# 已交付');
  const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as net.AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:projectRoot,env:{...process.env,PORT:String(port),NODE_ENV:'production',RELAY_DATA_DIR:root,OPENAI_API_KEY:'',ANTHROPIC_API_KEY:''},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  try{
    const deadline=Date.now()+10000;
    while(true){try{if((await fetch(base+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw new Error('HTTP test server did not start');await new Promise(resolve=>setTimeout(resolve,40));}
    const response=await fetch(`${base}/api/runs/${id}/artifacts/final-result.md`);
    assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')||'',/attachment/);assert.equal(await response.text(),'# 已交付');
    assert.equal((await fetch(base+'/.env.local')).status,403);
    assert.equal((await fetch(base+'/api/bootstrap',{headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await fetch(`${base}/api/runs/${id}/artifacts/not-found.md`)).status,404);
    const bootstrap=await(await fetch(base+'/api/bootstrap')).text();assert.doesNotMatch(bootstrap,/sk-(proj|ant)-/);
    const browser=async(body:unknown)=>fetch(base+'/api/studio/browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const created=await browser({action:'create',state:{boards:[{id:'local'}],projects:[]},history:{undo:[],redo:[]},localOnly:true});assert.equal(created.status,200);const visual=await created.json();
    const wrong=await browser({action:'pull',id:visual.id,token:'00000000-0000-4000-8000-000000000000'});assert.equal(wrong.status,404);
    const blobUrl=base+'/api/studio/browser/blob/'+visual.id+'/fixture',blobHeaders={'Content-Type':'application/octet-stream','X-Relay-Visual':visual.token};
    assert.equal((await fetch(blobUrl,{method:'PUT',headers:blobHeaders,body:Buffer.from('exact local file')})).status,200);assert.equal(await(await fetch(blobUrl,{headers:blobHeaders})).text(),'exact local file');
    assert.equal((await browser({action:'gesture',id:visual.id,token:visual.token,key:'unsafe',epoch:0,label:'unsafe',gesture:{kind:'evaluate',function:'process.exit()'}})).status,400);
    assert.equal((await browser({action:'close',id:visual.id,token:visual.token})).status,200);
    const badSettings=await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...store.settings,agents:store.settings.agents.slice(0,2)})});assert.equal(badSettings.status,400);
    const library=async(body:unknown)=>fetch(base+'/api/studio/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const found=await library({action:'search',query:'Excel'});assert.equal(found.status,200);assert.ok((await found.json()).entries.some((e:any)=>e.id==='anthropics/skills:skills/xlsx'));
    const recommended=await library({action:'recommend',project:{goal:'调试并验证代码'}});assert.equal(recommended.status,200);assert.equal((await recommended.json()).mode,'local');
    assert.equal((await library({action:'search',page:-1})).status,400);
    assert.equal((await library({action:'semantic',project:{goal:''}})).status,400);
    const status=await(await library({action:'status'})).json();assert.ok(status.revision);assert.equal(status.cancellable,false);
    const models=await fetch(base+'/api/studio/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})});assert.equal(models.status,200);const modelData=await models.json();assert.equal(modelData.vendors.length,6);assert.match(modelData.warning,/不稳定/);assert.ok(modelData.profiles.every((c:any)=>!Object.hasOwn(c,'apiKey')));
    const missingDocument=await fetch(base+'/api/studio/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',id:'0'.repeat(64)})});assert.equal(missingDocument.status,404);
    const uploadDoc=await fetch(base+'/api/studio/documents/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Relay-File':encodeURIComponent(JSON.stringify({fileId:'http-doc',boardId:'http-board',name:'rule.pdf'}))},body:new Uint8Array(pdfFixture('HTTP-PDF-TEXT-ONLY'))});assert.equal(uploadDoc.status,201);const doc=await uploadDoc.json();
    const documentAction=async(action:string)=>fetch(base+'/api/studio/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:doc.id})});
    let reading=await(await documentAction('read')).json();for(let i=0;i<100&&reading.status==='reading';i++){await new Promise(r=>setTimeout(r,25));reading=await(await documentAction('status')).json();}assert.equal(reading.status,'ready');assert.match(reading.segments[0].text,/HTTP-PDF-TEXT-ONLY/);
    assert.equal((await fetch(base+'/api/studio/documents/upload',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/octet-stream'},body:'blocked'})).status,403);
    const invalidModel=await fetch(base+'/api/studio/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',connection:{}})});assert.equal(invalidModel.status,400);
  }finally{
    child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(root,{recursive:true,force:true});
  }
});
