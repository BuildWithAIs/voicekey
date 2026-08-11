import { app, BrowserWindow, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { ASRProvider } from './asr-provider'
import { RefineService } from './refine'
// 配置管理模块
import { configManager } from './config-manager'
// 快捷键模块
import { hotkeyManager } from './hotkey-manager' // 待整理
import { ioHookManager } from './iohook-manager' // 待整理
import { registerGlobalHotkeys } from './hotkey'
// i18n 模块
import {
  broadcastLanguageSnapshot,
  initMainI18n,
  sendLanguageSnapshotToWindow,
  syncSystemLocaleIfNeeded,
  t,
} from './i18n'
// 初始化日志
import { initializeLogger } from './logger'
// 文本注入
import { textInjector } from './text-injector'
// 更新管理
import { UpdaterManager } from './updater-manager'
// 托盘管理
import { createTray, refreshLocalizedUi } from './tray'

// 通知模块
import { showNotification } from './notification'

// 窗口模块
import {
  createBackgroundWindow,
  setBackgroundWindowCrashHandler,
  // Settings 模块
  createSettingsWindow,
  getSettingsWindow,
  focusSettingsWindow,
} from './window/index'

// IPC 模块
import { initIPCHandlers, registerAllIPCHandlers } from './ipc'
// Audio 模块
import {
  // Session Manager
  handleStartRecording,
  handleStopRecording,
  handleAudioChunk,
  handleCancelSession,
  handleBackgroundRendererGone,
  getCurrentSession,
  setSessionError,
  // Processor
  initProcessor,
} from './audio'
// 环境模块
import { initEnv, VITE_DEV_SERVER_URL } from './env'
// 全局变量
let asrProvider: ASRProvider | null = null
let refineService: RefineService | null = null
const STARTUP_HIDDEN_ARG = '--startup-hidden'

// 设置开机自启
function updateAutoLaunchState(enable: boolean) {
  console.log(`[Main] Updating auto-launch state: ${enable}`)

  // Development runs use the generic Electron executable. Registering it as a login item
  // launches Electron without an app path on the next sign-in, showing its default window.
  if (!app.isPackaged) {
    console.log('[Main] Skipping auto-launch registration for an unpackaged app')
    return
  }

  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath,
      args: [STARTUP_HIDDEN_ARG],
    })
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

function isSilentStartupLaunch(): boolean {
  if (process.platform === 'win32') {
    return process.argv.includes(STARTUP_HIDDEN_ARG)
  }

  if (process.platform === 'darwin') {
    const loginItemSettings = app.getLoginItemSettings()
    return loginItemSettings.wasOpenedAtLogin || loginItemSettings.wasOpenedAsHidden
  }

  return false
}

function shouldOpenSettingsWindowOnLaunch(): boolean {
  if (VITE_DEV_SERVER_URL) {
    return true
  }

  return !isSilentStartupLaunch()
}

// 初始化ASR Provider
function initializeASRProvider() {
  asrProvider = new ASRProvider()
}

// 初始化文本润色服务
function initializeRefineService() {
  refineService = new RefineService({
    getRefineConfig: () => configManager.getLLMRefineConfig(),
    getTargetLanguage: () => configManager.getTranslationConfig().targetLanguage,
  })
}

function refreshRemoteGlossaryIfEnabled(): void {
  if (!refineService || !configManager.isLLMRefineEnabled()) {
    return
  }

  void refineService.refreshRemoteGlossary()
}

function willRunRefine(): boolean {
  return Boolean(refineService?.isEnabled() && refineService.hasValidConfig())
}

function registerHotkeys(): void {
  registerGlobalHotkeys({
    getWillRunRefine: willRunRefine,
  })
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

  // 同步系统语言
  const syncSystemLocale = async () => {
    const changed = await syncSystemLocaleIfNeeded()
    if (changed) {
      broadcastLanguageSnapshot()
      refreshLocalizedUi()
    }
  }

  // Follow system language changes when setting === 'system'
  app.on('browser-window-focus', () => {
    void syncSystemLocale()
  })

  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('did-finish-load', () => {
      sendLanguageSnapshotToWindow(window)
    })
  })
  // 设置开机自启
  updateAutoLaunchState(appConfig.autoLaunch ?? false)
  // The local ASR provider is initialized on first use.
  initializeRefineService()
  refreshRemoteGlossaryIfEnabled()
  // 创建后台窗口（渲染进程崩溃/无响应时中止进行中的录音会话）
  setBackgroundWindowCrashHandler(handleBackgroundRendererGone)
  createBackgroundWindow()
  // 创建托盘
  createTray()
  // 初始化音频处理器（需要 ASR / 文本润色服务依赖）
  initProcessor({
    getAsrProvider: () => asrProvider,
    getASRConfig: () => configManager.getASRConfig(),
    initializeASRProvider,
    getRefineService: () => refineService,
  })
  // 初始化 IPC 处理器依赖 必须在 registerAllIPCHandlers 之前
  initIPCHandlers({
    // config-handlers 依赖
    config: {
      updateAutoLaunchState,
      refreshLocalizedUi,
      registerGlobalHotkeys: registerHotkeys,
      getRefineService: () => refineService,
      getSettingsWindow,
    },

    // session-handlers 依赖
    session: {
      // 这些现在直接从 audio/ 模块导入
      handleStartRecording,
      handleStopRecording: () =>
        handleStopRecording({
          willRunRefine: willRunRefine(),
        }),
      handleAudioChunk,
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
  // 检查更新
  void UpdaterManager.checkForUpdates()
  // 注册全局快捷键
  registerHotkeys()
  // 启动 ioHook
  ioHookManager.start()

  // 设置 Dock 图标和应用名称（macOS）
  if (process.platform === 'darwin') {
    app.setName(t('app.name'))
    const dockIconPath = path.join(process.env.VITE_PUBLIC, 'voice-key-icon-1024-v3.png')
    const dockIcon = nativeImage.createFromPath(dockIconPath)
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon)
    } else {
      console.warn('[Main] Dock icon not found, keeping default:', dockIconPath)
    }
  }

  // 启动时窗口策略：
  // 1. 开发环境：总是打开
  // 2. 生产环境：仅用户手动启动时自动打开设置窗口
  // 3. 开机自启时只保留后台能力与托盘，不抢前台
  if (shouldOpenSettingsWindowOnLaunch()) {
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
