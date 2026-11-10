import { clipboard, type NativeImage } from 'electron'
import type { Key } from '@nut-tree-fork/nut-js'
import { createHash } from 'node:crypto'
import { hyprlandIntegration } from './platform/hyprland-integration'
import {
  pressNativeKey,
  probeNativeKeyboard,
  sendNativeClipboardShortcut,
  typeWithNativeKeyboard,
} from './platform/native-keyboard'

type ClipboardSnapshot = {
  text?: string
  html?: string
  rtf?: string
  image?: NativeImage
}

export type InjectionMethod = 'typed' | 'pasted'

export interface InjectionOptions {
  /**
   * Writes the transcript back to the clipboard after injection. Used when the text may never
   * reach a text field (no focused input, or a paste the target application ignores): the user can
   * still paste it by hand instead of dictating again.
   */
  keepInClipboard?: boolean
}

export interface InjectionOutcome {
  method: InjectionMethod
  clipboard: 'untouched' | 'kept'
}

export class TextInjector {
  async injectText(text: string, options: InjectionOptions = {}): Promise<InjectionOutcome> {
    const injectStartTime = Date.now()
    if (!text || text.trim().length === 0) {
      console.warn('[TextInjector] Empty text, skipping injection')
      return { method: 'typed', clipboard: 'untouched' }
    }

    const keepInClipboard = options.keepInClipboard === true

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
      const { method, clipboardKept } = await this.typeText(text, keepInClipboard)
      const typingDuration = Date.now() - typingStartTime
      console.log(`[TextInjector] [${new Date().toISOString()}] Text injection completed`)
      console.log(`[TextInjector] ⏱️  Keyboard typing took ${typingDuration}ms`)

      const totalDuration = Date.now() - injectStartTime
      console.log(`[TextInjector] ⏱️  Total injectText() took ${totalDuration}ms`)
      console.log('[TextInjector] Text injected successfully')
      return { method, clipboard: clipboardKept ? 'kept' : 'untouched' }
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
        await probeNativeKeyboard()
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
      await pressNativeKey(key)
    } catch (error) {
      console.error('Failed to press key:', error)
      throw error
    }
  }

  private async typeText(
    text: string,
    keepInClipboard: boolean,
  ): Promise<{ method: InjectionMethod; clipboardKept: boolean }> {
    if (this.shouldPasteFromClipboard(text)) {
      return {
        method: 'pasted',
        clipboardKept: await this.pasteFromClipboard(text, keepInClipboard),
      }
    }
    await typeWithNativeKeyboard(text)
    // The typing path never touches the clipboard, so the transcript has to be written explicitly.
    return { method: 'typed', clipboardKept: keepInClipboard && this.keepOnClipboard(text) }
  }

  private shouldPasteFromClipboard(text: string): boolean {
    if (process.platform === 'win32') {
      return true
    }

    if (hyprlandIntegration.isActiveSession()) {
      return true
    }

    return process.platform === 'darwin' && this.hasLineBreaks(text)
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

  // A failed restore must not be reported as a failed injection: the text already reached the
  // target application, and the caller uses the outcome to decide what the HUD says.
  private tryRestoreClipboard(snapshot: ClipboardSnapshot): void {
    try {
      this.restoreClipboard(snapshot)
    } catch (error) {
      console.error('[TextInjector] Failed to restore clipboard:', error)
    }
  }

  private keepOnClipboard(text: string): boolean {
    try {
      clipboard.writeText(text)
      return true
    } catch (error) {
      console.error('[TextInjector] Failed to keep transcript on clipboard:', error)
      return false
    }
  }

  private async pasteFromClipboard(text: string, keepInClipboard: boolean): Promise<boolean> {
    const snapshot = this.captureClipboard()
    let clipboardKept = false
    try {
      if (hyprlandIntegration.isActiveSession()) {
        await hyprlandIntegration.pasteClipboardText(text)
      } else {
        clipboard.writeText(text)
        await this.delay(50)
        await sendNativeClipboardShortcut('paste')
        await this.delay(50)
      }
    } finally {
      this.tryRestoreClipboard(snapshot)
      // Written after the restore so the transcript survives whatever happened to the paste.
      if (keepInClipboard) clipboardKept = this.keepOnClipboard(text)
    }
    return clipboardKept
  }

  private hasLineBreaks(text: string): boolean {
    return /[\r\n]/u.test(text)
  }

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

const injectorInstance = new TextInjector()
export const textInjector = injectorInstance
