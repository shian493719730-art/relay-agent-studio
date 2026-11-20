// SPDX-License-Identifier: AGPL-3.0-only
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bundleDevelopmentToolchain} from './bundle-development-toolchain.mjs';
const root=process.cwd(),out=path.join(root,'desktop-runtime');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(path.join(out,'server'),{recursive:true});
await build({entryPoints:['server/index.ts'],outfile:path.join(out,'server/index.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',target:'node24',sourcemap:false});
await fs.copyFile('server/development-runner.mjs',path.join(out,'server/development-runner.mjs'));
await fs.copyFile('server/document-worker.mjs',path.join(out,'server/document-worker.mjs'));
for(const name of ['dist','resources'])await fs.cp(name,path.join(out,name),{recursive:true});
await bundleDevelopmentToolchain(out);
for(const name of ['LICENSE','NOTICE.md','TRADEMARKS.md','THIRD_PARTY_NOTICES.md'])await fs.copyFile(name,path.join(out,name));
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));await fs.writeFile(path.join(out,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,type:'module',license:pkg.license}));
// A source snapshot is generated from the reviewed index, never from runtime/user-data directories.
const tree=execFileSync('git',['write-tree'],{encoding:'utf8'}).trim();
execFileSync('git',['archive','--format=zip','--prefix=relay-source/','--output='+path.join(out,'source.zip'),tree]);
await fs.writeFile(path.join(out,'build-info.json'),JSON.stringify({version:pkg.version,sourceTree:tree,builtAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({runtime:'desktop-runtime',version:pkg.version,sourceTree:tree,sourceIncluded:true}));
