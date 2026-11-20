// SPDX-License-Identifier: AGPL-3.0-only
// Keep npm descendants owned even when the service crashes or disconnects.
import {spawn} from 'node:child_process';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const node=env.RELAY_DEVELOPMENT_NODE,npm=env.RELAY_DEVELOPMENT_NPM;delete env.RELAY_DEVELOPMENT_NODE;delete env.RELAY_DEVELOPMENT_NPM;
let child,stopping=false,timer;
function stop(){if(stopping)return;stopping=true;if(!child?.pid)return;try{process.kill(-child.pid,'SIGTERM')}catch{}timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},1500);}
process.on('message',m=>{if(m?.type==='stop')stop()});process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child=spawn(node&&npm?node:'npm',node&&npm?[npm,...process.argv.slice(2)]:process.argv.slice(2),{env,cwd:process.cwd(),detached:true,stdio:['ignore','inherit','inherit']});
child.once('error',e=>{console.error(e.message);process.exitCode=1;});
child.once('close',code=>{if(timer)clearTimeout(timer);if(stopping){try{process.kill(-child.pid,'SIGKILL')}catch{}}if(process.connected)process.disconnect();process.exit(code??1);});
