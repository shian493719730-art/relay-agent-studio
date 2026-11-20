# Changelog

## 0.2.0-alpha.10

- Preserve visible teaching titles and restore controls when reopening an older saved collapsed panel.
- Show lesson pointers only on their own course board; keep other workspaces clear and preserve their view.

## 0.2.0-alpha.9

- Turn the core capability course into learning by doing: fine numbered operations, purpose and expected observations, explanatory checks, previous-lesson navigation and independent transfer tasks. Preserve existing course progress.
- Add plain hover/focus explanations and interactive authorization flow diagrams; distinguish actual service receipts from a clearly labeled three-task practice scenario.
- Default normal project recommendations to the configured model API, rank up to ten entries and keep other candidates plus the full catalog visible. Interpret sparse everyday-language goals before retrieval; never disguise a failed API call as a model recommendation.
- Keep the assistant transcript and controls usable alongside teaching, fix narrow-window target visibility, and preserve unsaved goals and course prompt results across redraws/reloads.

## 0.2.0-alpha.8

- 新增14步“从依赖到交付”教程，调用正式工具安装本地依赖、读改需求与源码、测试、实际应用预览、暂停接续、重新验证、ZIP及整轮恢复。
- 实际预览中的确认按钮按当前 iframe 来源、任务和源码版本核对，编号箭头使用页面实际按钮位置。交付核对读取真实 ZIP 正文，不把发起下载称为保存成功。
- 课程独立保存断点与原工作区，保护脚本和测试，免费教学不运行模型；Git仍需安装，Node/npm随桌面提供。新增5项离线行为检查，共201项；安装包检查增加实际课程工具链。

## 0.2.0-alpha.7

- 修正正式开发任务暂停并退出后，运行、预览与打包按钮未及时恢复可用的问题。
- 仅在任务结构或状态变化时刷新开发面板；日志轮询保留预览页面与手动输入。
- 新增真实前端轮询回归，覆盖进程结束与预览保留；当前离线检查共196项。

## 0.2.0-alpha.6

- Add formal Git/npm development environments, dependency installation, script execution, actual application previews, Playwright MCP page inspection, build artifact exports and checkpoint restoration to the built-in operator.
- Bundle standalone Node/npm in maintained desktop packages; preserve complete third-party notices. Keep Git/Python requirements explicit.
- Preserve manual source drafts and selected scripts, stop affected processes on pause/delete, refuse manual-version conflicts, and distinguish current outputs from historical packages.
- Keep fixed local lessons separate from the open-ended project workflow. No paid model acceptance run in this release. See [release notes](docs/releases/0.2.0-alpha.6.md).

## 0.2.0-alpha.5

- 新增“用自然语言修改 Relay”课程：在内置助手中说需求，由同一套软件动作真实读源码、修改、测试、差异、组件预览和逐次回滚。
- 正式助手开场文案以源码JSON为单一来源，课程修改独立副本，用同一个真实组件预览。测试/需求只读，结果与源码hash对齐。
- 本地课程明确不运行模型、仅支持本课文案字段。新增真实AI开发准备清单和草稿，连接权限缺失时不发送模型请求，准备不会自动收费执行。
- 逐步/自动执行可切换；暂停、刷新、继续保留已完成结果，停止检查后仅在明确继续时重跑，人工修改冲突保护保持。
- 新增8项回归及实际安装包的源码组件测试/预览/回滚验证，共186项离线测试。保留原布局、配色和手动源码课程。

## 0.2.0-alpha.4

- 新增人人可用的8步源码自开发教程，实际读取、编辑、测试、差异、回滚和恢复后再测，使用编号箭头指向真实控件。
- 独立练习工程用内置 Node 执行真实测试，不要求 Git/npm、API 或依赖下载；完成后可连接自己的 Git 仓库。
- 课程断点/检查日志保留，支持暂停、刷新后继续与原画板恢复，保护既有源码草稿；测试结果与运行时版本关联，不把停止或无关错误当成通过。
- 回滚后刷新文件列表，练习工程的逐次差异与真实仓库 Git diff 分别说明。增加5项回归检查及实际安装包中的离线源码练习验证；共178项离线测试。

## 0.2.0-alpha.3

- 修复可视窗口中未确认的新要求被继续命令覆盖，以及异步命令交叠；按实际完成顺序确认。新增两项回归用例（173项离线测试）。

## Unreleased

- Clarify macOS/Linux as the required maintenance, CI and desktop release scope. Windows is experimental, optional and no longer blocks publication.
- Recheck historical PDF-path and implicit-publishing failures against successful follow-up runs; update stale 155-test and planned-CI documentation to the actual 162-test desktop baseline.
- Sync edited release notes without replacing published tags or binaries.

## 0.2.0-alpha.2

- Add a project-linked Git source workspace for manual editing and built-in operator actions: actual file reads, CAS writes, unique replacements, deletion, Git diff and persistent per-edit rollback/reapply.
- Add approved typecheck/test/build processes with actual logs, exit codes, stop controls and process-group cleanup; preserve unsaved manual drafts and reject stale source versions.
- Keep Playwright browser control and the existing canvas style. Source tooling is optional and requires local developer tools; no arbitrary Shell, automatic install/push/deploy or paid model acceptance is claimed.

## 0.2.0-alpha.1 — Local desktop distribution

- Added a desktop shell with bundled runtime, a stable workspace origin and separate persistent user data.
- Added process-scoped local-service access, explicit source/license menus and the corresponding source archive in each build.
- Added opt-in source / built-in desktop weekly catalog scheduling with pause, cancel and retained valid data on failure.
- Adopted AGPL-3.0-only for this version and added brand rules; historical MIT grants remain unchanged.
- Added native packaging and packaged-backend checks. Platform build and UI verification are reported separately in release notes.

## 0.1.0-alpha — Initial public source preparation

### Included

- Editable, immersive multi-model canvas with freehand projects, groups and explicit sharing connections.
- Independent agent model bindings, dependency execution, synthesis, downstream context, document extraction and controllable runs.
- Software action assistant and Relay-origin visible execution through Playwright MCP.
- Delete, undo, redo, recovery, workspace/project progress, 19-step local tutorial and feature tour.
- Skill/workflow source catalog, intent-driven prompt refinement, three original starter guides and optional local app adapters.
- Standalone source build, bilingual project introduction, integration/privacy/architecture guides, contribution templates and CI configuration.

### Validation and limits

Clean macOS installation and production build, 155 offline tests passed. Recorded UI media uses an isolated local tutorial and sample data, with no paid inference. Linux/Windows CI and new real-provider acceptance remain to be verified. This is local single-user Alpha source, not a signed desktop installer or hosted multi-user service. Auth Relay and standalone Snapper Assist are not bundled.
