# 平台范围与验收

当前维护和发布验收以 **macOS、Linux** 为范围。**Windows 不作为当前必须满足的兼容、测试或发版条件**；不要求贡献者为 Windows 阻塞改动。已有 Windows 构建配置和旧版附件保留为实验性参考，没有持续维护或完整功能兼容承诺。

| 平台 | 当前范围 | 已有证据 | 待验证边界 |
| --- | --- | --- | --- |
| macOS Apple Silicon / arm64 | 主要实测平台，默认 CI 与打包必需 | 自动测试、生产构建、打包后真实 PDF 解析与隔离检查；实际窗口、保存/重开、撤销/重做、每周检查暂停及退出停服务 | 无 Developer ID 公证；Intel 包和新真实供应商流程未补验 |
| Linux x64 | 默认 CI 与打包必需 | Ubuntu runner 自动测试、构建、实际打包后服务与文件解析检查 | 不代表所有发行版，完整交互界面与桌面依赖仍待实机验收 |
| Windows x64 | 实验性参考，不作为验收条件 | 0.2.0-alpha.1 曾完成该平台的自动测试、打包与服务检查，旧 setup/portable 附件保留 | 以后不默认运行 Windows CI 或自动出包；未完成完整实机界面验收，无商业签名，不承诺兼容 |

macOS 的 Auth Relay / Snapper 本机适配器仍依赖另行安装的外部应用，不应按主画板的跨平台结果推断它们能在其他系统运行。收费模型测试仍需单独授权和有效额度；本轮平台与文档维护没有调用收费模型。

## CI 与发布

- `CI`：在 macOS、Ubuntu 执行干净依赖安装、公开文件检查、类型检查、全部离线行为测试和生产构建。任一失败仍应修复。
- `Desktop packages`：在 macOS、Ubuntu 构建，并验证安装包自身的本机服务、实际 PDF worker、对应源码与凭据隔离；通过后才进入新版本发布。Windows 不在该任务矩阵中。
- 已发布版本的标签和二进制不会因说明修订而替换。`Release notes` 只将对应 `docs/releases/<版本>.md` 的文字同步到该 Release 页面，不新建发布或更改附件。
- 保留 Windows 的 electron-builder 配置，方便自愿贡献者在对应环境自行尝试 `npm run desktop:dist`；这不是当前维护方的验收承诺。

## 已核对的 GitHub 报错（2026-11-19）

| 历史记录 | 原因 | 修复与验证 |
| --- | --- | --- |
| [首次 CI](https://github.com/shian493719730-art/relay-agent-studio/actions/runs/44612570696) | PDF.js 的资源目录要求以正斜杠结尾，Windows 路径未符合约定 | `server/document-worker.mjs` 统一路径；后续 [CI](https://github.com/shian493719730-art/relay-agent-studio/actions/runs/44621833495) 全部162项通过 |
| [首次桌面打包](https://github.com/shian493719730-art/relay-agent-studio/actions/runs/44620654647) | electron-builder 隐式尝试发布，缺少 GH_TOKEN | 打包明确 `--publish never`，独立发布步骤使用仓库短期令牌；后续 [桌面流程](https://github.com/shian493719730-art/relay-agent-studio/actions/runs/44621833474) 包括实际打包后检查和发布全部通过 |

上述是历史失败，不能通过删除记录当作修复；当前平台范围调整也不是这些故障的修复方式。162项和三个系统的历史通过属于0.2.0-alpha.1的实际证据；后续必需范围为macOS、Linux，以相应提交的Actions结果为准。
