import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  screen,
} from 'electron'
import fs from 'fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UiohookKey } from 'uiohook-napi'
import { ASRProvider } from './asr-provider'
import { configManager } from './config-manager'
import { historyManager } from './history-manager'
import { hotkeyManager } from './hotkey-manager'
import { initMainI18n, setMainLanguage, t } from './i18n'
import { ioHookManager } from './iohook-manager'
import { textInjector } from './text-injector'
import { UpdaterManager } from './updater-manager'
import { IPC_CHANNELS, OverlayState, VoiceSession } from '../shared/types'
// ES Module compatibility - 延迟导入 fluent-ffmpeg 避免启动时的 __dirname 错误
let ffmpeg: any
let ffmpegInitialized = false

function initializeFfmpeg() {
  if (ffmpegInitialized) return

  try {
    const require = createRequire(import.meta.url)
    const ffmpegModule = require('fluent-ffmpeg')
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')

    let ffmpegPath = ffmpegInstaller.path

    // 生产环境中，FFmpeg 二进制被解压到 app.asar.unpacked 目录
    if (app.isPackaged) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
    }

    ffmpeg = ffmpegModule
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpegInitialized = true
    console.log('[Main] FFmpeg initialized with path:', ffmpegPath)
  } catch (error) {
    console.error('[Main] Failed to initialize FFmpeg:', error)
    // 显示错误状态并在2秒后隐藏 HUD
    updateOverlay({ status: 'error', message: t('errors.ffmpegInitFailed') })
    setTimeout(() => hideOverlay(), 2000)
    throw error // 重新抛出以便调用方知道初始化失败
  }
}

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 目录结构
process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// 全局变量
// 更清晰的命名
let backgroundWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
// const audioRecorder = new AudioRecorder()
let asrProvider: ASRProvider | null = null
let currentSession: VoiceSession | null = null

// 创建主窗口（隐藏的后台窗口）
function createMainWindow() {
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
  // 打开开发者工具以查看 renderer 进程日志（开发模式）
  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.webContents.openDevTools({ mode: 'detach' })
  }

  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    backgroundWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // 监听页面加载完成
  backgroundWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] backgroundWindow finished loading')
  })

  // 监听页面加载失败
  backgroundWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] backgroundWindow failed to load:', errorCode, errorDescription)
  })
}

// 创建设置窗口
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  settingsWindow = new BrowserWindow({
    width,
    height,
    minWidth: 600,
    minHeight: 500,
    title: t('window.settingsTitle'),
    titleBarStyle: 'hiddenInset', // macOS 风格：隐藏标题栏但保留交通灯按钮
    trafficLightPosition: { x: 20, y: 20 }, // 交通灯按钮位置
    vibrancy: 'sidebar', // macOS 毛玻璃效果（可选）
    backgroundColor: '#00000000', // 透明背景
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${VITE_DEV_SERVER_URL}#/settings`)
    // 开发模式下打开 DevTools
    settingsWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    settingsWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      hash: '/settings',
    })
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// 创建录音状态浮窗 (透明、无边框、置顶)
function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const overlayWidth = 200
  const overlayHeight = 60
  const bottomMargin = 60

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round((screenWidth - overlayWidth) / 2),
    y: screenHeight - overlayHeight - bottomMargin,
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
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#/overlay`)
  } else {
    overlayWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      hash: '/overlay',
    })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

// 显示/隐藏/更新浮窗状态
function showOverlay(state: OverlayState) {
  console.log(`[Main] 🔵 showOverlay:`, JSON.stringify(state))
  console.log(`[Main] 🔵 showOverlay called from:`, new Error().stack?.split('\n')[2])
  const win = createOverlayWindow()
  win.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
  win.showInactive()
}

function hideOverlay() {
  console.log(`[Main] 🔵 hideOverlay`)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

// 统一错误处理：显示错误状态并自动关闭 HUD
function showErrorAndHide(message: string, hideDelay = 2000) {
  console.log(`[Main] 🔴 showErrorAndHide: ${message}`)
  updateOverlay({ status: 'error', message })
  setTimeout(() => hideOverlay(), hideDelay)
}

function updateOverlay(state: OverlayState) {
  console.log(`[Main] 🔵 updateOverlay:`, JSON.stringify(state))
  if (state.status === 'error') {
    console.log(`[Main] 🔴 ERROR state sent! Stack:`, new Error().stack)
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
  }
}

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

// 创建托盘图标
const buildTrayMenu = () =>
  Menu.buildFromTemplate([
    {
      label: t('tray.settings'),
      click: () => createSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        app.quit()
      },
    },
  ])

const refreshLocalizedUi = () => {
  if (tray) {
    tray.setToolTip(t('tray.tooltip'))
    tray.setContextMenu(buildTrayMenu())
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(t('window.settingsTitle'))
  }
}

function createTray() {
  // 创建一个简单的托盘图标（后续可以替换为实际图标）
  const icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'tray-icon.png'))
  // macOS 会自动查找 tray-icon@2x.png 用于 Retina 屏幕
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  refreshLocalizedUi()

  // 双击托盘图标打开设置
  tray.on('double-click', () => {
    createSettingsWindow()
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

      // Start Recording（带防抖）
      if (
        isPressed &&
        (!currentSession || currentSession.status !== 'recording') &&
        !debounceTimer
      ) {
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
      if (!isPressed && currentSession && currentSession.status === 'recording') {
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

// 处理开始录音
// 处理开始录音
async function handleStartRecording() {
  const startTimestamp = Date.now()
  console.log(`[Main] [${new Date().toISOString()}] handleStartRecording triggered`)
  if (currentSession && currentSession.status === 'recording') {
    return
  }

  try {
    showOverlay({ status: 'recording' })
    currentSession = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      status: 'recording',
    }

    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      console.log(`[Main] [${new Date().toISOString()}] Sending SESSION_START to backgroundWindow`)
      backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_START)
      const duration = Date.now() - startTimestamp
      console.log(`[Main] ⏱️  Recording start completed in ${duration}ms`)
    } else {
      console.error('[Main] backgroundWindow is not available')
      showErrorAndHide(t('errors.internal'))
      currentSession = null
    }
  } catch (error) {
    console.error('[Main] Failed to start recording:', error)
    showErrorAndHide(t('errors.startFailed'))
    currentSession = null
  }
}

// 处理停止录音
async function handleStopRecording() {
  if (!currentSession || currentSession.status !== 'recording') {
    console.log(
      '[Main] handleStopRecording called but no active session or not recording. Status:',
      currentSession?.status,
    )
    return
  }

  try {
    const recordingDuration = Date.now() - currentSession.startTime.getTime()
    console.log(`[Main] [${new Date().toISOString()}] handleStopRecording triggered`)
    console.log(`[Main] ⏱️  Recording duration: ${recordingDuration}ms`)
    currentSession.duration = recordingDuration
    currentSession.status = 'processing'
    updateOverlay({ status: 'processing' })

    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      console.log(`[Main] [${new Date().toISOString()}] Sending SESSION_STOP to backgroundWindow`)
      backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
    } else {
      console.error('[Main] Cannot send SESSION_STOP: backgroundWindow not available')
      showErrorAndHide(t('errors.stopFailed'))
    }
  } catch (error) {
    console.error('[Main] Failed to stop recording:', error)
    showErrorAndHide(t('errors.stopFailed'))
  }
}

// 转换音频格式为 MP3
function convertToMP3(inputPath: string, outputPath: string): Promise<void> {
  const conversionStartTime = Date.now()
  return new Promise((resolve, reject) => {
    // 确保 ffmpeg 已初始化
    initializeFfmpeg()

    console.log(`[Main] [${new Date().toISOString()}] Converting audio to MP3...`)
    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => {
        const conversionDuration = Date.now() - conversionStartTime
        console.log(`[Main] [${new Date().toISOString()}] Audio conversion completed`)
        console.log(`[Main] ⏱️  FFmpeg conversion took ${conversionDuration}ms`)
        resolve()
      })
      .on('error', (err: Error) => {
        const conversionDuration = Date.now() - conversionStartTime
        console.error(`[Main] Audio conversion failed after ${conversionDuration}ms:`, err)
        reject(err)
      })
      .save(outputPath)
  })
}

// 处理音频数据（来自渲染进程）
async function handleAudioData(buffer: Buffer) {
  if (!currentSession) {
    console.log('[Main] Received audio data but no active session')
    return
  }

  const overallStartTime = Date.now()
  const timestamp = Date.now()
  const tempWebmPath = path.join(app.getPath('temp'), `voice-key-${timestamp}.webm`)
  const tempMp3Path = path.join(app.getPath('temp'), `voice-key-${timestamp}.mp3`)

  try {
    console.log(
      `[Main] [${new Date().toISOString()}] Received audio data size: ${buffer.length} bytes`,
    )

    const saveStartTime = Date.now()
    console.log(
      `[Main] [${new Date().toISOString()}] Saving webm audio to temp file: ${tempWebmPath}`,
    )
    fs.writeFileSync(tempWebmPath, buffer)
    const saveDuration = Date.now() - saveStartTime
    console.log(`[Main] ⏱️  File save took ${saveDuration}ms`)

    const conversionStartTime = Date.now()
    await convertToMP3(tempWebmPath, tempMp3Path)
    const conversionDuration = Date.now() - conversionStartTime
    console.log(`[Main] [${new Date().toISOString()}] Audio converted to MP3: ${tempMp3Path}`)
    console.log(`[Main] ⏱️  Total conversion process took ${conversionDuration}ms`)

    if (!asrProvider) {
      const initStartTime = Date.now()
      console.log(`[Main] [${new Date().toISOString()}] Initializing ASR provider...`)
      initializeASRProvider()
      if (!asrProvider) throw new Error('ASR Provider initialization failed')
      const initDuration = Date.now() - initStartTime
      console.log(`[Main] ⏱️  ASR initialization took ${initDuration}ms`)
    }

    const asrStartTime = Date.now()
    console.log(`[Main] [${new Date().toISOString()}] Sending audio to ASR service...`)
    const transcription = await asrProvider.transcribe(tempMp3Path)
    const asrDuration = Date.now() - asrStartTime
    console.log(`[Main] [${new Date().toISOString()}] Transcription received`)
    console.log(`[Main] ⏱️  ASR transcription took ${asrDuration}ms`)
    console.log(
      '[Main] Transcription received (bytes):',
      Buffer.from(transcription.text).toString('hex'),
    )
    console.log('[Main] Transcription text:', transcription.text)

    currentSession.transcription = transcription.text
    currentSession.status = 'completed'

    historyManager.add({
      text: transcription.text,
      duration: currentSession.duration,
    })

    const injectStartTime = Date.now()
    console.log(`[Main] [${new Date().toISOString()}] Injecting text...`)
    await textInjector.injectText(transcription.text)
    const injectDuration = Date.now() - injectStartTime
    console.log(`[Main] ⏱️  Text injection took ${injectDuration}ms`)

    updateOverlay({ status: 'success' })
    setTimeout(() => hideOverlay(), 800)

    const cleanupStartTime = Date.now()
    if (fs.existsSync(tempWebmPath)) fs.unlinkSync(tempWebmPath)
    if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path)
    const cleanupDuration = Date.now() - cleanupStartTime
    console.log(`[Main] [${new Date().toISOString()}] Temp files cleaned up`)
    console.log(`[Main] ⏱️  Cleanup took ${cleanupDuration}ms`)

    const overallDuration = Date.now() - overallStartTime
    console.log(`[Main] ⏱️  ========================================`)
    console.log(`[Main] ⏱️  TOTAL PROCESSING TIME: ${overallDuration}ms`)
    console.log(`[Main] ⏱️  Breakdown:`)
    console.log(
      `[Main] ⏱️    - File save: ${saveDuration}ms (${((saveDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Audio conversion: ${conversionDuration}ms (${((conversionDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - ASR transcription: ${asrDuration}ms (${((asrDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Text injection: ${injectDuration}ms (${((injectDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Cleanup: ${cleanupDuration}ms (${((cleanupDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(`[Main] ⏱️  ========================================`)

    currentSession = null
  } catch (error) {
    const errorDuration = Date.now() - overallStartTime
    console.error(`[Main] Failed to process audio after ${errorDuration}ms:`, error)
    updateOverlay({
      status: 'error',
      message: error instanceof Error ? error.message : t('errors.generic'),
    })
    setTimeout(() => hideOverlay(), 2000)
    if (currentSession) {
      currentSession.status = 'error'
    }
    try {
      if (fs.existsSync(tempWebmPath)) fs.unlinkSync(tempWebmPath)
      if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path)
    } catch (cleanupError) {
      console.error('[Main] Failed to cleanup temp files:', cleanupError)
    }
  }
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

async function handleCancelSession() {
  // 1. 立即隐藏窗口
  hideOverlay()

  // 2. 标记当前会话为已取消
  if (currentSession) {
    currentSession = null // 或保留引用但标记失效
  }

  // 3. 通知后台窗口停止录音 (如果正在录音)
  if (backgroundWindow) {
    backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
  }

  // 4. (关键) 在 handleAudioData 中添加检查
  // 如果收到音频数据时 currentSession 为 null 或 status 为 aborted，则直接丢弃，不执行 ASR 和 注入。
}

// IPC处理器
function setupIPCHandlers() {
  // 配置相关
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return configManager.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config) => {
    if (config.app) {
      configManager.setAppConfig(config.app)
      if (typeof config.app.autoLaunch === 'boolean') {
        updateAutoLaunchState(config.app.autoLaunch)
      }
      await setMainLanguage(config.app.language)
      refreshLocalizedUi()
    }
    if (config.asr) {
      configManager.setASRConfig(config.asr)
      initializeASRProvider()
    }
    if (config.hotkey) {
      configManager.setHotkeyConfig(config.hotkey)
      // 重新注册快捷键：先清除所有监听器
      hotkeyManager.unregisterAll()
      ioHookManager.removeAllListeners('keydown')
      ioHookManager.removeAllListeners('keyup')
      registerGlobalHotkeys()
      console.log('[Main] Hotkeys re-registered with new config:', config.hotkey)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_TEST, async (_event, config?: any) => {
    if (config) {
      const tempProvider = new ASRProvider(config)
      return await tempProvider.testConnection()
    }
    if (!asrProvider) {
      return false
    }
    return await asrProvider.testConnection()
  })

  // 会话相关
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    await handleStartRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    await handleStopRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STATUS, () => {
    return currentSession?.status || 'idle'
  })

  // 历史记录相关
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, () => historyManager.getAll())
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => historyManager.clear())
  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_event, id) => historyManager.delete(id))

  // 接收音频数据
  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, buffer) => {
    handleAudioData(Buffer.from(buffer))
  })

  ipcMain.on(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, (_event, level: number) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, level)
    }
  })

  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean, options?: any) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(ignore, options)
    }
  })

  ipcMain.on('error', (_event, error) => {
    console.error('[Main] 🔴 Renderer Error received:', error)
    console.error('[Main] 🔴 Error type:', typeof error)
    console.error('[Main] 🔴 Current session status:', currentSession?.status)
    showNotification(t('notification.errorTitle'), error)
    if (currentSession) currentSession.status = 'error'
  })

  // 更新相关
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    return await UpdaterManager.checkForUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, () => {
    return UpdaterManager.getLastUpdateInfo()
  })

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, (_event, url) => {
    UpdaterManager.openReleasePage(url)
  })

  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, handleCancelSession)
}

// 应用程序生命周期
app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // 初始化
  const appConfig = configManager.getAppConfig()
  await initMainI18n(appConfig.language)
  updateAutoLaunchState(appConfig.autoLaunch ?? false)
  initializeASRProvider()
  createMainWindow()
  createTray()
  setupIPCHandlers()
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
  if (BrowserWindow.getAllWindows().length === 0 || !settingsWindow) {
    createSettingsWindow()
  } else if (settingsWindow) {
    settingsWindow.focus()
  }
})
