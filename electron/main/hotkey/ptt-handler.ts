import { configManager } from '../config-manager'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'
import { createSettingsWindow } from '../window'
import { handleStartRecording, handleStopRecording, getCurrentSession } from '../audio'
import { translator } from '../translation/translator'
import { hyprlandIntegration } from '../platform/hyprland-integration'
import { parseAccelerator } from './parser'

type RegisterGlobalHotkeysOptions = {
  getWillRunRefine?: () => boolean
}

/**
 * 注册全局快捷键（PTT + 设置）
 */
export async function registerGlobalHotkeys(
  options: RegisterGlobalHotkeysOptions = {},
): Promise<void> {
  const hotkeyConfig = configManager.getHotkeyConfig()
  const translationConfig = configManager.getTranslationConfig()
  const pttKey = hotkeyConfig.pttKey

  let debounceTimer: NodeJS.Timeout | null = null
  const DEBOUNCE_MS = 50

  const startPTT = () => {
    const session = getCurrentSession()
    if (session?.status === 'recording' || debounceTimer) return
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const currentSession = getCurrentSession()
      if (!currentSession || currentSession.status !== 'recording') {
        handleStartRecording()
      }
    }, DEBOUNCE_MS)
  }

  const stopPTT = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const session = getCurrentSession()
    if (session?.status === 'recording') {
      handleStopRecording({
        willRunRefine: options.getWillRunRefine?.() ?? false,
      })
    }
  }

  const openSettings = () => createSettingsWindow()
  const translate = () => {
    console.log('[Hotkey] Translation hotkey triggered')
    void translator.translate()
  }

  if (hyprlandIntegration.isActiveSession()) {
    hyprlandIntegration.start({
      'ptt-start': startPTT,
      'ptt-stop': stopPTT,
      'open-settings': openSettings,
      ...(translationConfig.enabled ? { translate } : {}),
    })
    console.log('[Hotkey] Using Hyprland socket2 backend')
    return
  }

  // Windows、macOS 与 Linux X11 继续使用 iohook 监听 PTT 按下与释放。
  try {
    await ioHookManager.start()
  } catch (error) {
    console.error('[Hotkey] Failed to start native PTT keyboard hook:', error)
  }

  let pttConfig: ReturnType<typeof parseAccelerator> = null
  try {
    pttConfig = parseAccelerator(pttKey, ioHookManager.getKeyMap())
  } catch (error) {
    console.error('[Hotkey] Native PTT backend is unavailable:', error)
  }
  console.log({ pttConfig })

  if (pttConfig) {
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
        stopPTT()
      }
    }

    ioHookManager.on('keydown', checkPTT)
    ioHookManager.on('keyup', checkPTT)
  }

  // 注册设置快捷键 (使用 Electron globalShortcut，因为是单次触发)
  hotkeyManager.register(hotkeyConfig.toggleSettings, openSettings)

  // 注册翻译快捷键 (使用 Electron globalShortcut，因为是单次触发)
  if (translationConfig.enabled && hotkeyConfig.translateKey) {
    hotkeyManager.register(hotkeyConfig.translateKey, translate)
  }
}
