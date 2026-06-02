import { configManager } from '../config-manager'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'
import { createSettingsWindow } from '../window'
import { handleStartRecording, handleStopRecording, getCurrentSession } from '../audio'
import { translator } from '../translation/translator'
import { parseAccelerator } from './parser'

type RegisterGlobalHotkeysOptions = {
  getWillRunRefine?: () => boolean
}

/**
 * 注册全局快捷键（PTT + 设置）
 */
export function registerGlobalHotkeys(options: RegisterGlobalHotkeysOptions = {}): void {
  const hotkeyConfig = configManager.getHotkeyConfig()
  const translationConfig = configManager.getTranslationConfig()
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
        handleStopRecording({
          willRunRefine: options.getWillRunRefine?.() ?? false,
        })
      }
    }

    ioHookManager.on('keydown', checkPTT)
    ioHookManager.on('keyup', checkPTT)
  }

  // 注册设置快捷键 (使用 Electron globalShortcut，因为是单次触发)
  hotkeyManager.register(hotkeyConfig.toggleSettings, () => {
    createSettingsWindow()
  })

  // 注册翻译快捷键 (使用 Electron globalShortcut，因为是单次触发)
  if (translationConfig.enabled && hotkeyConfig.translateKey) {
    hotkeyManager.register(hotkeyConfig.translateKey, () => {
      console.log('[Hotkey] Translation hotkey triggered')
      void translator.translate()
    })
  }
}
