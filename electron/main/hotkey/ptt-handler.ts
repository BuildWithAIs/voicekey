import { configManager } from '../config-manager'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'
import { createSettingsWindow } from '../window'
import { handleStartRecording, handleStopRecording, getCurrentSession } from '../audio'
import { translator } from '../translation/translator'
import { hyprlandIntegration } from '../platform/hyprland-integration'
import { parseAccelerator } from './parser'

type RegisterGlobalHotkeysOptions = {
  getWillProcessDictation?: () => boolean
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

  let pttPressed = false
  let lastExactMatch = false

  const startPTT = () => {
    if (pttPressed) return
    pttPressed = true
    const session = getCurrentSession()
    if (session?.status === 'recording') return
    // The pressed latch already suppresses repeat events. Delaying this edge
    // discards the beginning of short utterances before capture even starts.
    void handleStartRecording()
  }

  const stopPTT = () => {
    pttPressed = false
    const session = getCurrentSession()
    if (session?.status === 'recording') {
      handleStopRecording({
        willProcessDictation: options.getWillProcessDictation?.() ?? false,
        source: 'hotkey-release',
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
    const checkPTT = (
      inputKey: number,
      input?: {
        type: number
        time?: number
        metaKey?: boolean
        altKey?: boolean
        shiftKey?: boolean
        ctrlKey?: boolean
      },
    ) => {
      // Match exactly to start; after latching, tolerate extra keys until a
      // required key is released. Otherwise an unrelated key can stop capture.
      const exactMatch = ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key)
      const isPressed = pttPressed
        ? ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key, false)
        : exactMatch
      if (isPressed !== pttPressed || (pttPressed && exactMatch !== lastExactMatch)) {
        console.log('[Hotkey] PTT key state', {
          sessionId: getCurrentSession()?.id,
          pressed: isPressed,
          exactMatch,
          eventType: input?.type,
          nativeTime: input?.time,
          nativeModifiers: input && {
            meta: input.metaKey,
            alt: input.altKey,
            shift: input.shiftKey,
            ctrl: input.ctrlKey,
          },
          ...ioHookManager.getHotkeyDiagnostics(pttConfig.modifiers, pttConfig.key, inputKey),
        })
      }
      lastExactMatch = exactMatch
      // A rejected busy press is consumed until release. Key repeat must not
      // unexpectedly start a recording when previous processing finishes.
      if (isPressed && !pttPressed) startPTT()
      else if (!isPressed && pttPressed) stopPTT()
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
