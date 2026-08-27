export type UiohookKeyMap = Record<string | number, string | number>

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
export function parseAccelerator(
  accelerator: string,
  keyMap: UiohookKeyMap,
): { modifiers: string[]; key: number } | null {
  const parts = accelerator.split('+')
  const keyStr = parts.pop()
  if (!keyStr) return null

  const lowerKey = keyStr.toLowerCase()

  // 1. 单独修饰键作为主键的情况（无其他修饰键）
  if (parts.length === 0) {
    if (lowerKey === 'command' || lowerKey === 'cmd' || lowerKey === 'meta') {
      return { modifiers: [], key: keyMap.Meta as number }
    }
    if (lowerKey === 'control' || lowerKey === 'ctrl') {
      return { modifiers: [], key: keyMap.Ctrl as number }
    }
    if (lowerKey === 'alt' || lowerKey === 'option') {
      return { modifiers: [], key: keyMap.Alt as number }
    }
    if (lowerKey === 'shift') {
      return { modifiers: [], key: keyMap.Shift as number }
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
  const key = keyToUiohookCode(keyStr, keyMap)
  if (key === null) {
    console.warn(`[Hotkey:Parser] Unknown key "${keyStr}", falling back to Space`)
    return { modifiers, key: keyMap.Space as number }
  }

  return { modifiers, key }
}

/**
 * 将按键名称转换为 uiohook keycode
 */
export function keyToUiohookCode(keyStr: string, keyMap: UiohookKeyMap): number | null {
  const upper = keyStr.toUpperCase()
  const lower = keyStr.toLowerCase()

  // 特殊键映射
  const specialKeys: Record<string, number> = {
    SPACE: keyMap.Space as number,
    ENTER: keyMap.Enter as number,
    RETURN: keyMap.Enter as number,
    TAB: keyMap.Tab as number,
    BACKSPACE: keyMap.Backspace as number,
    DELETE: keyMap.Delete as number,
    ESCAPE: keyMap.Escape as number,
    ESC: keyMap.Escape as number,
    UP: keyMap.ArrowUp as number,
    DOWN: keyMap.ArrowDown as number,
    LEFT: keyMap.ArrowLeft as number,
    RIGHT: keyMap.ArrowRight as number,
    HOME: keyMap.Home as number,
    END: keyMap.End as number,
    PAGEUP: keyMap.PageUp as number,
    PAGEDOWN: keyMap.PageDown as number,
    INSERT: keyMap.Insert as number,
    CAPSLOCK: keyMap.CapsLock as number,
    NUMLOCK: keyMap.NumLock as number,
    PRINTSCREEN: keyMap.PrintScreen as number,
    // 标点符号
    COMMA: keyMap.Comma as number,
    PERIOD: keyMap.Period as number,
    SLASH: keyMap.Slash as number,
    BACKSLASH: keyMap.Backslash as number,
    SEMICOLON: keyMap.Semicolon as number,
    QUOTE: keyMap.Quote as number,
    BRACKETLEFT: keyMap.BracketLeft as number,
    BRACKETRIGHT: keyMap.BracketRight as number,
    MINUS: keyMap.Minus as number,
    EQUAL: keyMap.Equal as number,
    BACKQUOTE: keyMap.Backquote as number,
  }

  if (specialKeys[upper]) {
    return specialKeys[upper]
  }

  // F1-F24 功能键
  const fMatch = upper.match(/^F(\d+)$/)
  if (fMatch) {
    const fNum = parseInt(fMatch[1])
    if (fNum >= 1 && fNum <= 24) {
      const fKey = `F${fNum}`
      if (typeof keyMap[fKey] === 'number') {
        return keyMap[fKey] as number
      }
    }
  }

  // 字母 A-Z
  if (/^[A-Z]$/.test(upper)) {
    if (typeof keyMap[upper] === 'number') {
      return keyMap[upper] as number
    }
  }

  // 数字 0-9（主键盘区）
  if (/^[0-9]$/.test(upper)) {
    // UiohookKey 使用 Num0-Num9 表示主键盘数字
    const numKey = `Num${upper}`
    if (typeof keyMap[numKey] === 'number') {
      return keyMap[numKey] as number
    }
    // 备用：直接尝试数字
    if (typeof keyMap[upper] === 'number') {
      return keyMap[upper] as number
    }
  }

  // 修饰键作为主键（组合键场景，如 Command+Control）
  if (lower === 'command' || lower === 'cmd' || lower === 'meta') {
    return keyMap.Meta as number
  }
  if (lower === 'control' || lower === 'ctrl') {
    return keyMap.Ctrl as number
  }
  if (lower === 'alt' || lower === 'option') {
    return keyMap.Alt as number
  }
  if (lower === 'shift') {
    return keyMap.Shift as number
  }

  return null
}
