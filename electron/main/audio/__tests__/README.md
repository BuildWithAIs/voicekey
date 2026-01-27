# audio/**tests**/

主进程音频模块测试。

- `session-manager.test.ts` - 录音会话开始/停止/取消与 HUD 交互。
- `processor.test.ts` - 音频流水线（保存/转码/ASR/注入/清理）与异常分支。
- `converter.test.ts` - FFmpeg 初始化与音频格式转换成功/失败。
