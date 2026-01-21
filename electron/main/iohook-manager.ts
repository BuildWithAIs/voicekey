import { uIOhook, UiohookKey, UiohookKeyboardEvent } from 'uiohook-napi'
import { EventEmitter } from 'events'

// Define supported modifiers
const MODIFIERS = {
  SHIFT: new Set([UiohookKey.Shift, UiohookKey.ShiftRight]),
  CTRL: new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]),
  ALT: new Set([UiohookKey.Alt, UiohookKey.AltRight]),
  META: new Set([UiohookKey.Meta, UiohookKey.MetaRight]), // Command on Mac, Windows key on Win
}

// All modifier keys for exact match checking
const ALL_MODIFIER_KEYS: Set<number> = new Set([
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
])

export class IOHookManager extends EventEmitter {
  private pressedKeys: Set<number> = new Set()
  private isListening = false
  private debug = false

  constructor() {
    super()
  }

  start(debug = false) {
    if (this.isListening) return

    this.debug = debug
    this.pressedKeys.clear()

    uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })
    uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })

    uIOhook.start()
    this.isListening = true
    if (this.debug) console.log('[IOHook] Started')
  }

  stop() {
    if (!this.isListening) return
    uIOhook.stop()
    this.pressedKeys.clear()
    this.isListening = false
    if (this.debug) console.log('[IOHook] Stopped')
  }

  private handleInput(e: UiohookKeyboardEvent) {
    // We strictly only case about keyboard events 4 (keydown) and 5 (keyup)
    // The type definition might be different depending on version, usually 4=down, 5=up

    // uiohook-napi exposes e.type.
    // 4 = KeyPressed (KeyDown)
    // 5 = KeyReleased (KeyUp)

    if (e.type === 4) {
      // KeyDown
      this.pressedKeys.add(e.keycode)
      if (this.debug) console.log('[IOHook] KeyDown:', e.keycode, (UiohookKey as any)[e.keycode])
      this.emit('keydown', e.keycode)
      console.log('IOHookManager: pressedKeys:', this.pressedKeys)
      this.checkHotkeys()
    } else if (e.type === 5) {
      // KeyUp
      this.pressedKeys.delete(e.keycode)
      if (this.debug) console.log('[IOHook] KeyUp:', e.keycode, (UiohookKey as any)[e.keycode])
      this.emit('keyup', e.keycode)
      console.log('IOHookManager: pressedKeys:', this.pressedKeys)
    }
  }

  private checkHotkeys() {
    // This is where we could trigger 'hotkey-down' events
    // For PTT, we might want to let the main process handle the logic by querying checking state
    // But emitting a specific event is cleaner.
    // For now, we exposes an API to check if a specific combination is pressed.
  }

  /**
   * 检查指定的快捷键组合是否"当前正被按住"
   *
   * 这是 PTT（Push-To-Talk）功能的核心状态检测器，用于判断录音何时开始、何时停止。
   * 在 main.ts 的 checkPTT() 回调中被调用，每次键盘事件（keydown/keyup）都会触发检测。
   *
   * @param modifiers - 需要按住的修饰键数组，如 ['meta', 'shift']
   * @param key - 需要按住的主键 keycode，如 UiohookKey.Space (57)
   * @returns true = 用户正在按住配置的快捷键组合；false = 未按住或已松开
   *
   * @example
   * // 检查 Command+Space 是否被按住
   * const isPressed = ioHookManager.isPressed(['meta'], UiohookKey.Space)
   * if (isPressed) handleStartRecording()
   * else handleStopRecording()
   */
  isPressed(modifiers: string[], key: number): boolean {
    // 1. Check main key is pressed
    if (!this.pressedKeys.has(key)) return false

    // 2. Check all required modifiers are pressed
    for (const mod of modifiers) {
      if (!this.hasModifier(mod)) return false
    }

    // 3. Check no extra modifiers are pressed (exact match)
    // Get all keycodes that belong to the required modifiers
    const requiredModifierKeys = this.getRequiredModifierKeys(modifiers)

    for (const pressedKey of this.pressedKeys) {
      // Skip the main key
      if (pressedKey === key) continue

      // If a pressed key is a modifier key but NOT in the required set, reject
      if (ALL_MODIFIER_KEYS.has(pressedKey) && !requiredModifierKeys.has(pressedKey)) {
        return false
      }
    }

    return true
  }

  // Get all keycodes that belong to the specified modifiers
  // e.g., ['shift', 'meta'] -> Set { Shift, ShiftRight, Meta, MetaRight }
  private getRequiredModifierKeys(modifiers: string[]): Set<number> {
    const keys = new Set<number>()
    for (const mod of modifiers) {
      const modSet = MODIFIERS[mod.toUpperCase() as keyof typeof MODIFIERS]
      if (modSet) {
        for (const k of modSet) {
          keys.add(k)
        }
      }
    }
    return keys
  }

  private hasModifier(mod: string): boolean {
    const modSet = MODIFIERS[mod.toUpperCase() as keyof typeof MODIFIERS]
    if (!modSet) return false

    // Check if any key in the modifier set is pressed
    for (const key of modSet) {
      if (this.pressedKeys.has(key)) return true
    }
    return false
  }
}

export const ioHookManager = new IOHookManager()
