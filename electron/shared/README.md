# shared/

## Microphone Selection

`ASRConfig` stores the selected microphone device ID and last known label.
`RecordingStartPayload` carries the device ID from main to the hidden recorder,
and `MICROPHONE_INPUT` defines the renderer select sentinel plus config string
length caps.

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量；包含 ASR provider/本地模型下载状态、语言快照、Provider-aware LLM 润色配置、固定 OpenRouter 模型类型、设置窗口 API Key 原文读取请求、支持识别/润色两步 HUD 处理阶段的 Overlay、历史、日志、润色输出英文开关、`RecordingStartPayload` 与 `AudioChunkPayload`。
- `constants.ts` - GLM ASR / 本地 SenseVoiceSmall int8 ONNX 主备下载源与中文识别语言参数 / DeepSeek 与 OpenRouter LLM Provider 默认值及固定模型清单、API Key 渲染进程占位符、内部 reasoning 长度阈值与 timeout、文本润色默认值、内置术语表回退值与远程术语表源配置、refine system prompt 构造（可按配置追加整体输出英文模式，覆盖口水词清理、顺语序、分段编号、重复压缩、任务清单化与中英数字混排）、翻译/润色 system prompt（语音润色翻译与快捷键选中文本翻译共用 native-quality 指令，跨语言翻译、同语言润色，优先地道表达而非逐字直译）、29 秒单请求限制、3 分钟会话限制、默认快捷键、录音参数与日志限制。
- `llm-config.ts` - 共享 LLM 配置 normalizer 与迁移工具，将旧版 Base URL/model/API key 识别为 DeepSeek、OpenRouter 或 custom-compatible；OpenRouter 只接受固定模型，较长文本统一使用内部 low reasoning，短文本按模型能力使用 none 或最低 low，推理内容始终排除且不暴露用户开关。
- `refine-glossary.txt` - 远程术语表的本地维护源文件，按“每行一个术语”组织，支持 `#` 注释行与 UTF-8 文本上传到 R2。
- `refine-url.ts` - 文本润色 Base URL 归一化与 `/chat/completions` 请求地址拼装工具。
- `i18n.ts` - 共享 i18n 资源与语言解析工具。
- `locales/en.json` - 英文文案资源。
- `locales/zh.json` - 中文文案资源。
