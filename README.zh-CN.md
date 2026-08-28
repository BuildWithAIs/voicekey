<div align="center">
  <a href="https://github.com/BuildWithAIs/voicekey">
    <img src="imgs/logo.png" alt="Voice Key 标志" width="96" height="96">
  </a>

  <h1>Voice Key</h1>

  <p><strong>面向 Windows、macOS 和 Linux 的本地优先按键语音输入工具。</strong></p>

  <p>
    按住快捷键说话，松开即可完成输入。Voice Key 在本机完成语音识别，按需使用你自己的
    LLM 服务润色文本，并把结果写入当前获得焦点的应用。
  </p>

  <p>
    <a href="README.md">English</a>
    · <a href="https://buildwithais.github.io/voicekey/zh/">项目网站</a>
    · <a href="https://github.com/BuildWithAIs/voicekey/releases/latest">下载</a>
    · <a href="https://github.com/BuildWithAIs/voicekey/issues">问题反馈</a>
  </p>

  <p>
    <a href="https://github.com/BuildWithAIs/voicekey/actions/workflows/ci.yml"><img src="https://github.com/BuildWithAIs/voicekey/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
    <a href="https://github.com/BuildWithAIs/voicekey/releases/latest"><img src="https://img.shields.io/github/v/release/BuildWithAIs/voicekey" alt="最新版本"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/BuildWithAIs/voicekey" alt="MIT 许可证"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2f363d" alt="支持平台">
  </p>
</div>

> [!NOTE]
> Voice Key 仍在积极开发中。目前发布的安装包尚未进行商业代码签名，因此安装时可能会看到
> Windows SmartScreen 或 macOS Gatekeeper 的安全提示。

## 为什么选择 Voice Key

Voice Key 让语音输入融入现有桌面工作流。它在后台运行，仅在按住录音快捷键时采集声音，
并把最终文本直接粘贴到光标所在位置。

- **本地优先识别** — 使用按需下载的 ONNX 模型在本机处理音频，无需 ASR API Key。
- **两种识别模式** — 可选择紧凑的经典模式，或带实时文字预览与本地标点的流式模式。
- **可选文本润色** — 使用自己的 API Key 连接 OpenAI、DeepSeek、OpenRouter 或自定义
  OpenAI-compatible 服务。
- **原位翻译** — 通过独立快捷键翻译当前选中文本，并在原应用中直接替换。
- **桌面原生工作流** — 支持全局快捷键、麦克风选择、状态 HUD、开机自启、更新检查和焦点
  应用文本注入。
- **本地历史记录** — 可搜索、复制、查看和删除最近的输入记录；数据在本机最多保留 90 天。
- **中英文界面** — 可在设置中随时切换应用语言。

## 工作原理

```text
按住 PTT 录音快捷键
        ↓
采集麦克风音频
        ↓
在本机运行语音识别
        ↓
按需使用用户配置的 LLM 服务润色或翻译最终文本
        ↓
把结果注入当前应用，并保存到本地历史记录
```

Electron 主进程统一管理录音会话、模型文件、快捷键、凭据、历史记录、更新和文本注入。
语音识别在 Worker 线程中运行，避免模型推理阻塞应用界面。

### 识别模式

| 模式         | 本地模型                                                  | 使用体验                                       | 约需下载 |
| ------------ | --------------------------------------------------------- | ---------------------------------------------- | -------- |
| **经典模式** | SenseVoiceSmall int8                                      | 录音结束后转写，配置更小、更简单               | 240 MB   |
| **流式模式** | Streaming Paraformer bilingual int8 + CT-Transformer 标点 | 说话时显示实时文字，结束后在本地补充中英文标点 | 298 MB   |

两种模式互斥。模型仅在用户从设置页主动下载时写入 Electron 的用户数据目录；应用会校验
固定的文件大小和 SHA-256 哈希。切换模式不会自动删除已经下载的另一套模型。

## 安装

请从 [GitHub Releases](https://github.com/BuildWithAIs/voicekey/releases/latest) 下载最新版本。

| 平台                        | 安装包                      | 说明                                       |
| --------------------------- | --------------------------- | ------------------------------------------ |
| Windows x64                 | 安装程序（`.exe`）          | 安装包未签名，SmartScreen 可能会显示提示。 |
| macOS Intel / Apple 芯片    | 磁盘映像（`.dmg`）          | 需要麦克风和辅助功能权限。                 |
| Linux x86_64                | AppImage                    | 推荐用于常规 Linux X11 发行版。            |
| Omarchy / Arch Linux x86_64 | pacman 包（`.pkg.tar.zst`） | 提供受管理的 Hyprland 集成流程。           |

### 首次使用

1. 打开**设置**并选择麦克风。
2. 下载**经典模式**或**流式模式**所需的本地识别模型。
3. 如需文本润色和翻译，配置自己的 LLM 服务。
4. 把光标放在任意输入框中，按住录音快捷键说话，松开后等待文本写入。

Windows 和 Linux 的默认录音快捷键是 `Control+Shift+Space`；macOS 的默认快捷键是
`Option`（`Alt`）。所有快捷键都可以在设置中修改。

### Windows

如果出现 SmartScreen 提示，请选择**更多信息**，确认安装包来自本仓库的 Releases 页面，
再选择**仍要运行**。

### macOS

应用需要以下权限：

- **麦克风**：录制需要转写的语音。
- **辅助功能**：监听录音快捷键，并把文字写入其他应用。

如果 macOS 提示未签名应用“已损坏”，请先把应用移动到 `/Applications`，再运行：

```bash
xattr -cr "/Applications/Voice Key.app"
```

随后前往**系统设置 → 隐私与安全性 → 辅助功能**，为 Voice Key 开启权限。

### Linux 与 Omarchy

在常规 x86_64 Linux 发行版中，为下载的 AppImage 添加执行权限后启动：

```bash
chmod +x "/path/to/Voice Key-Linux.AppImage"
"/path/to/Voice Key-Linux.AppImage"
```

部分新版发行版默认不包含 FUSE 2。如果 AppImage 提示缺少 `libfuse.so.2`，请安装系统的
`fuse2` 或 `libfuse2` 包，也可以使用 AppImage 的提取运行模式：

```bash
APPIMAGE_EXTRACT_AND_RUN=1 "/path/to/Voice Key-Linux.AppImage"
```

Omarchy 或 Arch Linux 用户可以安装下载的 pacman 包：

```bash
sudo pacman -U "/path/to/voice-key-package.pkg.tar.zst"
```

在 Omarchy/Hyprland 中，请打开**设置 → Linux 与 Omarchy 集成**并点击**安装集成**。
Voice Key 只会管理 `~/.config/hypr/bindings.lua` 中带明确标记的配置块；安装时会检查
快捷键冲突、保留备份、重载 Hyprland，并在校验失败时自动回滚。

执行文本注入时，集成会通过 `wl-copy --sensitive` 临时提供剪贴板文本，并使用 `wtype`
Wayland 虚拟键盘发送粘贴快捷键；pacman 安装包已经声明这两个工具为依赖。

Linux X11 继续使用标准的全局键盘监听与文本注入后端。其他 Wayland 合成器尚未提供完整的
PTT 按下/释放支持；如果没有使用已适配的 Hyprland 集成，请切换到 X11 会话。

## 隐私与数据流

本地识别不会上传麦克风音频。可选云端功能的边界更窄，并且需要用户主动启用：

- **文本润色**只会把最终识别文本发送给已配置的 LLM 服务，不会发送原始音频。
- **翻译**会把当前选中的文本发送给该服务，并用返回结果替换选区。
- **历史记录和模型文件**保存在应用的本地用户数据目录。
- **API Key** 由 Electron 主进程管理，不会写入应用日志。

如需完全离线使用，请保持文本润色和翻译功能关闭。

## 从源码运行

### 环境要求

- [Node.js 20](https://nodejs.org/)
- npm
- Electron 原生依赖所需的平台构建工具

### 开发环境

```bash
git clone https://github.com/BuildWithAIs/voicekey.git
cd voicekey
npm ci
npm run dev
```

常用命令：

```bash
npm run quality       # ESLint、格式检查、类型检查和测试
npm run type-check    # 仅运行 TypeScript 类型检查
npm test              # 运行单元测试
npm run build         # 生产构建与当前平台安装包
```

构建产物会写入 `release/<version>/`。项目网站是 `website/` 下独立的 Astro 项目，可使用
根目录中的 `website:*` npm 脚本进行开发和构建。

## 项目结构

```text
electron/
  main/       Electron 生命周期、录音、ASR、快捷键、LLM、历史记录和文本注入
  preload/    通过 contextBridge 暴露给渲染窗口的类型化 API
  shared/     跨进程类型、常量、模型元数据与多语言资源
src/
  components/ React UI、录音桥接、HUD、图表与通用组件
  pages/      首页、设置和历史记录页面
website/      用于 GitHub Pages 的 Astro 项目网站
public/       桌面渲染进程使用的运行时资源
build/        安装包图标与打包资源
```

各目录内的 README 提供了更详细的职责地图。追踪运行时或界面改动时，可以先阅读
[`electron/README.md`](electron/README.md) 和 [`src/README.md`](src/README.md)。

## 参与贡献

欢迎提交贡献。发起 Pull Request 前，请：

1. 先搜索[现有 Issues](https://github.com/BuildWithAIs/voicekey/issues)，或为缺陷和建议创建范围
   清晰的新 Issue。
2. 把系统权限操作保留在 Electron 主进程，并校验渲染进程传入的 IPC 数据。
3. 当行为或模块职责发生实质变化时，同步更新对应目录的 README。
4. 运行 `npm run quality`，并在 PR 中说明已经验证的平台或运行链路。
5. 使用 [Conventional Commits](https://www.conventionalcommits.org/) 风格的提交信息。

请勿在 Issue 或日志中包含 API Key、转写正文或原始录音。

## 开源协议

Voice Key 使用 [MIT License](LICENSE) 开源。
