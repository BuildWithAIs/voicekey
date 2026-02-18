import Store from 'electron-store'
import { AppConfig, AppPreferences, ASRConfig, HotkeyConfig, LLMConfig } from '../shared/types'
import { DEFAULT_HOTKEYS, GLM_LLM } from '../shared/constants'

// 配置Schema
interface ConfigSchema {
  app: AppPreferences
  asr: ASRConfig
  llm: LLMConfig
  hotkey: HotkeyConfig
}

// 默认配置
const defaultConfig: AppConfig = {
  app: {
    language: 'system',
    autoLaunch: false,
  },
  asr: {
    provider: 'glm',
    region: 'cn',
    apiKeys: {
      cn: '',
      intl: '',
    },
    // apiKey: '',  // Deprecated, removed from default
    endpoint: '',
    language: 'auto',
  },
  llm: {
    enabled: true,  // 默认开启润色功能
    useASRKey: true,  // 默认使用 ASR 相同的 API Key
    apiKeys: {
      cn: '',
      intl: '',
    },
    model: GLM_LLM.DEFAULT_MODEL,
    endpoint: '',
  },
  hotkey: {
    pttKey: DEFAULT_HOTKEYS.PTT,
    toggleSettings: DEFAULT_HOTKEYS.SETTINGS,
  },
}

// 配置管理器
export class ConfigManager {
  private store: Store<ConfigSchema>

  constructor() {
    this.store = new Store<ConfigSchema>({
      defaults: defaultConfig,
      name: 'voice-key-config',
    })
    this.migrate()
  }

  // 迁移旧配置
  private migrate(): void {
    // 检查是否有旧的 apiKey，如果有且 cn key 为空，则迁移
    // 使用 any 绕过类型检查，因为 we want to check raw store content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asrConfig = this.store.get('asr') as any
    if (asrConfig && asrConfig.apiKey) {
      const currentApiKeys = this.store.get('asr.apiKeys', { cn: '', intl: '' })
      if (!currentApiKeys.cn) {
        this.store.set('asr.apiKeys.cn', asrConfig.apiKey)
        this.store.delete('asr.apiKey' as any) // 迁移后删除旧字段
      }
    }

    // 迁移 LLM 配置：确保 llm 配置存在且有默认值
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawConfig = this.store.store as any
    if (!rawConfig.llm) {
      this.store.set('llm', defaultConfig.llm)
    } else {
      // 确保 LLM 配置字段完整
      const llmConfig = this.getLLMConfig()
      if (typeof llmConfig.enabled !== 'boolean') {
        this.store.set('llm.enabled', defaultConfig.llm.enabled)
      }
      if (typeof llmConfig.useASRKey !== 'boolean') {
        this.store.set('llm.useASRKey', defaultConfig.llm.useASRKey)
      }
      if (!llmConfig.apiKeys) {
        this.store.set('llm.apiKeys', defaultConfig.llm.apiKeys)
      }
      if (!llmConfig.model) {
        this.store.set('llm.model', defaultConfig.llm.model)
      }
    }
  }

  // 获取完整配置
  getConfig(): AppConfig {
    return {
      app: this.getAppConfig(),
      asr: this.getASRConfig(),
      llm: this.getLLMConfig(),
      hotkey: this.getHotkeyConfig(),
    }
  }

  // 获取 App 配置
  getAppConfig(): AppPreferences {
    return this.store.get('app', defaultConfig.app)
  }

  // 设置 App 配置
  setAppConfig(config: Partial<AppPreferences>): void {
    const current = this.getAppConfig()
    this.store.set('app', { ...current, ...config })
  }

  // 获取ASR配置
  getASRConfig(): ASRConfig {
    const config = this.store.get('asr', defaultConfig.asr)
    // 确保 apiKeys 存在 (防止旧的部分配置覆盖)
    if (!config.apiKeys) {
      config.apiKeys = { cn: '', intl: '' }
    }
    // 确保 region 存在
    if (!config.region) {
      config.region = 'cn'
    }
    return config
  }

  // 设置ASR配置
  setASRConfig(config: Partial<ASRConfig>): void {
    const current = this.getASRConfig()
    this.store.set('asr', { ...current, ...config })
  }

  // 获取LLM配置
  getLLMConfig(): LLMConfig {
    const config = this.store.get('llm', defaultConfig.llm)
    // 确保所有字段存在 (防止旧的部分配置覆盖)
    return {
      enabled: config.enabled ?? defaultConfig.llm.enabled,
      useASRKey: config.useASRKey ?? defaultConfig.llm.useASRKey,
      apiKeys: config.apiKeys ?? defaultConfig.llm.apiKeys,
      model: config.model || defaultConfig.llm.model,
      endpoint: config.endpoint ?? '',
    }
  }

  // 设置LLM配置
  setLLMConfig(config: Partial<LLMConfig>): void {
    const current = this.getLLMConfig()
    this.store.set('llm', { ...current, ...config })
  }

  // 获取快捷键配置
  getHotkeyConfig(): HotkeyConfig {
    return this.store.get('hotkey', defaultConfig.hotkey)
  }

  // 设置快捷键配置
  setHotkeyConfig(config: Partial<HotkeyConfig>): void {
    const current = this.getHotkeyConfig()
    this.store.set('hotkey', { ...current, ...config })
  }

  // 重置为默认配置
  reset(): void {
    this.store.clear()
  }

  // 检查配置是否有效
  isValid(): boolean {
    const asr = this.getASRConfig()
    const region = asr.region || 'cn'
    const key = asr.apiKeys?.[region]
    return !!key && key.length > 0
  }
}

// 导出单例
export const configManager = new ConfigManager()
