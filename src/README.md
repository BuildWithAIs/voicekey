# src/

渲染进程目录，负责 UI 与前端逻辑。

## 目录结构

- `components/` - 应用组件与 UI 组件库（含 AudioRecorder、HUD、Hotkey 相关组件）。
- `pages/` - 路由页面（Home、Settings、History）。
- `layouts/` - 布局组件（侧边栏 + 内容区）。
- `lib/` - 工具函数（className 合并、快捷键处理）。
- `assets/` - 渲染进程静态资源。

## 入口与全局

- `App.tsx` - Hash 路由入口；根据窗口类型渲染 AudioRecorder、HUD 或主界面。
- `main.tsx` - React 启动与渲染入口，初始化 i18n 并挂载 Toaster。
- `i18n.ts` - 渲染进程 i18next 初始化，读取配置并加载共享语言资源。
- `index.css` - Tailwind 基础样式与主题变量。
- `global.d.ts` - `window.electronAPI` 类型声明。
- `vite-env.d.ts` - Vite 环境类型声明。
