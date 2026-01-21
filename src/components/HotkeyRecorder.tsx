import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  buildAccelerator,
  formatHotkey,
  hasNonModifierKey,
  isModifierOnly,
  normalizeKey,
} from '@/lib/hotkey-utils'

interface HotkeyRecorderProps {
  /** 当前快捷键值（Electron Accelerator 格式）*/
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 标签文本 */
  label: string
  /** 描述文本 */
  description?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示错误状态 */
  hasError?: boolean
  /** 错误信息 */
  errorMessage?: string
}

export function HotkeyRecorder({
  value,
  onChange,
  label,
  description,
  disabled = false,
  hasError = false,
  errorMessage,
}: HotkeyRecorderProps) {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  // 使用 Ref 来保持最新的按键状态，解决 useEffect 依赖导致的监听器反复重绑问题
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const recorderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isRecording || disabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setIsRecording(false)
        pressedKeysRef.current.clear()
        setPressedKeys(new Set())
        return
      }

      const key = normalizeKey(e)
      if (key) {
        pressedKeysRef.current.add(key)
        setPressedKeys(new Set(pressedKeysRef.current))
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (isModifierOnly(e.key)) {
        if (pressedKeysRef.current.size === 1 && !hasNonModifierKey(pressedKeysRef.current)) {
          const accelerator = normalizeKey(e)
          if (accelerator) {
            onChange(accelerator)
          }
          setIsRecording(false)
          pressedKeysRef.current.clear()
          setPressedKeys(new Set())
          return
        }
      }

      if (pressedKeysRef.current.size > 0) {
        const modifiers = ['Command', 'Control', 'Alt', 'Shift']
        const keysArray = [...pressedKeysRef.current]
        const mainKeyCount = keysArray.filter((k) => !modifiers.includes(k)).length

        if (mainKeyCount > 1) {
          toast.error(t('hotkey.toast.invalid'), {
            description: t('hotkey.validation.multiple'),
          })
          setIsRecording(false)
          pressedKeysRef.current.clear()
          setPressedKeys(new Set())
          return
        }

        const accelerator = buildAccelerator(pressedKeysRef.current)
        if (accelerator) {
          onChange(accelerator)
        }
        setIsRecording(false)
        pressedKeysRef.current.clear()
        setPressedKeys(new Set())
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (recorderRef.current && !recorderRef.current.contains(target)) {
        setIsRecording(false)
        pressedKeysRef.current.clear()
        setPressedKeys(new Set())
      }
    }

    const handleBlur = () => {
      setIsRecording(false)
      pressedKeysRef.current.clear()
      setPressedKeys(new Set())
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('blur', handleBlur)
    }
  }, [disabled, isRecording, onChange, t])

  const startRecording = useCallback(() => {
    if (!disabled) {
      setIsRecording(true)
      pressedKeysRef.current.clear()
      setPressedKeys(new Set())
    }
  }, [disabled])

  const displayValue = isRecording
    ? pressedKeys.size > 0
      ? formatHotkey(buildAccelerator(pressedKeys), t('hotkey.notSet'))
      : t('hotkey.recordingHint')
    : formatHotkey(value, t('hotkey.notSet'))

  return (
    <div ref={recorderRef} className="hotkey-recorder space-y-2">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}

      <div className="flex items-center gap-2">
        <div
          onClick={startRecording}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg border cursor-pointer transition-all',
            'bg-background text-foreground font-mono text-sm',
            'select-none',
            isRecording
              ? 'border-primary ring-2 ring-primary/30 animate-pulse'
              : 'border-border hover:border-primary/50',
            hasError && 'border-destructive',
            disabled && 'opacity-50 cursor-not-allowed hover:border-border',
          )}
        >
          <span className={isRecording && pressedKeys.size === 0 ? 'text-muted-foreground' : ''}>
            {displayValue}
          </span>
        </div>

        <button
          type="button"
          onClick={startRecording}
          disabled={disabled || isRecording}
          className={cn(
            'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            (disabled || isRecording) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isRecording ? t('hotkey.recording') : t('hotkey.record')}
        </button>
      </div>

      {description && !hasError && <p className="text-xs text-muted-foreground">{description}</p>}

      {hasError && errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  )
}
