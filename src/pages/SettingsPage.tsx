import { useEffect, useRef, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type LanguageSetting } from '@electron/shared/i18n'
import { LOG_FILE_MAX_SIZE_MB, LOG_RETENTION_DAYS } from '@electron/shared/constants'
import type { AppConfig, UpdateInfo } from '@electron/shared/types'
import { LogViewerDialog } from '@/components/LogViewerDialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<AppConfig>({
    app: {
      language: 'system',
      aiPostProcessEnabled: false,
    },
    asr: {
      provider: 'glm',
      region: 'cn',
      apiKeys: {
        cn: '',
        intl: '',
      },
      groqApiKey: '',
      endpoint: '',
      language: 'auto',
    },
    hotkey: {
      pttKey: '',
      toggleSettings: '',
    },
  })

  const [isConfigLoading, setIsConfigLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const hasLoadedConfig = useRef(false)
  const hasLoadedUpdateStatus = useRef(false)

  // 自动保存的防抖 timer
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedConfigRef = useRef<AppConfig | null>(null)

  useEffect(() => {
    if (hasLoadedConfig.current) return
    hasLoadedConfig.current = true

    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI.getConfig()
        setConfig(loadedConfig)
        lastSavedConfigRef.current = loadedConfig
      } catch (error) {
        console.error('Failed to load config:', error)
        toast.error(t('settings.result.loadError'))
      } finally {
        setIsConfigLoading(false)
      }
    }

    loadConfig()
  }, [t])

  // 自动保存逻辑（防抖 500ms）
  const autoSave = useCallback(
    async (newConfig: AppConfig) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = setTimeout(async () => {
        try {
          await window.electronAPI.setConfig(newConfig)
          lastSavedConfigRef.current = newConfig
          toast.success(t('settings.result.saveSuccess'))
        } catch (error) {
          console.error('Failed to auto-save config:', error)
          const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
          toast.error(t('settings.result.saveError', { message: errorMessage }))
        }
      }, 500)
    },
    [t],
  )

  // 清理 timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const handleAppLanguageChange = async (value: string) => {
    const setting = value as LanguageSetting
    const newConfig = {
      ...config,
      app: { ...config.app, language: setting },
    }
    setConfig(newConfig)
    // 语言变更立即保存，不防抖
    try {
      await window.electronAPI.setConfig({ app: { language: setting } })
      toast.success(t('settings.result.saveSuccess'))
    } catch (error) {
      console.error('Failed to persist app language:', error)
      toast.error(t('settings.result.saveError', { message: String(error) }))
    }
  }

  const handleAutoLaunchChange = (checked: boolean) => {
    const newConfig = {
      ...config,
      app: { ...config.app, autoLaunch: checked },
    }
    setConfig(newConfig)
    void autoSave(newConfig)
  }

  const handleAiPostProcessChange = (checked: boolean) => {
    const newConfig = {
      ...config,
      app: { ...config.app, aiPostProcessEnabled: checked },
    }
    setConfig(newConfig)
    void autoSave(newConfig)
  }

  const handleTestConnection = async () => {
    const provider = config.asr.provider || 'glm'
    const region = config.asr.region || 'cn'
    const apiKey =
      provider === 'groq' ? config.asr.groqApiKey?.trim() : config.asr.apiKeys[region]?.trim()

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
    const provider = config.asr.provider || 'glm'
    let newConfig: AppConfig

    if (provider === 'groq') {
      newConfig = {
        ...config,
        asr: { ...config.asr, groqApiKey: value },
      }
    } else {
      const region = config.asr.region || 'cn'
      newConfig = {
        ...config,
        asr: {
          ...config.asr,
          apiKeys: { ...config.asr.apiKeys, [region]: value },
        },
      }
    }

    setConfig(newConfig)
    void autoSave(newConfig)
  }

  // Helper to change Region
  const handleRegionChange = (value: string) => {
    const region = value as 'cn' | 'intl'
    const newConfig = {
      ...config,
      asr: {
        ...config.asr,
        region,
        endpoint: '', // Clear endpoint to ensure region default is used
      },
    }
    setConfig(newConfig)
    void autoSave(newConfig)
  }

  const handleProviderChange = (value: string) => {
    const provider = value as 'glm' | 'groq'
    const newConfig = {
      ...config,
      asr: { ...config.asr, provider },
    }
    setConfig(newConfig)
    void autoSave(newConfig)
  }

  const handleHotkeyChange = (hotkey: { pttKey: string; toggleSettings: string }) => {
    const newConfig = { ...config, hotkey }
    setConfig(newConfig)
    void autoSave(newConfig)
  }

  const isSuccess = testResult?.type === 'success'
  const resultMessage = testResult?.message ?? ''

  const currentProvider = config.asr.provider || 'glm'
  const currentRegion = config.asr.region || 'cn'
  const glmApiKey = config.asr.apiKeys?.[currentRegion] || ''
  const groqApiKey = config.asr.groqApiKey || ''
  const currentApiKey = (currentProvider === 'groq' ? groqApiKey : glmApiKey).trim()
  const pricingInfo =
    currentProvider === 'groq'
      ? {
          label: t('settings.pricingProviderGroq'),
          url: 'https://groq.com/pricing',
        }
      : currentRegion === 'intl'
        ? {
            label: t('settings.pricingProviderGlmIntl'),
            url: 'https://docs.z.ai/guides/overview/pricing',
          }
        : {
            label: t('settings.pricingProviderGlmCn'),
            url: 'https://bigmodel.cn/pricing',
          }
  const apiKeyHelp =
    currentProvider === 'groq' ? t('settings.apiKeyHelpGroq') : t('settings.apiKeyHelpGlm')
  const apiKeyPlaceholder =
    currentProvider === 'groq'
      ? t('settings.apiKeyPlaceholderGroq')
      : t('settings.apiKeyPlaceholderGlm')
  const apiKeyHelpUrl =
    currentProvider === 'groq'
      ? 'https://console.groq.com'
      : currentRegion === 'intl'
        ? 'https://z.ai/manage-apikey/apikey-list'
        : 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
  const apiKeyHelpLabel =
    currentProvider === 'groq'
      ? 'console.groq.com'
      : currentRegion === 'intl'
        ? 'z.ai'
        : 'bigmodel.cn'

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
              onCheckedChange={handleAutoLaunchChange}
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
            <Label>{t('settings.asrProvider')}</Label>
            <Tabs value={currentProvider} onValueChange={handleProviderChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="glm">{t('settings.providerGlm')}</TabsTrigger>
                <TabsTrigger value="groq">{t('settings.providerGroq')}</TabsTrigger>
              </TabsList>

              <TabsContent value="glm" className="space-y-4">
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
                  <Label htmlFor="apiKey-glm">
                    {t('settings.apiKey')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="apiKey-glm"
                    type="password"
                    value={glmApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={apiKeyPlaceholder}
                    className="no-drag"
                  />
                  <p className="text-sm text-muted-foreground mr-1">
                    {apiKeyHelp}{' '}
                    <a
                      href={apiKeyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {apiKeyHelpLabel}
                    </a>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endpoint-glm">{t('settings.apiEndpoint')}</Label>
                  <Input
                    id="endpoint-glm"
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
                    <Info className="h-4 w-4 text-yellow-500" />
                    <p className="text-sm text-muted-foreground">{t('settings.durationWarning')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.pricing')}</Label>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>{t('settings.pricingNotice')}</span>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={pricingInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer"
                          >
                            {t('settings.viewPricing', { provider: pricingInfo.label })}
                          </a>
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>

              <TabsContent value="groq" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey-groq">
                    {t('settings.apiKey')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="apiKey-groq"
                    type="password"
                    value={groqApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={apiKeyPlaceholder}
                    className="no-drag"
                  />
                  <p className="text-sm text-muted-foreground mr-1">
                    {apiKeyHelp}{' '}
                    <a
                      href={apiKeyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {apiKeyHelpLabel}
                    </a>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="asr-model">{t('settings.asrModel')}</Label>
                  <Input
                    id="asr-model"
                    type="text"
                    value="Whisper Large V3 Turbo"
                    readOnly
                    disabled
                    className="no-drag bg-muted text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endpoint-groq">{t('settings.apiEndpoint')}</Label>
                  <Input
                    id="endpoint-groq"
                    type="text"
                    value="https://api.groq.com/openai/v1/audio/transcriptions"
                    readOnly
                    disabled
                    className="no-drag bg-muted text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.pricing')}</Label>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>{t('settings.pricingNotice')}</span>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={pricingInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer"
                          >
                            {t('settings.viewPricing', { provider: pricingInfo.label })}
                          </a>
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="aiPostProcess">{t('settings.aiPostProcess')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.aiPostProcessHelp')}</p>
            </div>
            <Switch
              id="aiPostProcess"
              checked={config.app.aiPostProcessEnabled ?? false}
              onCheckedChange={handleAiPostProcessChange}
              className="no-drag cursor-pointer"
            />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-col gap-1 text-sm">
                <span>{t('settings.aiPostProcessPros')}</span>
                <span>{t('settings.aiPostProcessCons')}</span>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="mb-6">
        <HotkeySettings
          value={config.hotkey}
          isLoading={isConfigLoading}
          onChange={handleHotkeyChange}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('settings.troubleshooting')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.logsDescription', {
              days: LOG_RETENTION_DAYS,
              size: LOG_FILE_MAX_SIZE_MB,
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLogDialogOpen(true)}
            className="no-drag cursor-pointer"
          >
            {t('settings.viewLogs')}
          </Button>
        </CardContent>
      </Card>

      <LogViewerDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />

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
      </div>
    </div>
  )
}
