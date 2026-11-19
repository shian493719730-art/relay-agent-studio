// SPDX-License-Identifier: AGPL-3.0-only
const path=require('node:path');
const {spawnSync}=require('node:child_process');
module.exports=async function afterPack(context){
 if(context.electronPlatformName!=='darwin')return;
 const bundle=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
 // Apple QA1940: only remove Finder/resource-fork build metadata. Do not remove quarantine or weaken Gatekeeper.
 for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork'])spawnSync('/usr/bin/xattr',['-dr',attribute,bundle],{stdio:'ignore'});
};
