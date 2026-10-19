# preload/

## Microphone Selection

`RecordingStartPayload` may include `microphoneDeviceId`; the hidden recorder
uses it as a capture hint while preload keeps the same listener API.

Electron 预加载脚本目录，作为主进程与渲染进程之间的安全桥梁。

## 文件列表

### `preload.ts`

通过 `contextBridge` 暴露 `window.electronAPI`，封装配置、两套本地 ASR 模型下载/删除、模型目录打开、本机能力读取、经典/流式录音、Linux/Omarchy 集成、历史、日志与更新相关 IPC。

## 录音相关 API

- `onStartRecording(callback)` - 监听录音开始事件，并下发当前 `sessionId`。
- `onStopRecording(callback)` - 接收带会话 ID 的正常停止或取消事件。
- `sendAudioChunk(payload)` - 松键后发送完整录音（索引为 0 的单个 final `chunk`），包含 `sessionId`、`chunkIndex`、`isFinal`、`mimeType` 与 `buffer`。
- `sendStreamingAudioFrame(payload)` / `sendStreamingAudioEnd(payload)` - 按序发送 Float32 PCM 帧，并在 worklet flush 后发送流式会话结束标记。
- `sendAudioLevel(level)` - 向 HUD 同步实时音量。
- `sendError(error, sessionId)` - 上报带会话身份的录音错误。
- `cancelSession()` - 取消当前会话。
- `stopSession({ sessionId, reason })` - 录音窗口报告麦克风流意外结束或时长上限，由主进程核验会话与来源后停录。

## 其他 API

- `getConfig()` / `setConfig()` - 读取和保存应用配置；普通读取中的已保存 API Key 使用占位符。
- `getConfigSecret(request)` - 设置页点击显示时按 LLM Provider 请求当前版本保存的 API Key 原文，主进程会校验请求来源。
- `getLocalASRStatus()` / `downloadLocalASR()` / `deleteLocalASR()` / `onLocalASRDownloadProgress(callback)` - 经典本地模型状态、下载、删除与进度监听。
- `getStreamingASRStatus()` / `downloadStreamingASR()` / `deleteStreamingASR()` / `onStreamingASRDownloadProgress(callback)` - 实时识别组件的组合状态、缺失权重下载、成组删除与进度监听。
- `openASRModelDirectory(mode)` - 在文件管理器打开标准或实时识别模型的安装目录，只接受模型类型，不接受渲染进程传入路径。
- `getHostCapabilities()` - 读取本机逻辑核数与内存，以及是否达到实时识别建议配置。
- `testRefineConnection(config)` - 文本润色连接校验。
- `getHistory(request)` / `getHistorySummary()` / `clearHistory()` / `deleteHistoryItem(id)` - 分页查询、汇总及管理转录历史。
- `checkForUpdates()` / `getUpdateStatus()` / `openExternal(url)` - 更新相关接口。
- `getLogTail(options)` / `openLogFolder()` / `log(entry)` - 日志相关接口。
- `getLinuxIntegrationStatus()` / `installLinuxIntegration()` / `removeLinuxIntegration()` - 查询、安装/更新与移除受管理的 Omarchy/Hyprland 集成；主进程限制为设置窗口调用。

- `recordingStopped(sessionId)` 确认录音资源释放；`microphoneFallback(sessionId, label)` 通知实际回退设备。
- `cancelASRDownload(mode)` 取消下载/校验，保留已完成文件。模型状态带 `runtimeState`，下载进度区分传输、校验和运行时检查。
