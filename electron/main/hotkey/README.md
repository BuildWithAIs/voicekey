# hotkey/

主进程快捷键解析与 PTT 行为绑定模块。

## 文件

- `index.ts` - 快捷键模块统一导出。
- `parser.ts` - 使用按需加载的 uiohook 键位表解析 Electron Accelerator 对应的主键与修饰键。
- `ptt-handler.ts` - 注册 PTT、设置、翻译快捷键并绑定相应行为；Omarchy/Hyprland 通过 socket2 自定义事件接收可靠的按下/释放，其他支持平台保留原有 uiohook/globalShortcut 后端。
