/**
 * 配置相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - CONFIG_GET: 获取全部配置
 * - CONFIG_SET: 设置配置（支持 app/asr/llmRefine/hotkey/translation 部分更新）
 * - CONFIG_SECRET_GET: 仅向设置窗口返回指定的已保存 API Key 原文
 * - CONFIG_REFINE_TEST: 校验文本润色连接
 * - LOCAL_ASR_STATUS / LOCAL_ASR_DOWNLOAD: 本地 ASR 模型状态与下载
 *
 * @module electron/main/ipc/config-handlers
 */

import { ipcMain, type BrowserWindow } from 'electron'
import {
  IPC_CHANNELS,
  type AppPreferences,
  type ASRConfig,
  type ConfigSecretRequest,
  type HotkeyConfig,
  type LLMRefineConfig,
  type TranslationConfig,
} from '../../shared/types'
import { normalizeLLMRefineConfig } from '../../shared/llm-config'
import { getCurrentSession } from '../audio'
import { configManager } from '../config-manager'
import { broadcastLanguageSnapshot, getMainLanguageSnapshot, setMainLanguage } from '../i18n'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'
import { downloadLocalASRAssets, getLocalASRStatus, releaseLocalASR } from '../local-asr-manager'
import {
  downloadStreamingASRAssets,
  getStreamingASRStatus,
  releaseStreamingASR,
  warmStreamingASR,
} from '../streaming-asr-manager'
import type { TextRefiner } from '../refine'

/**
 * 配置处理器外部依赖
 * 这些函数/变量定义在 main.ts 中，需要通过依赖注入传入
 */
export type ConfigHandlersDeps = {
  /** 更新开机自启状态 */
  updateAutoLaunchState: (enable: boolean) => void
  /** 刷新本地化 UI（托盘菜单、窗口标题等） */
  refreshLocalizedUi: () => void
  /** 重新注册全局快捷键 */
  registerGlobalHotkeys: () => void
  /** 获取文本润色服务 */
  getRefineService: () => TextRefiner | null
  /** 获取设置窗口；只有该窗口可以请求显示已保存的明文密钥 */
  getSettingsWindow: () => BrowserWindow | null
}

let deps: ConfigHandlersDeps

// IPC 载荷可能来自被破坏的渲染进程，先做廉价的形状校验
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isConfigSecretRequest(value: unknown): value is ConfigSecretRequest {
  if (!isPlainObject(value)) return false

  if (value.scope === 'llm-refine') {
    return (
      value.provider === 'openai' ||
      value.provider === 'deepseek' ||
      value.provider === 'openrouter' ||
      value.provider === 'custom-compatible'
    )
  }

  return false
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

  ipcMain.handle(IPC_CHANNELS.CONFIG_SECRET_GET, (event, request: unknown) => {
    const settingsWindow = deps.getSettingsWindow()
    if (!settingsWindow || settingsWindow.webContents !== event.sender) {
      throw new Error('Saved API keys can only be revealed from the settings window')
    }
    if (!isConfigSecretRequest(request)) {
      throw new Error('Invalid saved API key request')
    }

    return configManager.getConfigSecret(request)
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
        const wasStreamingEnabled = configManager.getASRConfig().streamingEnabled ?? false
        configManager.setASRConfig(config.asr)
        const streamingEnabled = configManager.getASRConfig().streamingEnabled ?? false
        if (wasStreamingEnabled !== streamingEnabled) {
          if (getCurrentSession()) {
            console.warn(
              '[ASR] Recognition mode changed during an active session; current worker will follow its normal idle lifecycle',
            )
          } else if (streamingEnabled) {
            await releaseLocalASR()
            if (getStreamingASRStatus().ready) {
              void warmStreamingASR().catch((error: unknown) => {
                console.error(
                  '[ASR:Streaming] Failed to warm recognizer after enabling realtime mode:',
                  error instanceof Error ? error.message : error,
                )
              })
            }
          } else {
            await releaseStreamingASR()
          }
        }
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

  ipcMain.handle(IPC_CHANNELS.LOCAL_ASR_STATUS, () => {
    return getLocalASRStatus()
  })

  ipcMain.handle(IPC_CHANNELS.LOCAL_ASR_DOWNLOAD, async (event) => {
    return await downloadLocalASRAssets((progress) => {
      event.sender.send(IPC_CHANNELS.LOCAL_ASR_DOWNLOAD_PROGRESS, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.STREAMING_ASR_STATUS, () => {
    return getStreamingASRStatus()
  })

  ipcMain.handle(IPC_CHANNELS.STREAMING_ASR_DOWNLOAD, async (event) => {
    const status = await downloadStreamingASRAssets((progress) => {
      event.sender.send(IPC_CHANNELS.STREAMING_ASR_DOWNLOAD_PROGRESS, progress)
    })
    if (status.ready && configManager.getASRConfig().streamingEnabled) {
      void warmStreamingASR().catch((error: unknown) => {
        console.error(
          '[ASR:Streaming] Failed to warm recognizer after downloading realtime models:',
          error instanceof Error ? error.message : error,
        )
      })
    }
    return status
  })
}
