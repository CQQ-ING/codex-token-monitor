# codex-token-monitor · Codex Token 监测

![Windows x64](https://img.shields.io/badge/platform-Windows_x64-0078D4) ![MIT](https://img.shields.io/badge/license-MIT-blue) ![C%23](https://img.shields.io/badge/C%23-.NET_10-512BD4)

在 **Codex 桌面版**的回复操作栏和输入框附近增加 Token 用量入口，读取本机真实日志，查看单轮与整个会话的输入、输出及缓存用量。

这是基于 [codex-statusbar](https://github.com/dongyue-19/codex-statusbar) 修改的社区工具，非 OpenAI 官方产品。当前默认采用页面按钮模式。

## 下载与快速开始

**普通用户下载 [Releases 中的 Windows 免安装压缩包](https://github.com/CQQ-ING/codex-token-monitor/releases/latest)，不要下载 GitHub 自动生成的 Source code 包。**

1. 解压完整压缩包，保留所有文件。
2. 在 Codex 中通过 **文件 → 退出** 完全退出应用。
3. 双击 `start.cmd`，自动启动监测程序及 Codex。
4. 进入任意对话，稍等片刻即可看到用量按钮。

无需管理员权限，也无需安装 Node.js、Python 或 .NET。找不到 Codex 时，脚本会提示填写桌面程序 `ChatGPT.exe` 的完整路径。

以后需要此功能时，继续通过 `start.cmd` 启动。直接从原有入口启动可能没有调试连接。

## 功能

| 入口 | 用途 |
| --- | --- |
| 回复下方的数据库图标 / 用量 | 查看本轮输入、输出、缓存、总 Token 和缓存命中率 |
| 上下文圆环旁的数据库图标 | 查看当前会话累计用量；平时仅显示图标 |

- 单轮按钮与原生复制、反馈、朗读、更多等功能键处于同一行，并直接跟随原生容器显隐。
- 最新回复与原生功能键同时显示；历史回复随鼠标移入、移出该回复区域一起显隐。
- 点击打开浮动详情，不挤压正文或输入框；再次点击、点击空白处或按 Esc 关闭。
- 切换已有对话、新建对话后自动加载，按会话和轮次匹配真实日志。
- 没有可用记录时显示“用量不可用”，不估算或编造数值。

**会话累计 Token 与上下文圆环是两种数据。** 圆环表示上下文占用；累计用量来自会话日志中的用量记录，可能包含多次模型调用。缓存 Token 属于输入的一部分，总量按输入 + 输出展示，不重复加缓存。

## 兼容范围与已知限制

- Windows x64 + Codex 桌面版；不适用于浏览器 ChatGPT、手机、macOS 或 Linux。
- 需要本机 Codex 的 sessions 日志和 state 数据库。默认读取 `%USERPROFILE%\.codex`；设置 `CODEX_HOME` 时跟随该变量。
- 当前适配依赖 Codex 的 DOM、React 属性和日志格式，客户端更新后可能需要调整。
- 已在开发者本机验证最新 / 历史回复、对话切换和新对话；**未完成跨电脑兼容验证，不能保证所有 Codex 版本通用**。
- 老日志缺失统计、会话仍在进行或历史轮次无法匹配时，可能显示用量不可用。

## 隐私与工作方式

程序在本机读取日志，通过本机 `127.0.0.1:9338` 调试连接向 Codex 页面添加按钮。功能不需要上传聊天记录或 API 密钥，不修改 Codex 安装文件，也不设置开机自启。

启动参数会为本次 Codex 开启本机调试端口。该端口可控制应用页面，请勿转发或暴露到外网。发布包不包含开发者聊天记录、账户信息、密钥或个人配置。

## 常见问题

**没有按钮？** 完全退出 Codex 后从 `start.cmd` 启动，等待数秒；检查是否已有旧版监测程序占用单实例。若客户端更新后失效，可能需要重新适配页面。

**如何退出？** 在系统托盘找到“Codex 页面 Token”，右键退出。下次正常启动 Codex 时不使用本工具即可停用；也可删除解压目录。

**如何查看连接状态？** 查看 `%LOCALAPPDATA%\CodexStatusbar\page-status.json`。提交问题时请描述 Windows / Codex 版本和复现步骤，不要上传完整聊天日志。

**为什么累计量比上下文圆环大？** 累计量汇总会话多次调用，圆环描述当前上下文占用，含义不同。

## 源码结构与编译

```text
src/CodexStatusbar/
  PageTokens.js          页面按钮、浮层及会话识别
  PageTokenContext.cs    页面连接和按会话读取统计
  RolloutReader.cs       日志读取
  TpsTracker.cs          用量记录解析（含既有状态栏代码）
scripts/launch.ps1       自动定位并启动 Codex
start.cmd                普通用户入口
build.cmd                源码编译入口
LICENSE*                 开源许可证
THIRD-PARTY-NOTICES.md    上游来源声明
```

开发需要 **.NET 10 SDK**。双击 `build.cmd`，或执行：

```powershell
dotnet publish src/CodexStatusbar/CodexStatusbar.csproj -c Release -r win-x64 --self-contained true -o dist
```

编译结果为 `dist/CodexStatusbar.exe`。将其复制到仓库根目录，与 `start.cmd`、`scripts/` 一起使用。源码保留上游其他模式的实现，发布包默认只启动 `--page-tokens` 页面模式。

## 致谢与许可

采用 MIT 许可证。保留 [codex-statusbar](https://github.com/dongyue-19/codex-statusbar) 及其上游的许可证和声明；更多来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

本仓库的改动主要是页面用量入口、浮动详情、多对话匹配和与原生操作栏同步显隐。Codex、ChatGPT 与 OpenAI 商标归各自所有者所有，本项目不隶属于 OpenAI。
