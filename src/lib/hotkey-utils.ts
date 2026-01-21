/**
 * 快捷键工具函数
 * 用于处理 Electron Accelerator 格式的快捷键
 */

// macOS 系统保留快捷键（不允许用户设置）
export const RESERVED_HOTKEYS = [
  'Command+Q', // 退出
  'Command+W', // 关闭窗口
  'Command+Tab', // 切换应用
  'Command+H', // 隐藏
  'Command+M', // 最小化
  'Command+C', // 复制
  'Command+V', // 粘贴
  'Command+X', // 剪切
  'Command+Z', // 撤销
  'Command+A', // 全选
  'Command+S', // 保存
  'Command+N', // 新建
  'Command+O', // 打开
  'Command+P', // 打印
  'Control+Q',
  'Control+W',
  'Control+Tab',
]

// PTT 快捷键预设选项
export const PTT_PRESETS = [
  { value: 'Command', labelKey: 'hotkey.presets.command', platform: 'darwin' },
  { value: 'Control', labelKey: 'hotkey.presets.control', platform: 'all' },
  { value: 'Alt', labelKey: 'hotkey.presets.option', platform: 'darwin' },
  { value: 'Shift', labelKey: 'hotkey.presets.shift', platform: 'all' },
  { value: 'Command+Space', labelKey: 'hotkey.presets.commandSpace', platform: 'darwin' },
  { value: 'Control+Space', labelKey: 'hotkey.presets.controlSpace', platform: 'win32' },
  { value: 'F13', labelKey: 'hotkey.presets.f13', platform: 'all' },
  { value: 'F14', labelKey: 'hotkey.presets.f14', platform: 'all' },
] as const

export type HotkeyValidationMessage = 'missing' | 'conflict' | 'multiple'

/**
 * 将 KeyboardEvent 的 key 转换为 Electron Accelerator 格式
 */
export function normalizeKey(e: KeyboardEvent): string | null {
  const { key, code } = e

  // 修饰键映射
  if (key === 'Meta') return 'Command'
  if (key === 'Control') return 'Control'
  if (key === 'Alt') return 'Alt'
  if (key === 'Shift') return 'Shift'

  // 特殊键映射
  if (key === ' ') return 'Space'
  if (key === 'Escape') return null // ESC 用于取消
  if (key === 'Enter') return 'Enter'
  if (key === 'Tab') return 'Tab'
  if (key === 'Backspace') return 'Backspace'
  if (key === 'Delete') return 'Delete'
  if (key === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown') return 'Down'
  if (key === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight') return 'Right'
  if (key === 'Home') return 'Home'
  if (key === 'End') return 'End'
  if (key === 'PageUp') return 'PageUp'
  if (key === 'PageDown') return 'PageDown'

  // F 键
  if (/^F\d+$/.test(key)) return key

  // 字母和数字
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase()

  // 标点符号 - 使用 code 获取更准确的键名
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)

  // 其他可用键
  const symbolMap: Record<string, string> = {
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    ';': 'Semicolon',
    "'": 'Quote',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '\\': 'Backslash',
    '-': 'Minus',
    '=': 'Equal',
    '`': 'Backquote',
  }
  if (symbolMap[key]) return symbolMap[key]

  return key.length === 1 ? key : null
}

/**
 * 将按键集合转换为 Electron Accelerator 字符串
 */
export function buildAccelerator(keys: Set<string>): string {
  const modifierOrder = ['Command', 'Control', 'Alt', 'Shift']
  const modifiers = modifierOrder.filter((m) => keys.has(m))
  const mainKeys = [...keys].filter((k) => !modifierOrder.includes(k))

  if (modifiers.length === 0 && mainKeys.length === 0) return ''

  // 只取最后一个非修饰键
  const mainKey = mainKeys.length > 0 ? mainKeys[mainKeys.length - 1] : null

  if (mainKey) {
    return [...modifiers, mainKey].join('+')
  }
  return modifiers.join('+')
}

/**
 * 格式化显示快捷键（转换为符号）
 */
export function formatHotkey(accelerator: string, fallback = ''): string {
  if (!accelerator) return fallback

  const isMac = window.electronAPI?.platform === 'darwin'

  if (isMac) {
    return accelerator
      .replace(/Command/g, '⌘')
      .replace(/Control/g, '⌃')
      .replace(/Alt/g, '⌥')
      .replace(/Shift/g, '⇧')
      .replace(/Space/g, '␣')
      .replace(/\+/g, ' ')
  }

  return accelerator
    .replace(/Command/g, 'Win')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/Space/g, 'Space')
}

/**
 * 检查快捷键是否与系统保留键冲突
 */
export function isHotkeyConflict(accelerator: string): boolean {
  return RESERVED_HOTKEYS.includes(accelerator)
}

/**
 * 验证快捷键是否有效
 */
export function validateHotkey(accelerator: string): {
  valid: boolean
  messageKey?: HotkeyValidationMessage
} {
  if (!accelerator) {
    return { valid: false, messageKey: 'missing' }
  }

  if (isHotkeyConflict(accelerator)) {
    return { valid: false, messageKey: 'conflict' }
  }

  // 新增：检查非修饰键数量
  const parts = accelerator.split('+')
  const modifiers = ['Command', 'Control', 'Alt', 'Shift']
  const nonModifiers = parts.filter((p) => !modifiers.includes(p))

  if (nonModifiers.length > 1) {
    return { valid: false, messageKey: 'multiple' }
  }

  return { valid: true }
}

/**
 * 检测是否为单独的修饰键
 */
export function isModifierOnly(key: string): boolean {
  return ['Meta', 'Control', 'Alt', 'Shift'].includes(key)
}

/**
 * 检测按键集合中是否包含非修饰键
 */
export function hasNonModifierKey(keys: Set<string>): boolean {
  const modifiers = ['Command', 'Control', 'Alt', 'Shift']
  return [...keys].some((k) => !modifiers.includes(k))
}
