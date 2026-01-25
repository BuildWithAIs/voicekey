# 环境变量模块 (`env.ts`)

> 统一管理 Electron 主进程的运行时路径配置

## 概述

`env.ts` 模块解决了 Electron 应用在开发和生产环境中路径不一致的问题。它使用初始化函数模式，避免模块顶层副作用，确保路径在正确时机被计算。

## 为什么需要这个模块？

### 问题背景

Electron 应用的路径在不同环境下完全不同：

| 环境         | 代码位置                          | `__dirname` 值                         |
| ------------ | --------------------------------- | -------------------------------------- |
| **开发模式** | `dist-electron/main.mjs`          | `/project/dist-electron/`              |
| **生产模式** | `app.asar/dist-electron/main.mjs` | `/App.app/.../app.asar/dist-electron/` |

这些路径**必须在运行时动态计算**，无法放在 `.env` 文件中。

### 设计原则

1. **无顶层副作用** - 使用 `initEnv()` 显式初始化
2. **安全访问** - getter 函数确保初始化后才能访问
3. **单一数据源** - 所有模块从此处获取路径

## API 参考

### 初始化函数

#### `initEnv(): void`

初始化环境变量，**必须在 `app.whenReady()` 中第一个调用**。

```typescript
import { initEnv } from './env'

app.whenReady().then(async () => {
  initEnv() // ← 必须第一个调用
  // ... 其他初始化
})
```

### 常量

#### `VITE_DEV_SERVER_URL: string | undefined`

Vite 开发服务器 URL，仅在开发模式下有值。

```typescript
if (VITE_DEV_SERVER_URL) {
  window.loadURL(VITE_DEV_SERVER_URL)
} else {
  window.loadFile(path.join(getRendererDist(), 'index.html'))
}
```

### Getter 函数

> ⚠️ 所有 getter 函数必须在 `initEnv()` 调用后使用，否则会抛出错误。

#### `getAppRoot(): string`

返回应用根目录路径。

- 开发模式: `/path/to/voice-key-build/`
- 生产模式: `/path/to/Voice Key.app/Contents/Resources/app.asar/`

#### `getMainDist(): string`

返回主进程编译输出目录。

- 值: `${APP_ROOT}/dist-electron/`

#### `getRendererDist(): string`

返回渲染进程编译输出目录（Vite 输出）。

- 值: `${APP_ROOT}/dist/`

#### `getVitePublic(): string`

返回静态资源目录。

- 开发模式: `${APP_ROOT}/public/`
- 生产模式: `${APP_ROOT}/dist/`

## 使用示例

### 在 `main.ts` 中

```typescript
// 1. 导入
import { initEnv, VITE_DEV_SERVER_URL, getRendererDist, getVitePublic } from './env'

// 2. 在 whenReady 中初始化
app.whenReady().then(async () => {
  initEnv() // 必须第一个调用

  initializeLogger()
  // ...
})
```

### 在窗口模块中

```typescript
// electron/main/window/background.ts
import { VITE_DEV_SERVER_URL, getRendererDist } from '../env'

export function createBackgroundWindow(): BrowserWindow {
  const window = new BrowserWindow({
    /* ... */
  })

  if (VITE_DEV_SERVER_URL) {
    window.loadURL(VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(getRendererDist(), 'index.html'))
  }

  return window
}
```

### 加载静态资源

```typescript
import { getVitePublic } from './env'

// 加载托盘图标
const icon = nativeImage.createFromPath(path.join(getVitePublic(), 'tray-icon.png'))
```

## 错误处理

如果在 `initEnv()` 之前调用 getter 函数，会抛出错误：

```
Error: [Env] Environment not initialized. Call initEnv() first in main.ts
```

**解决方案**: 确保 `initEnv()` 在 `app.whenReady()` 回调的最开始调用。

## 目录结构

```
electron/main/
├── env.ts              ← 本模块
├── main.ts             ← 调用 initEnv() 的入口
└── window/
    ├── background.ts   ← 使用 getRendererDist()
    ├── settings.ts     ← 使用 getRendererDist()
    └── overlay.ts      ← 使用 getRendererDist()
```

## 迁移指南

从旧代码迁移到新模块：

| 旧代码                    | 新代码              |
| ------------------------- | ------------------- |
| `process.env.APP_ROOT`    | `getAppRoot()`      |
| `RENDERER_DIST` (常量)    | `getRendererDist()` |
| `MAIN_DIST` (常量)        | `getMainDist()`     |
| `process.env.VITE_PUBLIC` | `getVitePublic()`   |

## 最佳实践

1. ✅ 始终在 `app.whenReady()` 第一行调用 `initEnv()`
2. ✅ 使用 getter 函数而非直接访问 `process.env`
3. ✅ 在模块顶层只导入，不要调用 getter
4. ❌ 不要在模块顶层立即调用 getter 函数
5. ❌ 不要在 `app.whenReady()` 之前使用路径相关功能
