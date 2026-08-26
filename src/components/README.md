# components/

## Microphone Selection

`AudioRecorder.tsx` accepts an optional microphone device ID from
`RecordingStartPayload`, records from that device when available, falls back to
the system default when unavailable, and asks main to stop if the stream ends
mid-session.

React 组件目录，包含应用级组件与 `ui/` 组件库。

## 子目录

### `ui/`

基于 shadcn/ui 与 Radix UI 的基础组件集合。

## 文件

### `AudioRecorder.tsx`

后台无头录音组件，负责：

- 监听主进程的录音开始/停止事件。
- 在单次会话内保持同一条 `MediaStream` 与 `AudioContext`。
- 经典模式每 30 秒轮转一次 `MediaRecorder` 并发送独立音频 `chunk`。
- 流式模式通过 AudioWorklet 每约 100 ms 发送 Float32 PCM；停止时先 flush 最后一帧再发送 final marker。
- 在 5 分钟上限时自动请求停止会话。
- 向主进程同步音量电平与录音错误。

### `HUD.tsx`

宽屏录音状态浮窗组件；流式模式边说边显示实时文本，尾部未稳定字符弱化显示，停止后用本地补标点的 final text 替换 partial，并继续显示识别/润色阶段。

### `HotkeyRecorder.tsx`

快捷键录制组件，用于设置页录制和校验快捷键。

### `Waveform.tsx`

根据实时音频电平渲染波形动画（HUD 录音浮窗使用）。

### `VoiceWave.tsx`

品牌装饰声波：一排高度各异的竖条，`active` 时上下脉动，颜色继承 `currentColor`。纯装饰，不读取真实音频，用于侧栏待命卡、主页英雄区与历史记录。

### `HotkeyKeys.tsx`

将 Electron Accelerator 字符串渲染成一组实体键帽（按平台映射 ⌘ ⌥ ⇧ ⌃ 等符号）。

### `HotkeySettings.tsx`

快捷键配置卡片：PTT 预设/自定义、打开设置与翻译快捷键，含校验与重置。

### `LogViewerDialog.tsx`

日志查看对话框，负责展示主进程日志尾部内容。

### `StatsOverview.tsx`

主页统计磁贴行（累计字数 / 累计时长 / 活跃天数 / 峰值日），数据来自 `@/lib/stats`。

### `InteractiveCharts.tsx`

首页趋势图组件，聚合历史记录并绘制字符识别趋势，含 7/30/90 天分段切换。
