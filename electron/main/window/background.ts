/**
 * 后台窗口管理模块
 *
 * 职责：创建和管理用于音频录制的隐藏后台窗口
 * 该窗口渲染 AudioRecorder 组件，处理麦克风采集
 */
import { BrowserWindow } from 'electron'
import path from 'node:path'
import { VITE_DEV_SERVER_URL, getMainDist, getRendererDist } from '../env'

let backgroundWindow: BrowserWindow | null = null
let crashHandler: (() => void) | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 注册后台渲染进程崩溃/无响应时的回调（用于中止进行中的录音会话）
 */
export function setBackgroundWindowCrashHandler(handler: () => void): void {
  crashHandler = handler
}

/**
 * 渲染进程崩溃后延迟重载页面，恢复录音能力
 */
function scheduleBackgroundWindowReload(): void {
  if (reloadTimer) return
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      console.log('[Window] Reloading backgroundWindow after renderer crash')
      backgroundWindow.webContents.reload()
    }
  }, 1000)
}

/**
 * 创建后台录音窗口（隐藏）
 *
 * MVP版本不显示主窗口，仅用于：
 * 1. 渲染 AudioRecorder 组件
 * 2. 处理麦克风权限和音频采集
 * 3. 通过 IPC 发送音频数据到主进程
 */
export function createBackgroundWindow(): BrowserWindow {
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    return backgroundWindow
  }

  backgroundWindow = new BrowserWindow({
    show: false, // MVP版本不显示主窗口
    webPreferences: {
      preload: path.join(getMainDist(), 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // backgroundWindow 只渲染 AudioRecorder，不需要 DevTools
  // 如需调试录音逻辑，可在 settingsWindow 的 DevTools Console 中查看日志
  // 开发模式下打开 DevTools 以便调试
  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.webContents.openDevTools({ mode: 'detach' })
  }

  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    backgroundWindow.loadFile(path.join(getRendererDist(), 'index.html'))
  }

  // 监听页面加载完成
  backgroundWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] backgroundWindow finished loading')
  })

  // 监听页面加载失败
  backgroundWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Window] backgroundWindow failed to load:', errorCode, errorDescription)
  })

  // 渲染进程异常退出：中止会话并重载页面恢复录音能力
  backgroundWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error('[Window] backgroundWindow render process gone:', details.reason)
    crashHandler?.()
    scheduleBackgroundWindowReload()
  })

  // 渲染进程无响应：中止会话，避免 HUD 卡死
  backgroundWindow.on('unresponsive', () => {
    console.error('[Window] backgroundWindow became unresponsive')
    crashHandler?.()
  })

  backgroundWindow.on('responsive', () => {
    console.log('[Window] backgroundWindow became responsive again')
  })

  // 窗口关闭时清理引用
  backgroundWindow.on('closed', () => {
    backgroundWindow = null
  })

  return backgroundWindow
}

/**
 * 获取后台窗口实例
 * @returns 后台窗口实例或 null
 */
export function getBackgroundWindow(): BrowserWindow | null {
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    return backgroundWindow
  }
  return null
}

/**
 * 销毁后台窗口
 */
export function destroyBackgroundWindow(): void {
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    backgroundWindow.close()
  }
  backgroundWindow = null
}

/**
 * 检查后台窗口是否可用
 */
export function isBackgroundWindowAvailable(): boolean {
  return backgroundWindow !== null && !backgroundWindow.isDestroyed()
}
