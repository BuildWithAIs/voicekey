# electron/

主进程（Main Process）代码目录，运行在 Node.js 环境中，负责应用生命周期、系统级操作和核心业务逻辑。

## 技术栈

- **Electron 30** - 桌面应用框架
- **TypeScript** - 类型安全
- **uiohook-napi** - 低级键盘钩子（PTT）
- **@nut-tree-fork/nut-js** - 跨平台键盘模拟
- **fluent-ffmpeg** - 音频格式转换
- **electron-store** - 配置持久化
- **axios** - HTTP 请求

## 目录结构

### `main/`

主进程核心模块：

- `main.ts` - 应用入口、窗口管理、IPC 处理、PTT 流程编排
- `audio/` - 音频处理流水线（录音会话、转换、ASR、注入）
- `hotkey/` - 快捷键解析与 PTT 行为绑定
- `ipc/` - IPC 处理器（配置、会话、历史、日志、更新、浮窗）
- `tray/` - 托盘菜单与本地化刷新
- `window/` - 后台/设置/浮窗窗口管理
- `notification/` - 系统通知封装
- `i18n.ts` - 主进程 i18next 初始化与语言切换
- `config-manager.ts` - 配置持久化（基于 `electron-store`）
- `history-manager.ts` - 转录历史存储（基于 `electron-store`）
- `hotkey-manager.ts` - 全局快捷键管理（基于 `globalShortcut`）
- `iohook-manager.ts` - 低级键盘钩子（基于 `uiohook-napi`）
- `asr-provider.ts` - GLM / Groq ASR 服务封装
- `text-injector.ts` - 文本注入模拟（基于 `nut-js`）
- `logger.ts` - 主进程日志与保留策略
- `updater-manager.ts` - 版本检查与更新跳转

### `preload/`

IPC 桥接层：

- `preload.ts` - 使用 `contextBridge` 安全暴露 API 给渲染进程

### `shared/`

跨进程共享代码：

- `types.ts` - TypeScript 类型定义、IPC 通道常量
- `constants.ts` - 应用级常量（GLM / Groq API 配置、默认快捷键、音频参数）

## 根文件

### `electron-env.d.ts`

Electron 环境类型声明

## 核心流程

### PTT（Push-to-Talk）录音流程

1. **检测按键** - `iohook-manager` 监听低级键盘事件
2. **触发录音** - 主进程发送 `SESSION_START` 信号给渲染进程
3. **音频采集** - 渲染进程通过 Web Audio API 录制音频
4. **数据传输** - 渲染进程将音频数据发送回主进程
5. **格式转换** - `fluent-ffmpeg` 转换 WebM → MP3
6. **语音识别** - `asr-provider` 调用配置的 GLM / Groq API 转录
7. **文本注入** - `text-injector` 模拟键盘输入到活动窗口

### 配置管理

- 配置存储路径：`~/.config/voice-key/voice-key-config.json`（macOS/Linux）或 `%APPDATA%/voice-key/...`（Windows）
- 内容：ASR API 配置、快捷键配置
- 通过 IPC 与设置页面同步

### IPC 通信架构

```
Renderer Process ←→ Preload Script ←→ Main Process
  (React UI)      (contextBridge)    (Node.js API)
```

所有通信基于预定义的 `IPC_CHANNELS` 常量，确保类型安全。

## 安全机制

- **contextIsolation**: 启用（渲染进程与主进程隔离）
- **nodeIntegration**: 禁用（渲染进程不能直接访问 Node.js）
- **contextBridge**: 仅暴露必要的 API 给渲染进程
