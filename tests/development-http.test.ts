import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import express from 'express';
import {developmentArtifactHandler} from '../server/development-http.ts';
test('actual artifact HTTP responses serve images and ZIP bytes from hidden private storage with correct MIME, names and checksums',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-artifact-')),hidden=path.join(root,'.data','outputs');await fs.mkdir(hidden,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),zip=Buffer.from('PK\x03\x04test-download');const files={image:{name:'preview.png',bytes:png},zip:{name:'project-build.zip',bytes:zip}};
 for(const[id,a]of Object.entries(files))await fs.writeFile(path.join(hidden,id),a.bytes);
 const app=express();app.get('/artifacts/:task/:id',developmentArtifactHandler((task,id)=>{if(task!=='owned'||!Object.hasOwn(files,id))throw Object.assign(new Error('Not found'),{status:404});const a=files[id as keyof typeof files];return{file:path.join(hidden,id),name:a.name,sha256:createHash('sha256').update(a.bytes).digest('hex')}}));app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a==='object');const base='http://127.0.0.1:'+a.port;
 try{const shown=await fetch(base+'/artifacts/owned/image?view=1');assert.equal(shown.status,200);assert.match(shown.headers.get('content-type')||'',/^image\/png/);assert.deepEqual(Buffer.from(await shown.arrayBuffer()),png);const download=await fetch(base+'/artifacts/owned/zip?file=/etc/passwd');assert.equal(download.status,200);assert.match(download.headers.get('content-disposition')||'',/project-build.zip/);assert.equal(download.headers.get('x-relay-artifact-name'),'project-build.zip');assert.equal(download.headers.get('x-relay-artifact-sha256'),createHash('sha256').update(zip).digest('hex'));assert.deepEqual(Buffer.from(await download.arrayBuffer()),zip);assert.equal((await fetch(base+'/artifacts/foreign/image')).status,404);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await fs.rm(root,{recursive:true,force:true});}
});
