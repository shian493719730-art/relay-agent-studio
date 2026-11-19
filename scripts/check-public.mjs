import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw new Error('No tracked source files to inspect.');
const bad=[];
const forbidden=/^(?:\.data|\.learning-loop|\.agents|\.playwright-mcp|node_modules|dist)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/;
const credential=/(?:sk-ant-[A-Za-z0-9_-]{30,}|sk-proj-[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for(const file of files){
 if(file!=='.env.example'&&forbidden.test(file))bad.push({file,reason:'private/generated path'});
 const p=path.resolve(file);if(!fs.existsSync(p)||!fs.statSync(p).isFile())continue;
 if(/\.(?:png|jpe?g|gif|mp4|ico|woff2?)$/i.test(file))continue;
 const body=fs.readFileSync(p,'utf8');
 if(credential.test(body))bad.push({file,reason:'credential-shaped value'});
 if(/\/(?:Users|home)\/[^/\s]+\/(?:Desktop|Documents|Library|\.codex)\//.test(body))bad.push({file,reason:'personal absolute path'});
}
if(bad.length){console.error(JSON.stringify({result:'failed',findings:bad},null,2));process.exitCode=1;}
else console.log(JSON.stringify({result:'passed',trackedFiles:files.length,scope:'basic publication hygiene; not a full secret/security audit'}));
