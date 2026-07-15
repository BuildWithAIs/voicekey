/**
 * 配置相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - CONFIG_GET: 获取全部配置
 * - CONFIG_SET: 设置配置（支持 app/asr/llmRefine/hotkey/translation 部分更新）
 * - CONFIG_TEST: 校验 ASR 连接
 * - CONFIG_REFINE_TEST: 校验文本润色连接
 * - LOCAL_ASR_STATUS / LOCAL_ASR_DOWNLOAD: 本地 ASR 模型状态与下载
 *
 * @module electron/main/ipc/config-handlers
 */

import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type AppPreferences,
  type ASRConfig,
  type HotkeyConfig,
  type LLMRefineConfig,
  type TranslationConfig,
} from '../../shared/types'
import { normalizeLLMRefineConfig } from '../../shared/llm-config'
import { configManager } from '../config-manager'
import { broadcastLanguageSnapshot, getMainLanguageSnapshot, setMainLanguage } from '../i18n'
import { ASRProvider } from '../asr-provider'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'
import { downloadLocalASRAssets, getLocalASRStatus } from '../local-asr-manager'
import type { TextRefiner } from '../refine'
import { checkOpenRouterModel } from '../refine/openrouter-models'

/**
 * 配置处理器外部依赖
 * 这些函数/变量定义在 main.ts 中，需要通过依赖注入传入
 */
export type ConfigHandlersDeps = {
  /** 更新开机自启状态 */
  updateAutoLaunchState: (enable: boolean) => void
  /** 刷新本地化 UI（托盘菜单、窗口标题等） */
  refreshLocalizedUi: () => void
  /** 使当前 ASR Provider 失效，下次真正识别时再延迟初始化 */
  invalidateASRProvider: () => void
  /** 重新注册全局快捷键 */
  registerGlobalHotkeys: () => void
  /** 获取当前 ASR Provider 实例 */
  getAsrProvider: () => ASRProvider | null
  /** 获取文本润色服务 */
  getRefineService: () => TextRefiner | null
}

let deps: ConfigHandlersDeps

// IPC 载荷可能来自被破坏的渲染进程，先做廉价的形状校验
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 初始化配置处理器依赖
 * 必须在 registerConfigHandlers 之前调用
 */
export function initConfigHandlers(dependencies: ConfigHandlersDeps): void {
  deps = dependencies
}

/**
 * 注册配置相关 IPC 处理器
 */
export function registerConfigHandlers(): void {
  // CONFIG_GET: 获取全部配置
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return configManager.getConfig()
  })

  // APP_LANGUAGE_GET: 获取语言快照
  ipcMain.handle(IPC_CHANNELS.APP_LANGUAGE_GET, () => {
    return getMainLanguageSnapshot()
  })

  // CONFIG_SET: 设置配置（支持部分更新）
  ipcMain.handle(
    IPC_CHANNELS.CONFIG_SET,
    async (
      _event,
      config: {
        app?: Partial<AppPreferences>
        asr?: Partial<ASRConfig>
        llmRefine?: Partial<LLMRefineConfig>
        hotkey?: Partial<HotkeyConfig>
        translation?: Partial<TranslationConfig>
      },
    ) => {
      if (!isPlainObject(config)) {
        console.error('[IPC:Config] Ignoring malformed CONFIG_SET payload')
        return
      }

      let shouldReregisterHotkeys = false

      if (isPlainObject(config.app)) {
        configManager.setAppConfig(config.app)
        if (typeof config.app.autoLaunch === 'boolean') {
          deps.updateAutoLaunchState(config.app.autoLaunch)
        }
        if (typeof config.app.language === 'string' && config.app.language) {
          await setMainLanguage(config.app.language)
          broadcastLanguageSnapshot()
        }
        deps.refreshLocalizedUi()
      }
      if (isPlainObject(config.asr)) {
        configManager.setASRConfig(config.asr)
        deps.invalidateASRProvider()
      }
      if (isPlainObject(config.llmRefine)) {
        const wasRefineEnabled = configManager.isLLMRefineEnabled()
        configManager.setLLMRefineConfig(config.llmRefine)
        if (!wasRefineEnabled && configManager.isLLMRefineEnabled()) {
          const refineService = deps.getRefineService()
          void refineService?.refreshRemoteGlossary()
        }
      }
      if (isPlainObject(config.hotkey)) {
        configManager.setHotkeyConfig(config.hotkey)
        shouldReregisterHotkeys = true
      }
      if (isPlainObject(config.translation)) {
        const previousTranslationConfig = configManager.getTranslationConfig()
        configManager.setTranslationConfig(config.translation)
        const nextTranslationConfig = configManager.getTranslationConfig()
        if (previousTranslationConfig.enabled !== nextTranslationConfig.enabled) {
          shouldReregisterHotkeys = true
        }
      }
      if (shouldReregisterHotkeys) {
        // 重新注册快捷键：先清除所有监听器
        hotkeyManager.unregisterAll()
        ioHookManager.removeAllListeners('keydown')
        ioHookManager.removeAllListeners('keyup')
        deps.registerGlobalHotkeys()
        console.log('[IPC:Config] Hotkeys re-registered after config update')
      }
    },
  )

  // CONFIG_TEST: 校验 ASR 连接
  ipcMain.handle(IPC_CHANNELS.CONFIG_TEST, async (_event, config?: ASRConfig) => {
    if (config !== undefined && !isPlainObject(config)) {
      return false
    }
    if (config) {
      const tempProvider = new ASRProvider(configManager.resolveASRConfig(config))
      return await tempProvider.testConnection()
    }
    const asrProvider = deps.getAsrProvider()
    if (!asrProvider) {
      return false
    }
    return await asrProvider.testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_REFINE_TEST, async (_event, config: LLMRefineConfig) => {
    const refineService = deps.getRefineService()
    if (!refineService) {
      return {
        ok: false,
        message: 'Text refinement service is unavailable',
      }
    }

    if (!isPlainObject(config)) {
      return {
        ok: false,
        message: 'Text refinement config is required',
      }
    }

    return await refineService.testConnection(
      configManager.resolveLLMRefineConfig(normalizeLLMRefineConfig(config)),
    )
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_OPENROUTER_MODEL_CHECK, async (_event, model: unknown) => {
    if (typeof model !== 'string') {
      return {
        ok: false,
        message: 'OpenRouter model is required',
      }
    }

    return await checkOpenRouterModel(model)
  })

  ipcMain.handle(IPC_CHANNELS.LOCAL_ASR_STATUS, () => {
    return getLocalASRStatus()
  })

  ipcMain.handle(IPC_CHANNELS.LOCAL_ASR_DOWNLOAD, async (event) => {
    return await downloadLocalASRAssets((progress) => {
      event.sender.send(IPC_CHANNELS.LOCAL_ASR_DOWNLOAD_PROGRESS, progress)
    })
  })
}
