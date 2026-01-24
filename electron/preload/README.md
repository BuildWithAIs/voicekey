# preload/

Electron 预加载脚本目录，作为主进程和渲染进程之间的安全桥梁。

## 文件列表

### `preload.ts`

IPC 通信桥接脚本，运行在渲染进程上下文但可访问部分 Node.js API：

#### 功能职责

- **contextBridge** - 安全地暴露 `window.electronAPI` 给渲染进程
- **IPC 封装** - 封装 `ipcRenderer.invoke` 和 `ipcRenderer.on` 调用
- **类型定义** - 导出 `ElectronAPI` 接口供渲染进程 TypeScript 使用

#### 暴露的 API

**配置管理**

- `getConfig()` - 获取完整应用配置
- `setConfig(config)` - 保存配置
- `testConnection(config)` - 测试 ASR API 连接

**录音会话**

- `onStartRecording(callback)` - 监听录音开始信号（主进程 → 渲染）
- `onStopRecording(callback)` - 监听录音停止信号（主进程 → 渲染）
- `sendAudioData(buffer)` - 发送录制的音频数据（渲染 → 主进程）
- `sendError(error)` - 发送错误信息
- `cancelSession()` - 取消当前会话并停止录音

**快捷键**

- `registerHotkey(accelerator)` - 注册全局快捷键
- `unregisterHotkey(accelerator)` - 注销快捷键

**事件监听**

- `onSessionStatus(callback)` - 会话状态变化
- `onTranscription(callback)` - 转录结果返回
- `onError(callback)` - 错误通知

**系统信息**

- `platform` - 当前操作系统平台（darwin/win32/linux）
- `checkForUpdates()` - 请求 GitHub Releases 最新版本信息
- `getUpdateStatus()` - 获取启动时自动检查的缓存结果（如果有）
- `openExternal(url)` - 打开外部链接（用于发布页）

**日志**

- `getLogTail(options)` - 获取日志尾部文本（可限制读取字节数）
- `openLogFolder()` - 打开日志目录
- `log(entry)` - 渲染进程发送日志到主进程（带 level/message）

#### 安全机制

- 使用 `contextBridge` 避免直接暴露 Node.js 能力
- 所有 IPC 调用基于预定义的 `IPC_CHANNELS` 常量
- 禁用 `nodeIntegration`，启用 `contextIsolation`
