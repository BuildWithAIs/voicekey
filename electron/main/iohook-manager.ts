import { EventEmitter } from 'events'
import type { UiohookKeyMap } from './hotkey/parser'

type UiohookModule = typeof import('uiohook-napi')

type UiohookKeyboardEvent = {
  type: number
  keycode: number
}

export class IOHookManager extends EventEmitter {
  private pressedKeys: Set<number> = new Set()
  private isListening = false
  private debug = false
  private nativeModule: UiohookModule | null = null
  private modifiers: Record<string, Set<number>> = {}
  private allModifierKeys = new Set<number>()

  constructor() {
    super()
  }

  async start(debug = false): Promise<void> {
    if (this.isListening) return

    const nativeModule = await import('uiohook-napi')
    const keyMap = nativeModule.UiohookKey
    this.nativeModule = nativeModule
    this.modifiers = {
      SHIFT: new Set([keyMap.Shift, keyMap.ShiftRight]),
      CTRL: new Set([keyMap.Ctrl, keyMap.CtrlRight]),
      ALT: new Set([keyMap.Alt, keyMap.AltRight]),
      META: new Set([keyMap.Meta, keyMap.MetaRight]),
    }
    this.allModifierKeys = new Set([
      keyMap.Shift,
      keyMap.ShiftRight,
      keyMap.Ctrl,
      keyMap.CtrlRight,
      keyMap.Alt,
      keyMap.AltRight,
      keyMap.Meta,
      keyMap.MetaRight,
    ])
    this.debug = debug
    this.pressedKeys.clear()

    nativeModule.uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })
    nativeModule.uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })

    nativeModule.uIOhook.start()
    this.isListening = true
    if (this.debug) console.log('[IOHook] Started')
  }

  stop() {
    if (!this.isListening) return
    this.nativeModule?.uIOhook.stop()
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
      if (this.debug) {
        console.log('[IOHook] KeyDown:', e.keycode, this.getKeyName(e.keycode))
      }
      this.emit('keydown', e.keycode)
      this.checkHotkeys()
    } else if (e.type === 5) {
      // KeyUp
      this.pressedKeys.delete(e.keycode)
      if (this.debug) {
        console.log('[IOHook] KeyUp:', e.keycode, this.getKeyName(e.keycode))
      }
      this.emit('keyup', e.keycode)
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

    // 裸修饰键热键（如 PTT = 'Alt'）：主键本身是修饰键且无附加修饰键。
    // 这类热键必须"单独按下"才算命中——否则 'Alt' 会被 'Alt+T' 之类的组合键误触发，
    // 因为下面的检查默认只排斥额外的"修饰键"，不排斥额外的普通键（字母）。
    const isBareModifierHotkey = modifiers.length === 0 && this.allModifierKeys.has(key)

    for (const pressedKey of this.pressedKeys) {
      // Skip the main key
      if (pressedKey === key) continue

      if (this.allModifierKeys.has(pressedKey)) {
        // If a pressed key is a modifier key but NOT in the required set, reject
        if (!requiredModifierKeys.has(pressedKey)) {
          return false
        }
      } else if (isBareModifierHotkey) {
        // 裸修饰键热键不允许任何其他按键同时按下（包括字母键）
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
      const modSet = this.modifiers[mod.toUpperCase()]
      if (modSet) {
        for (const k of modSet) {
          keys.add(k)
        }
      }
    }
    return keys
  }

  private hasModifier(mod: string): boolean {
    const modSet = this.modifiers[mod.toUpperCase()]
    if (!modSet) return false

    // Check if any key in the modifier set is pressed
    for (const key of modSet) {
      if (this.pressedKeys.has(key)) return true
    }
    return false
  }

  getKeyMap(): UiohookKeyMap {
    if (!this.nativeModule) {
      throw new Error('uiohook has not been started')
    }
    return this.nativeModule.UiohookKey
  }

  private getKeyName(keycode: number): string | undefined {
    if (!this.nativeModule) return undefined
    return Object.entries(this.nativeModule.UiohookKey).find(([, value]) => value === keycode)?.[0]
  }
}

export const ioHookManager = new IOHookManager()
