import Store from 'electron-store'
import { AppConfig, AppPreferences, ASRConfig, HotkeyConfig } from '../shared/types'
import { DEFAULT_HOTKEYS } from '../shared/constants'

// 配置Schema
interface ConfigSchema {
  app: AppPreferences
  asr: ASRConfig
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
    groqApiKey: '',
    // apiKey: '',  // Deprecated, removed from default
    endpoint: '',
    language: 'auto',
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
  }

  // 获取完整配置
  getConfig(): AppConfig {
    return {
      app: this.getAppConfig(),
      asr: this.getASRConfig(),
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
    if (config.provider !== 'glm' && config.provider !== 'groq') {
      config.provider = 'glm'
    }
    // 确保 apiKeys 存在 (防止旧的部分配置覆盖)
    if (!config.apiKeys) {
      config.apiKeys = { cn: '', intl: '' }
    }
    // 确保 region 存在
    if (!config.region) {
      config.region = 'cn'
    }
    if (typeof config.groqApiKey !== 'string') {
      config.groqApiKey = ''
    }
    return config
  }

  // 设置ASR配置
  setASRConfig(config: Partial<ASRConfig>): void {
    const current = this.getASRConfig()
    this.store.set('asr', { ...current, ...config })
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
    if (asr.provider === 'groq') {
      return !!asr.groqApiKey && asr.groqApiKey.length > 0
    }
    const region = asr.region || 'cn'
    const key = asr.apiKeys?.[region]
    return !!key && key.length > 0
  }
}

// 导出单例
export const configManager = new ConfigManager()
