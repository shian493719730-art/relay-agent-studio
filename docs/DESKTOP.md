# 本地桌面部署

桌面包自带 Electron/Node 运行环境和已构建画板。普通用户不需要安装 Node、npm、Python 或 Codex。真实模型仍使用自己配置的 API；无需密钥即可编辑画板和进行本地教程。

## 安装与启动

从项目 [Releases](https://github.com/shian493719730-art/relay-agent-studio/releases) 下载匹配系统和架构的包，核对该版本说明中的验证范围。

当前以 macOS、Linux 为维护和发布验收范围。Windows 不作为必须满足的兼容、测试或发版条件；历史附件与构建配置仅供实验性参考，不承诺完整支持。见[平台范围](PLATFORMS.md)。

- macOS：打开 DMG，把 Relay 拖到 Applications；也可解压对应 ZIP 后打开 Relay.app。Apple Silicon 选 arm64，Intel 选 x64。
- Windows（实验性历史附件）：可自行尝试 setup.exe 或 portable.exe，退出后再替换；后续不默认构建，不要求满足当前验收。
- Linux：使用 AppImage，或解压 tar.gz 后运行其中的 relay-agent-studio。运行依赖取决于发行版的桌面环境，按实际发布验证记录判断支持范围。

当前社区构建没有 Developer ID 公证或 Windows 商业签名证书。下载首次运行可能被系统要求核验发布者；应由用户在操作系统正常界面核对来源并处理，软件不会关闭或绕过系统安全保护。

打开后进入原有沉浸式画板，顶部「连接」配置各个成员自己的模型；「授权」连接可选的本机 Auth Relay。Playwright 可视执行仍需本机 Chrome；普通画板、文件读取和团队协作不依赖它。

## 用户数据与升级

桌面版使用独立的用户目录：

| 系统 | 默认数据位置 |
| --- | --- |
| macOS | ~/Library/Application Support/Relay Agent Studio |
| Windows（实验性） | %APPDATA%/Relay Agent Studio |
| Linux | Electron 为当前桌面环境确定的 appData 目录下 /Relay Agent Studio，通常是 ~/.config/Relay Agent Studio |

其中 service 保存模型连接、文件正文和执行记录，浏览器存储保存画板、草稿、文件缓存和编辑历史，logs 保存本机服务日志。API 密钥仍为本机服务端文件存储，不是加密保险箱；备份不能公开分享。

更新只替换应用文件，数据目录保留。先退出 Relay，再备份整个用户目录和需要的文件原件；通过「帮助 → 查看新版本」下载新版并安装。当前不自动下载执行更新。需要还原时先彻底退出应用，再使用自己确认有效的完整目录备份；不要在应用运行时混合旧、新数据库文件。

网页版和桌面版是独立工作区，不自动搬运或清空原网页的画板、文件和 API 配置。当前不提供一键完整迁移；可继续保留旧网页工作区，在桌面版重新加入需要的材料。不要把一个普通画板导出误认为完整的文件/凭据备份。

高级用途可在启动前设置 RELAY_DESKTOP_USER_DATA 指向独立目录。应用窗口使用固定 relay://workspace 来源，内部服务每次可选择空闲回环端口，端口变化不改变桌面画板的存储来源。服务请求需要本次进程凭据；不会直接连接到另一个已占用端口的服务。

## 每周 GitHub 资源检查

桌面版自带每7天的本机调度，依据有效目录日期或上次完成时间计算；只有应用运行时执行，错过时间后在下次运行补检。无需另外部署 Codex 每周任务。

在能力库可查看状态、暂停/开启定时检查、手动更新或停止当前更新。失败、限流或不完整结果明确显示，保留有效目录，并延后重试；检查不会调用收费模型，也不会自动安装和执行新发现的外部脚本。源码部署默认不启动此调度；需要时可显式设置 RELAY_WEEKLY_UPDATES=1。

## 许可与源码

本版本自有代码采用 AGPL-3.0-only。帮助菜单与画板菜单可查看版权、完整许可和品牌规则；文件菜单可保存应用随附的对应源码 ZIP，无需联网。合法 Fork 和商用仍被允许，并须遵守许可义务；旧 MIT 版本授权继续有效。见 [许可说明](LICENSING.md)。

## 从源码制作本地包

开发者需要 Node.js 24+、npm、Python 3 和 Git。先提交/暂存准备分发的源文件，构建脚本从 Git index 生成对应源码快照，不复制本机运行数据。

```bash
npm ci
npm run desktop:dev     # 编译并打开开发桌面窗口
npm run desktop:pack    # 生成未压缩应用目录
npm run desktop:dist    # 生成当前平台安装/分发包
```

产物在 desktop-release/。Desktop packages 默认构建和检查 macOS、Linux；Windows 配置保留供自愿贡献者在对应环境自行试编译，不作为发布门槛。构建成功与真实界面验收分开记录。打包后的检查使用 desktop:smoke，验证服务隔离、原版画板、随包源码和真实 PDF 解析进程，不调用模型。

## 无需开发环境的源码练习

安装后打开「新手教程 → 人人都能自开发」，通过内置 Node 对独立的本地练习文件实际读、改、测和回滚，不需要 Git/npm、API 或依赖下载。接自己的仓库仍需 Git 与该项目开发环境；课程不会自动修改应用安装文件或启动收费模型。见[源码课程](SELF_DEVELOPMENT.md)。
