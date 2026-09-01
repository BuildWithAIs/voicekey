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
2. 经典模式由后台窗口每 30 秒轮转一个音频 chunk，主进程转为 16 kHz 单声道 WAV 后调用本地 SenseVoiceSmall。
3. 流式模式由 AudioWorklet 每约 100 ms 发送 Float32 PCM，主进程 worker 使用 X-ASR-zh-en 480 ms Zipformer2 Transducer 持续解码，并把带标点/大小写的 partial text 推送给 HUD。
4. 两种 ASR 模式互斥；流式模式停止时先 flush 句尾 PCM，由 X-ASR worker 直接生成 final text，不做 SenseVoice 二次识别或独立标点推理。
5. 最终文本就绪后，如果用户启用润色，仅调用一次云端 LLM；随后执行文本注入与历史记录写入。
6. 单次会话最长 5 分钟；到上限后自动停录并进入处理阶段。
