// SPDX-License-Identifier: AGPL-3.0-only
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
module.exports=async function afterPack(context){
 if(context.electronPlatformName!=='darwin')return;
 const bundle=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
 // Apple QA1940: remove build metadata and provenance attributes before signing.
 for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork','com.apple.provenance'])spawnSync('/usr/bin/xattr',['-dr',attribute,bundle],{stdio:'ignore'});
 const node=path.join(bundle,'Contents/Resources/app/desktop-runtime/toolchain/bin/node');if(fs.existsSync(node)){const signed=spawnSync('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',node],{encoding:'utf8'});if(signed.status!==0)throw new Error('Bundled Node signing failed: '+signed.stderr);const meta=path.join(path.dirname(node),'../info.json'),info=JSON.parse(fs.readFileSync(meta,'utf8'));info.signedNodeSHA256=createHash('sha256').update(fs.readFileSync(node)).digest('hex');fs.writeFileSync(meta,JSON.stringify(info,null,2));}
};
