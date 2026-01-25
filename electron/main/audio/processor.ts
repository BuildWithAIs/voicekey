/**
 * 音频数据处理流水线
 *
 * 负责：
 * - 接收渲染进程发来的音频数据
 * - 转换格式（WebM → MP3）
 * - 调用 ASR 进行语音转写
 * - 注入转写文本到活跃窗口
 * - 保存历史记录
 *
 * @module electron/main/audio/processor
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'node:path'
import { updateOverlay, hideOverlay } from '../window/overlay'
import { t } from '../i18n'
import { historyManager } from '../history-manager'
import { textInjector } from '../text-injector'
import { convertToMP3 } from './converter'
import { getCurrentSession, updateSession, clearSession } from './session-manager'
import type { ASRProvider } from '../asr-provider'

/**
 * 处理器外部依赖
 * ASR Provider 需要通过依赖注入传入
 */
type ProcessorDeps = {
  /** 获取 ASR Provider 实例 */
  getAsrProvider: () => ASRProvider | null
  /** 初始化 ASR Provider */
  initializeASRProvider: () => void
}

let deps: ProcessorDeps

/**
 * 初始化处理器依赖
 * 必须在 handleAudioData 之前调用
 */
export function initProcessor(dependencies: ProcessorDeps): void {
  deps = dependencies
  console.log('[Audio:Processor] Initialized')
}

/**
 * 处理音频数据（核心处理流水线）
 *
 * 流程：
 * 1. 保存 WebM 音频到临时文件
 * 2. 转换为 MP3 格式
 * 3. 调用 ASR 服务进行转写
 * 4. 保存到历史记录
 * 5. 注入文本到活跃窗口
 * 6. 清理临时文件
 *
 * @param buffer - 音频数据 Buffer
 */
export async function handleAudioData(buffer: Buffer): Promise<void> {
  const session = getCurrentSession()
  if (!session) {
    console.log('[Audio:Processor] Received audio data but no active session')
    return
  }

  const overallStartTime = Date.now()
  const timestamp = Date.now()
  const tempWebmPath = path.join(app.getPath('temp'), `voice-key-${timestamp}.webm`)
  const tempMp3Path = path.join(app.getPath('temp'), `voice-key-${timestamp}.mp3`)

  try {
    console.log(`[Audio:Processor] Received audio data: ${buffer.length} bytes`)

    // Step 1: 保存 WebM 文件
    const saveStartTime = Date.now()
    console.log(`[Audio:Processor] Saving WebM to: ${tempWebmPath}`)
    fs.writeFileSync(tempWebmPath, buffer)
    const saveDuration = Date.now() - saveStartTime
    console.log(`[Audio:Processor] ⏱️ File save: ${saveDuration}ms`)

    // Step 2: 转换为 MP3
    const conversionStartTime = Date.now()
    await convertToMP3(tempWebmPath, tempMp3Path)
    const conversionDuration = Date.now() - conversionStartTime

    // 检查取消
    if (!getCurrentSession()) {
      console.log('[Audio:Processor] Session cancelled during conversion, aborting')
      cleanupTempFiles(tempWebmPath, tempMp3Path)
      return
    }

    // Step 3: ASR 转写
    let asrProvider = deps.getAsrProvider()
    if (!asrProvider) {
      console.log('[Audio:Processor] Initializing ASR provider...')
      const initStartTime = Date.now()
      deps.initializeASRProvider()
      asrProvider = deps.getAsrProvider()
      if (!asrProvider) {
        throw new Error('ASR Provider initialization failed')
      }
      console.log(`[Audio:Processor] ⏱️ ASR init: ${Date.now() - initStartTime}ms`)
    }

    const asrStartTime = Date.now()
    console.log('[Audio:Processor] Sending audio to ASR service...')
    const transcription = await asrProvider.transcribe(tempMp3Path)
    const asrDuration = Date.now() - asrStartTime
    console.log(`[Audio:Processor] ⏱️ ASR transcription: ${asrDuration}ms`)
    console.log(`[Audio:Processor] Transcription received (length): ${transcription.text.length}`)

    // 检查取消
    if (!getCurrentSession()) {
      console.log('[Audio:Processor] Session cancelled during transcription, aborting')
      cleanupTempFiles(tempWebmPath, tempMp3Path)
      return
    }

    // Step 4: 更新会话状态
    updateSession({
      transcription: transcription.text,
      status: 'completed',
    })

    // Step 5: 保存历史记录
    historyManager.add({
      text: transcription.text,
      duration: getCurrentSession()?.duration,
    })

    // 检查取消（注入前最后一次检查）
    if (!getCurrentSession()) {
      console.log('[Audio:Processor] Session cancelled before injection, aborting')
      cleanupTempFiles(tempWebmPath, tempMp3Path)
      return
    }

    // Step 6: 注入文本
    const injectStartTime = Date.now()
    console.log('[Audio:Processor] Injecting text...')
    await textInjector.injectText(transcription.text)
    const injectDuration = Date.now() - injectStartTime
    console.log(`[Audio:Processor] ⏱️ Text injection: ${injectDuration}ms`)

    // Step 7: 完成
    updateOverlay({ status: 'success' })
    setTimeout(() => hideOverlay(), 800)

    // Step 8: 清理
    const cleanupStartTime = Date.now()
    cleanupTempFiles(tempWebmPath, tempMp3Path)
    const cleanupDuration = Date.now() - cleanupStartTime

    // 清除会话
    clearSession()

    // 输出性能统计
    const overallDuration = Date.now() - overallStartTime
    console.log(`[Audio:Processor] ⏱️ ========================================`)
    console.log(`[Audio:Processor] ⏱️ TOTAL PROCESSING TIME: ${overallDuration}ms`)
    console.log(`[Audio:Processor] ⏱️ Breakdown:`)
    console.log(
      `[Audio:Processor] ⏱️   - File save: ${saveDuration}ms (${((saveDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Audio:Processor] ⏱️   - Conversion: ${conversionDuration}ms (${((conversionDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Audio:Processor] ⏱️   - ASR: ${asrDuration}ms (${((asrDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Audio:Processor] ⏱️   - Injection: ${injectDuration}ms (${((injectDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Audio:Processor] ⏱️   - Cleanup: ${cleanupDuration}ms (${((cleanupDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(`[Audio:Processor] ⏱️ ========================================`)
  } catch (error) {
    const errorDuration = Date.now() - overallStartTime
    console.error(`[Audio:Processor] Processing failed after ${errorDuration}ms:`, error)

    updateOverlay({
      status: 'error',
      message: error instanceof Error ? error.message : t('errors.generic'),
    })
    setTimeout(() => hideOverlay(), 2000)

    updateSession({ status: 'error' })
    cleanupTempFiles(tempWebmPath, tempMp3Path)
  }
}

/**
 * 清理临时文件
 */
function cleanupTempFiles(...paths: string[]): void {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
        console.log(`[Audio:Processor] Cleaned up: ${path.basename(p)}`)
      }
    } catch (e) {
      console.error(`[Audio:Processor] Cleanup failed for ${p}:`, e)
    }
  }
}
