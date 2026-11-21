/* MODEL_CONNECTIONS_START */
/* MODEL_CONTEXT_CORE_START */
const ModelContextCore={
 snapshot(p,m,files,connectionId,model,request,shared=[]){
  const allowed=p.msgs.filter(x=>x.from===m.id||(x.from==='me'&&(!x.to||x.to===m.id)));
  const fileIds=new Set([...(p.pendingFiles||[]),...allowed.flatMap(x=>x.attachmentIds||[])]);
  const recent=allowed.slice(-80).map((x,i)=>({id:x.id,role:x.from==='me'?'user':'assistant',text:(i===0&&allowed.length>80?`[省略更早的 ${allowed.length-80} 条记录]\n`:'')+(x.from!=='me'&&!['api','canvas'].includes(x.executionSource)?'[本地演示记录，仅界面示例]\n':'')+(String(x.text||'').length>7600?String(x.text).slice(0,7600)+'\n[此条较长，后文已截断]':String(x.text||'')),state:x.st||'done'}));
  return{...(p.boardId?{boardId:p.boardId}:{}),shared:shared.filter(d=>d.to===p.id),project:{id:p.id,name:p.name,goal:p.summary||''},member:{id:m.id,name:m.name,role:m.role||''},target:{connectionId,model},messages:recent,files:files.filter(f=>f.pid===p.id||fileIds.has(f.id)&&(!p.boardId||f.boardId===p.boardId)).slice(0,100).map(f=>({id:f.id,name:f.name,...(f.documentId?{documentId:f.documentId}:{})})),artifacts:(p.artifacts||[]).filter(a=>a.memberId===m.id||a.text?.startsWith(m.name+'：')).slice(-30).map(a=>a.text.slice(0,1000)),request:request||''};
 },
 stamp(p,m,files,connectionId,model,request,shared=[]){return JSON.stringify({context:this.snapshot(p,m,files,connectionId,model,request,shared),binding:[m.connectionId,m.model,m.connectionRevision]});}
};
/* MODEL_CONTEXT_CORE_END */
function mcSharedReceipts(pid){return state.inbox.filter(i=>i.pid===pid).map(i=>state.deliveries.find(d=>d.id===i.did)).filter(Boolean).slice(-40).map(d=>({id:d.id,linkId:d.link,from:d.from,fromName:P(d.from)?.name||d.fromName||'来源项目',to:d.to,path:d.path,items:d.items}));}

const modelConnect=document.createElement('dialog');modelConnect.id='model-connect';modelConnect.setAttribute('aria-label','模型连接与接手');document.body.append(modelConnect);
const MC={tab:'connections',data:{profiles:[],vendors:[],warning:''},draft:null,pid:null,mid:null,connectionId:'',model:'',request:'',preview:null,stamp:'',applied:false,status:'',state:'',epoch:0,checkAC:null};
const liveTurns=new Map(),pendingTurns=new Map();ST.error='!失败';
function mcProject(id){const p=P(id);if(p)return p;const g=state.groups.find(g=>'group:'+g.id===id);return g?{id:'group:'+g.id,scopeKind:'group',group:g,boardId:P(g.pids[0])?.boardId,name:g.coordinator.name+' · 跨项目统筹',summary:g.rules||'',coordinator:g.coordinator,members:[],msgs:g.msgs,artifacts:g.artifacts||[],pendingFiles:[],ui:{composerDraft:''}}:null;}
const mcScopes=()=>[...state.projects,...state.groups.map(g=>mcProject('group:'+g.id))];
const mcScopeFiles=p=>p?.scopeKind==='group'?[]:state.files;
const mcMember=()=>{const p=mcProject(MC.pid);return p&&[p.coordinator,...p.members].find(m=>m.id===MC.mid);};
function mcChooseTarget(m){const vendor=MC.data.vendors.find(v=>v.brand===m?.agent)?.id;const candidates=MC.data.profiles.filter(c=>c.vendor===vendor&&c.configured&&c.defaultModel).slice().reverse();const c=MC.data.profiles.find(c=>c.id===m?.connectionId)||candidates.find(c=>c.status==='connected')||candidates[0]||MC.data.profiles.find(c=>c.id==='official-'+(vendor||'openai'));MC.connectionId=c?.id||'';MC.model=m?.connectionId?(m.model||c?.defaultModel||''):(c?.defaultModel||'');}
async function mcApi(action,data={},signal){const r=await fetch('/api/studio/models',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({action,...data})});const d=await r.json();if(!r.ok)throw new Error(d.error||'操作未完成');return d;}
async function mcEnsureData(){if(MC.data?.profiles?.length)return MC.data;try{MC.data=await mcApi('list');return MC.data;}catch(e){return MC.data;}}
void mcEnsureData();

function mcGetActiveConnection(){if(!MC.data?.profiles?.length)return null;const relay=MC.data.profiles.find(c=>c.configured&&c.kind==='relay'&&((c.models||[]).length>1||c.defaultModel));if(relay)return relay;return MC.data.profiles.find(c=>c.configured)||null;}

function mcPickModelForRole(conn,roleName,memberIndex=0){
 const models=conn?.models||[];const lower=(roleName||'').toLowerCase();
 const findModel=prefs=>{for(const p of prefs){const match=models.find(m=>m.toLowerCase()===p.toLowerCase()||m.toLowerCase().includes(p.toLowerCase()));if(match)return match;}return null;};
 if(/统筹|架构|规划|协调|总监|组长|主管|主导|调度|lead|coordinator|architect/i.test(lower)){
  return findModel(['claude-opus-5-5','claude-3-7-sonnet-20250219','claude-3-5-sonnet-20241022','claude-opus-4-5','gpt-5.4','gpt-5.5','claude-sonnet-4-5'])||conn?.defaultModel||models[0]||'claude-opus-5-5';
 }
 if(/分析|研判|调研|逻辑|审查|数据|研究|算法|职位|analyst|audit|research|logic/i.test(lower)){
  return findModel(['deepseek-v4.1-flash','claude-3-5-sonnet-20241022','claude-3-7-sonnet-20250219','gpt-5.4','gemini-2.5-pro','kimi-k3'])||conn?.defaultModel||models[1]||'deepseek-v4.1-flash';
 }
 if(/定制|写作|文案|创意|润色|简历|生成|设计|前端|writer|custom|creator|design/i.test(lower)){
  return findModel(['claude-3-5-sonnet-20241022','claude-3-7-sonnet-20250219','claude-fable-5-1','gemini-2.5-pro','gpt-5.4','claude-opus-5-5'])||conn?.defaultModel||models[2]||'claude-3-5-sonnet-20241022';
 }
 if(/进度|跟踪|执行|质检|质控|采集|助手|测试|验收|qa|tracker|test|assistant/i.test(lower)){
  return findModel(['gemini-2.5-flash','claude-3-5-haiku-20241022','gemini-2.5-pro','deepseek-v4.1-flash','gemini-3-flash','gpt-5.4'])||conn?.defaultModel||models[3]||'gemini-2.5-flash';
 }
 const defaultDist=[['claude-opus-5-5','claude-3-5-sonnet-20241022','gpt-5.4'],['deepseek-v4.1-flash','claude-3-5-sonnet-20241022'],['claude-3-5-sonnet-20241022','gemini-2.5-pro'],['gemini-2.5-flash','claude-3-5-haiku-20241022']];
 const prefs=defaultDist[memberIndex%defaultDist.length]||[];
 return findModel(prefs)||conn?.defaultModel||models[memberIndex%(models.length||1)]||'claude-3-5-sonnet-20241022';
}

function mcAutoAssignTeamModels(p,notify=false,forceReassign=false){
 if(!p)return false;const conn=mcGetActiveConnection();if(!conn)return false;const participants=[p.coordinator,...p.members];let changed=false;
 participants.forEach((m,idx)=>{
  if(forceReassign||!m.connectionId||!m.model){
   m.connectionId=conn.id;m.connectionRevision=conn.revision;m.model=mcPickModelForRole(conn,m.name,idx);
   const v=MC.data?.vendors?.find(v=>v.id===conn.vendor);if(v)m.agent=v.brand;changed=true;
  }
 });
 if(changed){save();if(notify)hint(`⚡ 已按「${conn.name}」自动为 ${participants.length} 位成员配置多模型协作`);}
 return changed;
}

function mcAutoAssignMember(m,memberIndex=0){
 if(!m||(m.connectionId&&m.model))return false;const conn=mcGetActiveConnection();if(!conn)return false;
 m.connectionId=conn.id;m.connectionRevision=conn.revision;m.model=mcPickModelForRole(conn,m.name,memberIndex);
 const v=MC.data?.vendors?.find(v=>v.id===conn.vendor);if(v)m.agent=v.brand;save();return true;
}

function modelWorkspaceLabel(projects,practice=false){if(practice)return'教程练习板 · 仅本地演练';const members=projects.flatMap(p=>[p.coordinator,...p.members]),bound=members.filter(m=>m.connectionId&&m.model).length;return members.length&&bound===members.length?'多模型协作 · 发送才开始 API':`${bound}/${members.length} 位已绑定 · 团队按各自模型执行`;}
const mcTop=renderTop;renderTop=function(){mcTop();if(!$('#gb').querySelector('[data-mc-open]'))$('#gb').insertAdjacentHTML('afterbegin',`<button data-mc-open aria-label="模型连接">${icon('network',16)}<span>连接</span></button>`);$('#tag').textContent=modelWorkspaceLabel(onB(state.projects));};
const mcPan=renderPan;renderPan=function(){mcPan();if(panK==='proj'){const conn=mcGetActiveConnection();$('#pan').insertAdjacentHTML('beforeend',`<div class="row"><button data-mc-handoff="${panId}">${icon('network',14)}模型连接与成员接手</button>${conn?`<button data-mc-reassign="${panId}">${icon('sparkles',12)}按「${conn.name}」智能配置全员模型</button>`:''}</div>`)}};
const mcRoom=renderRoom;renderRoom=function(){
 mcRoom();const p=P(state.room);if(!p)return;
 void mcEnsureData().then(()=>{if(state.room===p.id&&mcAutoAssignTeamModels(p,false)){renderMsgs();renderBoard();}});
 const conn=mcGetActiveConnection();if(conn)mcAutoAssignTeamModels(p,false);
 const rh=$('#room .rh');
 if(rh&&!rh.querySelector('[data-mc-handoff]'))rh.insertAdjacentHTML('beforeend',`<button data-mc-handoff="${p.id}">${icon('network',14)}模型 / 接手</button>`);
 if(rh&&conn&&!rh.querySelector('[data-mc-reassign]'))rh.insertAdjacentHTML('beforeend',`<button data-mc-reassign="${p.id}" class="mc-reassign-btn" title="按「${conn.name}」重新智能分配全员专属模型分工（如 Claude Opus、DeepSeek、Gemini 等）">${icon('sparkles',13)}智能重配多模型</button>`);
 const m=target&&[p.coordinator,...p.members].find(x=>x.id===target),bound=[p.coordinator,...p.members].filter(x=>x.connectionId);
 const text=$('#cmp .row:last-child>.lab');
 if(text){
  if(m){text.textContent=m.connectionId?`发给 ${m.name} · ${m.model}${conn?` (${conn.name})`:''} · 点击发送调用 API`:'此成员尚未绑定模型';}
  else{text.textContent=bound.length===[p.coordinator,...p.members].length&&conn?`多模型团队就绪 · 统筹与 ${p.members.length} 位成员已分配专属模型 (${conn.name})`:bound.length?`已连接 ${bound.length} 位；请选成员，全部发送需每位都已连接`:'点击发送开始按各自模型协作';}
 }
};
function executionStamp(m){if(m.executionSource==='document')return `<div class="lab" style="font-size:10px">本机正文读取 · ${m.st==='done'?'已完成':m.st==='stop'?'已暂停':m.st==='error'?'未完成':'正在读取'}</div>`;return m.from!=='me'&&['api','canvas'].includes(m.executionSource)?`<div class="lab" style="font-size:10px">${esc(m.connectionName||'API')} · ${esc(m.model||'')}${m.phase?' · '+esc(m.phase):''} · ${m.st==='done'?'真实回复':m.st==='stop'?'已停止':m.st==='error'?'未完成':'正在生成'}</div>`:'';}
CAT.find(c=>c[0]==='chat.send')[1]='向项目发消息（已连接成员会调用 API）';
CAT.push(['models.open','设置官方 API 或自己的中转站',''],['models.handoff','为成员准备模型接手（预览，不生成）','projectId,memberId?'],['models.stop','停止成员真实 API 请求','projectId,memberId']);
ACT['models.open']=()=>{mcOpen('connections');return'已打开模型连接；密钥只在专用表单填写'};
ACT['models.handoff']=a=>{mcOpen('handoff',rp(a.projectId).id,a.memberId);return'已打开接手预览，尚未发送模型请求'};
CAT.push(['models.group','设置跨项目统筹的模型（预览，不生成）','groupId']);
ACT['models.group']=a=>{const g=fnd(state.groups,a.groupId,'统筹组');mcOpen('handoff','group:'+g.id,g.coordinator.id);return'已打开跨项目统筹的模型设置，尚未生成'};
ACT['models.stop']=a=>{const p=rp(a.projectId),m=mem(p,a.memberId),turn=(liveTurns.get(m.id)||pendingTurns.get(m.id));if(turn){turn.ac.abort();return'正在停止，已收到内容保留';}return'此成员没有真实 API 请求在运行';};
// Direct control owns scoped cancellation before structural changes.
const mcStop=ACT['run.stop'];ACT['run.stop']=a=>{const m=mem(rp(a.projectId),a.memberId);return (liveTurns.has(m.id)||pendingTurns.has(m.id))?ACT['models.stop']({...a,memberId:m.id}):mcStop(a)};
const mcMemberUpdate=ACT['member.update'];ACT['member.update']=a=>{const p=rp(a.projectId),m=mem(p,a.memberId);if(a.agent&&m.connectionId&&a.agent!==m.agent){mcOpen('handoff',p.id,m.id);return'已接入 API 的成员请通过接手预览更换模型';}return mcMemberUpdate(a)};
const mcGroupUpdate=ACT['group.update'];ACT['group.update']=a=>{const g=fnd(state.groups,a.groupId,'统筹组');if(a.agent&&g.coordinator.connectionId&&a.agent!==g.coordinator.agent){mcOpen('handoff','group:'+g.id,g.coordinator.id);return'已接入API的统筹请通过接手预览更换模型';}return mcGroupUpdate(a)};
const mcGroupStop=ACT['group.stop'];ACT['group.stop']=a=>{const g=fnd(state.groups,a.groupId,'统筹组'),turn=liveTurns.get(g.coordinator.id)||pendingTurns.get(g.coordinator.id);if(turn){turn.ac.abort();return'正在停止统筹请求，已收到内容保留';}return mcGroupStop(a)};
const mcStopAll=ACT['run.stopAll'];ACT['run.stopAll']=a=>{const p=rp(a.projectId);[p.coordinator,...p.members].forEach(m=>(liveTurns.get(m.id)||pendingTurns.get(m.id))?.ac.abort());return mcStopAll(a)};
function mcSetDraft(p){MC.draft=p?{...p,apiKey:''}:{kind:'relay',vendor:'custom',name:'我的中转站',baseUrl:'',protocol:'chat',defaultModel:'',routeScope:'',riskAccepted:false,apiKey:''};MC.status='';MC.state='';}
async function mcOpen(tabName='connections',pid,mid){MC.tab=tabName;MC.pid=pid||(P(state.room)||P(state.sel))?.id||state.projects[0]?.id||null;const p=mcProject(MC.pid);MC.mid=mid?p&&[p.coordinator,...p.members].find(m=>m.id===mid)?.id:p?.coordinator.id||null;MC.preview=null;MC.applied=false;MC.status='正在读取已有连接…';MC.epoch++;const epoch=MC.epoch;if(!modelConnect.open)modelConnect.showModal();mcPaint();try{MC.data=await mcApi('list');if(epoch!==MC.epoch)return;mcSetDraft(MC.data.profiles.find(x=>x.id===MC.draft?.id)||MC.data.profiles[0]);const m=mcMember();mcChooseTarget(m);MC.request='';mcPaint();}catch(e){mcNotice(e.message,'error');}}
function mcClose(){MC.epoch++;MC.prepareAC?.abort();MC.checkAC?.abort();if(MC.draft)MC.draft.apiKey='';modelConnect.close();}
function mcNotice(text,state=''){MC.status=text;MC.state=state;const el=modelConnect.querySelector('.mc-status');if(el){el.textContent=text;el.dataset.state=state;}}
function mcPaint(){
 if(!modelConnect.open)return;const p=mcProject(MC.pid),m=mcMember(),d=MC.draft,v=d&&MC.data.vendors.find(v=>v.id===d.vendor);const active=m&&liveTurns.get(m.id);const output=active?.message?.text||(p&&m?p.msgs.filter(x=>x.from===m.id&&x.executionSource==='api').at(-1)?.text:'')||'';
 modelConnect.innerHTML=`<header class="mc-head"><span class="mc-emblem">${icon('network',23)}</span><div><h2>模型连接与接手</h2><span class="mc-kicker">让合适的模型，接住你的工作</span></div><button class="x" data-mc="close" aria-label="关闭模型连接">${icon('close',20)}</button></header><nav class="mc-tabs"><button data-mc-tab="connections" aria-pressed="${MC.tab==='connections'}">连接</button><button data-mc-tab="handoff" aria-pressed="${MC.tab==='handoff'}">成员接手</button></nav><div class="mc-layout"><aside class="mc-list">${MC.data.profiles.map(c=>`<button class="mc-profile" data-mc-profile="${c.id}" aria-pressed="${d?.id===c.id&&MC.tab==='connections'}"><b>${esc(c.name)}</b><small>${c.kind==='relay'?'中转站':'官方'} · ${!c.configured?'未设置':c.status==='connected'?'目录可用':c.status==='error'?'检测失败':'已设置'}</small></button>`).join('')}<button data-mc="new">${icon('plus',14)}自己的中转站</button></aside><main class="mc-main">
 ${MC.tab==='connections'?(d?`<div class="mc-type"><button data-mc-kind="official" aria-pressed="${d.kind==='official'}">官方 API<small>直连模型厂商</small></button><button data-mc-kind="relay" aria-pressed="${d.kind==='relay'}">自己的中转站<small>使用自己的线路与密钥</small></button></div><h3>${esc(d.name)}</h3><form id="mc-form"><div class="mc-fields">${d.kind==='official'?`<label>服务商<select id="mc-vendor">${MC.data.vendors.map(x=>`<option value="${x.id}" ${d.vendor===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:`<label>连接名称<input id="mc-name" value="${esc(d.name)}" maxlength="80"></label>`}
 ${d.kind==='relay'||d.vendor==='qwen'?`<label>API Base URL<input id="mc-url" value="${esc(d.baseUrl)}" placeholder="${d.vendor==='qwen'?'从控制台复制对应区域的兼容接口地址':'https://你的中转站/v1'}" type="url" required><small>填写 Base URL，不带 /chat/completions 或 /messages。</small></label>`:''}
 <label>API Key<input id="mc-key" type="password" autocomplete="new-password" value="${esc(d.apiKey||'')}" placeholder="${d.configured?'已设置，留空保留；输入新 Key 更换':'粘贴这条线路自己的 API Key'}"><small>${d.configured?esc(d.keySource)+' · 内容不回显':'仅保存在本机连接配置，不放进项目聊天'}</small>${v&&d.kind==='official'?`<a href="${v.keyUrl}" target="_blank" rel="noreferrer">还没有 Key？去官方申请 ↗</a>`:''}</label>
 <label>默认模型（可选）<input id="mc-default-model" value="${esc(d.defaultModel)}" list="mc-model-options" placeholder="从检测结果选择，或填写确切模型名"><datalist id="mc-model-options">${(d.models||[]).slice(0,400).map(id=>`<option value="${esc(id)}">`).join('')}</datalist></label></div>
 ${d.kind==='relay'?`<div class="mc-warning">${esc(MC.data.warning)}<label style="display:flex;align-items:flex-start;gap:7px;margin-top:8px"><input id="mc-risk" type="checkbox" style="width:auto;margin-top:4px" ${d.riskAccepted?'checked':''}>我了解以上提示，使用这条中转站线路。</label></div>`:''}
 <details><summary>高级连接设置</summary><label>协议<select id="mc-protocol" ${d.kind==='official'?'disabled':''}><option value="chat" ${d.protocol==='chat'?'selected':''}>OpenAI 兼容 · Chat Completions</option><option value="responses" ${d.protocol==='responses'?'selected':''}>OpenAI Responses</option><option value="anthropic" ${d.protocol==='anthropic'?'selected':''}>Anthropic Messages</option></select></label><label>线路范围（可选 X-Route-Scope）<input id="mc-scope" value="${esc(d.routeScope||'')}" placeholder="仅填写这条线路允许使用的范围"></label><p class="mc-muted">目标地址：${esc(d.baseUrl||'请从官方控制台复制')} ${v?` · <a href="${v.docsUrl}" target="_blank" rel="noreferrer">官方文档 ↗</a>`:''}</p></details>
 <div class="mc-status" data-state="${MC.state}" role="status">${esc(MC.status)}</div><div class="mc-models">${(d.models||[]).slice(0,40).map(id=>`<button type="button" data-mc-model="${esc(id)}">${esc(id)}</button>`).join('')}</div><p class="mc-muted">目录由服务方返回，仅供选择；目录可用不代表已验证推理、工具调用或模型真实性。保存不会调用模型。</p><div class="mc-actions"><button type="submit">保存连接</button><button type="button" data-mc="check" ${d.id?'':'disabled'}>检测模型目录</button>${MC.checkAC?'<button type="button" data-mc="stop-check">停止检测</button>':''}<button type="button" data-mc="close" class="mc-ghost">关闭</button></div></form>`:'<p class="mc-muted">读取连接配置…</p>'):
 `<h3>把工作交给另一位模型</h3><p class="mc-muted">先预览，再应用；点击继续才调用 API。旧记录全部保留，工具内部状态与隐藏思考不会迁移。</p><div class="mc-targets"><label>项目与成员<select id="mc-member">${mcScopes().flatMap(x=>[x.coordinator,...x.members].map(a=>`<option value="${x.id}|${a.id}" ${p?.id===x.id&&m===a?'selected':''}>${esc(x.name)} / ${esc(a.name)}</option>`)).join('')}</select></label><label>目标连接<select id="mc-target">${MC.data.profiles.map(c=>`<option value="${c.id}" ${MC.connectionId===c.id?'selected':''} ${c.configured?'':'disabled'}>${esc(c.name)}${c.configured?'':' · 未设置'}</option>`).join('')}</select></label><label>确切模型名<input id="mc-target-model" value="${esc(MC.model)}" list="mc-target-models" placeholder="填写或选择模型名"><datalist id="mc-target-models">${(MC.data.profiles.find(c=>c.id===MC.connectionId)?.models||[]).slice(0,400).map(id=>`<option value="${esc(id)}">`).join('')}</datalist></label></div>
 ${m?`<p class="mc-muted">当前：${esc(m.name)} · ${esc(m.model||'尚未设置单聊线路')} ${m.connectionId?' / '+esc(MC.data.profiles.find(c=>c.id===m.connectionId)?.name||m.connectionId):''}${active?' · 正在工作':''}</p>`:''}
 ${MC.data.profiles.find(c=>c.id===MC.connectionId)?.kind==='relay'?`<div class="mc-warning">${esc(MC.data.warning)}<br>交接内容将发往：${esc(MC.data.profiles.find(c=>c.id===MC.connectionId).baseUrl)}</div>`:''}
 <label>接下来想让这位成员做什么<textarea id="mc-request" rows="3" placeholder="可先留空，只切换配置；继续生成前需要填写请求">${esc(MC.request)}</textarea></label><p class="mc-muted">交接包含项目目标、职责、该成员可见对话和所选文件正文。准备时在本机读取，点击继续才交给模型；可关闭以暂停读取。</p>
 <textarea class="mc-context" aria-label="接手内容预览" readonly placeholder="点击「预览交接内容」，检查新模型将收到什么">${esc(MC.preview?.packet||'')}</textarea><div class="mc-status" data-state="${MC.state}" role="status">${esc(MC.status)}</div><pre class="mc-stream" aria-live="polite">${esc(output)}</pre><div class="mc-actions"><button data-mc="prepare" ${active?'disabled':''}>预览交接内容</button><button data-mc="apply" ${MC.preview&&!active&&!MC.applied?'':'disabled'}>应用接手（不生成）</button><button class="mc-primary" data-mc="continue" ${MC.applied&&!active&&MC.request.trim()?'':'disabled'}>继续 · 调用 API</button>${active?'<button data-mc="stop">停止</button>':''}<button data-mc="checkpoint">上次接力记录</button></div>`}
 </main></div>`;
}
function mcCapture(){const d=MC.draft;if(!d||!$('#mc-key'))return;d.apiKey=$('#mc-key').value;d.name=$('#mc-name')?.value||d.name;d.baseUrl=$('#mc-url')?.value||d.baseUrl;d.defaultModel=$('#mc-default-model').value;d.protocol=$('#mc-protocol').value;d.routeScope=$('#mc-scope').value;d.riskAccepted=!!$('#mc-risk')?.checked;}
function mcInvalidate(){MC.preview=null;MC.applied=false;MC.status='内容或目标改变，请重新预览。';const box=modelConnect.querySelector('.mc-context');if(box)box.value='';for(const name of ['apply','continue']){const b=modelConnect.querySelector(`[data-mc="${name}"]`);if(b)b.disabled=true;}}
function mcContext(p=mcProject(MC.pid),m=mcMember()){if(!p||!m)throw new Error('先选择项目成员');return ModelContextCore.snapshot(p,m,mcScopeFiles(p),MC.connectionId,MC.model,MC.request,mcSharedReceipts(p.id));}
function mcStamp(){return ModelContextCore.stamp(mcProject(MC.pid),mcMember(),mcScopeFiles(mcProject(MC.pid)),MC.connectionId,MC.model,MC.request,mcSharedReceipts(MC.pid));}
function mcApply(){const p=mcProject(MC.pid),m=mcMember();if(!p||!m||!MC.preview)throw new Error('先预览交接内容');if(typeof canvasBindingLocked==='function'&&canvasBindingLocked(p.id,m.id))throw new Error('本轮模型已固定，请先停止流程，再为下一轮更换成员模型');if(liveTurns.has(m.id)||pendingTurns.has(m.id)||runs[m.id]||(typeof canvasMemberBusy==='function'&&canvasMemberBusy(p.id,m.id)))throw new Error('先停止此成员再接手');if(MC.stamp!==mcStamp())throw new Error('项目内容已改变，请重新预览');pushUndo();m.previousBinding={connectionId:m.connectionId,connectionRevision:m.connectionRevision,model:m.model,agent:m.agent};m.connectionId=MC.preview.target.id;m.connectionRevision=MC.preview.target.revision;m.model=MC.preview.target.model;const c=MC.data.profiles.find(c=>c.id===m.connectionId),v=MC.data.vendors.find(v=>v.id===c?.vendor);if(v)m.agent=v.brand;MC.applied=true;MC.stamp=mcStamp();if(state.room===p.id)target=m.id;save();renderAll();mcNotice('已应用。尚未生成；继续会按目标连接计费。','ok');mcPaint();}
async function mcRun(preview,p,m,text,atts=[],fromComposer=false,existingAC){
 if(liveTurns.has(m.id)||pendingTurns.has(m.id)||runs[m.id]||(typeof canvasMemberBusy==='function'&&canvasMemberBusy(p.id,m.id)))throw new Error('此成员正在工作，请先停止');
 const ac=existingAC||new AbortController();if(ac.signal.aborted)throw new Error('已停止，未发送生成请求');const user={id:'msg'+uid(),from:'me',to:m.id,text,attachmentIds:atts,executionSource:'api'},message={id:'msg'+uid(),from:m.id,text:'',st:'stream',executionSource:'api',model:preview.target.model,connectionId:preview.target.id,connectionName:preview.target.name};
 p.msgs.push(user,message);if(fromComposer){if((p.ui.composerDraft||'').trim()===text)p.ui.composerDraft='';p.pendingFiles=p.pendingFiles.filter(id=>!atts.includes(id));}m.st='think';const turn={ac,pid:p.id,message};liveTurns.set(m.id,turn);save();if(p.scopeKind==='group'){if(panK==='group'&&panId===p.group.id)renderMsgs()}else renderRoom();renderBoard();mcPaint();let finished=false;
 const update=()=>{save();if(state.room===p.id||p.scopeKind==='group'&&panK==='group'&&panId===p.group.id)renderMsgs();if(modelConnect.open&&MC.mid===m.id){const out=modelConnect.querySelector('.mc-stream');if(out)out.textContent=message.text;}};
 try{
  const r=await fetch('/api/studio/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run',token:preview.token,fingerprint:preview.fingerprint}),signal:ac.signal});if(!r.ok){const d=await r.json();throw new Error(d.error||'模型请求未完成');}
  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
  for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.match(/^event: (.+)$/m)?.[1],line=block.match(/^data: (.+)$/m)?.[1];if(!line)continue;const d=JSON.parse(line);if(d.text!==undefined)message.text=d.text;if(event==='tool')m.st='tool';if(event==='progress')m.st='think';if(['done','stopped','error'].includes(event)){finished=true;message.st=event==='done'?'done':event==='stopped'?'stop':'error';m.st=event==='done'?'done':event==='stopped'?'stop':'error';if(d.error)message.text+=(message.text?'\n\n':'')+d.error;if(event==='done'){p.artifacts.push({id:'a'+uid(),memberId:m.id,text:m.name+'：'+d.text.slice(0,1000),done:true});if(p.scopeKind==='group')p.group.artifacts=p.artifacts;else fire('done',p.id,d.text);}}update();}if(done)break;}
  if(!finished)throw new Error('连接提前结束，已有内容保留；请查看接力记录后再决定是否继续。');
 }catch(e){message.st=ac.signal.aborted?'stop':'error';m.st=ac.signal.aborted?'stop':'error';if(ac.signal.aborted&&!message.text)message.text='（已停止，尚未收到模型输出）';if(!ac.signal.aborted)message.text+=(message.text?'\n\n':'')+'本次未完成：'+e.message;}
 finally{liveTurns.delete(m.id);update();renderBoard();if(modelConnect.open&&MC.mid===m.id){MC.preview=null;MC.applied=false;MC.status=message.st==='done'?'这次真实回复已保存到项目会话。':'已保留收到的输出；没有切换到其他线路重试。';mcPaint();}}
}
const mcDemoSend=sendProject;sendProject=function(p,text,toId,atts){
 const members=toId?[mem(p,toId)]:[p.coordinator,...p.members];
 if(members.some(m=>!m.connectionId||!m.model)){
  if(toId)mcAutoAssignMember(members[0]);
  else mcAutoAssignTeamModels(p,false);
 }
 if(!members.some(m=>m.connectionId))return mcDemoSend(p,text,toId,atts);
 if(members.some(m=>!m.connectionId))return'仍有成员未连接 API，请先 @ 已连接的成员，或逐个设置连接';if(!text.trim())return'先补充文字请求，成员会根据所选文件正文处理';if(members.some(m=>liveTurns.has(m.id)||pendingTurns.has(m.id)||runs[m.id]||(typeof canvasMemberBusy==='function'&&canvasMemberBusy(p.id,m.id))))return'有成员正在工作，请等待或停止';
 const controllers=members.map(()=>new AbortController());members.forEach((m,i)=>{pendingTurns.set(m.id,{ac:controllers[i],pid:p.id});m.st='queue';});save();
 void(async()=>{try{const prepared=await Promise.all(members.map((m,i)=>mcApi('prepare',{context:{...ModelContextCore.snapshot(p,m,state.files,m.connectionId,m.model,text,mcSharedReceipts(p.id)),target:{connectionId:m.connectionId,model:m.model,connectionRevision:m.connectionRevision}}},controllers[i].signal)));members.forEach(m=>pendingTurns.delete(m.id));await Promise.all(members.map((m,i)=>mcRun(prepared[i],p,m,text,atts,true,controllers[i])));}catch(e){hint(e.name==='AbortError'?'已停止，未继续发送请求':e.message);}finally{members.forEach((m,i)=>{if(pendingTurns.get(m.id)?.ac===controllers[i]){pendingTurns.delete(m.id);m.st='stop';}});save();renderMsgs();renderBoard();}})();return'正在发给已连接成员 · 使用各自线路，不自动替换模型';};
modelConnect.addEventListener('cancel',e=>{e.preventDefault();mcClose();});
modelConnect.addEventListener('input',e=>{const id=e.target.id;if(id==='mc-request'){MC.request=e.target.value;mcInvalidate();}if(id==='mc-target-model'){MC.model=e.target.value;mcInvalidate();}});
modelConnect.addEventListener('change',e=>{const id=e.target.id;if(id==='mc-vendor'){const c=MC.data.profiles.find(x=>x.id==='official-'+e.target.value);mcSetDraft(c);mcPaint();}else if(id==='mc-member'){[MC.pid,MC.mid]=e.target.value.split('|');const m=mcMember();mcChooseTarget(m);mcInvalidate();mcPaint();}else if(id==='mc-target'){MC.connectionId=e.target.value;MC.model=MC.data.profiles.find(c=>c.id===MC.connectionId)?.defaultModel||'';mcInvalidate();mcPaint();}});
modelConnect.addEventListener('submit',async e=>{e.preventDefault();mcCapture();try{const d=MC.draft,payload={...d};delete payload.configured;delete payload.keySource;delete payload.models;delete payload.status;if(!payload.apiKey)delete payload.apiKey;const saved=await mcApi('save',{connection:payload});MC.data=await mcApi('list');mcSetDraft(MC.data.profiles.find(c=>c.id===saved.id));MC.status='连接已保存到本机，尚未发送生成请求。';MC.state='ok';mcPaint();}catch(err){mcNotice(err.message,'error');}});
document.addEventListener('click',async e=>{
 const reassign=e.target.closest('[data-mc-reassign]');
 if(reassign){const p=P(reassign.dataset.mcReassign);if(p){mcAutoAssignTeamModels(p,true,true);renderAll();}return;}
 const open=e.target.closest('[data-mc-open]'),handoff=e.target.closest('[data-mc-handoff]');if(open){mcOpen();return;}if(handoff){mcOpen('handoff',handoff.dataset.mcHandoff);return;}const b=e.target.closest('#model-connect button');if(!b)return;
 try{if(b.dataset.mcTab){mcCapture();MC.tab=b.dataset.mcTab;MC.status='';MC.state='';mcPaint();return;}if(b.dataset.mcProfile){mcSetDraft(MC.data.profiles.find(c=>c.id===b.dataset.mcProfile));MC.tab='connections';mcPaint();return;}if(b.dataset.mcKind){mcSetDraft(b.dataset.mcKind==='official'?MC.data.profiles[0]:null);mcPaint();return;}if(b.dataset.mcModel){$('#mc-default-model').value=b.dataset.mcModel;MC.draft.defaultModel=b.dataset.mcModel;return;}
 switch(b.dataset.mc){case'close':mcClose();break;case'new':mcSetDraft(null);MC.tab='connections';mcPaint();break;case'stop-check':MC.checkAC?.abort();break;case'check':{mcCapture();const c=MC.data.profiles.find(c=>c.id===MC.draft.id);if(!c)throw new Error('请先保存连接');if(MC.draft.apiKey||MC.draft.baseUrl!==c.baseUrl||MC.draft.protocol!==c.protocol||MC.draft.routeScope!==c.routeScope)throw new Error('连接有修改，请先保存后检测');if(MC.checkAC)return;const ac=MC.checkAC=new AbortController(),epoch=MC.epoch;MC.status='正在检测模型目录…';MC.state='busy';mcPaint();try{const d=await mcApi('check',{id:c.id},ac.signal);if(epoch!==MC.epoch)return;MC.data=await mcApi('list');mcSetDraft(d);MC.status=d.status==='connected'?`目录可用，找到 ${d.models.length} 个模型。尚未执行推理。`:d.error;MC.state=d.status==='connected'?'ok':'error';}catch(err){MC.status=ac.signal.aborted?'已停止目录检测。':err.message;MC.state='error';}finally{if(MC.checkAC===ac)MC.checkAC=null;if(epoch===MC.epoch)mcPaint();}break;}
 case'prepare':{const m=mcMember();if(liveTurns.has(m.id)||pendingTurns.has(m.id)||runs[m.id]||(typeof canvasMemberBusy==='function'&&canvasMemberBusy(MC.pid,m.id)))throw new Error('先停止此成员再准备接手');MC.prepareAC?.abort();const readAC=MC.prepareAC=new AbortController();mcNotice('正在本机读取文件正文，可关闭以暂停…','busy');const scopeProject=mcProject(MC.pid);if(scopeProject?.scopeKind!=='group')await dfEnsureProjectFiles(scopeProject,readAC.signal);const context=mcContext(),stamp=mcStamp(),epoch=MC.epoch;mcNotice('正在准备可读上下文，不调用模型…','busy');const preview=await mcApi('prepare',{context},readAC.signal);if(epoch!==MC.epoch||stamp!==mcStamp())throw new Error('内容已改变，请重新预览');MC.preview=preview;MC.stamp=stamp;MC.applied=false;MC.status=preview.note;MC.state='ok';mcPaint();break;}
 case'apply':mcApply();break;case'continue':{if(!MC.applied||MC.stamp!==mcStamp())throw new Error('内容或配置已改变，请重新预览并应用');const preview=MC.preview;MC.applied=false;await mcRun(preview,mcProject(MC.pid),mcMember(),MC.request);break;}
 case'stop':liveTurns.get(MC.mid)?.ac.abort();break;case'checkpoint':{const record=await mcApi('checkpoint',{projectId:MC.pid,memberId:MC.mid});mcNotice(record?`${record.status==='completed'?'已完成':record.status==='running'?'运行记录（服务重启后不会自动续费重试）':'未完成'} · ${record.target.connectionName} / ${record.target.model} · ${record.finishedAt||record.startedAt}`:'此成员尚无真实接力记录');const out=modelConnect.querySelector('.mc-stream');if(out)out.textContent=record?.text||'';break;}}
 }catch(err){mcNotice(err.message||String(err),'error');}
});
/* MODEL_CONNECTIONS_END */
