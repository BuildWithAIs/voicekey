import { useState } from 'react'
import { Keyboard, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatHotkey,
  PTT_PRESETS,
  type HotkeyValidationMessage,
  validateHotkey,
} from '@/lib/hotkey-utils'
import { HotkeyRecorder } from './HotkeyRecorder'

interface HotkeyConfig {
  pttKey: string
  toggleSettings: string
}

interface HotkeySettingsProps {
  value: HotkeyConfig
  originalValue: HotkeyConfig | null
  isLoading?: boolean
  onChange: (value: HotkeyConfig) => void
}

// 渲染进程默认值，与 electron/shared/constants.ts 保持一致  后面配置到 constants.ts
const getDefaultHotkeys = (): HotkeyConfig => {
  const isMac = window.electronAPI?.platform === 'darwin'
  return {
    pttKey: isMac ? 'Alt' : 'Control+Shift+Space',
    toggleSettings: isMac ? 'Command+Shift+,' : 'Control+Shift+,',
  }
}

export function HotkeySettings({
  value: config,
  originalValue,
  isLoading = false,
  onChange,
}: HotkeySettingsProps) {
  const { t } = useTranslation()
  const [pttInputMode, setPttInputMode] = useState<'preset' | 'record'>('preset')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDirty =
    !!originalValue &&
    (config.pttKey !== originalValue.pttKey ||
      config.toggleSettings !== originalValue.toggleSettings)

  const getValidationMessage = (messageKey?: HotkeyValidationMessage) =>
    messageKey ? t(`hotkey.validation.${messageKey}`) : t('hotkey.validation.missing')

  const handleHotkeyChange = (key: 'pttKey' | 'toggleSettings', nextValue: string) => {
    const validation = validateHotkey(nextValue)

    if (!validation.valid) {
      const message = getValidationMessage(validation.messageKey)
      setErrors((prev) => ({ ...prev, [key]: message }))
      const toastTitle =
        validation.messageKey === 'conflict'
          ? t('hotkey.toast.conflict')
          : t('hotkey.toast.invalid')
      toast.error(toastTitle, { description: message })
      return
    }

    const otherKey = key === 'pttKey' ? 'toggleSettings' : 'pttKey'
    if (nextValue === config[otherKey]) {
      const message = t('hotkey.toast.duplicateDesc')
      setErrors((prev) => ({ ...prev, [key]: message }))
      toast.error(t('hotkey.toast.duplicate'), { description: message })
      return
    }

    setErrors((prev) => ({ ...prev, [key]: '' }))
    onChange({ ...config, [key]: nextValue })
  }

  const handleReset = () => {
    onChange(getDefaultHotkeys())
    setErrors({})
    toast.info(t('hotkey.toast.reset'), {
      description: t('hotkey.toast.resetDesc'),
    })
  }

  const handleCancel = () => {
    if (originalValue) {
      onChange(originalValue)
      setErrors({})
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span>{t('hotkey.loading')}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const platform = window.electronAPI?.platform
  const filteredPresets = PTT_PRESETS.filter((p) => p.platform === 'all' || p.platform === platform)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="w-5 h-5" />
          {t('hotkey.title')}
        </CardTitle>
        <CardDescription>{t('hotkey.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('hotkey.pttLabel')}</label>
            <Tabs
              value={pttInputMode}
              onValueChange={(value) => setPttInputMode(value as 'preset' | 'record')}
              className="w-auto"
            >
              <TabsList className="h-7">
                <TabsTrigger value="preset" className="text-xs px-2 py-1">
                  {t('hotkey.preset')}
                </TabsTrigger>
                <TabsTrigger value="record" className="text-xs px-2 py-1">
                  {t('hotkey.custom')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {pttInputMode === 'preset' ? (
            <div className="space-y-2">
              <Select
                value={config.pttKey}
                onValueChange={(value) => handleHotkeyChange('pttKey', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('hotkey.select')}>
                    {config.pttKey && (
                      <span className="font-mono">{formatHotkey(config.pttKey)}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredPresets.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {t(preset.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('hotkey.pttHint')}</p>
            </div>
          ) : (
            <HotkeyRecorder
              label=""
              value={config.pttKey}
              onChange={(value) => handleHotkeyChange('pttKey', value)}
              description={t('hotkey.pttHint')}
              hasError={!!errors.pttKey}
              errorMessage={errors.pttKey}
            />
          )}
        </div>

        <div className="border-t border-border" />

        <HotkeyRecorder
          label={t('hotkey.settingsLabel')}
          value={config.toggleSettings}
          onChange={(value) => handleHotkeyChange('toggleSettings', value)}
          description={t('hotkey.settingsHint')}
          hasError={!!errors.toggleSettings}
          errorMessage={errors.toggleSettings}
        />

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('hotkey.reset')}
          </Button>

          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              {t('hotkey.cancel')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
