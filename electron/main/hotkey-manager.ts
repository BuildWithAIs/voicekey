import { globalShortcut } from 'electron'

export type HotkeyCallback = () => void

export class HotkeyManager {
  private registered: Map<string, HotkeyCallback> = new Map()

  // 注册快捷键
  register(accelerator: string, callback: HotkeyCallback): boolean {
    if (this.registered.has(accelerator)) {
      console.warn(`Hotkey ${accelerator} already registered`)
      return false
    }

    try {
      const success = globalShortcut.register(accelerator, callback)
      if (success) {
        this.registered.set(accelerator, callback)
        console.log(`Hotkey registered: ${accelerator}`)
      } else {
        console.error(`Failed to register hotkey: ${accelerator}`)
      }
      return success
    } catch (error) {
      console.error(`Error registering hotkey ${accelerator}:`, error)
      return false
    }
  }

  // 注销快捷键
  unregister(accelerator: string): void {
    if (!this.registered.has(accelerator)) {
      return
    }

    globalShortcut.unregister(accelerator)
    this.registered.delete(accelerator)
    console.log(`Hotkey unregistered: ${accelerator}`)
  }

  // 注销所有快捷键
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registered.clear()
    console.log('All hotkeys unregistered')
  }

  // 检查快捷键是否已注册
  isRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator)
  }

  // 获取所有已注册的快捷键
  getRegistered(): string[] {
    return Array.from(this.registered.keys())
  }
}

export const hotkeyManager = new HotkeyManager()
