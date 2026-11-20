// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type {RequestHandler} from 'express';
type Artifact={file:string;name:string;sha256:string};
// The resolver owns the exact file; callers cannot pass a filesystem path.
// Source deployments intentionally keep these files inside a hidden .data folder.
export function developmentArtifactHandler(resolve:(task:string,id:string)=>Artifact):RequestHandler{
 return(req,res,next)=>{try{const a=resolve(String(req.params.task),String(req.params.id));res.type(path.basename(a.name));res.setHeader('X-Relay-Artifact-Name',encodeURIComponent(path.basename(a.name)));res.setHeader('X-Relay-Artifact-Sha256',a.sha256);if(req.query.view==='1'&&/\.(?:jpe?g|png)$/i.test(a.name))res.sendFile(a.file,{dotfiles:'allow'});else res.download(a.file,path.basename(a.name),{dotfiles:'allow'});}catch(e){next(e);}};
}
