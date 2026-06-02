import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type LanguageSetting } from '@electron/shared/i18n'
import {
  LOG_FILE_MAX_SIZE_MB,
  LOG_RETENTION_DAYS,
  LLM_REFINE,
  TRANSLATION,
  TARGET_LANGUAGES,
  BASE_TRANSLATION_SYSTEM_PROMPT,
} from '@electron/shared/constants'
import { normalizeRefineBaseUrl } from '@electron/shared/refine-url'
import type {
  AppConfig,
  LLMRefineConfig,
  TranslationConfig,
  UpdateInfo,
} from '@electron/shared/types'
import { LogViewerDialog } from '@/components/LogViewerDialog'
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
import { validateHotkey } from '@/lib/hotkey-utils'

const AUTO_SAVE_DELAY_MS = 700

const defaultLLMRefineConfig: LLMRefineConfig = {
  enabled: LLM_REFINE.ENABLED,
  endpoint: LLM_REFINE.ENDPOINT,
  model: LLM_REFINE.MODEL,
  apiKey: LLM_REFINE.API_KEY,
  translateToEnglish: LLM_REFINE.TRANSLATE_TO_ENGLISH,
}

const defaultTranslationConfig: TranslationConfig = {
  enabled: TRANSLATION.ENABLED,
  targetLanguage: TRANSLATION.TARGET_LANGUAGE,
  systemPrompt: TRANSLATION.DEFAULT_SYSTEM_PROMPT,
}

type TestStatus = {
  type: 'success' | 'error'
  message: string
} | null

type SaveStatus = {
  state: 'saving' | 'success' | 'error' | 'invalid'
  message: string
} | null

function readTranslateToEnglishFlag(config?: Record<string, unknown>): boolean {
  if (!config) {
    return defaultLLMRefineConfig.translateToEnglish
  }

  if (typeof config.translateToEnglish === 'boolean') {
    return config.translateToEnglish
  }

  if (typeof config.translateChineseToEnglish === 'boolean') {
    return config.translateChineseToEnglish
  }

  return defaultLLMRefineConfig.translateToEnglish
}

function normalizeLLMRefineConfig(config?: Partial<LLMRefineConfig>): LLMRefineConfig {
  const rawConfig =
    config && typeof config === 'object'
      ? (config as Partial<LLMRefineConfig> & Record<string, unknown>)
      : undefined

  return {
    ...defaultLLMRefineConfig,
    enabled: typeof config?.enabled === 'boolean' ? config.enabled : defaultLLMRefineConfig.enabled,
    endpoint: normalizeRefineBaseUrl(config?.endpoint ?? defaultLLMRefineConfig.endpoint),
    model: config?.model ?? defaultLLMRefineConfig.model,
    apiKey: config?.apiKey ?? defaultLLMRefineConfig.apiKey,
    translateToEnglish: readTranslateToEnglishFlag(rawConfig),
  }
}

function isRefineConfigComplete(config: LLMRefineConfig): boolean {
  return Boolean(config.endpoint.trim() && config.model.trim() && config.apiKey.trim())
}

function isAppPreferencesDirty(current: AppConfig['app'], original: AppConfig['app']): boolean {
  return (current.autoLaunch ?? false) !== (original.autoLaunch ?? false)
}

function isAsrConfigDirty(current: AppConfig['asr'], original: AppConfig['asr']): boolean {
  return (
    current.provider !== original.provider ||
    current.region !== original.region ||
    current.endpoint !== original.endpoint ||
    current.language !== original.language ||
    (current.lowVolumeMode ?? true) !== (original.lowVolumeMode ?? true) ||
    current.apiKeys.cn !== original.apiKeys.cn ||
    current.apiKeys.intl !== original.apiKeys.intl
  )
}

function isLlmRefineDirty(current: LLMRefineConfig, original: LLMRefineConfig): boolean {
  return (
    current.enabled !== original.enabled ||
    current.endpoint !== original.endpoint ||
    current.model !== original.model ||
    current.apiKey !== original.apiKey ||
    current.translateToEnglish !== original.translateToEnglish
  )
}

function isHotkeyConfigDirty(current: AppConfig['hotkey'], original: AppConfig['hotkey']): boolean {
  return (
    current.pttKey !== original.pttKey ||
    current.toggleSettings !== original.toggleSettings ||
    current.translateKey !== original.translateKey
  )
}

function isTranslationConfigDirty(
  current: TranslationConfig,
  original: TranslationConfig,
): boolean {
  const currentPrompt = current.systemPrompt || BASE_TRANSLATION_SYSTEM_PROMPT
  const originalPrompt = original.systemPrompt || BASE_TRANSLATION_SYSTEM_PROMPT
  return (
    current.enabled !== original.enabled ||
    current.targetLanguage !== original.targetLanguage ||
    currentPrompt !== originalPrompt
  )
}

function getTranslationErrorMessage(
  config: TranslationConfig,
  t: (key: string) => string,
): string | null {
  if (!config.enabled) return null
  const effectivePrompt = config.systemPrompt || BASE_TRANSLATION_SYSTEM_PROMPT
  if (!effectivePrompt.includes('{{targetLanguage}}')) {
    return t('settings.translation.missingPlaceholder')
  }
  return null
}

function mergeConfigPatch(config: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...config,
    app: patch.app ? { ...config.app, ...patch.app } : config.app,
    asr: patch.asr
      ? {
          ...config.asr,
          ...patch.asr,
          apiKeys: patch.asr.apiKeys
            ? { ...config.asr.apiKeys, ...patch.asr.apiKeys }
            : config.asr.apiKeys,
        }
      : config.asr,
    llmRefine: patch.llmRefine
      ? normalizeLLMRefineConfig({ ...config.llmRefine, ...patch.llmRefine })
      : config.llmRefine,
    hotkey: patch.hotkey ? { ...config.hotkey, ...patch.hotkey } : config.hotkey,
    translation: patch.translation
      ? { ...config.translation, ...patch.translation }
      : config.translation,
  }
}

function InlineFeedback({
  status,
  className = '',
  testId,
}: {
  status: TestStatus | SaveStatus
  className?: string
  testId?: string
}) {
  if (!status) return null

  const isSaveStatus = 'state' in status
  const isSuccess = isSaveStatus ? status.state === 'success' : status.type === 'success'
  const isSaving = isSaveStatus ? status.state === 'saving' : false
  const isError = isSaveStatus
    ? status.state === 'error' || status.state === 'invalid'
    : status.type === 'error'

  return (
    <Alert variant={isError ? 'destructive' : 'default'} className={className} data-testid={testId}>
      {isSaving ? (
        <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isSuccess ? (
        <CheckCircle2 className="h-4 w-4 text-chart-2" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      <AlertDescription className={isSuccess ? 'text-chart-2' : ''}>
        {status.message}
      </AlertDescription>
    </Alert>
  )
}

function SaveStatusCard({
  status,
  className = '',
  testId,
}: {
  status: SaveStatus
  className?: string
  testId?: string
}) {
  if (!status) return null

  return (
    <div
      className={`rounded-xl border border-border/80 bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 ${className}`}
      data-testid={testId}
    >
      <InlineFeedback status={status} />
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
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
      lowVolumeMode: true,
      endpoint: '',
      language: 'auto',
    },
    llmRefine: defaultLLMRefineConfig,
    hotkey: {
      pttKey: '',
      toggleSettings: '',
      translateKey: '',
    },
    translation: defaultTranslationConfig,
  })

  const [originalConfig, setOriginalConfig] = useState<AppConfig | null>(null)
  const [isConfigLoading, setIsConfigLoading] = useState(true)
  const [testingAsr, setTestingAsr] = useState(false)
  const [asrTestStatus, setAsrTestStatus] = useState<TestStatus>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null)
  const [showAsrApiKey, setShowAsrApiKey] = useState(false)
  const [showRefineApiKey, setShowRefineApiKey] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [testingRefine, setTestingRefine] = useState(false)
  const [refineTestStatus, setRefineTestStatus] = useState<TestStatus>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [translationSystemPromptDraft, setTranslationSystemPromptDraft] = useState(
    BASE_TRANSLATION_SYSTEM_PROMPT,
  )
  const hasLoadedConfig = useRef(false)
  const hasLoadedUpdateStatus = useRef(false)
  const latestConfigRef = useRef(config)
  const latestOriginalConfigRef = useRef<AppConfig | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAutoSavingRef = useRef(false)
  const shouldRunAutoSaveAgainRef = useRef(false)
  const flushAutoSaveRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    latestConfigRef.current = config
  }, [config])

  useEffect(() => {
    latestOriginalConfigRef.current = originalConfig
  }, [originalConfig])

  useEffect(() => {
    if (hasLoadedConfig.current) return
    hasLoadedConfig.current = true

    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI.getConfig()
        const normalizedConfig: AppConfig = {
          ...loadedConfig,
          llmRefine: normalizeLLMRefineConfig(loadedConfig.llmRefine),
          translation: { ...defaultTranslationConfig, ...loadedConfig.translation },
        }
        setTranslationSystemPromptDraft(
          normalizedConfig.translation.systemPrompt || BASE_TRANSLATION_SYSTEM_PROMPT,
        )
        setConfig(normalizedConfig)
        setOriginalConfig(normalizedConfig)
      } catch (error) {
        console.error('Failed to load config:', error)
      } finally {
        setIsConfigLoading(false)
      }
    }

    loadConfig()
  }, [])

  const clearAutoSaveTimer = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }

  const handleAppLanguageChange = (value: string) => {
    const setting = value as LanguageSetting
    setConfig((prev) => ({
      ...prev,
      app: {
        ...prev.app,
        language: setting,
      },
    }))
    setOriginalConfig((prev) =>
      prev
        ? {
            ...prev,
            app: {
              ...prev.app,
              language: setting,
            },
          }
        : prev,
    )
    setSaveStatus({ state: 'saving', message: t('settings.autoSave.saving') })
    void window.electronAPI
      .setConfig({ app: { language: setting } })
      .then(() => {
        setSaveStatus({ state: 'success', message: t('settings.autoSave.saved') })
      })
      .catch((error) => {
        console.error('Failed to persist app language:', error)
        const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
        setSaveStatus({
          state: 'error',
          message: t('settings.autoSave.error', { message: errorMessage }),
        })
      })
  }

  const getHotkeyErrorMessage = (hotkey: AppConfig['hotkey']): string | null => {
    const pttValidation = validateHotkey(hotkey.pttKey)
    const settingsValidation = validateHotkey(hotkey.toggleSettings)
    const translateValidation = validateHotkey(hotkey.translateKey)

    if (!pttValidation.valid || !settingsValidation.valid || !translateValidation.valid) {
      return t('settings.result.hotkeyInvalid')
    }

    // Check for duplicate hotkeys
    const keys = [hotkey.pttKey, hotkey.toggleSettings, hotkey.translateKey]
    if (new Set(keys).size !== keys.length) {
      return t('settings.result.hotkeyInvalid')
    }

    return null
  }

  const getRefineErrorMessage = (refineConfig: LLMRefineConfig): string | null => {
    if (refineConfig.enabled && !isRefineConfigComplete(refineConfig)) {
      return t('settings.result.refineConfigRequired')
    }

    return null
  }

  const flushAutoSave = async () => {
    clearAutoSaveTimer()

    if (isAutoSavingRef.current) {
      shouldRunAutoSaveAgainRef.current = true
      return
    }

    const currentConfig = latestConfigRef.current
    const currentOriginalConfig = latestOriginalConfigRef.current

    if (!currentOriginalConfig) return

    const normalizedRefineConfig = normalizeLLMRefineConfig(currentConfig.llmRefine)
    const appDirty = isAppPreferencesDirty(currentConfig.app, currentOriginalConfig.app)
    const asrDirty = isAsrConfigDirty(currentConfig.asr, currentOriginalConfig.asr)
    const refineDirty = isLlmRefineDirty(normalizedRefineConfig, currentOriginalConfig.llmRefine)
    const hotkeyDirty = isHotkeyConfigDirty(currentConfig.hotkey, currentOriginalConfig.hotkey)
    const translationDirty = isTranslationConfigDirty(
      currentConfig.translation,
      currentOriginalConfig.translation,
    )
    const refineError = refineDirty ? getRefineErrorMessage(normalizedRefineConfig) : null
    const hotkeyError = hotkeyDirty ? getHotkeyErrorMessage(currentConfig.hotkey) : null
    const translationError = translationDirty
      ? getTranslationErrorMessage(currentConfig.translation, t)
      : null

    const patch: Partial<AppConfig> = {}

    if (appDirty) {
      patch.app = {
        language: currentConfig.app.language,
        autoLaunch: currentConfig.app.autoLaunch ?? false,
      }
    }

    if (asrDirty) {
      patch.asr = currentConfig.asr
    }

    if (refineDirty && !refineError) {
      patch.llmRefine = normalizedRefineConfig
    }

    if (hotkeyDirty && !hotkeyError) {
      patch.hotkey = currentConfig.hotkey
    }

    if (translationDirty && !translationError) {
      patch.translation = currentConfig.translation
    }

    const invalidMessage = hotkeyError ?? refineError ?? translationError

    if (Object.keys(patch).length === 0) {
      if (invalidMessage) {
        setSaveStatus({ state: 'invalid', message: invalidMessage })
      }
      return
    }

    isAutoSavingRef.current = true
    shouldRunAutoSaveAgainRef.current = false
    setSaveStatus({ state: 'saving', message: t('settings.autoSave.saving') })

    try {
      await window.electronAPI.setConfig(patch)
      setOriginalConfig((prev) => {
        if (!prev) return prev
        const merged = mergeConfigPatch(prev, patch)
        latestOriginalConfigRef.current = merged
        return merged
      })

      if (invalidMessage) {
        setSaveStatus({ state: 'invalid', message: invalidMessage })
      } else {
        setSaveStatus({ state: 'success', message: t('settings.autoSave.saved') })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setSaveStatus({
        state: 'error',
        message: t('settings.autoSave.error', { message: errorMessage }),
      })
    } finally {
      isAutoSavingRef.current = false
      if (shouldRunAutoSaveAgainRef.current) {
        shouldRunAutoSaveAgainRef.current = false
        void flushAutoSave()
      }
    }
  }

  flushAutoSaveRef.current = flushAutoSave

  useEffect(() => {
    if (isConfigLoading || !originalConfig) return

    const normalizedRefineConfig = normalizeLLMRefineConfig(config.llmRefine)
    const hasPendingChanges =
      isAppPreferencesDirty(config.app, originalConfig.app) ||
      isAsrConfigDirty(config.asr, originalConfig.asr) ||
      isLlmRefineDirty(normalizedRefineConfig, originalConfig.llmRefine) ||
      isHotkeyConfigDirty(config.hotkey, originalConfig.hotkey) ||
      isTranslationConfigDirty(config.translation, originalConfig.translation)

    if (!hasPendingChanges) return

    clearAutoSaveTimer()
    autoSaveTimerRef.current = setTimeout(() => {
      void flushAutoSave()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      clearAutoSaveTimer()
    }
  }, [config, originalConfig, isConfigLoading])

  const handleTestConnection = async () => {
    const region = config.asr.region || 'cn'
    const apiKey = config.asr.apiKeys[region]

    if (!apiKey) {
      setAsrTestStatus({ type: 'error', message: t('settings.result.apiKeyRequired') })
      return
    }

    setTestingAsr(true)
    setAsrTestStatus(null)
    try {
      const result = await window.electronAPI.testConnection(config.asr)
      if (result) {
        setAsrTestStatus({ type: 'success', message: t('settings.result.connectionSuccess') })
      } else {
        setAsrTestStatus({ type: 'error', message: t('settings.result.connectionFailed') })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setAsrTestStatus({
        type: 'error',
        message: t('settings.result.testFailed', { message: errorMessage }),
      })
    } finally {
      setTestingAsr(false)
    }
  }

  const handleTestRefineConnection = async () => {
    const normalizedRefineConfig = normalizeLLMRefineConfig(config.llmRefine)

    if (!isRefineConfigComplete(normalizedRefineConfig)) {
      setRefineTestStatus({ type: 'error', message: t('settings.result.refineConfigRequired') })
      return
    }

    setTestingRefine(true)
    setRefineTestStatus(null)
    try {
      const result = await window.electronAPI.testRefineConnection(normalizedRefineConfig)
      if (result.ok) {
        setRefineTestStatus({
          type: 'success',
          message: t('settings.result.refineConnectionSuccess'),
        })
      } else if (result.message) {
        setRefineTestStatus({
          type: 'error',
          message: t('settings.result.refineTestFailed', { message: result.message }),
        })
      } else {
        setRefineTestStatus({
          type: 'error',
          message: t('settings.result.refineConnectionFailed'),
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setRefineTestStatus({
        type: 'error',
        message: t('settings.result.refineTestFailed', { message: errorMessage }),
      })
    } finally {
      setTestingRefine(false)
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

  const handleRefineConfigChange = (key: 'endpoint' | 'model' | 'apiKey', value: string) => {
    const nextValue = key === 'endpoint' ? normalizeRefineBaseUrl(value) : value

    setConfig((prev) => ({
      ...prev,
      llmRefine: {
        ...prev.llmRefine,
        [key]: nextValue,
      },
    }))
  }

  const handleTranslationSystemPromptChange = (value: string) => {
    setTranslationSystemPromptDraft(value)
    setConfig((prev) => ({
      ...prev,
      translation: { ...prev.translation, systemPrompt: value },
    }))
  }

  const handleResetTranslationSystemPrompt = () => {
    setTranslationSystemPromptDraft(BASE_TRANSLATION_SYSTEM_PROMPT)
    setConfig((prev) => ({
      ...prev,
      translation: { ...prev.translation, systemPrompt: '' },
    }))
  }

  const currentRegion = config.asr.region || 'cn'
  const currentApiKey = config.asr.apiKeys?.[currentRegion] || ''
  const normalizedLLMRefineConfig = normalizeLLMRefineConfig(config.llmRefine)
  const llmRefineEnabled = normalizedLLMRefineConfig.enabled
  const translateToEnglish = normalizedLLMRefineConfig.translateToEnglish
  const canTestRefine = isRefineConfigComplete(normalizedLLMRefineConfig)
  const hotkeyValidationMessage =
    originalConfig && isHotkeyConfigDirty(config.hotkey, originalConfig.hotkey)
      ? getHotkeyErrorMessage(config.hotkey)
      : null
  const refineValidationMessage =
    originalConfig && isLlmRefineDirty(normalizedLLMRefineConfig, originalConfig.llmRefine)
      ? getRefineErrorMessage(normalizedLLMRefineConfig)
      : null
  const translationValidationMessage =
    originalConfig && isTranslationConfigDirty(config.translation, originalConfig.translation)
      ? getTranslationErrorMessage(config.translation, t)
      : null

  useEffect(() => {
    setAsrTestStatus(null)
  }, [config.asr])

  useEffect(() => {
    setRefineTestStatus(null)
  }, [config.llmRefine])

  useEffect(() => {
    return () => {
      clearAutoSaveTimer()
      if (!isConfigLoading && latestOriginalConfigRef.current) {
        const currentConfig = latestConfigRef.current
        const currentOriginalConfig = latestOriginalConfigRef.current
        const normalizedRefineConfig = normalizeLLMRefineConfig(currentConfig.llmRefine)
        const hasPendingChanges =
          isAppPreferencesDirty(currentConfig.app, currentOriginalConfig.app) ||
          isAsrConfigDirty(currentConfig.asr, currentOriginalConfig.asr) ||
          isLlmRefineDirty(normalizedRefineConfig, currentOriginalConfig.llmRefine) ||
          isHotkeyConfigDirty(currentConfig.hotkey, currentOriginalConfig.hotkey) ||
          isTranslationConfigDirty(currentConfig.translation, currentOriginalConfig.translation)

        if (hasPendingChanges) {
          void flushAutoSaveRef.current()
        }
      }
    }
  }, [isConfigLoading])

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,48rem)_18rem] xl:items-start">
      <div className="min-w-0 max-w-xl xl:max-w-none">
        <h1 className="mb-6 text-2xl font-bold text-foreground">{t('settings.title')}</h1>

        <InlineFeedback
          status={saveStatus}
          className="mb-6 xl:hidden"
          testId="save-status-inline"
        />

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
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showAsrApiKey ? 'text' : 'password'}
                  value={currentApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className="no-drag pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAsrApiKey((prev) => !prev)}
                  aria-label={showAsrApiKey ? t('settings.hideKey') : t('settings.showKey')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground no-drag"
                >
                  {showAsrApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
              <div className="mt-2 flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <p className="text-sm text-muted-foreground">{t('settings.durationWarning')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="lowVolumeMode">{t('settings.lowVolumeMode')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.lowVolumeModeHelp')}</p>
              </div>
              <Switch
                id="lowVolumeMode"
                checked={config.asr.lowVolumeMode ?? true}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    asr: { ...prev.asr, lowVolumeMode: checked },
                  }))
                }
                className="no-drag cursor-pointer"
              />
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Button
                variant="secondary"
                onClick={handleTestConnection}
                disabled={testingAsr || !currentApiKey}
                className="no-drag cursor-pointer"
              >
                {testingAsr ? t('settings.testingConnection') : t('settings.testConnection')}
              </Button>
              <InlineFeedback status={asrTestStatus} testId="asr-test-status" />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('settings.llmRefineConfig')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="llmRefineEnabled">{t('settings.llmRefineEnabled')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.llmRefineEnabledHelp')}
                </p>
              </div>
              <Switch
                id="llmRefineEnabled"
                checked={llmRefineEnabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    llmRefine: {
                      ...prev.llmRefine,
                      enabled: checked,
                    },
                  }))
                }
                className="no-drag cursor-pointer"
              />
            </div>

            <p className="text-sm text-muted-foreground">{t('settings.llmRefineManualHelp')}</p>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="translateToEnglish">{t('settings.translateToEnglish')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.translateToEnglishHelp')}
                </p>
              </div>
              <Switch
                id="translateToEnglish"
                checked={translateToEnglish}
                disabled={!llmRefineEnabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    llmRefine: {
                      ...prev.llmRefine,
                      translateToEnglish: checked,
                    },
                  }))
                }
                className="no-drag cursor-pointer disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refineEndpoint">
                {t('settings.refineEndpoint')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refineEndpoint"
                type="text"
                value={normalizedLLMRefineConfig.endpoint}
                onChange={(e) => handleRefineConfigChange('endpoint', e.target.value)}
                placeholder={t('settings.refineEndpointPlaceholder')}
                className="no-drag"
              />
              <p className="text-sm text-muted-foreground">{t('settings.refineEndpointHelp')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refineModel">
                {t('settings.refineModel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refineModel"
                type="text"
                value={normalizedLLMRefineConfig.model}
                onChange={(e) => handleRefineConfigChange('model', e.target.value)}
                placeholder={t('settings.refineModelPlaceholder')}
                className="no-drag"
              />
              <Alert className="border-primary/30 bg-primary/5 [&>svg]:text-primary">
                <Sparkles className="h-4 w-4" />
                <AlertTitle>{t('settings.refineModelTipTitle')}</AlertTitle>
                <AlertDescription className="text-foreground/80">
                  {t('settings.refineModelHelp')}
                </AlertDescription>
              </Alert>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refineApiKey">
                {t('settings.refineApiKey')} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="refineApiKey"
                  type={showRefineApiKey ? 'text' : 'password'}
                  value={normalizedLLMRefineConfig.apiKey}
                  onChange={(e) => handleRefineConfigChange('apiKey', e.target.value)}
                  placeholder={t('settings.refineApiKeyPlaceholder')}
                  className="no-drag pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRefineApiKey((prev) => !prev)}
                  aria-label={
                    showRefineApiKey ? t('settings.hideRefineKey') : t('settings.showRefineKey')
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground no-drag"
                >
                  {showRefineApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {refineValidationMessage && (
              <Alert variant="destructive" data-testid="refine-validation-status">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{refineValidationMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestRefineConnection}
                disabled={testingRefine || !canTestRefine}
                className="no-drag cursor-pointer"
              >
                {testingRefine
                  ? t('settings.testingRefineConnection')
                  : t('settings.testRefineConnection')}
              </Button>
              <InlineFeedback status={refineTestStatus} testId="refine-test-status" />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('settings.translation.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('settings.translation.description')}</p>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="translationEnabled">{t('settings.translation.enable')}</Label>
              </div>
              <Switch
                id="translationEnabled"
                checked={config.translation.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    translation: { ...prev.translation, enabled: checked },
                  }))
                }
                className="no-drag cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetLanguage">{t('settings.translation.targetLanguage')}</Label>
              <Select
                value={config.translation.targetLanguage}
                onValueChange={(value) =>
                  setConfig((prev) => ({
                    ...prev,
                    translation: { ...prev.translation, targetLanguage: value },
                  }))
                }
                disabled={!config.translation.enabled}
              >
                <SelectTrigger id="targetLanguage" className="no-drag w-full cursor-pointer">
                  <SelectValue placeholder="English" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {t(`settings.translation.languages.${lang.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="translationSystemPrompt">
                  {t('settings.translation.systemPrompt')}
                </Label>
                {(config.translation.systemPrompt ||
                  translationSystemPromptDraft !== BASE_TRANSLATION_SYSTEM_PROMPT) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetTranslationSystemPrompt}
                    className="h-7 cursor-pointer px-2 text-xs text-muted-foreground hover:text-foreground"
                    title={t('settings.translation.resetSystemPrompt')}
                  >
                    {t('settings.translation.resetSystemPrompt')}
                  </Button>
                )}
              </div>
              <textarea
                id="translationSystemPrompt"
                value={translationSystemPromptDraft}
                onChange={(e) => handleTranslationSystemPromptChange(e.target.value)}
                disabled={!config.translation.enabled}
                rows={8}
                className="no-drag w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p
                className="text-xs text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: t('settings.translation.systemPromptHelp'),
                }}
              />
            </div>

            {config.translation.enabled && !canTestRefine && (
              <Alert className="border-yellow-500/30 bg-yellow-500/10 [&>svg]:text-yellow-500">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t('settings.translation.refineWarning')}</AlertDescription>
              </Alert>
            )}

            {translationValidationMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{translationValidationMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="mb-6 space-y-3">
          <HotkeySettings
            value={config.hotkey}
            originalValue={originalConfig?.hotkey ?? null}
            isLoading={isConfigLoading}
            onChange={(hotkey) => setConfig((prev) => ({ ...prev, hotkey }))}
          />
          {hotkeyValidationMessage && (
            <Alert variant="destructive" data-testid="hotkey-validation-status">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{hotkeyValidationMessage}</AlertDescription>
            </Alert>
          )}
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
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-6">
          <SaveStatusCard status={saveStatus} testId="save-status-card" />
        </div>
      </aside>
    </div>
  )
}
