# Changelog

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
