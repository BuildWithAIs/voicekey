# audio/

主进程音频处理模块，负责录音会话状态与音频处理流水线。

## 文件

- `index.ts` - 音频模块统一导出。
- `session-manager.ts` - 会话生命周期管理（开始/停止/取消）与 HUD 状态更新。
- `processor.ts` - 音频处理流水线（保存、转码、ASR、可选 LLM 润色、写历史、注入、清理）。
- `converter.ts` - FFmpeg 初始化与 WebM → MP3 转换。
