/**
 * 后台窗口管理模块
 *
 * 职责：创建和管理用于音频录制的隐藏后台窗口
 * 该窗口渲染 AudioRecorder 组件，处理麦克风采集
 */
import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VITE_DEV_SERVER_URL, getRendererDist } from '../env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let backgroundWindow: BrowserWindow | null = null

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
      preload: path.join(__dirname, 'preload.cjs'),
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
