// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectRoot} from './store.ts';
export const relayCopyPath='resources/ui/assistant-copy.json';
export const relayCopyOriginal=fs.readFileSync(path.join(projectRoot,relayCopyPath),'utf8');
export const relayCopyHash=createHash('sha256').update(relayCopyOriginal).digest('hex');
export function relayPractice(expected:string){
 return{source:relayCopyPath,baselineHash:relayCopyHash,commands:{test:['--test','tests/relay-welcome.test.mjs']},readonly:['package.json','requirements.json','tests/relay-welcome.test.mjs'],files:{
  [relayCopyPath]:relayCopyOriginal,
  'requirements.json':JSON.stringify({welcome:expected},null,2)+'\n',
  'package.json':JSON.stringify({name:'relay-selfdev-lesson',private:true,type:'module',scripts:{test:'node --test tests/relay-welcome.test.mjs'}},null,2)+'\n',
  'tests/relay-welcome.test.mjs':`import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst copy=JSON.parse(fs.readFileSync('${relayCopyPath}','utf8'));\nconst goal=JSON.parse(fs.readFileSync('requirements.json','utf8'));\ntest('Relay助手开场说明符合用户需求',()=>assert.equal(copy.welcome,goal.welcome));\n`
 }};
}
