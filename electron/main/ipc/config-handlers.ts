/**
 * 配置相关 IPC 处理器
 *
 * 负责处理以下 IPC 通道：
 * - CONFIG_GET: 获取全部配置
 * - CONFIG_SET: 设置配置（支持部分更新）
 * - CONFIG_TEST: 测试 ASR 连接
 *
 * @module electron/main/ipc/config-handlers
 */

import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type AppPreferences,
  type ASRConfig,
  type HotkeyConfig,
} from '../../shared/types'
import { configManager } from '../config-manager'
import { setMainLanguage } from '../i18n'
import { ASRProvider } from '../asr-provider'
import { hotkeyManager } from '../hotkey-manager'
import { ioHookManager } from '../iohook-manager'

/**
 * 配置处理器外部依赖
 * 这些函数/变量定义在 main.ts 中，需要通过依赖注入传入
 */
export type ConfigHandlersDeps = {
  /** 更新开机自启状态 */
  updateAutoLaunchState: (enable: boolean) => void
  /** 刷新本地化 UI（托盘菜单、窗口标题等） */
  refreshLocalizedUi: () => void
  /** 重新初始化 ASR Provider */
  initializeASRProvider: () => void
  /** 重新注册全局快捷键 */
  registerGlobalHotkeys: () => void
  /** 获取当前 ASR Provider 实例 */
  getAsrProvider: () => ASRProvider | null
}

let deps: ConfigHandlersDeps

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

  // CONFIG_SET: 设置配置（支持部分更新）
  ipcMain.handle(
    IPC_CHANNELS.CONFIG_SET,
    async (
      _event,
      config: {
        app?: Partial<AppPreferences>
        asr?: Partial<ASRConfig>
        hotkey?: Partial<HotkeyConfig>
      },
    ) => {
      if (config.app) {
        configManager.setAppConfig(config.app)
        if (typeof config.app.autoLaunch === 'boolean') {
          deps.updateAutoLaunchState(config.app.autoLaunch)
        }
        if (config.app.language) {
          await setMainLanguage(config.app.language)
        }
        deps.refreshLocalizedUi()
      }
      if (config.asr) {
        configManager.setASRConfig(config.asr)
        deps.initializeASRProvider()
      }
      if (config.hotkey) {
        configManager.setHotkeyConfig(config.hotkey)
        // 重新注册快捷键：先清除所有监听器
        hotkeyManager.unregisterAll()
        ioHookManager.removeAllListeners('keydown')
        ioHookManager.removeAllListeners('keyup')
        deps.registerGlobalHotkeys()
        console.log('[IPC:Config] Hotkeys re-registered with new config:', config.hotkey)
      }
    },
  )

  // CONFIG_TEST: 测试 ASR 连接
  ipcMain.handle(IPC_CHANNELS.CONFIG_TEST, async (_event, config?: ASRConfig) => {
    if (config) {
      const tempProvider = new ASRProvider(config)
      return await tempProvider.testConnection()
    }
    const asrProvider = deps.getAsrProvider()
    if (!asrProvider) {
      return false
    }
    return await asrProvider.testConnection()
  })
}
