<div align="center">

# Relay

### 把不同模型，放进同一张可以亲手操控的工作画板。

面向 vibe coding 与日常办公的多模型 Agent 工作室。组团队、交材料、连项目，随时暂停、接手与修改。

[English](README.en.md) · [快速开始](docs/QUICKSTART.md) · [插件与模型](docs/INTEGRATIONS.md) · [操作演示](docs/DEMO.md) · [路线图](docs/ROADMAP.md)

![Alpha](https://img.shields.io/badge/status-alpha-6C63FF)
[![CI](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/ci.yml)
![Node 24+](https://img.shields.io/badge/node-%E2%89%A524-339933)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

![Relay 工作画板：项目、成员与连接](docs/media/workspace.png)

</div>

> **早期 Alpha，欢迎一起打磨。** 当前以本地单用户 Web 应用交付；无需 API 密钥就能体验教程和画板。真实模型执行需要自行配置 API，并产生对应供应商费用。

## 为什么做 Relay

写代码、做内容、处理文件时，一个聊天窗口常常装不下整个过程。Relay 把任务、模型、材料和交接关系放在同一张画板上：你能手动搭建，也能让内置助手使用软件动作来操作；执行过程有状态、有来源、有暂停入口。

我们希望保留“亲手搭东西”的感觉，同时让多模型协作真正接续工作。

## 你可以做什么

| 能力 | 当前行为 |
| --- | --- |
| **可编辑工作画板** | 自由绘制项目选区，保留原轮廓；切换圆形等形状，移动、缩放、分组，放笔记和文件阅读框。布局、组件和样式按画板保存。 |
| **各用各的模型** | 每位成员独立绑定连接、模型与职责。统筹拆解任务，成员按依赖执行，再汇总成果；不会把所有头像偷偷转给同一个模型。 |
| **项目之间继续工作** | 多个项目、组内项目与整组可连接。点击连线选择共享内容、触发条件；下游读取带来源的共享内容，继续执行。 |
| **文件成为工作材料** | 拖入 DOCX、XLSX、文本型 PDF 或文本，读取正文供成员使用，并在关联阅读框中浏览。扫描 PDF 暂不含 OCR。 |
| **随时接手** | 暂停、停止与更新要求；移动不打断无关任务。删除会停止受影响执行并保留已有记录，撤销恢复对象不会自动重启收费调用。 |
| **软件内的执行助手** | 理解目标、读取状态，调用可用的软件动作并观察回执。可视模式借助 Playwright MCP 在专用浏览器里展开、填写、点击与拖拽。 |
| **看得见的近况** | 打开画板、项目或项目组查看近期操作与进度。编辑支持删除、撤销、重做和恢复。 |
| **从零练习** | 19 步自媒体流程教程，带编号箭头；另有亮点功能导览。本地预设内容，不调用模型、不真实发布。 |

![实际界面操作节选](docs/media/walkthrough.gif)

*由实际浏览器操作画面剪辑；这里展示本地教学与界面能力，不是付费模型的自主任务验收。[观看 MP4 与演示说明](docs/DEMO.md)。*

## 5 分钟开始

需要 **Node.js 24+、npm、Python 3**（`python3` 在 PATH 中）。

```bash
git clone https://github.com/shian493719730-art/relay-agent-studio.git
cd relay-agent-studio
npm ci
npm run build
npm start
```

打开 **[http://127.0.0.1:4317/design-v2/](http://127.0.0.1:4317/design-v2/)**，点击右下角「新手教程」。教程无需密钥。根路径保留早期工作台，主画板入口是 `/design-v2/`。

要开始真实任务：打开「连接」→ 添加官方或兼容 API → 填写 Base URL、协议、准确模型 ID 与密钥 → 检查连接 → 为每位成员绑定 → 明确开始执行。**连接检查也可能消耗额度。** 不需要购买特定中转站服务。

[完整安装、数据位置与更新方法 →](docs/QUICKSTART.md)

## 模型与附加能力

| 接入 | 交付方式 | 说明 |
| --- | --- | --- |
| GPT / Claude / Gemini / DeepSeek / Qwen / Grok 等 | 自带可配置连接层 | 支持 Responses、Chat Completions、Anthropic Messages；是否可用取决于供应商协议、准确模型 ID 和账号权限。品牌头像不是可用性保证。 |
| 自定义中转站 | 可选配置 | 任意兼容服务；银子 API 仅是可选推荐。中转无法证明上游真实模型，质量、稳定性与数据政策可能有差异。 |
| Playwright MCP | npm 依赖 | 专用浏览器内的真实可视操作，目前限定 Relay 自身来源；支持暂停和人工接手，不是全桌面键鼠控制。 |
| Skill / Workflow 能力库 | 内置目录 + 按需正文 | 收录 5,000+ 条来源索引与链接；目录收录、正文读取、运行验证分别标记。支持手动刷新，每周检查需另配调度器。 |
| Prompt 优化 / Snapper Assist | 内置优化流程 + 可选独立应用 | 从需求选择 Skill、读取方法再优化；附 3 个项目自有基础 Skill，可扩展本地目录。实时优化需配置模型。 |
| Auth Relay 自动授权接力 | 可选 macOS 本机适配器 | 连接已安装且已有本人授权的外部应用，显示实际状态与范围；本仓库不包含该应用，不会默认授予权限。 |

[配置、授权、许可证与接入边界 →](docs/INTEGRATIONS.md)

## 一个具体流程

把需求文档放入「选题与制作」→ 统筹安排策划、编辑与审阅各用自己的模型 → 汇总成待审稿 → 通过连接交给「人工审核」→ 审核后的材料继续进入「数据复盘」。任一步都能暂停、更改要求和查看已有成果。

教程使用虚构材料和样例数据；真实社交平台发布、平台数据采集和任意外部业务自动化仍需相应集成，不能用教程完成来代替真实验收。

## 开发与参与

```bash
npm run dev        # 本地开发服务
npm run typecheck
npm test           # 离线单元/行为测试，模拟供应商，不调用收费模型
npm run build      # 生成沉浸式画板并构建 Web 资源
npm run check:public
```

当前发布准备在 macOS 完成了干净目录安装、构建与 **155 项测试**；跨平台 CI 配置在仓库内，其他系统请以实际 CI 结果为准。浏览器首次可视操作需要本机 Chrome；普通画板不需要 Playwright 浏览器安装。

欢迎提交复现清楚的 Bug、交互改进和新的连接适配器。开始前请阅读 [贡献指南](CONTRIBUTING.md)、[架构](docs/ARCHITECTURE.md)、[安全说明](SECURITY.md) 和 [行为准则](CODE_OF_CONDUCT.md)。我们尤其需要跨平台验证、无障碍、文件处理和协作恢复方面的贡献。

## 当前边界

本地单用户 Alpha，尚无正式桌面安装包、多人权限系统或托管云服务。密钥保存在本机服务端文件中，不是加密保险箱；请保护设备与备份，不把运行目录提交到 Git。选中的任务与文件内容会发送给你配置的供应商。[数据与隐私](docs/PRIVACY.md) 说明具体位置和网络行为。

MIT 许可适用于本项目代码与自有 Skill。第三方依赖、模型品牌和外部 Skill/Workflow 按各自许可与条款处理。感谢 [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)、[Lucide](https://github.com/lucide-icons/lucide)、React、Vite 以及各来源维护者；见 [第三方说明](THIRD_PARTY_NOTICES.md)。
