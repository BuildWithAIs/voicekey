/**
 * FFmpeg 音频转换模块
 *
 * 负责：
 * - FFmpeg 初始化（处理 app.asar.unpacked 路径）
 * - WebM 到 MP3 格式转换
 *
 * @module electron/main/audio/converter
 */

import { app } from 'electron'
import { createRequire } from 'node:module'
import { updateOverlay, hideOverlay } from '../window/overlay'
import { t } from '../i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpeg: any
let ffmpegInitialized = false

/**
 * 初始化 FFmpeg
 *
 * 处理 Electron 打包后的路径问题：
 * - 开发环境：使用 node_modules 中的 ffmpeg
 * - 生产环境：使用 app.asar.unpacked 中的 ffmpeg
 *
 * @throws {Error} FFmpeg 初始化失败时抛出错误
 */
export function initializeFfmpeg(): void {
  if (ffmpegInitialized) return

  try {
    const require = createRequire(import.meta.url)
    const ffmpegModule = require('fluent-ffmpeg')
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')

    let ffmpegPath = ffmpegInstaller.path

    // 生产环境中，FFmpeg 二进制被解压到 app.asar.unpacked 目录
    if (app.isPackaged) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
    }

    ffmpeg = ffmpegModule
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpegInitialized = true
    console.log('[Audio:Converter] FFmpeg initialized with path:', ffmpegPath)
  } catch (error) {
    console.error('[Audio:Converter] Failed to initialize FFmpeg:', error)
    updateOverlay({ status: 'error', message: t('errors.ffmpegInitFailed') })
    setTimeout(() => hideOverlay(), 2000)
    throw error
  }
}

/**
 * 转换音频格式为 MP3
 *
 * @param inputPath - 输入文件路径（WebM 格式）
 * @param outputPath - 输出文件路径（MP3 格式）
 * @returns Promise<void> - 转换完成时 resolve
 * @throws {Error} 转换失败时 reject
 */
export function convertToMP3(inputPath: string, outputPath: string): Promise<void> {
  const conversionStartTime = Date.now()
  return new Promise((resolve, reject) => {
    // 确保 ffmpeg 已初始化
    initializeFfmpeg()

    console.log(`[Audio:Converter] Converting audio to MP3...`)
    console.log(`[Audio:Converter]   Input: ${inputPath}`)
    console.log(`[Audio:Converter]   Output: ${outputPath}`)

    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => {
        const duration = Date.now() - conversionStartTime
        console.log(`[Audio:Converter] ⏱️ Conversion completed in ${duration}ms`)
        resolve()
      })
      .on('error', (err: Error) => {
        const duration = Date.now() - conversionStartTime
        console.error(`[Audio:Converter] Conversion failed after ${duration}ms:`, err)
        reject(err)
      })
      .save(outputPath)
  })
}

/**
 * 检查 FFmpeg 是否已初始化
 */
export function isFfmpegInitialized(): boolean {
  return ffmpegInitialized
}
