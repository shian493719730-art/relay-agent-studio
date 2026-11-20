// SPDX-License-Identifier: AGPL-3.0-only
const {app,BrowserWindow,Menu,dialog,shell,protocol,session}=require('electron');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {createHash}=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const fs=require('node:fs');
const path=require('node:path');
const {isWorkspaceUrl,externalUrl,backendEnvironment,proxyRequest,proxyDevelopmentPreview}=require('./runtime.cjs');
const dataDirectory=process.env.RELAY_DESKTOP_USER_DATA?path.resolve(process.env.RELAY_DESKTOP_USER_DATA):path.join(app.getPath('appData'),'Relay Agent Studio');
app.setName('Relay');app.setPath('userData',dataDirectory);
protocol.registerSchemesAsPrivileged(['relay','relay-preview'].map(scheme=>({scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}})));
let window,backend,base,quitting=false,exiting=false;
const token=randomBytes(32).toString('hex');
const runtimeRoot=path.join(app.getAppPath(),'desktop-runtime');
const prefs={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true};
const repository='https://github.com/shian493719730-art/relay-agent-studio';
async function openExternal(value){const u=externalUrl(value);if(u)await shell.openExternal(u);}
async function exportDevelopmentArtifact(task,id){
 const r=await fetch(base+'/api/studio/development/artifacts/'+task+'/'+id,{headers:{'X-Relay-Desktop':token}});if(!r.ok)throw new Error('产物已不可用，请刷新开发步骤。');
 const name=decodeURIComponent(r.headers.get('x-relay-artifact-name')||'project-build.zip'),expected=r.headers.get('x-relay-artifact-sha256');
 const choice=await dialog.showSaveDialog(window,{title:'保存本次真实构建产物',defaultPath:path.basename(name)});if(choice.canceled||!choice.filePath){await r.body?.cancel();return;}
 const temporary=choice.filePath+'.relay-'+randomBytes(8).toString('hex')+'.tmp',sha=createHash('sha256');
 try{await pipeline(Readable.fromWeb(r.body),new Transform({transform(chunk,encoding,done){sha.update(chunk);done(null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));if(expected!==sha.digest('hex'))throw new Error('产物校验失败，没有替换目标文件。');await fs.promises.rename(temporary,choice.filePath);}finally{await fs.promises.rm(temporary,{force:true});}
}
function secureContents(contents){
 contents.on('will-navigate',(event,url)=>{if(!isWorkspaceUrl(url)){event.preventDefault();void openExternal(url);}});
 contents.setWindowOpenHandler(({url})=>{
  if(isWorkspaceUrl(url)&&/^\/development-export\/[-a-f0-9]{36}\/[-a-f0-9]{36}$/.test(new URL(url).pathname)){const [, ,task,id]=new URL(url).pathname.split('/');void exportDevelopmentArtifact(task,id).catch(e=>dialog.showErrorBox('产物未保存',e.message));return{action:'deny'};}
  if(isWorkspaceUrl(url)&&/^\/development-preview\/[-a-f0-9]{36}$/.test(new URL(url).pathname)){
   const id=new URL(url).pathname.split('/').pop(),child=new BrowserWindow({title:'Relay · 项目实际预览',width:1100,height:800,parent:window,webPreferences:prefs});
   child.webContents.on('will-navigate',(event,next)=>{if(!next.startsWith('relay-preview://'+id+'/'))event.preventDefault();});child.webContents.setWindowOpenHandler(()=>({action:'deny'}));void child.loadURL('relay-preview://'+id+'/');return{action:'deny'};
  }
  if(isWorkspaceUrl(url)&&new URL(url).pathname==='/license'){return{action:'allow',overrideBrowserWindowOptions:{width:920,height:720,webPreferences:prefs}};}
  void openExternal(url);return{action:'deny'};
 });
 contents.on('will-attach-webview',event=>event.preventDefault());
}
async function sourceCopy(){const result=await dialog.showSaveDialog(window,{title:'保存本版本对应源码',defaultPath:'Relay-'+app.getVersion()+'-source.zip',filters:[{name:'ZIP 源码包',extensions:['zip']}]});if(!result.canceled&&result.filePath)await fs.promises.copyFile(path.join(runtimeRoot,'source.zip'),result.filePath);}
function legalWindow(){const child=new BrowserWindow({title:'Relay · 源码与开源许可',width:920,height:720,parent:window,webPreferences:prefs,autoHideMenuBar:true});secureContents(child.webContents);void child.loadURL('relay://workspace/license');}
function menu(){const items=[
 ...(process.platform==='darwin'?[{label:'Relay',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),
 {label:'文件',submenu:[{label:'打开工作数据文件夹',click:()=>shell.openPath(dataDirectory)},{label:'保存本版本对应源码…',click:()=>sourceCopy().catch(e=>dialog.showErrorBox('源码未保存',e.message))},{type:'separator'},{role:process.platform==='darwin'?'close':'quit'}]},
 {role:'editMenu',label:'编辑'},{role:'viewMenu',label:'视图'},{role:'windowMenu',label:'窗口'},
 {label:'帮助',submenu:[{label:'关于 Relay',click:()=>app.showAboutPanel()},{label:'开源许可与版权',click:legalWindow},{label:'项目说明与使用帮助',click:()=>openExternal(repository+'#readme')},{label:'查看新版本',click:()=>openExternal(repository+'/releases')}]}
 ];Menu.setApplicationMenu(Menu.buildFromTemplate(items));}
function createWindow(){
 window=new BrowserWindow({title:'Relay',width:1380,height:900,minWidth:680,minHeight:480,backgroundColor:'#F5F7FA',show:false,webPreferences:prefs,icon:path.join(__dirname,'icon.png')});
 secureContents(window.webContents);window.once('ready-to-show',()=>window.show());
 window.on('closed',()=>{window=null;});void window.loadURL('relay://workspace/design-v2/');
}
async function startBackend(){
 fs.mkdirSync(path.join(dataDirectory,'service'),{recursive:true,mode:0o700});fs.mkdirSync(path.join(dataDirectory,'logs'),{recursive:true,mode:0o700});
 const log=path.join(dataDirectory,'logs','service.log');try{if(fs.statSync(log).size>1000000)fs.renameSync(log,log+'.previous');}catch{}
 const logStream=fs.createWriteStream(log,{flags:'a',mode:0o600});
 backend=spawn(process.execPath,[path.join(runtimeRoot,'server','index.mjs')],{cwd:runtimeRoot,env:backendEnvironment(process.env,{runtimeRoot,dataRoot:path.join(dataDirectory,'service'),token}),stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 backend.stdout.pipe(logStream,{end:false});backend.stderr.pipe(logStream,{end:false});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('本机服务启动超时，请查看工作数据目录中的 logs/service.log。')),30000);
  const fail=e=>{clearTimeout(timer);reject(e)};backend.once('error',fail);backend.once('exit',code=>fail(new Error('本机服务已退出（'+code+'）。')));
  backend.on('message',message=>{if(message?.type==='relay-ready'&&Number.isInteger(message.port)&&message.port>0){base='http://127.0.0.1:'+message.port;clearTimeout(timer);resolve();}});
 });
 backend.on('exit',()=>{logStream.end();if(!quitting){dialog.showErrorBox('Relay 本机服务已停止','已有数据保留。请退出并重新打开 Relay，未完成执行不会自动恢复。');app.quit();}});
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
 app.whenReady().then(async()=>{
  app.setAboutPanelOptions({applicationName:'Relay',applicationVersion:app.getVersion(),copyright:'Copyright (c) 2026 Relay contributors',credits:'AGPL-3.0-only · 许可与本版本对应源码见“帮助”菜单。\nRelay 品牌不授予官方背书或仿冒权。',website:repository,iconPath:path.join(__dirname,'icon.png')});
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(permission==='clipboard-sanitized-write'&&isWorkspaceUrl(wc.getURL())));session.defaultSession.setPermissionCheckHandler((wc,permission)=>permission==='clipboard-sanitized-write'&&!!wc&&isWorkspaceUrl(wc.getURL()));
  await startBackend();
  protocol.handle('relay',request=>proxyRequest(request,base,token).catch(error=>{fs.appendFileSync(path.join(dataDirectory,'logs','desktop.log'),new Date().toISOString()+' '+error.name+': '+error.message+'\n');return new Response('本机服务不可用，请重新打开 Relay。',{status:503});}));
  protocol.handle('relay-preview',request=>proxyDevelopmentPreview(request,base,token).catch(()=>new Response('预览尚未启动或已停止。',{status:503})));
  menu();createWindow();app.on('activate',()=>{if(!window)createWindow();});
 }).catch(error=>{dialog.showErrorBox('Relay 未能启动',error.message);app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{
  if(exiting)return;event.preventDefault();if(quitting)return;quitting=true;
  session.defaultSession.flushStorageData();
  const finish=()=>{exiting=true;app.quit();};
  if(!backend||backend.exitCode!==null||backend.signalCode){finish();return;}
  const timer=setTimeout(()=>{backend.kill('SIGKILL');finish();},7000);backend.once('exit',()=>{clearTimeout(timer);finish();});
  if(backend.connected)backend.send({type:'relay-shutdown'});else backend.kill('SIGTERM');
 });
}
