# shared/

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量（含语言快照、Overlay 状态、历史记录、更新信息、日志 payload、AI 润色开关）。
- `constants.ts` - GLM / Groq ASR/Chat 配置、默认快捷键、录音参数、历史与日志保留/大小限制。
- `i18n.ts` - 共享 i18n 资源与语言解析工具（resolveLanguage/getLocale）。
- `locales/en.json` - 英文文案资源（含设置校验提示）。
- `locales/zh.json` - 中文文案资源（含设置校验提示）。
