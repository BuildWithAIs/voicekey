# refine/

文本润色模块，负责将 `llmRefine` 配置解析为统一的 OpenAI Chat Completions 请求，并执行润色、推理关闭参数注入与连接校验。

## 文件

- `index.ts` - 统一导出润色服务、OpenAI-compatible client、配置解析工具与 TokenDance OAuth 授权。
- `tokendance-oauth.ts` - TokenDance OAuth 式 API Key 授权（Authorization Code + S256 PKCE）；主进程监听 127.0.0.1 随机端口接收回调 code，浏览器授权页携带 App URL 归因参数，交换出的新 Key 由 IPC 处理器写入主进程配置；同一时间只允许一个进行中的授权流程。
- `service.ts` - `RefineService` 维护内存术语表缓存；每次调用都读取最新配置，使用精简的 raw transcript 包装、术语表感知 prompt 与 Provider-aware 的 reasoning/thinking 关闭参数执行语音稿编辑和连接校验。录音流水线只在完整 final text 到达后调用一次，短文本也不跳过。
- `service.test.ts` - 回归短文本仍调用云端润色，以及 DeepSeek 请求显式关闭 thinking。
- `glossary-cache.ts` - 以内置术语表初始化内存缓存，按需拉取远程纯文本术语表，做 UTF-8、空行/注释过滤、去重与失败回退。
- `config-resolver.ts` - 将手动填写的润色 Base URL 归一化后补全为 `/chat/completions` 请求参数，并按润色配置与传入术语表生成最终 system prompt。
- `openai-client.ts` - OpenAI Chat Completions HTTP client，负责请求发送（支持 Provider 级额外请求头，如 TokenDance 的 X-App-URL 归因头）、错误与消息内容解析；失败时读取 `TokenDance-Recovery-Action` 响应头并追加充值/重新授权/额度刷新提示。
