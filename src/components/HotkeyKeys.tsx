import { cn } from '@/lib/utils'

const MAC_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Space: '空格',
  Enter: '↵',
  Escape: 'Esc',
}

const WIN_SYMBOLS: Record<string, string> = {
  Command: 'Win',
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
}

interface HotkeyKeysProps {
  value: string
  className?: string
}

/** 把 Electron Accelerator 字符串渲染成一组实体键帽。 */
export function HotkeyKeys({ value, className }: HotkeyKeysProps) {
  const isMac = window.electronAPI?.platform === 'darwin'
  const symbols = isMac ? MAC_SYMBOLS : WIN_SYMBOLS
  const parts = (value || '').split('+').filter(Boolean)

  if (parts.length === 0) {
    return <span className="text-muted-foreground text-xs">未设置</span>
  }

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {parts.map((p, i) => (
        <kbd key={i} className={cn('vk-keycap', p === 'Space' && 'is-wide')}>
          {symbols[p] || p}
        </kbd>
      ))}
    </span>
  )
}
