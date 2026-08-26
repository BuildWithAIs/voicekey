# ipc/

主进程 IPC 处理器目录，按功能域拆分并在 `index.ts` 中统一注册。

## 文件

- `index.ts` - IPC 处理器注册入口与依赖初始化。
- `config-handlers.ts` - 配置读写、受限密钥读取、润色连接校验、SenseVoice 与实时识别组件的状态/显式下载、Paraformer 预热、空闲状态切换模式时立即释放另一套 ASR worker，以及语言快照查询与广播。标点 worker 在每次流式录音开始后单独预热并在结束后释放。
- `session-handlers.ts` - 录音会话相关处理器，包括开始、停止、状态、经典音频分段、流式 PCM 帧/结束标记与取消；载荷进入音频流水线前会校验会话 ID、序号、采样率与缓冲区大小，并拒绝向当前模式发送另一种音频格式。
- `history-handlers.ts` - 历史记录获取、删除与清空。
- `log-handlers.ts` - 日志读取、写入与打开目录。
- `updater-handlers.ts` - 更新检查、版本查询与打开发布页。
- `overlay-handlers.ts` - HUD 音频电平与鼠标穿透控制；渲染进程错误上报会被安全转为字符串，并在有活跃会话时把 HUD 切到错误态后自动隐藏。
