# preload/

Electron 预加载脚本目录，作为主进程与渲染进程之间的安全桥梁。

## 文件列表

### `preload.ts`

通过 `contextBridge` 暴露 `window.electronAPI`，封装配置、本地 ASR 模型下载、录音、历史、日志与更新相关 IPC。

## 录音相关 API

- `onStartRecording(callback)` - 监听录音开始事件，并下发当前 `sessionId`。
- `onStopRecording(callback)` - 监听录音停止事件。
- `sendAudioChunk(payload)` - 发送单个录音 `chunk`，包含 `sessionId`、`chunkIndex`、`isFinal`、`mimeType` 与 `buffer`。
- `sendAudioLevel(level)` - 向 HUD 同步实时音量。
- `sendError(error)` - 上报渲染进程录音错误。
- `cancelSession()` - 取消当前会话。

## 其他 API

- `getConfig()` / `setConfig()` - 读取和保存应用配置。
- `testConnection(config)` - ASR 连接校验。
- `getLocalASRStatus()` / `downloadLocalASR()` / `onLocalASRDownloadProgress(callback)` - 本地 SenseVoiceSmall 模型状态、下载与进度监听。
- `testRefineConnection(config)` - 文本润色连接校验。
- `getHistory()` / `clearHistory()` / `deleteHistoryItem(id)` - 管理转录历史。
- `checkForUpdates()` / `getUpdateStatus()` / `openExternal(url)` - 更新相关接口。
- `getLogTail(options)` / `openLogFolder()` / `log(entry)` - 日志相关接口。
