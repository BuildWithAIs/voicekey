# ipc/

主进程 IPC 处理器目录，按功能域拆分并在 `index.ts` 中统一注册。

## 文件

- `index.ts` - IPC 处理器注册入口与依赖初始化。
- `config-handlers.ts` - 配置读写、受限密钥读取、润色连接校验、TokenDance 浏览器 OAuth 授权建 Key、两种本地识别模式的状态/显式下载/确认后删除、按模式打开模型安装目录、本机逻辑核数与内存读取（供实时识别性能提示，不拦截下载）、下载取消与跨操作互斥、X-ASR 预热、空闲状态切换模式时立即释放另一套 ASR worker，以及语言快照查询与广播。目录、删除与 TokenDance 授权操作仅允许设置窗口调用。
- `session-handlers.ts` - 录音会话相关处理器，包括开始、停止、状态、标准模式完整音频、流式 PCM 帧/结束标记与取消；载荷进入音频流水线前会校验会话 ID、序号、采样率与缓冲区大小，并拒绝向当前模式发送另一种音频格式。
- `history-handlers.ts` - 历史记录分页查询、首页统计、删除与清空；校验渲染进程传来的查询和记录 ID。
- `log-handlers.ts` - 日志读取、写入与打开目录。
- `updater-handlers.ts` - 更新检查、版本查询与打开发布页。
- `overlay-handlers.ts` - HUD 音频电平与鼠标穿透控制；渲染进程错误上报会被安全转为字符串，校验录音窗口及会话身份，并执行统一会话清理后显示错误。
- `platform-handlers.ts` - Linux/Omarchy 集成状态、安装与移除；仅设置窗口可调用，快捷键和路径均由主进程配置解析，不接受渲染进程传入的文件路径或 Lua 内容。

`CONFIG_SET` accepts `userDictionary` and validates its type, entry lengths, total
size and single-line content in the main process before applying other sections.
`CONFIG_GET` includes the persisted dictionary; no separate renderer filesystem access is used.

录音窗口发送带会话 ID 的停止确认与麦克风回退通知；主进程拒绝非录音窗口的数据、超限音频和非单次最终标准音频。模型管理仅设置窗口可调用，录音/处理期间禁止删除或下载校验操作。
