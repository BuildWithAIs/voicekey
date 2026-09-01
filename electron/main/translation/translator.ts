import { clipboard, type NativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import type { LLMRefineConfig, TranslationConfig } from '../../shared/types'
import { configManager } from '../config-manager'
import { showOverlay, updateOverlay, hideOverlay } from '../window/overlay'
import { requestChatCompletion, extractMessageContent } from '../refine/openai-client'
import { buildRefineChatEndpoint, normalizeRefineBaseUrl } from '../../shared/refine-url'
import { buildTranslationSystemPrompt } from '../../shared/constants'
import {
  buildLLMAttributionHeaders,
  buildReasoningPayloadFields,
  getReasoningTimeoutMs,
  resolveLLMConnection,
  type ResolvedLLMConnection,
} from '../../shared/llm-config'
import { t } from '../i18n'
import { hyprlandIntegration } from '../platform/hyprland-integration'
import { sendNativeClipboardShortcut } from '../platform/native-keyboard'

type ClipboardSnapshot = {
  text?: string
  html?: string
  rtf?: string
  image?: NativeImage
}

const HOTKEY_RELEASE_DELAY_MS = 150
const CLIPBOARD_WRITE_DELAY_MS = 80
const SELECTION_COPY_DELAY_MS = 150
const GUI_PASTE_SETTLE_DELAY_MS = 500
const CLIPBOARD_SENTINEL_PREFIX = 'voice-key-translation-copy-sentinel'

interface ResolvedTranslationConfig {
  endpoint: string
  model: string
  apiKey: string
  connection: ResolvedLLMConnection
}

interface CaptureResult {
  originalText: string
  snapshot: ClipboardSnapshot
}

export class Translator {
  private readonly getRefineConfig: () => LLMRefineConfig
  private readonly getTranslationConfig: () => TranslationConfig
  private isTranslating = false

  constructor(deps: {
    getRefineConfig: () => LLMRefineConfig
    getTranslationConfig: () => TranslationConfig
  }) {
    this.getRefineConfig = deps.getRefineConfig
    this.getTranslationConfig = deps.getTranslationConfig
  }

  // ─── Public API ──────────────────────────────────────────

  async translate(): Promise<void> {
    if (this.isTranslating) {
      console.warn('[Translator] Translation already in progress, skipping')
      return
    }

    this.isTranslating = true
    let activeSnapshot: ClipboardSnapshot | null = null

    try {
      const translationConfig = this.getTranslationConfig()
      if (!translationConfig.enabled) {
        console.warn('[Translator] Translation is disabled, skipping')
        return
      }

      const resolved = this.resolveConfig(this.getRefineConfig())
      if (!resolved) {
        showOverlay({ status: 'error', message: t('hud.refineConfigIncomplete') })
        setTimeout(() => hideOverlay(), 2000)
        return
      }

      // Capture selected text from the foreground app
      const capture = await this.captureSelectedText()
      if (!capture) return

      const { originalText, snapshot } = capture
      activeSnapshot = snapshot

      // Wait for API response
      let translatedText: string
      try {
        translatedText = await this.requestTranslation(
          resolved,
          originalText,
          translationConfig.targetLanguage,
        )
      } catch {
        console.error('[Translator] Translation API call failed')
        updateOverlay({ status: 'error', message: t('hud.translationError') })
        this.restoreClipboardQuietly(activeSnapshot)
        activeSnapshot = null
        setTimeout(() => hideOverlay(), 3000)
        return
      }

      if (!translatedText) {
        console.error('[Translator] Translation returned empty text')
        updateOverlay({ status: 'error', message: t('hud.translationEmpty') })
        this.restoreClipboardQuietly(activeSnapshot)
        activeSnapshot = null
        setTimeout(() => hideOverlay(), 2000)
        return
      }

      console.log(`[Translator] Translation result length: ${translatedText.length}`)

      if (!(await this.confirmSelectionStillMatches(originalText))) {
        console.warn('[Translator] Selection changed or disappeared before paste')
        updateOverlay({ status: 'error', message: t('hud.noTextSelected') })
        this.restoreClipboardQuietly(activeSnapshot)
        activeSnapshot = null
        setTimeout(() => hideOverlay(), 2000)
        return
      }

      try {
        await this.replaceSelectionWithPlainText(translatedText, activeSnapshot)
      } finally {
        activeSnapshot = null
      }

      console.log('[Translator] Translation completed successfully')
      updateOverlay({ status: 'success', message: 'Translated' })
      setTimeout(() => hideOverlay(), 800)
    } catch (error) {
      console.error('[Translator] Unexpected translation failure:', error)
      updateOverlay({ status: 'error', message: t('hud.translationError') })
      this.restoreClipboardQuietly(activeSnapshot)
      setTimeout(() => hideOverlay(), 3000)
    } finally {
      this.isTranslating = false
    }
  }

  isConfigured(): boolean {
    const translationConfig = this.getTranslationConfig()
    if (!translationConfig.enabled) {
      return false
    }

    const refineConfig = this.getRefineConfig()
    return this.resolveConfig(refineConfig) !== null
  }

  // ─── Private: config ─────────────────────────────────────

  private resolveConfig(refineConfig: LLMRefineConfig): ResolvedTranslationConfig | null {
    const connection = resolveLLMConnection(refineConfig)
    const baseUrl = normalizeRefineBaseUrl(connection.endpoint)
    const endpoint = buildRefineChatEndpoint(baseUrl)
    const model = connection.model.trim()
    const apiKey = connection.apiKey.trim()

    if (!baseUrl || !endpoint || !model || !apiKey) {
      return null
    }

    return {
      endpoint,
      model,
      apiKey,
      connection: {
        ...connection,
        endpoint,
        model,
        apiKey,
      },
    }
  }

  // ─── Private: selected text capture ──────────────────────

  /** Save clipboard → Ctrl+C → read selected text. Returns null on failure. */
  private async captureSelectedText(): Promise<CaptureResult | null> {
    showOverlay({ status: 'processing', processingStage: 'translating' })

    const snapshot = this.captureClipboard()

    try {
      await this.delay(HOTKEY_RELEASE_DELAY_MS)
      const sentinel = this.writeClipboardSentinel()
      await this.delay(CLIPBOARD_WRITE_DELAY_MS)

      console.log('[Translator] Simulating Ctrl+C to copy selected text')
      await this.simulateCopy()
      await this.delay(SELECTION_COPY_DELAY_MS)

      const originalText = clipboard.readText()
      if (
        this.isClipboardSentinel(originalText, sentinel) ||
        !originalText ||
        originalText.trim().length === 0
      ) {
        console.warn('[Translator] No text selected')
        updateOverlay({ status: 'error', message: t('hud.noTextSelected') })
        this.restoreClipboardQuietly(snapshot)
        setTimeout(() => hideOverlay(), 2000)
        return null
      }

      console.log(`[Translator] Selected text length: ${originalText.length}`)
      return { originalText, snapshot }
    } catch (error) {
      this.restoreClipboardQuietly(snapshot)
      throw error
    }
  }

  // ─── Private: API ────────────────────────────────────────

  /**
   * Build the chat-completion payload and call the LLM.
   * Uses the built-in translation system prompt with the target language resolved in.
   */
  private async requestTranslation(
    resolved: ResolvedTranslationConfig,
    originalText: string,
    targetLanguage: string,
  ): Promise<string> {
    const systemPrompt = buildTranslationSystemPrompt(targetLanguage)

    const reasoning = buildReasoningPayloadFields(resolved.connection, originalText)
    const payload = {
      model: resolved.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: originalText },
      ],
      ...reasoning.fields,
    }

    console.log('[Translator] Calling LLM API for translation...')
    const response = await requestChatCompletion(
      resolved.endpoint,
      resolved.apiKey,
      payload,
      getReasoningTimeoutMs(reasoning.level),
      buildLLMAttributionHeaders(resolved.connection),
    )

    return extractMessageContent(response)
  }

  // ─── Private: clipboard helpers ──────────────────────────

  private captureClipboard(): ClipboardSnapshot {
    const snapshot: ClipboardSnapshot = {}

    try {
      const formats = clipboard.availableFormats()
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
    } catch (error) {
      console.warn('[Translator] Failed to capture clipboard:', error)
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
      console.warn('[Translator] Clipboard restore skipped: nothing captured')
      return
    }

    clipboard.write(data)
  }

  private restoreClipboardQuietly(snapshot: ClipboardSnapshot | null): void {
    if (snapshot) {
      try {
        this.restoreClipboard(snapshot)
      } catch (error) {
        console.warn('[Translator] Failed to restore clipboard:', error)
      }
    }
  }

  // ─── Private: keyboard simulation ────────────────────────

  private async confirmSelectionStillMatches(expectedText: string): Promise<boolean> {
    const sentinel = this.writeClipboardSentinel()
    await this.delay(CLIPBOARD_WRITE_DELAY_MS)

    await this.simulateCopy()
    await this.delay(SELECTION_COPY_DELAY_MS)

    const currentText = clipboard.readText()
    if (this.isClipboardSentinel(currentText, sentinel)) {
      return false
    }

    return this.normalizeClipboardText(currentText) === this.normalizeClipboardText(expectedText)
  }

  private async replaceSelectionWithPlainText(
    translatedText: string,
    snapshot: ClipboardSnapshot,
  ): Promise<void> {
    try {
      clipboard.clear()
      clipboard.write({ text: translatedText })
      await this.delay(CLIPBOARD_WRITE_DELAY_MS)

      console.log('[Translator] Simulating Ctrl+V to replace selected text with translation')
      await this.simulatePaste()
      await this.delay(GUI_PASTE_SETTLE_DELAY_MS)
    } finally {
      this.restoreClipboard(snapshot)
    }
  }

  private async simulateCopy(): Promise<void> {
    if (hyprlandIntegration.isActiveSession()) {
      await hyprlandIntegration.sendClipboardShortcut('copy')
      return
    }
    await sendNativeClipboardShortcut('copy')
  }

  private async simulatePaste(): Promise<void> {
    if (hyprlandIntegration.isActiveSession()) {
      await hyprlandIntegration.sendClipboardShortcut('paste')
      return
    }
    await sendNativeClipboardShortcut('paste')
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private writeClipboardSentinel(): string {
    const sentinel = `${CLIPBOARD_SENTINEL_PREFIX}:${randomUUID()}`
    clipboard.writeText(sentinel)
    return sentinel
  }

  private isClipboardSentinel(value: string, sentinel: string): boolean {
    return value === sentinel
  }

  private normalizeClipboardText(text: string): string {
    return text.replace(/\r\n?/g, '\n')
  }
}

export const translator = new Translator({
  getRefineConfig: () => configManager.getLLMRefineConfig(),
  getTranslationConfig: () => configManager.getTranslationConfig(),
})
