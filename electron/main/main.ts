import { app, BrowserWindow, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { ASRProvider } from './asr-provider'
import { LLMProvider } from './llm-provider'
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
  handleAudioData,
  handleCancelSession,
  getCurrentSession,
  setSessionError,
  // Processor
  initProcessor,
} from './audio'
// 环境模块
import { initEnv, VITE_DEV_SERVER_URL } from './env'
// 全局变量
let asrProvider: ASRProvider | null = null
let llmProvider: LLMProvider | null = null

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

// 初始化 LLM Provider
function initializeLLMProvider() {
  const config = configManager.getASRConfig()
  llmProvider = new LLMProvider(config)
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
  // 初始化ASR Provider
  initializeASRProvider()
  // 初始化 LLM Provider
  initializeLLMProvider()
  // 创建后台窗口
  createBackgroundWindow()
  // 创建托盘
  createTray()
  // 初始化音频处理器（需要 ASR Provider 依赖）
  initProcessor({
    getAsrProvider: () => asrProvider,
    initializeASRProvider,
    getLlmProvider: () => llmProvider,
    initializeLLMProvider,
  })
  // 初始化 IPC 处理器依赖 必须在 registerAllIPCHandlers 之前
  initIPCHandlers({
    // config-handlers 依赖
    config: {
      updateAutoLaunchState,
      refreshLocalizedUi,
      initializeASRProvider,
      initializeLLMProvider,
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
  // 检查更新
  void UpdaterManager.checkForUpdates()
  // 注册全局快捷键
  registerGlobalHotkeys()
  // 启动 ioHook
  ioHookManager.start()

  // 设置 Dock 图标和应用名称（macOS）
  if (process.platform === 'darwin') {
    app.setName(t('app.name'))
    const dockIconPath = path.join(process.env.VITE_PUBLIC, 'voice-key-dock-icon.png')
    app.dock.setIcon(nativeImage.createFromPath(dockIconPath))
  }

  // 启动时窗口策略：
  // 1. 开发环境：总是打开
  // 2. 生产环境：如果是用户手动启动（非隐藏启动），则打开
  // isHiddenLaunch: macOS 上通过 setLoginItemSettings({ openAsHidden: true }) 启动时为 true
  const isHiddenLaunch = app.getLoginItemSettings().wasOpenedAsHidden
  if (VITE_DEV_SERVER_URL || !isHiddenLaunch) {
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
