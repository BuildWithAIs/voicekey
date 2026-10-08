# refine/

文本润色模块，负责将 `llmRefine` 配置解析为 OpenAI Chat Completions 或 Anthropic Messages 请求，并执行润色、推理关闭参数注入与连接校验。Anthropic 仅支持 Claude Haiku 5.5，OpenRouter 也可选择该模型；两条路径均显式关闭 thinking/reasoning。

## 文件

- `index.ts` - 统一导出润色服务、OpenAI-compatible client、配置解析工具与 TokenDance OAuth 授权。
- `tokendance-oauth.ts` - TokenDance OAuth 式 API Key 授权（Authorization Code + S256 PKCE）；主进程监听 127.0.0.1 随机端口接收回调 code，浏览器授权页携带 App URL 归因参数，交换出的新 Key 由 IPC 处理器写入主进程配置；同一时间只允许一个进行中的授权流程。
- `service.ts` - `RefineService` 维护内存术语表缓存；润色或语音输入翻译任一启用时，每次读取最新配置，使用 raw transcript 包装、多语言/术语表感知 prompt 与 Provider 对应的 reasoning/thinking 关闭参数执行一次语音稿处理。默认保留原文语言与语气，翻译模式先整理转写内容再按目标语言的书写习惯翻译，独立于润色开关。
- `service.test.ts` - 回归短文本仍调用云端润色、DeepSeek 请求显式关闭 thinking，以及 Anthropic/OpenRouter Haiku 5.5 润色和连接检测的端点与推理关闭参数。
- `glossary-cache.ts` - 以内置术语表初始化内存缓存，按需拉取远程纯文本术语表，做 UTF-8、空行/注释过滤、去重与失败回退。
- `config-resolver.ts` - 按 Provider 解析 `/chat/completions` 或 `/messages` 请求端点，并按润色配置与传入术语表生成最终 system prompt。
- `openai-client.ts` - LLM HTTP client：OpenAI-compatible 请求支持 Provider 级额外请求头；Anthropic 使用原生认证、顶层 system prompt 和关闭 thinking 的 Messages 请求，将 text blocks 转为共用响应格式，并拒绝被输出上限截断的内容。统一解析错误；TokenDance 失败时读取 `TokenDance-Recovery-Action` 响应头并追加恢复提示。
- `openai-client.test.ts` - Anthropic 原生请求格式、认证、推理关闭、文本块过滤、截断与 API 错误，以及 TokenDance 恢复提示回归测试。
