/* LEARNING_START */
/* LEARNING_CORE_START */
const LearningCore={
 explanations:{
  'board.create':'新建一个独立工作区。项目、文件和连线放在各自画板里，原来的工作会保留。',
  'project.create':'建立一项有目标、成员和文件的工作。创建本身不会让模型开工。',
  'project.delete':'移除这个项目，并自动停止与它有关的执行；已完成成果保留，可以撤销恢复。',
  'board.delete':'移除当前画板及其中对象；相关执行会停止。可以撤销，恢复后不会自动调用模型。',
  'member.add':'给当前项目增加一位成员。头像代表模型品牌，实际使用的模型需要单独绑定。',
  'member.remove':'移除这位成员，停止它受影响的任务；可以撤销恢复。',
  'member.update':'修改成员名字或职责，让团队清楚这位成员要负责什么。',
  'room.enter':'进入这个项目的会议空间，查看成员、材料、聊天和工作成果。',
  'room.leave':'返回画板。当前对话草稿、项目位置和视口会保留。',
  'file.pick':'从电脑选择 Word、Excel、PDF 或文本。先在本机读取正文，发送任务后模型才能处理这些内容。',
  'link.create':'把源项目连到下游项目。创建后还要设置共享内容和触发规则，再启用。',
  'link.enable':'启用这条连接的共享规则。后续满足触发条件时才会交付所选内容。',
  'link.pause':'暂停这条连接的交付；现有内容保留，可随时恢复。',
  'link.resume':'重新开启这条连接。恢复共享不等于自动重跑已完成的工作。',
  'link.deliver':'现在把勾选的内容交给下游。真实项目可能继续调用下游模型，请核对执行提示。',
  'link.delete':'断开这条项目连接，可以撤销恢复。已交付的内容会保留。',
  'undo':'撤回最近一次可恢复的编辑。不会收回已发送给模型的数据，也不会自动重启任务。',
  'redo':'重新应用刚才撤销的编辑；你之后仍可以再撤销。',
  'view.fit':'把当前画板上的项目都带进视野，不改变项目的实际位置。',
  'models.open':'配置官方、自己的中转站或本机模型连接。可以给每位成员分别指定确切模型。',
  'run.stopAll':'停止当前范围的执行，保留已经得到的内容。未完成部分需要你明确接续。',
  'cluster.create':'把多个独立项目装进同一个项目组，既能组内连线，也能连接整个项目组。',
  'cluster.delete':'解散组的边界，保留里面的子项目；可以撤销恢复。',
  'dev.files':'读取已连接源码仓库的文件目录；这一步不会改动代码。',
  'dev.read':'读取所选源码的实际正文与版本，AI 不能只凭文件名猜内容。',
  'dev.write':'保存代码修改前会核对版本。先建立回滚点，测试后可恢复差异。',
  'dev.install':'在隔离开发环境中安装项目依赖。依赖是项目需要的代码包，会显示真实进度和结果。',
  'dev.run':'执行你已允许的项目脚本，例如测试、启动预览或构建。过程可暂停，结果以真实日志为准。',
  'dev.checkpoint':'给当前源码和开发环境留一个恢复点，方便之后回滚。',
  'dev.package':'把本次实际构建的产物打成可下载文件；旧文件不会冒充本次结果。',
  'dev.restore':'把本轮源码与依赖环境恢复到所选检查点，先核对实际差异。'
 },
 place(r,w,h,vw,vh){const x=Math.max(8,Math.min(r.left,vw-w-8));let y=r.bottom+9;if(y+h>vh-8)y=Math.max(8,r.top-h-9);return{x,y};}
};
/* LEARNING_CORE_END */
const learningRules=[
 ['[data-mc-open]','配置自己的官方接口、中转站或本机模型。每位成员都能分别绑定具体模型，保存密钥不等于开工。'],
 ['[data-util="auth"]','查看你现有授权允许哪些站点；需要本人验证时暂停等待，完成后从原断点接续。'],
 ['[data-util="prompt"]','用自己的话提出需求，AI 按这次意图选择合适方法推敲；原任务不会因此自动执行。'],
 ['#rin','写给团队的任务或问题。你可先修改草稿，点击发送后才可能调用绑定的模型。'],
 ['#room [data-a="rsend"]','把任务交给当前选中的成员或统筹。普通项目会真实调用绑定模型，练习项目会明确标记本地示例。'],
 ['[data-dm-window-resize]','按住右下角拖动，调整这个窗口大小；已填写的内容保留。'],
 ['[data-dm-window-fold]','收拢或展开当前面板，减少画面占用；这与暂停正在运行的任务是不同操作。'],
 ['[data-learn="previous"]','返回上一课复习，保留操作成果、理解检查和本轮草稿；不会自动调用模型。'],
 ['[data-teach-detail]','查看这一步的目的、正在做的事、应看到的结果，以及怎样换成自己的任务。'],
 ['[data-teach-library]','用通俗例子区分 Skill、工作流、角色和工具，理解目录、正文、采用与运行是不同阶段。'],

 ['#tl [data-a="boards"]','切换或新建画板；每张画板保存自己的项目与视口。'],
 ['[data-a="guide"]','向内置 AI 描述目标。它会调用软件能力完成操作，并逐步报告真实结果。'],
 ['[data-model]','点击把这个品牌的成员加入当前项目，也可以拖进项目选区。模型和职责可在项目里分别设置。'],
 ['.ring .rt','这是项目的标题。单击选中并查看详情，再点击「进入房间」查看项目对话。'],
 ['[data-dm-resize],[data-dm-cluster-resize]','按住拖动调整大小；只改变展示，不停止无关任务。'],
 ['[data-tool="select"]','选择、移动项目和对象；按住对象拖动即可调整位置。'],
 ['[data-tool="draw"]','按住鼠标画出项目边界，保留你画的形状；之后也能改成圆形或其他形状。'],
 ['[data-tool="note"]','在画板空白处放一条笔记，记录想法或给项目补充说明。'],
 ['[data-tool="link"]','先点连线，再从一个项目拖到另一个项目；连接方向表示内容交给谁。'],
 ['[data-link]','点击连线，选择共享什么、何时交付；也能暂停或断开。'],
 ['[data-lf="trigger"]','选择什么时候交付内容，例如源任务完成后，或由你手动交付。'],
 ['[data-ls="summary"]','共享源项目的摘要，帮助下游了解背景；不会自动共享所有文件。'],
 ['[data-ls="artifacts"]','共享源项目已完成的成果，例如草稿、分析或报告。'],
 ['[data-ls="documents"]','把源项目的文档正文交给下游。请只勾选确实需要共享的内容。'],
 ['[data-sb-open]','按当前项目目标寻找 Skill、工作流和工具；也可以自由搜索全部资料。'],
 ['#sb-project','选择这些推荐要服务的项目。推荐始终围绕该项目的目标，已选方法不会串到其他项目。'],
 ['#sb-goal','写清想得到什么成果、给谁使用，以及不能做什么。越具体，推荐越贴合。'],
 ['[data-sb="goal"]','保存你写的目标，并调用已配置 API 重新推荐前十项。会使用模型额度。'],
 ['[data-sb="semantic"]','根据项目目标调用 API 重新判断前十项，说明为什么适合、怎么使用。可以随时停止。'],
 ['[data-sb="recommend"]','只用本机目录做关键词匹配，不调用模型。它与 AI 语义推荐分别标明。'],
 ['[data-sb="stop"]','中断本次 API 推荐，保留目标、已选方法及已完成结果。'],
 ['[data-sb-view="recommend"]','查看 AI 按当前项目目标排序的前十项；合适条目不足时会如实说明。'],
 ['[data-sb-view="browse"]','查看其他候选与完整资料库。没有进入前十的条目仍可搜索、查看和加入。'],
 ['#sb-query','输入想解决的问题、文件类型或工具名；点击查找后会显示实际匹配数与条目。'],
 ['[data-sb-cat]','按工作场景筛选资料。这个筛选只影响浏览结果，不会悄悄隐藏 AI 推荐。'],
 ['#sb-kind','Skill 是做事方法，工作流是一串步骤，示例是可参考的做法。这里按资源类型筛选。'],
 ['#sb-open-only','只显示声明采用开源许可的条目；真正采用前仍应核对来源和许可。'],
 ['#sb-history','也显示已归档或已移除的历史条目，用于查阅。它们可能已经不能继续使用。'],
 ['[data-sb-id]','查看这份方法的用途、原始来源和许可；目录收录并不代表已安装或验证可运行。'],
 ['[data-sb-quick],[data-sb="add"]','把这份方法保存到当前项目作参考。之后仍可移除，加入不会自动执行。'],
 ['[data-sb="read"]','联网读取该方法的真实正文与许可；读取成功后会显示版本，不会运行其中的脚本。'],
 ['[data-sb="use"]','把已读正文的这个版本用于项目。Prompt 优化会按原话决定是否采用，不会机械套模板。'],
 ['[data-sb="refresh"]','检查开源来源并更新目录。通常每周执行，也可手动更新；不是实时扫描整个网络。'],
 ['[data-sb="schedule"]','开启或暂停这台电脑的每周目录检查；应用需要保持运行。不会自动安装收录的工具。'],
 ['[data-sb="status"]','重新读取本机的更新记录与定时状态，不调用 AI 模型。'],
 ['[data-sb="clear"]','清掉当前搜索和筛选，重新显示全部可浏览资料；不移除项目已选方法。'],
 ['#prompt-original','用你自己的话写需求，不需要先学会写长 Prompt。AI 会先理解再选择合适方法。'],
 ['[data-refine-start]','调用已配置 API 理解原话、选择 Skill 并读取正文，再推敲这条请求；不是运行你的原任务。'],
 ['[data-refine-stop]','停止当前 Prompt 推敲，保留原话和已完成结果。'],
 ['#prompt-result','这是可继续手动修改的请求。检查意思是否正确，再决定复制或放入项目草稿。'],
 ['[data-prompt-apply]','只把结果放到项目输入框，不替你发送；你还可以修改，也可以撤销。'],
 ['[data-prompt-restore]','把当前结果恢复成最开始的原话，不会删除项目里的成果。'],
 ['[data-auth-refresh]','读取 Auth Relay 的实际状态；只有本人已经授权的范围才能接力。'],
 ['[data-native="auth"]','打开已安装的授权控制面板。登录、范围和有效期仍由本人掌握。'],
 ['[data-au-action="focus"]','转到需要你本人验证的页面；AI 不会代取密码或验证码。'],
 ['[data-au-action="resume"]','在你本人完成验证后，从这个任务原来的断点继续；不会让其他任务重做。'],
 ['[data-au-action="cancel"]','取消这一个授权接力任务，其他任务与原来的授权范围保留。'],
 ['#as-input','告诉助手要达成的目标。执行中也可以在这里补充更正；新要求优先，已完成的成果保留。'],
 ['[data-as-send]','调用选中的 API 分析目标并实际操作软件。文件选择、模型开工和授权会在对应步骤明确呈现。'],
 ['[data-as-binding]','给软件操作助手选择模型。团队成员仍使用它们各自绑定的模型。'],
 ['[data-as-pause]','停止助手正在做的事并保留断点。你可以手动接手，之后明确继续。'],
 ['[data-as-continue]','接着处理未完成部分，保留已经观察到的结果。可能继续使用模型额度。'],
 ['[data-as-steer]','先暂停，再带着你输入的新要求重新分析；完成步骤不会无故重复。'],
 ['[data-as-locate],[data-as-results]','回到实际创建或修改的对象，查看它在画板里的成果。'],
 ['[data-as-all]','展开完整步骤记录；平时只显示当前相关步骤，减少阅读负担。'],
 ['[data-as-demo]','固定的本地演示，不是真实 AI 推理，也不调用付费模型。'],
 ['[data-ft="pause"],[data-tut="pause"]','暂停课程，保存学习进度，回到原工作区。之后可以从当前步骤继续。'],
 ['[data-ft="next"],[data-tut="next"]','当前操作的真实结果达到要求后才能继续；不需要记快捷键。'],
 ['[data-activity-board]','查看画板近期改动、项目进度和待处理事项。'],
 ['[data-dm-create-cluster]','把你选的多个项目放进同一个大组，子项目仍可分别工作和连接。'],
 ['[data-activity-close]','收起近况回报，回到刚才的工作位置。']
];
const learningGlossary={
 'Skill':'一份教 AI 怎么做事的方法说明。采用前要按当前需求判断，不是固定模板。',
 '工作流':'把多个步骤或工具按先后关系连起来，适合反复完成同一类事情。',
 '角色':'给成员设定关注点和职责；角色本身不等于一个已经接通的模型。',
 '指令':'针对某个场景的要求或操作约定，使用时以你的本次需求为准。',
 '示例':'供你参考和修改的现成做法，不保证不改就能运行。',
 '方法集合':'同一来源的一组方法，通常还需要从中选择具体适用的内容。',
 '插件条目':'可以扩展软件能力的工具记录；收录不等于已经安装或获得授权。',
 '工作流平台':'运行或搭建自动化流程的平台，通常需要另行部署和连接服务。',
 'JSON':'一种让软件准确读取字段和值的文字格式，例如项目名和操作参数。',
 'MCP':'让 AI 通过统一接口使用工具的连接方式；具体能做什么仍取决于已接入的工具和许可。',
 'API':'软件调用模型或服务的接口。需要配置地址和密钥，真实请求可能按用量计费。',
 'Chat Completions':'一种常见模型接口协议。请选择服务商文档支持的协议，模型名称仍要单独指定。',
 'Responses':'OpenAI 的一种模型接口协议；自定义服务只有明确支持时才能使用。',
 'Anthropic Messages':'Claude 官方使用的接口格式；中转服务也必须明确支持这个格式。',
 '圆形':'把项目边界显示为圆形。项目内容、成员和连线都会保留。',
 '手绘原形':'恢复你最初画出的不规则边界，保留亲手圈选的形状。',
 '菱形':'用菱形边界区分这个项目，仍可以继续调整尺寸。',
 '椭圆':'分别设置宽和高，让项目边界适合内部内容。',
 '源任务完成':'等源项目得到完整结果后，再把所选内容交给下游。',
 '手动交付':'由你点击立即交付时才共享，不随源项目进度自动触发。'
};
const learningTip=document.createElement('div');learningTip.id='explainer-tooltip';learningTip.setAttribute('popover','manual');learningTip.setAttribute('role','tooltip');learningTip.hidden=true;document.body.append(learningTip);
let learningTarget=null,learningTimer=null,learningDescribed='';
function learningText(el){if(!el)return'';if(el.dataset.explain)return el.dataset.explain;for(const[selector,text]of learningRules)if(el.matches(selector))return text;const name=el.dataset.act||el.dataset.action;if(LearningCore.explanations[name])return LearningCore.explanations[name];if(name){const c=CAT.find(x=>x[0]===name);if(c)return c[1]+'。操作结果会显示在当前工作区。';}const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.closest('label')?.textContent||el.textContent||el.placeholder||'').trim().replace(/\s+/g,' ').slice(0,100);if(!label)return'这里可以调整当前项目的设置；改动前可先查看旁边的说明。';if(el.matches('select'))return '选择「'+label+'」的具体设置。展开后可用鼠标选择，当前值会保留。';if(el.matches('input[type=checkbox],input[type=radio]'))return'勾选或取消「'+label+'」，只改变这一项选择。';if(el.matches('input,textarea'))return'在这里填写「'+label+'」。填写后先检查内容，再使用附近的保存或执行按钮。';if(el.matches('summary'))return'展开「'+label+'」查看细节；再点一次可以收起，当前工作会保留。';return '「'+label+'」：'+(el.matches('a')?'打开所示来源页面，可核对详细内容。':'点击进行这项操作，结果会在当前窗口呈现。');}
function learningHide(){clearTimeout(learningTimer);if(learningTarget&&learningDescribed){learningTarget.setAttribute('aria-describedby',learningDescribed);}else learningTarget?.removeAttribute('aria-describedby');learningTarget=null;learningDescribed='';try{learningTip.hidePopover()}catch{}learningTip.hidden=true;}
function learningShow(el,immediate=false){if(!el||el===learningTarget||el.closest('#explainer-tooltip'))return;learningHide();learningTarget=el;learningDescribed=el.getAttribute('aria-describedby')||'';learningTimer=setTimeout(()=>{if(!el.isConnected||!el.getBoundingClientRect().width)return learningHide();el.setAttribute('aria-describedby',(learningDescribed+' explainer-tooltip').trim());learningTip.textContent=learningText(el);learningTip.hidden=false;try{learningTip.showPopover()}catch{}const r=el.getBoundingClientRect(),box=LearningCore.place(r,learningTip.offsetWidth,learningTip.offsetHeight,innerWidth,innerHeight);Object.assign(learningTip.style,{left:box.x+'px',top:box.y+'px'});},immediate?0:400);}
const learningOriginalText=learningText;learningText=function(el){const text=learningOriginalText(el);if(!el)return text;const selected=el.matches('select')?el.selectedOptions?.[0]?.textContent?.trim():'';const key=Object.keys(learningGlossary).find(k=>selected===k||selected?.toLowerCase()===k.toLowerCase());return key?text+' 当前选项：'+learningGlossary[key]:text;};
const learningControl=e=>e.target instanceof Element?e.target.closest('button,input,textarea,select,summary,a,.ring .rt,[data-link],[role="button"],[data-explain]'):null;
document.addEventListener('pointerover',e=>learningShow(learningControl(e)),true);
document.addEventListener('pointerout',e=>{if(learningTarget&&!learningTarget.contains(e.relatedTarget))learningHide()},true);
document.addEventListener('focusin',e=>learningShow(learningControl(e),true),true);
document.addEventListener('change',e=>{if(e.target.matches?.('select')){learningHide();learningShow(e.target,true)}},true);
document.addEventListener('focusout',learningHide,true);document.addEventListener('scroll',learningHide,true);document.addEventListener('keydown',e=>{if(e.key==='Escape')learningHide()},true);document.addEventListener('pointerdown',learningHide,true);
// All courses share the same explanation layer; no API is called on hover.
const learningListBase=tutorialPointerList;tutorialPointerList=function(host,operations){const index=learningListBase(host,operations),current=operations[index];let explain=host.querySelector('.learning-why');if(!explain){explain=document.createElement('p');explain.className='learning-why';host.querySelector('.tm-body')?.append(explain)}const text=current&&(current.explanation||learningText(document.querySelector(current.selector||':not(*)')));explain.textContent=text?'这一步学会：'+text:'';explain.hidden=!text;return index;};
/* LEARNING_END */
