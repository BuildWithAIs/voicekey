# hotkey/

主进程快捷键解析与 PTT 行为绑定模块。

## 文件

- `index.ts` - 快捷键模块统一导出。
- `parser.ts` - 使用按需加载的 uiohook 键位表解析 Electron Accelerator 对应的主键与修饰键。
- `ptt-handler.ts` - 注册 PTT、设置、翻译快捷键并绑定相应行为；Omarchy/Hyprland 通过 socket2 自定义事件接收可靠的按下/释放，其他支持平台保留原有 uiohook/globalShortcut 后端；开始时严格匹配，触发后仅松开必需键才停录，额外按键不会中断录音；状态切换日志仅记录配置键、修饰键状态与原生事件时间，不记录普通输入；按下沿立即触发一次，不延迟 50 ms 启动采集，处理期间被拒绝的按键必须释放后才能重新开始，避免键盘重复事件触发意外录音。

- `ptt-handler.test.ts` - 覆盖 Command+Option 和单 Option 持续按住时的额外按键、真实松键、立即启动与短按释放及忙碌期间按键隔离。
