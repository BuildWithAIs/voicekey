# hotkey/

主进程快捷键解析与 PTT 行为绑定模块。

## 文件

- `index.ts` - 快捷键模块统一导出。
- `parser.ts` - 解析 Electron Accelerator 为 uiohook 按键与修饰键。
- `ptt-handler.ts` - 注册 PTT 与设置快捷键，绑定录音开始/停止。
