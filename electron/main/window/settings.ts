/**
 * 设置窗口管理模块
 *
 * 职责：创建和管理应用设置窗口
 * 窗口特性：全屏工作区尺寸、macOS hiddenInset 标题栏、毛玻璃效果
 */
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { VITE_DEV_SERVER_URL, getMainDist, getRendererDist } from '../env'
import { t } from '../i18n'

let settingsWindow: BrowserWindow | null = null

// 窗口最小尺寸常量
const MIN_WIDTH = 600
const MIN_HEIGHT = 500

/**
 * 创建或聚焦设置窗口
 *
 * 特性：
 * - 全屏工作区尺寸
 * - macOS hiddenInset 标题栏
 * - 毛玻璃效果 (vibrancy)
 * - 透明背景
 */
export function createSettingsWindow(): BrowserWindow | void {
  // 如果已存在，聚焦并返回
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  settingsWindow = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: t('window.settingsTitle'),
    titleBarStyle: 'hiddenInset', // macOS 风格：隐藏标题栏但保留交通灯按钮
    trafficLightPosition: { x: 20, y: 20 }, // 交通灯按钮位置
    vibrancy: 'sidebar', // macOS 毛玻璃效果
    backgroundColor: '#00000000', // 透明背景
    webPreferences: {
      preload: path.join(getMainDist(), 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 开发模式加载 Vite 开发服务器，生产模式加载打包后的 index.html
  if (VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${VITE_DEV_SERVER_URL}#/settings`)
    // 开发模式下打开 DevTools
    settingsWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    settingsWindow.loadFile(path.join(getRendererDist(), 'index.html'), {
      hash: '/settings',
    })
  }

  // 窗口关闭时清理引用
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  return settingsWindow
}

/**
 * 获取设置窗口实例
 * @returns 设置窗口实例或 null
 */
export function getSettingsWindow(): BrowserWindow | null {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    return settingsWindow
  }
  return null
}

/**
 * 销毁设置窗口
 */
export function destroySettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
  }
  settingsWindow = null
}

/**
 * 更新设置窗口标题（用于国际化切换）
 */
export function updateSettingsWindowTitle(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(t('window.settingsTitle'))
  }
}

/**
 * 聚焦设置窗口
 */
export function focusSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
  }
}

/**
 * 检查设置窗口是否可用
 */
export function isSettingsWindowAvailable(): boolean {
  return settingsWindow !== null && !settingsWindow.isDestroyed()
}
