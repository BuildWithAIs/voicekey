import { clipboard, type NativeImage } from 'electron'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { createHash } from 'node:crypto'

type ClipboardSnapshot = {
  text?: string
  html?: string
  rtf?: string
  image?: NativeImage
}

export class TextInjector {
  constructor() {
    keyboard.config.autoDelayMs = 0
  }

  async injectText(text: string): Promise<void> {
    const injectStartTime = Date.now()
    if (!text || text.trim().length === 0) {
      console.warn('[TextInjector] Empty text, skipping injection')
      return
    }

    try {
      const textHash = createHash('sha256').update(text, 'utf8').digest('hex')
      console.log('[TextInjector] Text length:', text.length)
      console.log('[TextInjector] Text hash (sha256):', textHash)

      const delayStartTime = Date.now()
      await this.delay(100)
      const delayDuration = Date.now() - delayStartTime
      console.log(`[TextInjector] ⏱️  Pre-injection delay took ${delayDuration}ms`)

      const typingStartTime = Date.now()
      console.log(`[TextInjector] [${new Date().toISOString()}] Starting text injection...`)
      await this.typeText(text)
      const typingDuration = Date.now() - typingStartTime
      console.log(`[TextInjector] [${new Date().toISOString()}] Text injection completed`)
      console.log(`[TextInjector] ⏱️  Keyboard typing took ${typingDuration}ms`)

      const totalDuration = Date.now() - injectStartTime
      console.log(`[TextInjector] ⏱️  Total injectText() took ${totalDuration}ms`)
      console.log('[TextInjector] Text injected successfully')
    } catch (error) {
      const errorDuration = Date.now() - injectStartTime
      console.error(`[TextInjector] Failed to inject text after ${errorDuration}ms:`, error)
      throw new Error(
        `Text injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // 检查是否有必要的权限（主要针对macOS）
  async checkPermissions(): Promise<{ hasPermission: boolean; message?: string }> {
    if (process.platform === 'darwin') {
      // macOS需要辅助功能权限
      // nut.js会在第一次使用时自动请求权限
      try {
        // 尝试一个简单的操作来检查权限
        await keyboard.type('')
        return { hasPermission: true }
      } catch (error) {
        console.log({ error })
        return {
          hasPermission: false,
          message:
            'macOS requires Accessibility permissions. Please go to System Preferences > Security & Privacy > Privacy > Accessibility and enable Voice Key.',
        }
      }
    }

    // Windows和Linux通常不需要特殊权限
    return { hasPermission: true }
  }

  // 模拟按键（用于特殊按键，如Enter、Tab等）
  async pressKey(key: Key): Promise<void> {
    try {
      await keyboard.pressKey(key)
      await keyboard.releaseKey(key)
    } catch (error) {
      console.error('Failed to press key:', error)
      throw error
    }
  }

  private async typeText(text: string): Promise<void> {
    if (process.platform === 'win32') {
      await this.pasteFromClipboard(text)
      return
    }
    await keyboard.type(text)
  }

  private captureClipboard(): ClipboardSnapshot {
    const formats = clipboard.availableFormats()
    const snapshot: ClipboardSnapshot = {}

    if (formats.includes('text/plain')) {
      snapshot.text = clipboard.readText()
    }
    if (formats.includes('text/html')) {
      snapshot.html = clipboard.readHTML()
    }
    if (formats.includes('text/rtf')) {
      snapshot.rtf = clipboard.readRTF()
    }
    if (formats.some((format) => format.startsWith('image/'))) {
      const image = clipboard.readImage()
      if (!image.isEmpty()) {
        snapshot.image = image
      }
    }

    return snapshot
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): void {
    const data: Electron.Data = {}
    if (snapshot.text !== undefined) {
      data.text = snapshot.text
    }
    if (snapshot.html !== undefined) {
      data.html = snapshot.html
    }
    if (snapshot.rtf !== undefined) {
      data.rtf = snapshot.rtf
    }
    if (snapshot.image && !snapshot.image.isEmpty()) {
      data.image = snapshot.image
    }

    if (Object.keys(data).length === 0) {
      console.warn('[TextInjector] Clipboard restore skipped: no standard formats captured')
      return
    }

    clipboard.write(data)
  }

  private async pasteFromClipboard(text: string): Promise<void> {
    const snapshot = this.captureClipboard()
    try {
      clipboard.writeText(text)
      await this.delay(50)
      await keyboard.pressKey(Key.LeftControl, Key.V)
      await keyboard.releaseKey(Key.LeftControl, Key.V)
      await this.delay(50)
    } finally {
      this.restoreClipboard(snapshot)
    }
  }

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

const injectorInstance = new TextInjector()
export const textInjector = injectorInstance
