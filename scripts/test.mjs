import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.ts')).sort().map(name => 'tests/' + name);
const child = spawn(process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...process.argv.slice(2), ...files],
  {stdio: 'inherit'});
child.once('error', error => {console.error(error.message); process.exitCode = 1;});
child.once('exit', code => {process.exitCode = code ?? 1;});
