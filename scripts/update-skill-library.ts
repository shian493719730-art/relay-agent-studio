import fs from 'node:fs/promises';
import {refreshSkillLibrary,applyConnectorTrees} from '../server/library-refresh.ts';
const file=process.argv[2]==='--apply-trees'?process.argv[3]:null;
const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
const status=file?await applyConnectorTrees(JSON.parse(await fs.readFile(file,'utf8'))):await refreshSkillLibrary({signal:controller.signal});
console.log(JSON.stringify({state:status.state,sources:status.sources,entries:status.entries,unavailableSources:status.unavailableSources,revision:status.revision,results:status.results},null,2));
