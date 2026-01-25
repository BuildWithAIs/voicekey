# window/

主进程窗口管理模块，负责后台录音、设置窗口与 HUD 浮窗。

## 文件

- `index.ts` - 窗口模块统一导出。
- `background.ts` - 隐藏后台窗口（AudioRecorder）创建与管理。
- `settings.ts` - 设置窗口创建、聚焦与标题更新。
- `overlay.ts` - 录音状态浮窗创建、显示与状态更新。
