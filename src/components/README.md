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
- 经典模式在整次录音中保持同一个 `MediaRecorder`，松键后发送一份完整音频；不定时停录/切段。
- 流式模式通过 AudioWorklet 每约 100 ms 发送 Float32 PCM；停止时先 flush 最后一帧再发送 final marker。
- 在 5 分钟上限时自动请求停止会话。
- 以 20 Hz 向主进程同步音量；错误、停止确认和麦克风回退携带会话 ID，取消时立即丢弃采集数据。

### `HUD.tsx`

暖白纸感录音浮窗，使用细边框、柔和阴影与琥珀色点缀，底边固定。有实时文本时向上展开为两行可滚动文字，录音期间跟随最新内容并弱化可修订的尾部；无文本时只显示紧凑的收音波形。处理时保留已识别文本并显示当前阶段，成功时展示实际输入结果，错误详情支持滚动。取消按钮保留鼠标穿透切换；状态文案支持屏幕阅读器，光标和加载动画尊重减少动态效果设置。

### `HotkeyRecorder.tsx`

快捷键录制组件，用于设置页录制和校验快捷键。

### `Waveform.tsx`

根据实时音频电平渲染波形动画（HUD 录音浮窗使用）：每根柱子采样略有延迟的历史电平形成行波，配合钟形包络与缓动跟随，静止时有轻微呼吸感。

### `VoiceWave.tsx`

品牌装饰声波：一排高度各异的竖条，`active` 时上下脉动，颜色继承 `currentColor`。纯装饰，不读取真实音频，用于侧栏待命卡、主页英雄区与历史记录。

### `HotkeyKeys.tsx`

将 Electron Accelerator 字符串渲染成一组实体键帽（按平台映射 ⌘ ⌥ ⇧ ⌃ 等符号）。

### `HotkeySettings.tsx`

快捷键配置卡片：录音、打开设置与翻译快捷键统一使用录制控件，含校验与重置；录音快捷键支持单修饰键。

### `LogViewerDialog.tsx`

日志查看对话框，负责展示主进程日志尾部内容。

### `StatsOverview.tsx`

统计磁贴组件（累计字数 / 累计时长 / 活跃天数 / 峰值日），使用主进程返回的汇总数据。

### `InteractiveCharts.tsx`

首页分析面板：字数/次数/时长切换、7/30/90 天、全部历史和历史截止日期选择、紧邻上一周期虚线对比、日期提示、本期摘要与弹窗每日明细。全部历史自动按日/周/月/年聚合图表，每日明细每页 50 天，隐藏无意义的上期对比。图表随首页剩余高度自适应，明细弹窗独立滚动。查看范围不影响永久保留。

### `UserDictionary.tsx`

独立词典页编辑器：添加、重复提示、删除与大小写不敏感搜索，使用完整词条列表、计数和空状态；本地校验与主进程共用规则。保存成功后清空草稿，失败时保留以便重试。

### `MicrophoneTest.tsx`

设置页的十秒麦克风电平测试，不保存音频；设备切换、卸载和正式录音开始时释放采集资源。

### `AudioRecorder.test.ts`

覆盖超过 30 秒仍连续采集、停止后只发送一个文件、取消、权限请求迟到和旧停止消息隔离。
