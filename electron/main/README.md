# main/

Electron 主进程目录，负责窗口管理、IPC、录音流程、ASR 调用与文本注入。

## 文件列表

- `main.ts` - 应用入口；创建后台/设置/浮窗窗口、托盘菜单与 IPC 处理，协调 PTT 录音 → 转录 → 注入流程并初始化 FFmpeg。
- `i18n.ts` - 主进程 i18next 初始化与语言切换。
- `config-manager.ts` - 使用 `electron-store` 持久化应用偏好、ASR 配置与快捷键配置。
- `history-manager.ts` - 录音历史存储（最多 1000 条），提供增删清空与统计接口。
- `hotkey-manager.ts` - 基于 `globalShortcut` 的全局快捷键注册/注销。
- `iohook-manager.ts` - 基于 `uiohook-napi` 的键盘钩子，检测 PTT 组合键按住状态。
- `asr-provider.ts` - 调用 GLM ASR API（axios + FormData）上传音频并返回转录结果。
- `text-injector.ts` - 基于 `@nut-tree-fork/nut-js` 注入文本；Windows 使用剪贴板粘贴，macOS 校验辅助功能权限。
