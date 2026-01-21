import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage, type LanguageSetting } from '@electron/shared/i18n'
import type { AppConfig } from '@electron/shared/types'
import { HotkeySettings } from '@/components/HotkeySettings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<AppConfig>({
    app: {
      language: 'system',
    },
    asr: {
      provider: 'glm',
      region: 'cn',
      apiKeys: {
        cn: '',
        intl: '',
      },
      endpoint: '',
      language: 'auto',
    },
    hotkey: {
      pttKey: '',
      toggleSettings: '',
    },
  })

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const hasLoadedConfig = useRef(false)

  useEffect(() => {
    if (hasLoadedConfig.current) return
    hasLoadedConfig.current = true

    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI.getConfig()
        setConfig(loadedConfig)
        const resolvedLanguage = resolveLanguage(
          loadedConfig.app?.language ?? 'system',
          navigator.language,
        )
        void i18n.changeLanguage(resolvedLanguage)
      } catch (error) {
        console.error('Failed to load config:', error)
      }
    }

    loadConfig()
  }, [i18n])

  const handleAppLanguageChange = (value: string) => {
    const setting = value as LanguageSetting
    setConfig((prev) => ({
      ...prev,
      app: {
        ...prev.app,
        language: setting,
      },
    }))
    const resolvedLanguage = resolveLanguage(setting, navigator.language)
    void i18n.changeLanguage(resolvedLanguage)
    void window.electronAPI.setConfig({ app: { language: setting } }).catch((error) => {
      console.error('Failed to persist app language:', error)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      const latestConfig = await window.electronAPI.getConfig()

      await window.electronAPI.setConfig({
        ...latestConfig,
        app: config.app,
        asr: config.asr,
      })

      setTestResult({ type: 'success', message: t('settings.result.saveSuccess') })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setTestResult({
        type: 'error',
        message: t('settings.result.saveError', { message: errorMessage }),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    // Validate key for current region
    const region = config.asr.region || 'cn'
    const apiKey = config.asr.apiKeys[region]

    if (!apiKey) {
      setTestResult({ type: 'error', message: t('settings.result.apiKeyRequired') })
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testConnection(config.asr)
      if (result) {
        setTestResult({ type: 'success', message: t('settings.result.connectionSuccess') })
      } else {
        setTestResult({ type: 'error', message: t('settings.result.connectionFailed') })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setTestResult({
        type: 'error',
        message: t('settings.result.testFailed', { message: errorMessage }),
      })
    } finally {
      setTesting(false)
    }
  }

  // Helper to update API Key for current region
  const handleApiKeyChange = (value: string) => {
    const region = config.asr.region || 'cn'
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        apiKeys: {
          ...prev.asr.apiKeys,
          [region]: value,
        },
      },
    }))
  }

  // Helper to change Region
  const handleRegionChange = (value: string) => {
    const region = value as 'cn' | 'intl'
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        region,
        endpoint: '', // Clear endpoint to ensure region default is used
      },
    }))
  }

  const isSuccess = testResult?.type === 'success'
  const resultMessage = testResult?.message ?? ''

  const currentRegion = config.asr.region || 'cn'
  const currentApiKey = config.asr.apiKeys?.[currentRegion] || ''

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('settings.title')}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('settings.appPreferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appLanguage">{t('settings.appLanguage')}</Label>
            <Select value={config.app.language} onValueChange={handleAppLanguageChange}>
              <SelectTrigger id="appLanguage" className="no-drag w-full cursor-pointer">
                <SelectValue placeholder={t('settings.languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.systemLanguage')}</SelectItem>
                <SelectItem value="zh">{t('settings.languageChinese')}</SelectItem>
                <SelectItem value="en">{t('settings.languageEnglish')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="autoLaunch">{t('settings.autoLaunch')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.autoLaunchHelp')}</p>
            </div>
            <Switch
              id="autoLaunch"
              checked={config.app.autoLaunch ?? false}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  app: { ...config.app, autoLaunch: checked },
                })
              }
              className="no-drag cursor-pointer"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('settings.asrConfig')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region">{t('settings.region')}</Label>
            <Select value={currentRegion} onValueChange={handleRegionChange}>
              <SelectTrigger id="region" className="no-drag w-full cursor-pointer">
                <SelectValue placeholder={t('settings.languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cn">{t('settings.regionChina')}</SelectItem>
                <SelectItem value="intl">{t('settings.regionIntl')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {t('settings.apiKey')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={currentApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
              className="no-drag"
            />
            <p className="text-sm text-muted-foreground mr-1">
              {t('settings.apiKeyHelp')}{' '}
              <a
                href={
                  currentRegion === 'intl'
                    ? 'https://z.ai/manage-apikey/apikey-list'
                    : 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {currentRegion === 'intl' ? 'z.ai' : 'bigmodel.cn'}
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint">{t('settings.apiEndpoint')}</Label>
            <Input
              id="endpoint"
              type="text"
              value={
                config.asr.endpoint ||
                (currentRegion === 'intl'
                  ? 'https://api.z.ai/api/paas/v4/audio/transcriptions'
                  : 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions')
              }
              readOnly
              disabled
              className="no-drag bg-muted text-muted-foreground"
            />
            <div className="flex items-center space-x-2 mt-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <p className="text-sm text-muted-foreground">{t('settings.durationWarning')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <HotkeySettings />
      </div>

      {testResult && (
        <Alert variant={isSuccess ? 'default' : 'destructive'} className="mb-6">
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-chart-2" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription className={isSuccess ? 'text-chart-2' : ''}>
            {resultMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={handleTestConnection}
          disabled={testing || !currentApiKey}
          className="no-drag flex-1 cursor-pointer"
        >
          {testing ? t('settings.testingConnection') : t('settings.testConnection')}
        </Button>
        <Button onClick={handleSave} disabled={saving} className="no-drag flex-1 cursor-pointer">
          {saving ? t('settings.savingConfig') : t('settings.saveConfig')}
        </Button>
      </div>
    </div>
  )
}
