# ipc/

主进程 IPC 处理器目录，按功能域拆分并在 `index.ts` 中统一注册。

## 文件

- `index.ts` - IPC 处理器注册入口与依赖初始化。
- `config-handlers.ts` - 配置读写、仅限设置窗口的已保存 API Key 原文读取、ASR/润色连接校验、本地 SenseVoiceSmall 状态/下载、语言快照查询与广播；设置变化只使 ASR Provider 失效，下次识别时再延迟初始化；润色从关闭切到开启时刷新远程术语表，快捷键或翻译开关变化时重注册全局快捷键。
- `session-handlers.ts` - 录音会话相关处理器，包括开始、停止、状态、音频分段接收与取消；`AUDIO_DATA` 载荷（会话 ID、分段索引、缓冲区类型）在进入音频流水线前做形状校验。
- `history-handlers.ts` - 历史记录获取、删除与清空。
- `log-handlers.ts` - 日志读取、写入与打开目录。
- `updater-handlers.ts` - 更新检查、版本查询与打开发布页。
- `overlay-handlers.ts` - HUD 音频电平与鼠标穿透控制；渲染进程错误上报会被安全转为字符串，并在有活跃会话时把 HUD 切到错误态后自动隐藏。
