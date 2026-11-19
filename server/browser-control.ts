import {randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {desktopAccess} from './desktop-access.ts';

// The public API accepts native gestures, never JavaScript, filesystem paths or an arbitrary MCP tool.
export const gestureSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('click'),target:z.string().min(1).max(1000),doubleClick:z.boolean().optional()}),
 z.object({kind:z.literal('type'),target:z.string().min(1).max(1000),text:z.string().max(100000)}),
 z.object({kind:z.literal('select'),target:z.string().min(1).max(1000),values:z.array(z.string().max(1000)).min(1).max(20)}),
 z.object({kind:z.literal('drag'),startTarget:z.string().min(1).max(1000),endTarget:z.string().min(1).max(1000)}),
 z.object({kind:z.literal('draw'),points:z.array(z.tuple([z.number().finite().min(0).max(10000),z.number().finite().min(0).max(10000)])).min(3).max(128)}),
 z.object({kind:z.literal('key'),key:z.enum(['Tab','Enter','Escape'])}),
 z.object({kind:z.literal('snapshot')}),
]);
export type Gesture=z.infer<typeof gestureSchema>;
export function mcpGesture(g:Gesture){switch(g.kind){
 case'click':return{name:'browser_click',arguments:{target:g.target,doubleClick:g.doubleClick||false}};
 case'type':return{name:'browser_type',arguments:{target:g.target,text:g.text}};
 case'select':return{name:'browser_select_option',arguments:{target:g.target,values:g.values}};
 case'drag':return{name:'browser_drag',arguments:{startTarget:g.startTarget,endTarget:g.endTarget}};
 case'draw':return{name:'browser_mouse_move_xy',arguments:{x:g.points[0][0],y:g.points[0][1]}};
 case'key':return{name:'browser_press_key',arguments:{key:g.key}};
 case'snapshot':return{name:'browser_snapshot',arguments:{depth:5}};
}}
export class BrowserControlError extends Error{constructor(message:string,public status=409){super(message)}}
type Mcp={callTool(input:{name:string;arguments:Record<string,unknown>}):Promise<any>;close():Promise<void>};
type Event={seq:number;time:number;kind:string;label:string;key?:string;status:string};
type Session={id:string;token:string;origin:string;state:any;history:{undo:string[];redo:string[]};blobs:Map<string,Buffer>;client?:Mcp;closeServer?:()=>Promise<void>;status:string;epoch:number;ack:number;revision:number;ready:boolean;busy:boolean;events:Event[];receipts:Map<string,any>;inflight:Map<string,Promise<any>>;lastSeen:number;localOnly:boolean;command?:{id:string;name:string;text?:string};frame?:string;frameTask?:Promise<void>};
const validState=z.object({projects:z.array(z.unknown()).max(2000),boards:z.array(z.unknown()).min(1).max(500)}).passthrough();
const historySchema=z.object({undo:z.array(z.string().max(10000000)).max(80),redo:z.array(z.string().max(10000000)).max(80)});
const frameSchema=z.object({state:validState,history:historySchema,ack:z.number().int().nonnegative(),commandAck:z.string().uuid().nullable().optional(),viewport:z.object({width:z.number().int().min(100).max(10000),height:z.number().int().min(100).max(10000)}).optional()});
export class BrowserControl{
 private session?:Session;
 constructor(private factory?:(origin:string)=>Promise<Mcp>){}
 private event(s:Session,kind:string,label:string,status=s.status,key?:string){s.events.push({seq:(s.events.at(-1)?.seq||0)+1,time:Date.now(),kind,label,status,key});if(s.events.length>400)s.events.shift()}
 private get(id:string,token:string){const s=this.session;const a=Buffer.from(token||''),b=Buffer.from(s?.token||'');if(!s||s.id!==id||a.length!==b.length||!timingSafeEqual(a,b))throw new BrowserControlError('可视窗口会话不存在或已经结束',404);return s}
 status(s=this.session){return s?{id:s.id,status:s.status,epoch:s.epoch,ack:s.ack,revision:s.revision,ready:s.ready,busy:s.busy,localOnly:s.localOnly,events:s.events,lastSeen:s.lastSeen,command:s.command,engine:'Playwright MCP 0.0.86'}:{status:'disconnected'}}
 async action(input:any,origin:string){
  if(input.action==='create'){
   if(this.session)throw new BrowserControlError('已有可视窗口，请先返回或结束该窗口');
   const data=z.object({state:validState,history:historySchema,localOnly:z.boolean().default(false)}).parse(input);
   if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw new BrowserControlError('只能控制本软件的本机窗口',400);
   const s:Session={id:randomUUID(),token:randomUUID(),origin,state:data.state,history:data.history,blobs:new Map(),status:'opening',epoch:0,ack:0,revision:0,ready:false,busy:false,events:[],receipts:new Map(),inflight:new Map(),lastSeen:Date.now(),localOnly:data.localOnly};this.session=s;
   this.event(s,'session','正在准备同一画板的可视窗口');return{...this.status(s),token:s.token};
  }
  const s=this.get(z.string().uuid().parse(input.id),z.string().uuid().parse(input.token));
  if(s.origin!==origin)throw new BrowserControlError('会话来源不匹配',403);
  if(input.action==='status')return this.status(s);
  if(input.action==='command'){
   const d=z.object({name:z.enum(['demo','continue','steer','edit-demo-note']),text:z.string().trim().min(1).max(4000).optional()}).parse(input);
   if((d.name==='demo'||d.name==='edit-demo-note')&&!s.localOnly)throw new BrowserControlError('此窗口不是本地演练');
   if(d.name==='steer'&&s.localOnly)throw new BrowserControlError('本地演练不分析开放式目标；可以直接修改未执行说明笔记');
   if(['steer','edit-demo-note'].includes(d.name)&&!d.text)throw new BrowserControlError('请先写下修改内容');
   if(!s.ready)throw new BrowserControlError('工作窗口尚未就绪，请稍候');if(s.command)throw new BrowserControlError('上一条操作尚未确认，请稍候再继续',409);s.command={id:randomUUID(),...d};return this.status(s);
  }
  if(input.action==='frame'){
   if(!s.busy&&s.client){s.busy=true;s.frameTask=(async()=>{try{const r=await s.client!.callTool({name:'browser_take_screenshot',arguments:{type:'jpeg'}});const img=r.content?.find((c:any)=>c.type==='image');if(img)s.frame='data:'+img.mimeType+';base64,'+img.data;}finally{s.busy=false;s.frameTask=undefined}})();await s.frameTask}
   return{frame:s.frame||null};
  }
  if(input.action==='pull')return{...this.status(s),state:s.state,history:s.history,files:[...s.blobs.keys()],viewport:s.state.visualViewport||null};
  if(input.action==='heartbeat'){
   const d=frameSchema.parse(input);s.state=d.state;if(d.viewport)s.state.visualViewport=d.viewport;s.history=d.history;s.ack=d.ack;if(d.commandAck===s.command?.id)s.command=undefined;s.revision++;s.lastSeen=Date.now();s.ready=true;return this.status(s);
  }
  if(input.action==='open'){
   try{
    if(s.client)return this.status(s);
    if(this.factory)s.client=await this.factory(origin);
    else{
     // Loading the browser engine is unnecessary for the normal workbench and document services.
     const [{createConnection},{Client},{InMemoryTransport}]=await Promise.all([import('@playwright/mcp'),import('@modelcontextprotocol/sdk/client/index.js'),import('@modelcontextprotocol/sdk/inMemory.js')]);
     const server=await createConnection({browser:{browserName:'chromium',isolated:true,launchOptions:{channel:'chrome',headless:false},contextOptions:{viewport:{width:1280,height:820},...(desktopAccess.enabled?{storageState:desktopAccess.storageState(origin)}:{})}},network:{allowedOrigins:[origin]},capabilities:['vision'],timeouts:{action:4000,navigation:15000},snapshot:{mode:'none'},imageResponses:'allow'});
     const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);const client=new Client({name:'relay-visual-controller',version:'1.0.0'});await client.connect(left);s.client=client as Mcp;s.closeServer=()=>server.close();
    }
    const r=await s.client.callTool({name:'browser_navigate',arguments:{url:origin+'/design-v2/?v=20#relay-visual='+s.id+'.'+s.token}});if(r.isError)throw new Error(this.errorText(r));
    s.status='human';this.event(s,'session','可视窗口已打开，当前由你操作');
    return this.status(s);
   }catch(e){s.status='failed';this.event(s,'error','浏览器未能打开；可返回原画板重试');throw new BrowserControlError(e instanceof Error?e.message:String(e),503)}
  }
  if(input.action==='settle'){
   if(input.epoch===s.epoch&&s.status==='ai'){s.epoch++;s.status='paused';this.event(s,'control','本段执行已结束，成果和进度已保留')}
   return this.status(s);
  }
  if(input.action==='pause'||input.action==='takeover'){
   s.epoch++;s.command=undefined;s.status=input.action==='takeover'?'human':'paused';this.event(s,'control',input.action==='takeover'?'你已接手，AI不再执行后续动作':'正在暂停，当前单次动作结束后保留结果');return this.status(s);
  }
  if(input.action==='resume'){
   if(s.frameTask)await s.frameTask;
   if(input.epoch!==undefined&&input.epoch!==s.epoch)throw new BrowserControlError('这条继续指令已被后来的暂停取代');
   if(!s.client||!s.ready)throw new BrowserControlError('可视窗口尚未就绪');
   if(s.busy)throw new BrowserControlError('当前单次动作还在结束，请稍候');
   s.status='ai';this.event(s,'control','AI继续，使用最新软件状态与要求');return this.status(s);
  }
  if(input.action==='gesture'){
   const d=z.object({key:z.string().min(1).max(180),epoch:z.number().int(),label:z.string().min(1).max(160),gesture:gestureSchema}).parse(input);
   // A completed native gesture is returned exactly once even if the HTTP reply was lost.
   if(s.receipts.has(d.key))return s.receipts.get(d.key);
   if(s.inflight.has(d.key))return s.inflight.get(d.key);
   if(s.frameTask)await s.frameTask;
   if(s.status!=='ai'||s.epoch!==d.epoch)throw new BrowserControlError('你已暂停或接手，没有执行此动作');
   if(s.busy)throw new BrowserControlError('浏览器正在执行另一动作');
   if(Date.now()-s.lastSeen>6000)throw new BrowserControlError('受控页面失去连接，已停止执行');
   if(!s.client)throw new BrowserControlError('MCP尚未连接');
   const task=(async()=>{
    s.busy=true;this.event(s,'gesture',d.label,'running',d.key);
    try{
     let r;if(d.gesture.kind==='draw'){
      const input=async(name:string,args:Record<string,unknown>)=>{const result=await s.client!.callTool({name,arguments:args});if(result.isError)throw new Error(this.errorText(result));return result};
      let released=false;
      try{await input('browser_mouse_move_xy',{x:d.gesture.points[0][0],y:d.gesture.points[0][1]});if(s.epoch!==d.epoch||s.status!=='ai')throw new Error('绘制已暂停');await input('browser_mouse_down',{button:'left'});for(const[x,y]of d.gesture.points.slice(1)){if(s.epoch!==d.epoch||s.status!=='ai')throw new Error('绘制已暂停');await input('browser_mouse_move_xy',{x,y});}if(s.epoch!==d.epoch||s.status!=='ai')throw new Error('绘制已暂停');r=await input('browser_mouse_up',{button:'left'});released=true;}
      finally{if(!released){await input('browser_press_key',{key:'Escape'}).catch(()=>{});await input('browser_mouse_up',{button:'left'}).catch(()=>{})}}
     }else r=await s.client!.callTool(mcpGesture(d.gesture));if(r.isError)throw new Error(this.errorText(r));
     const receipt={key:d.key,kind:d.gesture.kind,epoch:s.epoch,completed:true,message:d.label,...(d.gesture.kind==='snapshot'?{snapshot:this.errorText(r).slice(0,18000)}:{})};
     s.receipts.set(d.key,receipt);this.event(s,'gesture',d.label,'done',d.key);return receipt;
    }catch(e){this.event(s,'error',d.label+'未完成；请检查实际界面后继续','failed',d.key);throw new BrowserControlError(e instanceof Error?e.message:String(e));}
    finally{s.busy=false;s.inflight.delete(d.key)}
   })();s.inflight.set(d.key,task);return task;
  }
  if(input.action==='close'){
   if(s.busy||s.ready&&s.ack<s.epoch)throw new BrowserControlError('正在保留最后一个动作的结果，请稍候');
   await s.client?.callTool({name:'browser_close',arguments:{}}).catch(()=>{});await s.client?.close().catch(()=>{});await s.closeServer?.().catch(()=>{});this.session=undefined;return{status:'disconnected'};
  }
  throw new BrowserControlError('未知可视控制操作',400);
 }
 private errorText(r:any){return(r.content||[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n')||'MCP操作未完成'}
 blob(id:string,token:string,fileId:string,buffer?:Buffer){const s=this.get(id,token);if(!/^[A-Za-z0-9_-]{1,100}$/.test(fileId))throw new BrowserControlError('无效文件ID',400);if(buffer){const size=[...s.blobs.entries()].reduce((n,[k,b])=>n+(k===fileId?0:b.length),0)+buffer.length;if(size>200*1024*1024)throw new BrowserControlError('本次可视窗口文件合计超过200MB',413);s.blobs.set(fileId,buffer)}const result=s.blobs.get(fileId);if(!result)throw new BrowserControlError('原件尚未同步',404);return result}
}
export const browserControl=new BrowserControl();
