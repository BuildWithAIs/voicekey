import { app, BrowserWindow, Notification, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { UiohookKey } from 'uiohook-napi'
import { ASRProvider } from './asr-provider'
import { configManager } from './config-manager'
import { hotkeyManager } from './hotkey-manager'
import { initMainI18n, t } from './i18n'
import { ioHookManager } from './iohook-manager'
import { initializeLogger } from './logger'
import { textInjector } from './text-injector'
import { UpdaterManager } from './updater-manager'
import { createTray, refreshLocalizedUi } from './tray'

import {
  createBackgroundWindow,
  // Settings 模块
  createSettingsWindow,
  getSettingsWindow,
  focusSettingsWindow,
} from './window/index'
import { initIPCHandlers, registerAllIPCHandlers } from './ipc'
import {
  // Session Manager
  handleStartRecording,
  handleStopRecording,
  handleAudioData,
  handleCancelSession,
  getCurrentSession,
  setSessionError,
  // Processor
  initProcessor,
} from './audio'

import { initEnv, VITE_DEV_SERVER_URL } from './env'
// 全局变量
let asrProvider: ASRProvider | null = null

// 设置开机自启
function updateAutoLaunchState(enable: boolean) {
  console.log(`[Main] Updating auto-launch state: ${enable}`)
  // Windows/macOS 通用 API
  // openAsHidden: true 让应用启动时隐藏主窗口（只显示托盘）
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

// 初始化ASR Provider
function initializeASRProvider() {
  const config = configManager.getASRConfig()
  asrProvider = new ASRProvider(config)
}

/**
 * 将 Electron Accelerator 格式字符串解析为 uiohook 参数
 *
 * 支持的格式：
 * - 单修饰键：Command, Control, Alt, Shift
 * - 组合键：Command+Space, Control+Shift+A
 * - 功能键：F1-F24
 * - 字母/数字：A-Z, 0-9
 *
 * @param accelerator Electron Accelerator 格式字符串
 * @returns { modifiers: string[], key: number } 或 null
 */
function parseAccelerator(accelerator: string): { modifiers: string[]; key: number } | null {
  const parts = accelerator.split('+')
  const keyStr = parts.pop()
  if (!keyStr) return null

  const lowerKey = keyStr.toLowerCase()

  // 1. 单独修饰键作为主键的情况（无其他修饰键）
  if (parts.length === 0) {
    if (lowerKey === 'command' || lowerKey === 'cmd' || lowerKey === 'meta') {
      return { modifiers: [], key: UiohookKey.Meta }
    }
    if (lowerKey === 'control' || lowerKey === 'ctrl') {
      return { modifiers: [], key: UiohookKey.Ctrl }
    }
    if (lowerKey === 'alt' || lowerKey === 'option') {
      return { modifiers: [], key: UiohookKey.Alt }
    }
    if (lowerKey === 'shift') {
      return { modifiers: [], key: UiohookKey.Shift }
    }
  }

  // 2. 解析修饰键数组
  const modifiers = parts.map((p) => {
    const lower = p.toLowerCase()
    if (lower === 'command' || lower === 'cmd' || lower === 'meta') return 'meta'
    if (lower === 'control' || lower === 'ctrl') return 'ctrl'
    if (lower === 'alt' || lower === 'option') return 'alt'
    return lower
  })

  // 3. 解析主键
  const key = keyToUiohookCode(keyStr)
  if (key === null) {
    console.warn(`[Main] parseAccelerator: Unknown key "${keyStr}", falling back to Space`)
    return { modifiers, key: UiohookKey.Space }
  }

  return { modifiers, key }
}

/**
 * 将按键名称转换为 uiohook keycode
 */
function keyToUiohookCode(keyStr: string): number | null {
  const upper = keyStr.toUpperCase()
  const lower = keyStr.toLowerCase()

  // 特殊键映射
  const specialKeys: Record<string, number> = {
    SPACE: UiohookKey.Space,
    ENTER: UiohookKey.Enter,
    RETURN: UiohookKey.Enter,
    TAB: UiohookKey.Tab,
    BACKSPACE: UiohookKey.Backspace,
    DELETE: UiohookKey.Delete,
    ESCAPE: UiohookKey.Escape,
    ESC: UiohookKey.Escape,
    UP: UiohookKey.ArrowUp,
    DOWN: UiohookKey.ArrowDown,
    LEFT: UiohookKey.ArrowLeft,
    RIGHT: UiohookKey.ArrowRight,
    HOME: UiohookKey.Home,
    END: UiohookKey.End,
    PAGEUP: UiohookKey.PageUp,
    PAGEDOWN: UiohookKey.PageDown,
    INSERT: UiohookKey.Insert,
    CAPSLOCK: UiohookKey.CapsLock,
    NUMLOCK: UiohookKey.NumLock,
    PRINTSCREEN: UiohookKey.PrintScreen,
    // 标点符号
    COMMA: UiohookKey.Comma,
    PERIOD: UiohookKey.Period,
    SLASH: UiohookKey.Slash,
    BACKSLASH: UiohookKey.Backslash,
    SEMICOLON: UiohookKey.Semicolon,
    QUOTE: UiohookKey.Quote,
    BRACKETLEFT: UiohookKey.BracketLeft,
    BRACKETRIGHT: UiohookKey.BracketRight,
    MINUS: UiohookKey.Minus,
    EQUAL: UiohookKey.Equal,
    BACKQUOTE: UiohookKey.Backquote,
  }

  if (specialKeys[upper]) {
    return specialKeys[upper]
  }

  // F1-F24 功能键
  const fMatch = upper.match(/^F(\d+)$/)
  if (fMatch) {
    const fNum = parseInt(fMatch[1])
    if (fNum >= 1 && fNum <= 24) {
      const fKey = `F${fNum}` as keyof typeof UiohookKey
      if (UiohookKey[fKey] !== undefined) {
        return UiohookKey[fKey]
      }
    }
  }

  // 字母 A-Z
  if (/^[A-Z]$/.test(upper)) {
    const letterKey = upper as keyof typeof UiohookKey
    if (UiohookKey[letterKey] !== undefined) {
      return UiohookKey[letterKey]
    }
  }

  // 数字 0-9（主键盘区）
  if (/^[0-9]$/.test(upper)) {
    // UiohookKey 使用 Num0-Num9 表示主键盘数字
    const numKey = `Num${upper}` as keyof typeof UiohookKey
    if (UiohookKey[numKey] !== undefined) {
      return UiohookKey[numKey]
    }
    // 备用：直接尝试数字
    const directKey = upper as keyof typeof UiohookKey
    if (UiohookKey[directKey] !== undefined) {
      return UiohookKey[directKey]
    }
  }

  // 修饰键作为主键（组合键场景，如 Command+Control）
  if (lower === 'command' || lower === 'cmd' || lower === 'meta') {
    return UiohookKey.Meta
  }
  if (lower === 'control' || lower === 'ctrl') {
    return UiohookKey.Ctrl
  }
  if (lower === 'alt' || lower === 'option') {
    return UiohookKey.Alt
  }
  if (lower === 'shift') {
    return UiohookKey.Shift
  }

  return null
}

// 注册全局快捷键
function registerGlobalHotkeys() {
  const hotkeyConfig = configManager.getHotkeyConfig()
  const pttKey = hotkeyConfig.pttKey

  // PTT 逻辑：使用 iohook 监听按下与释放
  const pttConfig = parseAccelerator(pttKey)
  console.log({ pttConfig })

  if (pttConfig) {
    // 防抖计时器，防止快速按组合键时误触发
    let debounceTimer: NodeJS.Timeout | null = null
    const DEBOUNCE_MS = 50 // 50ms 确认期

    const checkPTT = () => {
      // 判断是否按住设置的快捷键（精确匹配）
      const isPressed = ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key)
      const session = getCurrentSession()

      // Start Recording（带防抖）
      if (isPressed && (!session || session.status !== 'recording') && !debounceTimer) {
        // 设置防抖计时器，50ms 后再次确认
        debounceTimer = setTimeout(() => {
          // 再次检查是否仍然精确匹配
          if (ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key)) {
            handleStartRecording()
          }
          debounceTimer = null
        }, DEBOUNCE_MS)
      }

      // 取消待确认的录音（精确匹配失败）
      if (!isPressed && debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }

      // Stop Recording
      if (!isPressed && session && session.status === 'recording') {
        handleStopRecording()
      }
    }

    ioHookManager.on('keydown', checkPTT)
    ioHookManager.on('keyup', checkPTT)
  }

  // 注册设置快捷键 (使用 Electron globalShortcut，因为是单次触发)
  hotkeyManager.register(hotkeyConfig.toggleSettings, () => {
    createSettingsWindow()
  })
}

// 显示系统通知
function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
    }).show()
  }
}

// 应用程序生命周期
app.whenReady().then(async () => {
  initEnv() // 必须第一个调用
  initializeLogger()
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // 初始化
  const appConfig = configManager.getAppConfig()
  await initMainI18n(appConfig.language)
  updateAutoLaunchState(appConfig.autoLaunch ?? false)
  initializeASRProvider()
  createBackgroundWindow()
  createTray()
  // 初始化音频处理器（需要 ASR Provider 依赖）
  initProcessor({
    getAsrProvider: () => asrProvider,
    initializeASRProvider,
  })
  // 初始化 IPC 处理器依赖
  initIPCHandlers({
    // config-handlers 依赖
    config: {
      updateAutoLaunchState,
      refreshLocalizedUi,
      initializeASRProvider,
      registerGlobalHotkeys,
      getAsrProvider: () => asrProvider,
    },

    // session-handlers 依赖
    session: {
      // 这些现在直接从 audio/ 模块导入
      handleStartRecording,
      handleStopRecording,
      handleAudioData,
      handleCancelSession,
      getCurrentSession,
    },

    // overlay-handlers 依赖
    overlay: {
      showNotification,
      getCurrentSession, // 同样从 audio/ 导入
      setSessionError, // 同样从 audio/ 导入
    },
  })
  registerAllIPCHandlers()
  void UpdaterManager.checkForUpdates()
  registerGlobalHotkeys()
  ioHookManager.start()

  // 设置 Dock 图标和应用名称（macOS）
  if (process.platform === 'darwin') {
    app.setName(t('app.name'))
    const dockIconPath = path.join(process.env.VITE_PUBLIC, 'voice-key-dock-icon.png')
    app.dock.setIcon(nativeImage.createFromPath(dockIconPath))
  }

  // 开发环境下自动打开设置窗口
  if (VITE_DEV_SERVER_URL) {
    createSettingsWindow()
  }

  // 检查权限（macOS）
  if (process.platform === 'darwin') {
    textInjector.checkPermissions().then((result) => {
      if (!result.hasPermission && result.message) {
        showNotification(t('notification.permissionTitle'), result.message)
      }
    })
  }
})

app.on('window-all-closed', () => {
  // MVP版本：即使关闭所有窗口也继续运行（托盘应用）
  // 用户需要从托盘退出
})

app.on('before-quit', () => {
  // 清理资源
  hotkeyManager.unregisterAll()
  ioHookManager.stop()
})

app.on('activate', () => {
  // macOS: 点击 Dock 图标时打开设置窗口
  const settingsWin = getSettingsWindow()
  if (BrowserWindow.getAllWindows().length === 0 || !settingsWin) {
    createSettingsWindow()
  } else {
    focusSettingsWindow()
  }
})
