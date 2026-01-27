# ipc/

主进程 IPC 处理器目录，按功能域拆分并在 `index.ts` 统一注册。

## 文件

- `index.ts` - IPC 处理器注册入口与依赖初始化。
- `config-handlers.ts` - 配置读写、ASR 连接测试、语言快照查询与广播，并在 ASR 配置变更时重建 LLM Provider。
- `session-handlers.ts` - 录音会话相关处理器（开始/停止/状态/音频数据/取消）。
- `history-handlers.ts` - 历史记录获取、删除、清空。
- `log-handlers.ts` - 日志尾部读取、写入、打开目录。
- `updater-handlers.ts` - 更新检查、获取版本与打开发布页。
- `overlay-handlers.ts` - 浮窗音频电平与鼠标穿透控制。
