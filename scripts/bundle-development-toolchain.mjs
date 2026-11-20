// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Supported desktop releases use setup-node's official distribution. Keep its
// executable, npm and complete license notices together, outside project source.
export async function bundleDevelopmentToolchain(runtime){
 if(!['darwin','linux'].includes(process.platform))throw new Error('Bundled development tools are maintained for macOS/Linux only.');
 const node=await fs.realpath(process.execPath),prefix=path.dirname(path.dirname(node));
 const candidates=[process.env.RELAY_NODE_LICENSE,path.join(prefix,'LICENSE'),path.join(prefix,'NODE-LICENSE'),path.join(prefix,'share/doc/node/LICENSE'),path.join(prefix,'share/doc/nodejs/LICENSE')].filter(Boolean);
 let license;for(const candidate of candidates)try{license=await fs.readFile(candidate);break;}catch{}
 if(!license)throw new Error('Node LICENSE not found. Build with the official Node distribution or set RELAY_NODE_LICENSE to its complete license file.');
 let npm=process.env.npm_execpath?path.resolve(path.dirname(process.env.npm_execpath),'..'):'';
 try{if(JSON.parse(await fs.readFile(path.join(npm,'package.json'),'utf8')).name!=='npm')npm='';}catch{npm='';}
 if(!npm){const npmRoot=execFileSync('npm',['root','-g'],{encoding:'utf8',timeout:10000}).trim();npm=path.join(npmRoot,'npm');}
 const out=path.join(runtime,'toolchain');
 await fs.mkdir(path.join(out,'bin'),{recursive:true});await fs.copyFile(node,path.join(out,'bin/node'));await fs.chmod(path.join(out,'bin/node'),0o755);await fs.writeFile(path.join(out,'NODE-LICENSE'),license);
 await fs.cp(npm,path.join(out,'npm'),{recursive:true,filter:p=>!['.npmrc','npmrc','.env','.cache','_logs'].includes(path.basename(p))});
 for(const name of ['npm','npx'])await fs.writeFile(path.join(out,'bin',name),'#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../npm/bin/'+name+'-cli.js" "$@"\n',{mode:0o755});
 const nodeVersion=execFileSync(path.join(out,'bin/node'),['--version'],{encoding:'utf8'}).trim(),npmVersion=execFileSync(path.join(out,'bin/node'),[path.join(out,'npm/bin/npm-cli.js'),'--version'],{encoding:'utf8'}).trim();
 await fs.writeFile(path.join(out,'info.json'),JSON.stringify({node:nodeVersion,npm:npmVersion,platform:process.platform,arch:process.arch,nodeSourceSHA256:createHash('sha256').update(await fs.readFile(path.join(out,'bin/node'))).digest('hex')},null,2));
 console.log(JSON.stringify({developmentToolchain:'bundled',node:nodeVersion,npm:npmVersion,platform:process.platform,arch:process.arch,licensesIncluded:true}));
}
