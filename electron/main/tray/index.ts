import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'node:path'
import { getVitePublic } from '../env'
import { t } from '../i18n'
import { createSettingsWindow, updateSettingsWindowTitle } from '../window'

let tray: Tray | null = null

/**
 * 构建托盘菜单
 */
export function buildTrayMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: t('tray.settings'),
      click: () => createSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => app.quit(),
    },
  ])
}

/**
 * 刷新托盘（国际化切换时调用）
 */
export function refreshTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(t('tray.tooltip'))
    tray.setContextMenu(buildTrayMenu())
  }
}

/**
 * 刷新所有本地化 UI（托盘 + 设置窗口）
 */
export function refreshLocalizedUi(): void {
  refreshTray()
  updateSettingsWindowTitle()
}

/**
 * 创建托盘图标
 */
export function createTray(): Tray {
  if (tray && !tray.isDestroyed()) {
    return tray
  }

  const icon = nativeImage.createFromPath(path.join(getVitePublic(), 'tray-icon.png'))
  // macOS 会自动查找 tray-icon@2x.png 用于 Retina 屏幕
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  refreshTray()

  // 双击托盘图标打开设置
  tray.on('double-click', () => {
    createSettingsWindow()
  })

  return tray
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
}
