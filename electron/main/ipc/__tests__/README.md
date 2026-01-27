# ipc/**tests**/

主进程 IPC 处理器测试。

- `config-handlers.test.ts` - 配置相关 IPC handler 测试（含 invoke 流程）。
- `session-handlers.test.ts` - 会话 IPC handler（开始/停止/状态/音频数据/取消）。
- `history-handlers.test.ts` - 历史记录 IPC handler（获取/删除/清空）。
- `log-handlers.test.ts` - 日志 IPC handler（tail/写入/打开目录）。
- `overlay-handlers.test.ts` - 浮窗 IPC handler（音频电平/鼠标穿透/错误上报）。
- `updater-handlers.test.ts` - 更新 IPC handler（检查更新/版本/发布页）。
