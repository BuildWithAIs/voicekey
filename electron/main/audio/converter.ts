/**
 * FFmpeg 音频转换模块
 *
 * 负责：
 * - FFmpeg 初始化（处理 app.asar.unpacked 路径）
 * - WebM 到 MP3 / WAV 格式转换
 *
 * @module electron/main/audio/converter
 */

import { app } from 'electron'
import { createRequire } from 'node:module'
import { updateOverlay, hideOverlay } from '../window/overlay'
import { t } from '../i18n'

interface FfmpegCommand {
  toFormat(format: string): FfmpegCommand
  audioCodec(codec: string): FfmpegCommand
  audioBitrate(bitrate: string): FfmpegCommand
  audioFrequency(frequency: number): FfmpegCommand
  audioChannels(channels: number): FfmpegCommand
  audioFilters(filter: string): FfmpegCommand
  on(event: 'end', listener: () => void): FfmpegCommand
  on(event: 'error', listener: (error: Error) => void): FfmpegCommand
  save(outputPath: string): void
}

type FfmpegFactory = {
  (inputPath: string): FfmpegCommand
  setFfmpegPath: (ffmpegPath: string) => void
}

let ffmpeg: FfmpegFactory
let ffmpegInitialized = false

export interface ConvertToMP3Options {
  gainDb?: number
}

export interface ConvertToWAVOptions {
  gainDb?: number
}

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
    const ffmpegModule = require('fluent-ffmpeg') as FfmpegFactory
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
export function convertToMP3(
  inputPath: string,
  outputPath: string,
  options?: ConvertToMP3Options,
): Promise<void> {
  return convertAudio(inputPath, outputPath, 'MP3', options, (command) => {
    command.toFormat('mp3').audioCodec('libmp3lame').audioBitrate('128k')
  })
}

/**
 * 转换音频格式为 16kHz 单声道 WAV
 *
 * 本地 ASR runtime 使用最基础的 PCM WAV 输入，避开 native MP3 解码路径差异。
 */
export function convertToWAV(
  inputPath: string,
  outputPath: string,
  options?: ConvertToWAVOptions,
): Promise<void> {
  return convertAudio(inputPath, outputPath, 'WAV', options, (command) => {
    command.toFormat('wav').audioCodec('pcm_s16le').audioFrequency(16000).audioChannels(1)
  })
}

function convertAudio(
  inputPath: string,
  outputPath: string,
  outputLabel: string,
  options: { gainDb?: number } | undefined,
  configure: (command: FfmpegCommand) => void,
): Promise<void> {
  const conversionStartTime = Date.now()
  return new Promise((resolve, reject) => {
    // 确保 ffmpeg 已初始化
    initializeFfmpeg()

    console.log(`[Audio:Converter] Converting audio to ${outputLabel}...`)
    console.log(`[Audio:Converter]   Input: ${inputPath}`)
    console.log(`[Audio:Converter]   Output: ${outputPath}`)
    if (typeof options?.gainDb === 'number') {
      console.log(`[Audio:Converter]   Gain: +${options.gainDb}dB`)
    }

    const command = ffmpeg(inputPath)
    configure(command)

    if (typeof options?.gainDb === 'number') {
      command.audioFilters(`volume=${options.gainDb}dB`)
    }

    command
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
