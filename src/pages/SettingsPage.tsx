import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Lightbulb, Timer, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage, type LanguageSetting } from '@electron/shared/i18n'
import { GLM_LLM } from '@electron/shared/constants'
import type { AppConfig, UpdateInfo } from '@electron/shared/types'
import { HotkeySettings } from '@/components/HotkeySettings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
    ai: {
      enabled: false,
      model: GLM_LLM.MODEL,
    },
  })

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const hasLoadedConfig = useRef(false)
  const hasLoadedUpdateStatus = useRef(false)

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
        ai: config.ai,
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

  // Update Logic
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    if (hasLoadedUpdateStatus.current) return
    hasLoadedUpdateStatus.current = true

    const loadUpdateStatus = async () => {
      try {
        const info = await window.electronAPI.getUpdateStatus()
        if (info) {
          setUpdateInfo(info)
        }
      } catch (error) {
        console.error('Failed to load update status:', error)
      }
    }

    loadUpdateStatus()
  }, [])

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateInfo(null)
    try {
      const info = await window.electronAPI.checkForUpdates()
      setUpdateInfo(info)
    } catch (error) {
      console.error('Update check failed:', error)
      setUpdateInfo({
        hasUpdate: false,
        latestVersion: '',
        releaseUrl: '',
        releaseNotes: '',
        error: 'failed',
      })
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleOpenRelease = () => {
    if (updateInfo?.releaseUrl) {
      window.electronAPI.openExternal(updateInfo.releaseUrl)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('settings.title')}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('settings.about')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('settings.version', { version: __APP_VERSION__ })}
              </p>
              {updateInfo?.hasUpdate && (
                <p className="text-sm text-chart-2 font-medium">
                  {t('settings.hasUpdate', { version: updateInfo.latestVersion })}
                </p>
              )}
              {updateInfo?.hasUpdate === false && !updateInfo.error && (
                <p className="text-sm text-muted-foreground">{t('settings.noUpdate')}</p>
              )}
              {updateInfo?.error && (
                <p className="text-sm text-destructive">{t('settings.updateError')}</p>
              )}
            </div>
            <div className="flex gap-2">
              {updateInfo?.hasUpdate ? (
                <Button size="sm" onClick={handleOpenRelease} className="cursor-pointer no-drag">
                  {t('settings.downloadUpdate')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="cursor-pointer no-drag"
                >
                  {checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t('settings.pricingNoticeTitle')}</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <p>{t('settings.pricingNoticeBody')}</p>
                  <Button asChild variant="outline" size="sm" className="no-drag cursor-pointer">
                    <a
                      href={
                        currentRegion === 'intl'
                          ? 'https://docs.z.ai/guides/overview/pricing'
                          : 'https://bigmodel.cn/pricing'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('settings.pricingLink')}
                    </a>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <p className="text-sm text-muted-foreground">{t('settings.durationWarning')}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('settings.aiAssistant')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="aiEnabled">{t('settings.aiAssistantToggle')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.aiAssistantHelp')}</p>
            </div>
            <Switch
              id="aiEnabled"
              checked={config.ai.enabled}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  ai: { ...config.ai, enabled: checked },
                })
              }
              className="no-drag cursor-pointer"
            />
          </div>

          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>{t('settings.aiAssistantTipTitle')}</AlertTitle>
            <AlertDescription className="space-y-2">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-foreground">
                    {t('settings.aiAssistantRule1Title')}
                  </span>{' '}
                  {t('settings.aiAssistantRule1Body')}
                </p>
                <p>
                  <span className="font-semibold text-foreground">
                    {t('settings.aiAssistantRule2Title')}
                  </span>{' '}
                  {t('settings.aiAssistantRule2Body')}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t('settings.aiAssistantRule3Title')}
                  </span>{' '}
                  {t('settings.aiAssistantRule3Body')}
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <Alert>
            <Timer className="h-4 w-4" />
            <AlertTitle>{t('settings.aiAssistantPerfTitle')}</AlertTitle>
            <AlertDescription>{t('settings.aiAssistantPerfBody')}</AlertDescription>
          </Alert>
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
