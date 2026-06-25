# electron/

主进程相关代码目录，运行在 Node.js / Electron 环境中，负责应用生命周期、系统能力与核心录音链路。

## 技术栈

- Electron 30
- TypeScript
- `uiohook-napi`
- `@nut-tree-fork/nut-js`
- `fluent-ffmpeg`
- `electron-store`
- `axios`

## 目录结构

### `main/`

主进程核心模块：窗口、IPC、录音、ASR、润色、注入与托盘逻辑。

### `preload/`

`contextBridge` 安全桥，向渲染进程暴露 `window.electronAPI`。

### `shared/`

跨进程共享类型、常量与本地化资源。

## 当前录音链路

1. 主进程通过快捷键开始会话并生成 `sessionId`。
2. 后台渲染窗口开始录音，在同一会话内每 29 秒轮转一个音频 chunk。
3. 主进程收到每个 chunk 后立即转码并调用当前配置的 ASR provider（GLM 或本地 SenseVoiceSmall）。
4. 全部 chunk 完成后按顺序合并文本，再统一执行润色、按内容结构优化排版、保留多行换行的文本注入与历史记录写入。
5. 单次会话最长 3 分钟；到上限后自动停录并进入处理阶段。
