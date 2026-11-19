import fs from 'node:fs';
import path from 'node:path';

export class Artifacts {
  readonly root: string;
  constructor(root: string) { fs.mkdirSync(root,{recursive:true,mode:0o700}); this.root=fs.realpathSync(root); }
  resolve(name: string) {
    if (!/^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,99}$/u.test(name) || name.includes('..')) throw new Error('文件名只能包含文字、数字、空格、下划线、连字符和扩展名。');
    const resolved = path.join(this.root, name);
    if(fs.lstatSync(resolved,{throwIfNoEntry:false})?.isSymbolicLink()) throw new Error('不允许访问符号链接。');
    return resolved;
  }
  list() { return fs.readdirSync(this.root).filter(name => { try { return fs.lstatSync(this.resolve(name)).isFile(); } catch { return false; } }).map(name=>({name,size:fs.statSync(this.resolve(name)).size})); }
  read(name: string) { const p=this.resolve(name); if(fs.statSync(p).size>200_000) throw new Error('文件超出读取大小限制。'); return fs.readFileSync(p,'utf8'); }
  write(name: string, content: string) { const p=this.resolve(name); if(Buffer.byteLength(content)>200_000) throw new Error('单个产物最大为 200KB。'); fs.writeFileSync(p,content,{mode:0o600}); return {name,bytes:Buffer.byteLength(content)}; }
}
