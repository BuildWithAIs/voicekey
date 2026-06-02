# ipc/

主进程 IPC 处理器目录，按功能域拆分并在 `index.ts` 中统一注册。

## 文件

- `index.ts` - IPC 处理器注册入口与依赖初始化。
- `config-handlers.ts` - 配置读写、ASR/润色连接校验、语言快照查询与广播；在文本润色从关闭切到开启时触发一次远程术语表刷新，并在快捷键或翻译开关变化时重注册全局快捷键。
- `session-handlers.ts` - 录音会话相关处理器，包括开始、停止、状态、音频分段接收与取消。
- `history-handlers.ts` - 历史记录获取、删除与清空。
- `log-handlers.ts` - 日志读取、写入与打开目录。
- `updater-handlers.ts` - 更新检查、版本查询与打开发布页。
- `overlay-handlers.ts` - HUD 音频电平与鼠标穿透控制。
