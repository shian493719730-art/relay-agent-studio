/* PREMIUM_DESIGN_START */
function premiumOrbIndex(a){return["gpt","claude","gemini","deepseek","qwen","grok"].indexOf(a)}
function premiumStatus(st){return(typeof ST!=="undefined"&&ST[st])||"○闲"}
function premiumAvatar(a,sz=40,coordinator=false){
 const i=premiumOrbIndex(a),s=Math.max(16,Math.round(+sz||40)),m=(typeof MODELS!=="undefined"&&MODELS[a])||null,base=String((m&&m[1])||"#9AA0A8"),name=m?m[0]:(a||"未知模型");
 const inner=i>=0?`<image href="/design-v2/assets/agent-orbs.png" width="1536" height="1024" x="${-(i%3)*512}" y="${-Math.floor(i/3)*512}" preserveAspectRatio="none"/>`:`<circle cx="256" cy="256" r="190" fill="${esc(base)}"/>`;
 return`<span class="agent-token${coordinator?" is-lead":""}" data-orb="${esc(String(a||""))}" style="--s:${s}px;--orb:${esc(base)}" role="img" aria-label="${esc(name)}${coordinator?" · 统筹":""}"><svg width="${s}" height="${s}" viewBox="66 66 380 380" style="overflow:hidden" aria-hidden="true" focusable="false">${inner}</svg>${coordinator?'<span class="agent-lead" aria-hidden="true">统</span>':""}</span>`}
function premiumProject(p){
 const s=p.space,r=s.r,c=esc(String(p.ui.color||"#8C93A0")),ms=p.members||[],n=ms.length,cy=r*1.04,orbit=r*.6;
 const cs=Math.round(Math.min(64,Math.max(44,r*.3))),ms_=Math.round(Math.min(40,Math.max(30,r*.2)));
 const unread=state.inbox.some(i=>i.pid===p.id&&!i.done);
 const sum=String(p.summary||"").trim(),role=x=>x&&x.role?` title="${esc(String(x.role).slice(0,40))}"`:"";
 const co=p.coordinator;
 const mem=ms.map((m,i)=>{const deg=n===1?45:n===2?25+i*130:15+i*150/(n-1),t=deg*Math.PI/180;
  return`<div class="pc" data-ag="${esc(p.id)}|${esc(m.id)}" style="left:${(r+Math.cos(t)*orbit).toFixed(1)}px;top:${(cy+Math.sin(t)*orbit).toFixed(1)}px"${role(m)}>${piece(m.agent,ms_)}<span class="bb">${premiumStatus(m.st)}</span><span class="nm">${esc(m.name)}</span></div>`}).join("");
 return`<div class="ring${state.sel===p.id?" sel":""}${linkFrom===p.id?" hot":""}" data-pid="${esc(p.id)}" data-dense="${n>=3}" style="left:${s.x-r}px;top:${s.y-r}px;width:${2*r}px;height:${2*r}px;--c:${c}">`+
 `<div class="rhd"><span class="rt" data-drag="p" title="拖动移动项目">${esc(p.name)}</span>${sum?`<span class="rs">${esc(sum.slice(0,48))}</span>`:""}${unread?`<span class="ru" data-unread="1">${icon("inbox",12)}新收件</span>`:""}</div>`+
 `<div class="pc lead" data-ag="${esc(p.id)}|${esc(co.id)}" style="left:${r}px;top:${cy.toFixed(1)}px"${role(co)}>${piece(co.agent,cs,1)}<span class="bb">${premiumStatus(co.st)}</span><span class="nm">${esc(co.name)}</span></div>`+
 mem+`<span class="rhint" aria-hidden="true">双击进入房间</span></div>`}
function premiumGroup(g,x,y){
 const c=g.coordinator;
 return`<button class="gc" data-grp="${esc(g.id)}" style="left:${x}px;top:${y}px" aria-label="跨项目统筹 ${esc(c.name)}">${piece(c.agent,34,1)}<span class="gc-t"><b>${esc(c.name)}</b><small>跨项目统筹 · ${premiumStatus(c.st)}</small></span></button>`}
function premiumChrome(){
 const gb=document.getElementById("gb");
 if(gb){
  const lab=t=>`<span class="premium-label">${t}</span>`;
  const html=`<button data-mc-open aria-label="模型连接与接手" title="模型连接与接手">${icon("network")}${lab("连接")}</button>`+
   `<button data-util="auth" aria-label="自动化授权" title="自动化授权">${icon("settings")}${lab("授权")}</button>`+
   `<button data-util="prompt" aria-label="Prompt 优化" title="Prompt 优化">${icon("sparkles")}${lab("Prompt")}</button>`+
   `<button data-a="guide" aria-label="讲解员" title="讲解员">${piece("claude",28)}${lab("讲解员")}</button>`;
  if(gb.dataset.premiumHtml!==html||gb.children.length!==4){
   const f=document.activeElement,key=f&&gb.contains(f)?["data-mc-open","data-util","data-a"].map(k=>f.hasAttribute(k)?`[${k}${f.getAttribute(k)?`="${f.getAttribute(k)}"`:""}]`:"").join(""):"";
   gb.innerHTML=html;gb.dataset.premiumHtml=html;
   if(key){const el=gb.querySelector(key);if(el)el.focus({preventScroll:true})}}}
 const names={undo:"撤销",redo:"重做"};
 const tools=document.getElementById("tools");
 if(tools)tools.querySelectorAll(":scope>button").forEach(b=>{
  if(b.querySelector(".premium-label"))return;
  const svg=b.querySelector("svg"),txt=b.textContent.trim(),a=b.dataset.act,label=txt||names[a]||b.title||"";
  b.innerHTML=(svg?svg.outerHTML:"")+(txt?`<span class="premium-label">${esc(txt)}</span>`:"");
  const al=b.getAttribute("title")&&!/^[a-z.]+$/i.test(b.getAttribute("title"))?b.getAttribute("title"):label;
  if(al){b.setAttribute("aria-label",al);b.setAttribute("title",al)}});
 const shelf=document.getElementById("shelf");
 if(shelf)shelf.querySelectorAll("[data-model]").forEach(b=>{if(!b.title)b.title=b.getAttribute("aria-label")||""});
 const tl=document.querySelector("#tl [data-a=boards]");
 if(tl){const name=tl.textContent.trim();if(!tl.querySelector(".premium-board-name"))tl.innerHTML=icon("board")+`<span class="premium-board-name">${esc(name)}</span>`;if(!tl.getAttribute("aria-label"))tl.setAttribute("aria-label","切换画板："+name)}}

piece=premiumAvatar;
const premiumRenderTop=renderTop;renderTop=function(){premiumRenderTop();premiumChrome()};
// Keep the broad lighting layers stationary; only the spatial grid follows zoom/pan.
const premiumApplyView=applyView;applyView=function(an){premiumApplyView(an);const v=V(),bd=document.getElementById("bd");bd.style.backgroundPosition=`0 0,0 0,${v.x}px ${v.y}px`;bd.style.backgroundSize=`auto,auto,${48*v.k}px ${48*v.k}px`};
/* PREMIUM_DESIGN_END */
