import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  SlidersHorizontal,
  Mic,
  ScrollText,
  Activity,
  Info,
  Plug,
  RefreshCw,
  Languages,
  Download,
  HardDrive,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type LanguageSetting } from '@electron/shared/i18n'
import {
  LOG_FILE_MAX_SIZE_MB,
  LOG_RETENTION_DAYS,
  LLM_PROVIDERS,
  MICROPHONE_INPUT,
  STORED_SECRET_PLACEHOLDER,
  TRANSLATION,
  TARGET_LANGUAGES,
} from '@electron/shared/constants'
import { normalizeRefineBaseUrl } from '@electron/shared/refine-url'
import {
  defaultLLMRefineConfig,
  normalizeLLMRefineConfig,
  resolveLLMConnection,
} from '@electron/shared/llm-config'
import type {
  AppConfig,
  ASRProviderType,
  LLMRefineConfig,
  LLMProvider,
  LocalASRDownloadProgress,
  LocalASRStatus,
  TranslationConfig,
  UpdateInfo,
} from '@electron/shared/types'
import { LogViewerDialog } from '@/components/LogViewerDialog'
import { HotkeySettings } from '@/components/HotkeySettings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { validateHotkey } from '@/lib/hotkey-utils'
import { applyPersistedSecretState, normalizeRendererConfig } from './settings-config'

const AUTO_SAVE_DELAY_MS = 700
const NO_MICROPHONE_SELECT_VALUE = '__no-microphones__'

type AudioInputDevice = {
  deviceId: string
  label: string
}

const defaultTranslationConfig: TranslationConfig = {
  enabled: TRANSLATION.ENABLED,
  targetLanguage: TRANSLATION.TARGET_LANGUAGE,
}

type TestStatus = {
  type: 'success' | 'error'
  message: string
} | null

type SaveStatus = {
  state: 'saving' | 'success' | 'error' | 'invalid'
  message: string
} | null

function isRefineConfigComplete(config: LLMRefineConfig): boolean {
  const connection = resolveLLMConnection(config)
  return Boolean(connection.endpoint.trim() && connection.model.trim() && connection.apiKey.trim())
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
    (current.microphoneDeviceId ?? '') !== (original.microphoneDeviceId ?? '') ||
    (current.microphoneDeviceLabel ?? '') !== (original.microphoneDeviceLabel ?? '') ||
    current.apiKeys.cn !== original.apiKeys.cn ||
    current.apiKeys.intl !== original.apiKeys.intl
  )
}

function isLlmRefineDirty(current: LLMRefineConfig, original: LLMRefineConfig): boolean {
  return (
    JSON.stringify(normalizeLLMRefineConfig(current)) !==
    JSON.stringify(normalizeLLMRefineConfig(original))
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
  return current.enabled !== original.enabled || current.targetLanguage !== original.targetLanguage
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
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
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      <AlertDescription className={isSuccess ? 'text-green-600 dark:text-green-500' : ''}>
        {status.message}
      </AlertDescription>
    </Alert>
  )
}

function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground">
          {icon}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
  disabled = false,
}: {
  title: string
  desc?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        {desc ? (
          <div className="mt-0.5 max-w-[420px] text-xs leading-relaxed text-muted-foreground">
            {desc}
          </div>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="no-drag cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border bg-secondary p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'no-drag cursor-pointer rounded-md px-5 py-1.5 text-xs font-semibold transition-colors',
            value === option.value
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
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
      microphoneDeviceId: '',
      microphoneDeviceLabel: '',
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
  const [localAsrStatus, setLocalAsrStatus] = useState<LocalASRStatus | null>(null)
  const [localAsrProgress, setLocalAsrProgress] = useState<LocalASRDownloadProgress | null>(null)
  const [downloadingLocalAsr, setDownloadingLocalAsr] = useState(false)
  const [microphoneDevices, setMicrophoneDevices] = useState<AudioInputDevice[]>([])
  const [loadingMicrophones, setLoadingMicrophones] = useState(false)
  const [microphoneError, setMicrophoneError] = useState<string | null>(null)
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
        const normalizedConfig = normalizeRendererConfig(loadedConfig)
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

  useEffect(() => {
    const loadLocalAsrStatus = async () => {
      try {
        const status = await window.electronAPI.getLocalASRStatus()
        setLocalAsrStatus(status)
        setDownloadingLocalAsr(status.downloading)
        setLocalAsrProgress(status.progress ?? null)
      } catch (error) {
        console.error('Failed to load local ASR status:', error)
      }
    }

    void loadLocalAsrStatus()

    return window.electronAPI.onLocalASRDownloadProgress((progress) => {
      setLocalAsrProgress(progress)
      setDownloadingLocalAsr(true)
      setLocalAsrStatus((prev) => (prev ? { ...prev, downloading: true, progress } : prev))
    })
  }, [])

  // While a download is in flight, poll the real status so the UI recovers
  // when progress hits 100% or the download finished outside this page
  // (progress events alone never report completion).
  useEffect(() => {
    if (!downloadingLocalAsr) return

    const timer = setInterval(() => {
      void window.electronAPI
        .getLocalASRStatus()
        .then((status) => {
          if (status.downloading) return
          setLocalAsrStatus(status)
          setLocalAsrProgress(status.progress ?? null)
          setDownloadingLocalAsr(false)
        })
        .catch((error) => {
          console.error('Failed to refresh local ASR status:', error)
        })
    }, 2000)

    return () => clearInterval(timer)
  }, [downloadingLocalAsr])

  const loadMicrophoneDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicrophoneDevices([])
      setMicrophoneError(t('settings.microphone.unsupported'))
      return
    }

    setLoadingMicrophones(true)
    setMicrophoneError(null)

    try {
      let devices = await navigator.mediaDevices.enumerateDevices()
      let rawAudioInputs = devices.filter((device) => device.kind === 'audioinput')
      let audioInputs = rawAudioInputs.filter(
        (device) =>
          device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications',
      )

      if (
        rawAudioInputs.length > 0 &&
        (audioInputs.length === 0 || audioInputs.every((device) => !device.label))
      ) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((track) => track.stop())
          devices = await navigator.mediaDevices.enumerateDevices()
          rawAudioInputs = devices.filter((device) => device.kind === 'audioinput')
          audioInputs = rawAudioInputs.filter(
            (device) =>
              device.deviceId &&
              device.deviceId !== 'default' &&
              device.deviceId !== 'communications',
          )
        } catch {
          setMicrophoneError(t('settings.microphone.permissionHelp'))
        }
      }

      const seenDeviceIds = new Set<string>()
      const nextDevices = audioInputs.reduce<AudioInputDevice[]>((result, device) => {
        if (seenDeviceIds.has(device.deviceId)) return result
        seenDeviceIds.add(device.deviceId)
        result.push({
          deviceId: device.deviceId,
          label:
            device.label ||
            t('settings.microphone.deviceFallback', {
              index: result.length + 1,
            }),
        })
        return result
      }, [])

      setMicrophoneDevices(nextDevices)
    } catch (error) {
      console.error('Failed to enumerate microphone devices:', error)
      setMicrophoneDevices([])
      setMicrophoneError(t('settings.microphone.detectFailed'))
    } finally {
      setLoadingMicrophones(false)
    }
  }, [t])

  useEffect(() => {
    void loadMicrophoneDevices()

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.addEventListener) return

    const handleDeviceChange = () => {
      void loadMicrophoneDevices()
    }

    mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [loadMicrophoneDevices])

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
    const pttValidation = validateHotkey(hotkey.pttKey, { allowModifierOnly: true })
    const settingsValidation = validateHotkey(hotkey.toggleSettings, { allowModifierOnly: false })
    const translateValidation = validateHotkey(hotkey.translateKey, { allowModifierOnly: false })

    if (!pttValidation.valid || !settingsValidation.valid || !translateValidation.valid) {
      return t('settings.result.hotkeyInvalid')
    }

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

    if (translationDirty) {
      patch.translation = currentConfig.translation
    }

    const invalidMessage = hotkeyError ?? refineError

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
      try {
        // Re-read from the main process so newly entered secrets immediately become placeholders
        // and legacy-encryption status reflects the persisted state.
        const persistedConfig = normalizeRendererConfig(await window.electronAPI.getConfig())
        latestOriginalConfigRef.current = persistedConfig
        setOriginalConfig(persistedConfig)
        setConfig((current) => {
          const next = applyPersistedSecretState(current, patch, persistedConfig)
          latestConfigRef.current = next
          return next
        })
      } catch (reloadError) {
        // The save already succeeded. Keep the previous behavior as a fallback and let a later
        // settings load obtain the masked values rather than reporting a false save failure.
        console.error('Failed to refresh masked config after save:', reloadError)
        setOriginalConfig((prev) => {
          if (!prev) return prev
          const merged = mergeConfigPatch(prev, patch)
          latestOriginalConfigRef.current = merged
          return merged
        })
      }

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
      void flushAutoSaveRef.current()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      clearAutoSaveTimer()
    }
  }, [config, originalConfig, isConfigLoading])

  const handleTestConnection = async () => {
    if (config.asr.provider === 'local-sensevoice' && !localAsrStatus?.ready) {
      setAsrTestStatus({ type: 'error', message: t('settings.result.localModelRequired') })
      return
    }

    const region = config.asr.region || 'cn'
    const apiKey = config.asr.apiKeys?.[region] || ''

    if (config.asr.provider === 'glm' && !apiKey) {
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

  const handleDownloadLocalASR = async () => {
    setDownloadingLocalAsr(true)
    setAsrTestStatus(null)
    try {
      const status = await window.electronAPI.downloadLocalASR()
      setLocalAsrStatus(status)
      setLocalAsrProgress(status.progress ?? null)
      if (status.ready) {
        setAsrTestStatus({ type: 'success', message: t('settings.localAsr.downloadComplete') })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setAsrTestStatus({
        type: 'error',
        message: t('settings.localAsr.downloadFailed', { message: errorMessage }),
      })
    } finally {
      setDownloadingLocalAsr(false)
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

  const handleRegionChange = (value: string) => {
    const region = value as 'cn' | 'intl'
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        region,
        endpoint: '',
      },
    }))
  }

  const handleAsrProviderChange = (value: string) => {
    const provider = value as ASRProviderType
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        provider,
      },
    }))
  }

  const handleMicrophoneChange = (value: string) => {
    if (value === NO_MICROPHONE_SELECT_VALUE) return

    if (value === MICROPHONE_INPUT.SYSTEM_DEFAULT_ID) {
      setConfig((prev) => ({
        ...prev,
        asr: {
          ...prev.asr,
          microphoneDeviceId: '',
          microphoneDeviceLabel: '',
        },
      }))
      return
    }

    const device = microphoneDevices.find((item) => item.deviceId === value)
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        microphoneDeviceId: value,
        microphoneDeviceLabel: device?.label ?? prev.asr.microphoneDeviceLabel ?? '',
      },
    }))
  }

  const handleLLMProviderChange = (value: string) => {
    const provider = value as LLMProvider
    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        provider,
      }),
    }))
  }

  const handleDeepSeekApiKeyChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        deepseek: {
          ...prev.llmRefine.deepseek,
          apiKey: value,
        },
      }),
    }))
  }

  const handleDeepSeekModelChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        deepseek: {
          ...prev.llmRefine.deepseek,
          model: value,
        },
      }),
    }))
  }

  const handleOpenRouterApiKeyChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        openrouter: {
          ...prev.llmRefine.openrouter,
          apiKey: value,
        },
      }),
    }))
  }

  const handleOpenRouterModelChange = (value: string) => {
    const model = LLM_PROVIDERS.OPENROUTER_MODELS.find((option) => option.id === value)?.id
    if (!model) return

    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        openrouter: {
          ...prev.llmRefine.openrouter,
          model,
        },
      }),
    }))
  }

  const handleCustomConfigChange = (key: 'endpoint' | 'model' | 'apiKey', value: string) => {
    setConfig((prev) => ({
      ...prev,
      llmRefine: {
        ...prev.llmRefine,
        custom: {
          ...prev.llmRefine.custom,
          [key]: value,
        },
      },
    }))
  }

  const handleCustomEndpointBlur = () => {
    setConfig((prev) => ({
      ...prev,
      llmRefine: normalizeLLMRefineConfig({
        ...prev.llmRefine,
        custom: {
          ...prev.llmRefine.custom,
          endpoint: normalizeRefineBaseUrl(prev.llmRefine.custom.endpoint),
        },
      }),
    }))
  }

  const currentRegion = config.asr.region || 'cn'
  const currentApiKey = config.asr.apiKeys?.[currentRegion] || ''
  const isLocalAsr = config.asr.provider === 'local-sensevoice'
  const selectedMicrophoneDeviceId = config.asr.microphoneDeviceId?.trim() ?? ''
  const selectedMicrophoneValue = selectedMicrophoneDeviceId || MICROPHONE_INPUT.SYSTEM_DEFAULT_ID
  const selectedMicrophone = microphoneDevices.find(
    (device) => device.deviceId === selectedMicrophoneDeviceId,
  )
  const selectedMicrophoneUnavailable = Boolean(selectedMicrophoneDeviceId && !selectedMicrophone)
  const selectedMicrophoneLabel =
    config.asr.microphoneDeviceLabel?.trim() || t('settings.microphone.unknownDevice')
  const localAsrReady = Boolean(localAsrStatus?.ready)
  const localAsrSupported = localAsrStatus?.supported ?? true
  const canTestAsr = isLocalAsr ? localAsrReady : Boolean(currentApiKey)
  const normalizedLLMRefineConfig = normalizeLLMRefineConfig(config.llmRefine)
  const activeLLMConnection = resolveLLMConnection(normalizedLLMRefineConfig)
  const currentLLMProvider = normalizedLLMRefineConfig.provider
  const isCustomLLMProvider = currentLLMProvider === 'custom-compatible'
  const builtInDeepSeekModels: string[] = [...LLM_PROVIDERS.DEEPSEEK_MODELS]
  const deepSeekModelOptions = builtInDeepSeekModels.includes(
    normalizedLLMRefineConfig.deepseek.model,
  )
    ? builtInDeepSeekModels
    : [...builtInDeepSeekModels, normalizedLLMRefineConfig.deepseek.model]
  const llmProviderOptions = [
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'openrouter', label: 'OpenRouter' },
    ...(isCustomLLMProvider
      ? [{ value: 'custom-compatible', label: t('settings.llmProviderCustom') }]
      : []),
  ]
  const llmRefineEnabled = normalizedLLMRefineConfig.enabled
  const translateOutput = normalizedLLMRefineConfig.translateOutput
  const canTestRefine = isRefineConfigComplete(normalizedLLMRefineConfig)
  const hotkeyValidationMessage =
    originalConfig && isHotkeyConfigDirty(config.hotkey, originalConfig.hotkey)
      ? getHotkeyErrorMessage(config.hotkey)
      : null
  const refineValidationMessage =
    originalConfig && isLlmRefineDirty(normalizedLLMRefineConfig, originalConfig.llmRefine)
      ? getRefineErrorMessage(normalizedLLMRefineConfig)
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

  const asrEndpoint =
    config.asr.endpoint ||
    (currentRegion === 'intl'
      ? 'https://api.z.ai/api/paas/v4/audio/transcriptions'
      : 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions')
  const localAsrProgressPercent = localAsrProgress?.percent ?? localAsrStatus?.progress?.percent
  const localAsrProgressPhase = localAsrProgress?.phase ?? localAsrStatus?.progress?.phase
  const localAsrProgressLabel = localAsrProgressPhase
    ? t(`settings.localAsr.phase.${localAsrProgressPhase}`)
    : t('settings.localAsr.downloading')
  const asrHealthReady = isLocalAsr ? localAsrReady : Boolean(currentApiKey)
  const asrHealthStatus = isLocalAsr
    ? localAsrReady
      ? t('settings.health.asrLocalReady')
      : t('settings.health.asrLocalMissing')
    : currentApiKey
      ? t('settings.health.asrOn')
      : t('settings.health.asrOff')

  const translationActive = config.translation.enabled || translateOutput
  const activeTargetLanguage = TARGET_LANGUAGES.find(
    (lang) => lang.value === config.translation.targetLanguage,
  )

  return (
    <div className="mx-auto max-w-[1040px] px-8 py-7">
      {/* 页头 */}
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <SlidersHorizontal className="h-3 w-3" />
          {t('settings.eyebrow')}
        </span>
        <h1 className="mt-2 font-display text-[27px] font-bold tracking-tight text-foreground">
          {t('settings.title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {config.secretStorage?.legacyEncryptedKeys ? (
        <Alert className="mb-5 border-yellow-500/30 bg-yellow-500/10 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('settings.legacyEncryptedKeys')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_256px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* 通用 */}
          <SectionCard
            icon={<SlidersHorizontal className="h-[18px] w-[18px]" />}
            title={t('settings.appPreferences')}
            desc={t('settings.descGeneral')}
          >
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
            <div className="mt-4">
              <ToggleRow
                title={t('settings.autoLaunch')}
                desc={t('settings.autoLaunchHelp')}
                checked={config.app.autoLaunch ?? false}
                onChange={(checked) =>
                  setConfig((prev) => ({ ...prev, app: { ...prev.app, autoLaunch: checked } }))
                }
              />
            </div>
          </SectionCard>

          {/* 语音识别 */}
          <SectionCard
            icon={<Mic className="h-[18px] w-[18px]" />}
            title={t('settings.asrConfig')}
            desc={t('settings.descAsr')}
          >
            <div className="space-y-2">
              <Label>{t('settings.asrProvider')}</Label>
              <Segmented
                value={config.asr.provider}
                onChange={handleAsrProviderChange}
                options={[
                  { value: 'local-sensevoice', label: t('settings.asrProviderLocal') },
                  { value: 'glm', label: t('settings.asrProviderGlm') },
                ]}
              />
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="microphoneDevice">{t('settings.microphone.label')}</Label>
              <div className="flex items-center gap-2">
                <Select value={selectedMicrophoneValue} onValueChange={handleMicrophoneChange}>
                  <SelectTrigger
                    id="microphoneDevice"
                    className="no-drag min-w-0 flex-1 cursor-pointer"
                  >
                    <SelectValue placeholder={t('settings.microphone.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MICROPHONE_INPUT.SYSTEM_DEFAULT_ID}>
                      {t('settings.microphone.systemDefault')}
                    </SelectItem>
                    {microphoneDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                    {selectedMicrophoneUnavailable ? (
                      <SelectItem value={selectedMicrophoneDeviceId}>
                        {t('settings.microphone.unavailableOption', {
                          label: selectedMicrophoneLabel,
                        })}
                      </SelectItem>
                    ) : null}
                    {microphoneDevices.length === 0 ? (
                      <SelectItem value={NO_MICROPHONE_SELECT_VALUE} disabled>
                        {t('settings.microphone.noDevices')}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadMicrophoneDevices()}
                  disabled={loadingMicrophones}
                  className="no-drag shrink-0 cursor-pointer"
                >
                  <RefreshCw className={cn('h-4 w-4', loadingMicrophones && 'animate-spin')} />
                  {loadingMicrophones
                    ? t('settings.microphone.detecting')
                    : t('settings.microphone.refresh')}
                </Button>
              </div>
              {microphoneError ? (
                <p className="text-xs leading-relaxed text-destructive">{microphoneError}</p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('settings.microphone.help')}
                </p>
              )}
              {selectedMicrophoneUnavailable ? (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500" />
                  {t('settings.microphone.unavailableHelp')}
                </div>
              ) : null}
            </div>

            {isLocalAsr ? (
              <div className="mt-4 rounded-lg border bg-secondary/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-card text-primary">
                      <HardDrive className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground">
                        {localAsrStatus?.modelName ?? t('settings.localAsr.modelName')}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t('settings.localAsr.help', {
                          size: formatBytes(localAsrStatus?.downloadSizeBytes ?? 240 * 1024 * 1024),
                        })}
                      </p>
                      {downloadingLocalAsr ? (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{localAsrProgressLabel}</span>
                            <span>{localAsrProgressPercent ?? 0}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${localAsrProgressPercent ?? 0}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {localAsrReady ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-600 dark:text-green-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('settings.localAsr.ready')}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleDownloadLocalASR}
                        disabled={!localAsrSupported || downloadingLocalAsr}
                        className="no-drag cursor-pointer"
                      >
                        {downloadingLocalAsr ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {downloadingLocalAsr
                          ? t('settings.localAsr.downloading')
                          : t('settings.localAsr.download')}
                      </Button>
                    )}
                  </div>
                </div>
                {!localAsrSupported ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{t('settings.localAsr.unsupported')}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-2">
                  <Label>{t('settings.region')}</Label>
                  <Segmented
                    value={currentRegion}
                    onChange={handleRegionChange}
                    options={[
                      { value: 'cn', label: t('settings.regionChina') },
                      { value: 'intl', label: t('settings.regionIntl') },
                    ]}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <Label htmlFor="apiKey">
                    {t('settings.apiKey')} <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="apiKey"
                      type={showAsrApiKey ? 'text' : 'password'}
                      value={currentApiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      onFocus={(event) => {
                        if (currentApiKey === STORED_SECRET_PLACEHOLDER) {
                          event.currentTarget.select()
                        }
                      }}
                      placeholder={t('settings.apiKeyPlaceholder')}
                      className="no-drag pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAsrApiKey((prev) => !prev)}
                      aria-label={showAsrApiKey ? t('settings.hideKey') : t('settings.showKey')}
                      className="no-drag absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    >
                      {showAsrApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.apiKeyHelp')}{' '}
                    <a
                      href={
                        currentRegion === 'intl'
                          ? 'https://z.ai/manage-apikey/apikey-list'
                          : 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary hover:underline"
                    >
                      {currentRegion === 'intl' ? 'z.ai' : 'bigmodel.cn'}
                    </a>
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  <Label htmlFor="endpoint">{t('settings.apiEndpoint')}</Label>
                  <Input
                    id="endpoint"
                    type="text"
                    value={asrEndpoint}
                    readOnly
                    disabled
                    className="no-drag bg-muted font-mono text-muted-foreground"
                  />
                </div>
              </>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500" />
              {t('settings.durationWarning')}
            </div>

            <div className="mt-4 border-t pt-4">
              <ToggleRow
                title={t('settings.lowVolumeMode')}
                desc={t('settings.lowVolumeModeHelp')}
                checked={config.asr.lowVolumeMode ?? true}
                onChange={(checked) =>
                  setConfig((prev) => ({ ...prev, asr: { ...prev.asr, lowVolumeMode: checked } }))
                }
              />
            </div>

            <div className="mt-4 space-y-3 border-t pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestConnection}
                disabled={testingAsr || !canTestAsr || downloadingLocalAsr}
                className="no-drag cursor-pointer"
              >
                <Plug className="h-4 w-4" />
                {testingAsr ? t('settings.testingConnection') : t('settings.testConnection')}
              </Button>
              <InlineFeedback status={asrTestStatus} testId="asr-test-status" />
            </div>
          </SectionCard>

          {/* 润色与翻译 */}
          <SectionCard
            icon={<Sparkles className="h-[18px] w-[18px]" />}
            title={t('settings.refineAndTranslation')}
            desc={t('settings.descRefine')}
          >
            {/* 共享 LLM 连接 */}
            <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <Plug className="h-3.5 w-3.5" />
              {t('settings.llmConnectionHelp')}
            </p>

            <div className="space-y-2">
              <Label>{t('settings.llmProvider')}</Label>
              <Segmented
                value={currentLLMProvider}
                onChange={handleLLMProviderChange}
                options={llmProviderOptions}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.llmProviderHelp', { endpoint: activeLLMConnection.endpoint })}
              </p>
            </div>

            {currentLLMProvider === 'deepseek' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="deepSeekModel">
                    {t('settings.refineModel')} <span className="text-primary">*</span>
                  </Label>
                  <Select
                    value={normalizedLLMRefineConfig.deepseek.model}
                    onValueChange={handleDeepSeekModelChange}
                  >
                    <SelectTrigger id="deepSeekModel" className="no-drag w-full cursor-pointer">
                      <SelectValue placeholder={LLM_PROVIDERS.DEFAULT_DEEPSEEK_MODEL} />
                    </SelectTrigger>
                    <SelectContent>
                      {deepSeekModelOptions.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {currentLLMProvider === 'openrouter' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="openRouterModel">
                    {t('settings.refineModel')} <span className="text-primary">*</span>
                  </Label>
                  <Select
                    value={normalizedLLMRefineConfig.openrouter.model}
                    onValueChange={handleOpenRouterModelChange}
                  >
                    <SelectTrigger id="openRouterModel" className="no-drag w-full cursor-pointer">
                      <SelectValue placeholder={LLM_PROVIDERS.DEFAULT_OPENROUTER_MODEL} />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_PROVIDERS.OPENROUTER_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {isCustomLLMProvider && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customRefineEndpoint">
                    {t('settings.refineEndpoint')} <span className="text-primary">*</span>
                  </Label>
                  <Input
                    id="customRefineEndpoint"
                    type="text"
                    value={config.llmRefine.custom.endpoint}
                    onChange={(e) => handleCustomConfigChange('endpoint', e.target.value)}
                    onBlur={handleCustomEndpointBlur}
                    placeholder={t('settings.refineEndpointPlaceholder')}
                    className="no-drag font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customRefineModel">
                    {t('settings.refineModel')} <span className="text-primary">*</span>
                  </Label>
                  <Input
                    id="customRefineModel"
                    type="text"
                    value={config.llmRefine.custom.model}
                    onChange={(e) => handleCustomConfigChange('model', e.target.value)}
                    placeholder={t('settings.refineModelPlaceholder')}
                    className="no-drag font-mono"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <Label htmlFor="refineApiKey">
                {t('settings.refineApiKey')} <span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="refineApiKey"
                  type={showRefineApiKey ? 'text' : 'password'}
                  value={activeLLMConnection.apiKey}
                  onChange={(e) => {
                    if (currentLLMProvider === 'deepseek') {
                      handleDeepSeekApiKeyChange(e.target.value)
                    } else if (currentLLMProvider === 'openrouter') {
                      handleOpenRouterApiKeyChange(e.target.value)
                    } else {
                      handleCustomConfigChange('apiKey', e.target.value)
                    }
                  }}
                  onFocus={(event) => {
                    if (activeLLMConnection.apiKey === STORED_SECRET_PLACEHOLDER) {
                      event.currentTarget.select()
                    }
                  }}
                  placeholder={t(
                    currentLLMProvider === 'openrouter'
                      ? 'settings.openRouterApiKeyPlaceholder'
                      : currentLLMProvider === 'deepseek'
                        ? 'settings.deepSeekApiKeyPlaceholder'
                        : 'settings.refineApiKeyPlaceholder',
                  )}
                  className="no-drag pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowRefineApiKey((prev) => !prev)}
                  aria-label={
                    showRefineApiKey ? t('settings.hideRefineKey') : t('settings.showRefineKey')
                  }
                  className="no-drag absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showRefineApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {refineValidationMessage && (
              <Alert variant="destructive" className="mt-4" data-testid="refine-validation-status">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{refineValidationMessage}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestRefineConnection}
                disabled={testingRefine || !canTestRefine}
                className="no-drag cursor-pointer"
              >
                <Plug className="h-4 w-4" />
                {testingRefine
                  ? t('settings.testingRefineConnection')
                  : t('settings.testRefineConnection')}
              </Button>
              <InlineFeedback status={refineTestStatus} testId="refine-test-status" />
            </div>

            {/* 文本润色 */}
            <div className="mt-5 border-t pt-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t('settings.llmRefineConfig')}
              </p>
              <ToggleRow
                title={t('settings.llmRefineEnabled')}
                desc={t('settings.llmRefineEnabledHelp')}
                checked={llmRefineEnabled}
                onChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    llmRefine: { ...prev.llmRefine, enabled: checked },
                  }))
                }
              />
            </div>

            {/* 翻译 */}
            <div className="mt-5 border-t pt-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <Languages className="h-3.5 w-3.5" />
                {t('settings.translation.title')}
              </p>

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
                  disabled={!config.translation.enabled && !translateOutput}
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

              <div className="mt-4">
                <ToggleRow
                  title={t('settings.translation.enable')}
                  checked={config.translation.enabled}
                  onChange={(checked) =>
                    setConfig((prev) => ({
                      ...prev,
                      translation: { ...prev.translation, enabled: checked },
                    }))
                  }
                />
              </div>

              <div className="mt-4">
                <ToggleRow
                  title={t('settings.translateOutput')}
                  desc={t('settings.translateOutputHelp')}
                  checked={translateOutput}
                  disabled={!llmRefineEnabled}
                  onChange={(checked) =>
                    setConfig((prev) => ({
                      ...prev,
                      llmRefine: { ...prev.llmRefine, translateOutput: checked },
                    }))
                  }
                />
              </div>

              {config.translation.enabled && !canTestRefine && (
                <Alert className="mt-4 border-yellow-500/30 bg-yellow-500/10 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-500">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t('settings.translation.refineWarning')}</AlertDescription>
                </Alert>
              )}
            </div>
          </SectionCard>

          {/* 快捷键 */}
          <div className="space-y-3">
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

          {/* 诊断 */}
          <SectionCard
            icon={<ScrollText className="h-[18px] w-[18px]" />}
            title={t('settings.troubleshooting')}
            desc={t('settings.descLogs')}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="max-w-[420px] text-xs leading-relaxed text-muted-foreground">
                {t('settings.logsDescription', {
                  days: LOG_RETENTION_DAYS,
                  size: LOG_FILE_MAX_SIZE_MB,
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogDialogOpen(true)}
                className="no-drag shrink-0 cursor-pointer"
              >
                <ScrollText className="h-4 w-4" />
                {t('settings.viewLogs')}
              </Button>
            </div>
          </SectionCard>

          <LogViewerDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
        </div>

        {/* 右侧栏 */}
        <aside className="hidden xl:block">
          <div className="sticky top-0 flex flex-col gap-4">
            {/* 自动保存状态 */}
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-semibold shadow-sm',
                saveStatus?.state === 'error' || saveStatus?.state === 'invalid'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : saveStatus?.state === 'saving'
                    ? 'bg-secondary text-muted-foreground'
                    : 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-500',
              )}
              data-testid="save-status-card"
            >
              {saveStatus?.state === 'saving' ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('settings.autoSave.saving')}
                </>
              ) : saveStatus?.state === 'error' || saveStatus?.state === 'invalid' ? (
                <>
                  <XCircle className="h-[17px] w-[17px]" />
                  {saveStatus.message}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-[17px] w-[17px]" />
                  {t('settings.autoSave.saved')}
                </>
              )}
            </div>

            {/* 连接状态 */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                {t('settings.connectionTitle')}
              </p>
              <HealthItem
                on={asrHealthReady}
                title={t('settings.health.asr')}
                status={asrHealthStatus}
              />
              <HealthItem
                on={canTestRefine}
                title={t('settings.health.refine')}
                status={
                  canTestRefine ? t('settings.health.refineOn') : t('settings.health.refineOff')
                }
              />
              <HealthItem
                on={translationActive}
                title={t('settings.health.translation')}
                status={
                  translationActive && activeTargetLanguage
                    ? `→ ${t(`settings.translation.languages.${activeTargetLanguage.value}`)}`
                    : t('settings.health.translationOff')
                }
              />
            </div>

            {/* 关于 */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                {t('settings.about')}
              </p>
              <div className="text-[13px] font-semibold text-foreground">
                {t('settings.version', { version: __APP_VERSION__ })}
              </div>
              {updateInfo?.hasUpdate ? (
                <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-500">
                  {t('settings.hasUpdate', { version: updateInfo.latestVersion })}
                </p>
              ) : updateInfo?.hasUpdate === false && !updateInfo.error ? (
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.noUpdate')}</p>
              ) : updateInfo?.error ? (
                <p className="mt-1 text-xs text-destructive">{t('settings.updateError')}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.aboutHint')}</p>
              )}
              {updateInfo?.hasUpdate ? (
                <Button
                  size="sm"
                  onClick={handleOpenRelease}
                  className="no-drag mt-3 w-full cursor-pointer"
                >
                  {t('settings.downloadUpdate')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="no-drag mt-3 w-full cursor-pointer"
                >
                  <RefreshCw className={cn('h-4 w-4', checkingUpdate && 'animate-spin')} />
                  {checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function HealthItem({ on, title, status }: { on: boolean; title: string; status: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0">
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          on ? 'bg-green-500 ring-3 ring-green-500/20' : 'bg-muted-foreground/40',
        )}
      />
      <div>
        <div className="text-[12.5px] font-semibold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{status}</div>
      </div>
    </div>
  )
}
