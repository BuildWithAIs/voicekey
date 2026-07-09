# main/

## Microphone Selection

The selected microphone is stored by `config-manager.ts` as part of ASR config.
`audio/session-manager.ts` reads that value when a recording session starts and
forwards the device ID to the hidden recording renderer. An empty value keeps the
existing system-default microphone behavior.

Electron 主进程目录，负责窗口管理、IPC、录音编排、ASR/润色调用与文本注入。

## 文件列表

- `main.ts` - 应用入口，初始化窗口、托盘、IPC、服务与录音流程。
- `i18n.ts` - 主进程 `i18next` 初始化与语言广播。
- `env.ts` - 开发/生产环境资源路径解析。
- `config-manager.ts` - 基于 `electron-store` 的配置持久化，含旧版润色 Base URL 配置到 DeepSeek/OpenRouter/custom-compatible 的迁移、润色输出英文开关迁移与 API Key 加密。
- `logger.ts` - `electron-log` 初始化与日志保留策略。
- `history-manager.ts` - 转录历史存储与统计。
- `hotkey-manager.ts` - Electron `globalShortcut` 管理。
- `iohook-manager.ts` - `uiohook-napi` 键盘监听。
- `asr-provider.ts` - ASR Provider 入口，按配置调用 GLM API 或本地 SenseVoiceSmall int8。
- `local-asr-manager.ts` - 本地 SenseVoiceSmall int8 ONNX 模型状态检测、按需下载（含 30s 空闲超时与流错误清理）、SHA-256 校验与 `sherpa-onnx` worker 线程中文识别（显式 `zh`）。
- `local-asr-worker.ts` - Worker 线程内创建并缓存 `sherpa-onnx` recognizer，执行模型校验与本地 WAV 转写，避免阻塞主进程。
- `refine/` - 文本润色模块，使用 OpenAI-compatible Chat Completions 做后处理、动态 prompt 组装、远程术语表缓存刷新与连接校验。
- `translation/` - 文本翻译模块，通过快捷键复制选中文本 → LLM API 翻译 → 粘贴替换，复用润色 API 配置。
- `text-injector.ts` - 基于 `@nut-tree-fork/nut-js` 的文本注入，优先保证多行文本的换行保真。
- `updater-manager.ts` - GitHub Releases 更新检查。
- `audio/` - 录音会话与分段转写流水线。
- `hotkey/` - 快捷键解析与 PTT 行为绑定。
- `tray/` - 托盘菜单与本地化刷新。
- `window/` - 后台窗口、设置窗口与 HUD 管理。
- `notification/` - 系统通知封装。
- `ipc/` - IPC 处理器模块。
