/**
 * 录音状态浮窗管理模块
 *
 * 职责：创建和管理录音状态浮窗（HUD）
 * 浮窗特性：透明、无边框、置顶、不可聚焦、穿透鼠标事件
 */
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { VITE_DEV_SERVER_URL, getMainDist, getRendererDist } from '../env'
import { IPC_CHANNELS, type OverlayState } from '../../shared/types'

let overlayWindow: BrowserWindow | null = null

// 浮窗尺寸常量
const OVERLAY_WIDTH = 200
const OVERLAY_HEIGHT = 60
const BOTTOM_MARGIN = 60

/**
 * 创建录音状态浮窗（透明、无边框、置顶）
 *
 * 浮窗位置：屏幕底部居中
 * 特性：
 * - 透明背景
 * - 无边框
 * - 始终置顶
 * - 不在任务栏显示
 * - 不可调整大小/移动/聚焦
 * - 鼠标事件穿透
 * - 全屏/多工作区可见
 */
export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: Math.round((screenWidth - OVERLAY_WIDTH) / 2),
    y: screenHeight - OVERLAY_HEIGHT - BOTTOM_MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(getMainDist(), 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 设置全屏/多工作区可见
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 鼠标事件穿透（点击穿透到下层窗口）
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // 加载渲染进程页面
  if (VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#/overlay`)
  } else {
    overlayWindow.loadFile(path.join(getRendererDist(), 'index.html'), {
      hash: '/overlay',
    })
  }

  // 窗口关闭时清理引用
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

/**
 * 显示浮窗并更新状态
 * @param state 浮窗状态
 */
export function showOverlay(state: OverlayState): void {
  console.log(`[Overlay] 🔵 showOverlay:`, JSON.stringify(state))
  console.log(`[Main] 🔵 showOverlay called from:`, new Error().stack?.split('\n')[2])
  const win = createOverlayWindow()
  win.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
  win.showInactive()
}

/**
 * 隐藏浮窗
 */
export function hideOverlay(): void {
  console.log(`[Overlay] 🔵 hideOverlay`)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

/**
 * 更新浮窗状态（不改变可见性）
 * @param state 浮窗状态
 */
export function updateOverlay(state: OverlayState): void {
  console.log(`[Overlay] 🔵 updateOverlay:`, JSON.stringify(state))
  if (state.status === 'error') {
    console.log(`[Overlay] 🔴 ERROR state sent!`)
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
  }
}

/**
 * 显示错误状态并自动隐藏
 * @param message 错误消息
 * @param hideDelay 隐藏延迟（毫秒），默认 2000ms
 */
export function showErrorAndHide(message: string, hideDelay = 2000): void {
  console.log(`[Overlay] 🔴 showErrorAndHide: ${message}`)
  updateOverlay({ status: 'error', message })
  setTimeout(() => hideOverlay(), hideDelay)
}

/**
 * 获取浮窗实例
 * @returns 浮窗实例或 null
 */
export function getOverlayWindow(): BrowserWindow | null {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }
  return null
}

/**
 * 销毁浮窗
 */
export function destroyOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
  }
  overlayWindow = null
}

/**
 * 发送音频电平到浮窗
 * @param level 音频电平 (0-1)
 */
export function sendAudioLevel(level: number): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, level)
  }
}

/**
 * 设置浮窗鼠标事件穿透
 * @param ignore 是否忽略鼠标事件
 * @param options 选项
 */
export function setOverlayIgnoreMouseEvents(
  ignore: boolean,
  options?: { forward?: boolean },
): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, options)
  }
}
