# shared/

## Microphone Selection

`ASRConfig` stores the low-volume toggle, selected microphone device ID, last known label, and mutually exclusive streaming-mode selection.
`RecordingStartPayload` carries the device ID from main to the hidden recorder,
and `MICROPHONE_INPUT` defines the renderer select sentinel plus config string
length caps.

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量；包含经典/流式 ASR 模式、两套模型下载/删除状态、统一模型存储目录、流式 PCM 载荷、带实时 transcript 的 Overlay、Linux/Omarchy 集成状态、Provider-aware LLM 润色配置及其余应用配置。
- `constants.ts` - SenseVoice 与 X-ASR-zh-en 480 ms 的版本、文件大小、SHA-256 和 ModelScope/Hugging Face 双源元数据（运行时由公网国家动态排序），以及录音限制、Provider 固定模型、精简 refine system prompt、术语表与翻译规则。
- `constants.test.ts` - 录音限制、X-ASR 文件总大小/哈希/下载源顺序、500 ms 收尾静音与 20 分钟空闲卸载，以及精简润色 prompt 关键边界的回归测试。
- `llm-config.ts` - 共享 LLM 配置 normalizer 与迁移工具；保留翻译功能的 Provider-aware reasoning 能力，同时为语音润色提供显式关闭 reasoning/thinking 的独立参数构造器。
- `refine-glossary.txt` - 远程术语表的本地维护源文件，按“每行一个术语”组织，支持 `#` 注释行与 UTF-8 文本上传到 R2。
- `refine-url.ts` - 文本润色 Base URL 归一化与 `/chat/completions` 请求地址拼装工具。
- `i18n.ts` - 共享 i18n 资源与语言解析工具。
- `locales/en.json` - 英文文案资源。
- `locales/zh.json` - 中文文案资源。
