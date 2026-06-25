import { app } from 'electron'
import fs from 'fs'
import { createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { LOCAL_ASR } from '../shared/constants'
import type { LocalASRDownloadProgress, LocalASRStatus } from '../shared/types'

type RuntimeAsset = {
  fileName: string
  sizeBytes: number
  archiveType: 'zip' | 'tar.gz'
  sha256: string
  executableSha256?: string
}

type LocalASRPaths = {
  installDir: string
  runtimeDir: string
  modelDir: string
  downloadsDir: string
  executablePath: string
  modelPath: string
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void

let activeDownload: Promise<LocalASRStatus> | null = null
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined

export function getLocalASRStatus(): LocalASRStatus {
  const paths = getLocalASRPaths()
  const runtimeAsset = getRuntimeAsset()
  const missing: string[] = []

  if (!runtimeAsset) {
    return {
      supported: false,
      ready: false,
      downloading: Boolean(activeDownload),
      modelName: LOCAL_ASR.MODEL_NAME,
      installDir: paths.installDir,
      missing: ['runtime'],
      downloadSizeBytes: LOCAL_ASR.MODEL_SIZE_BYTES,
      progress: currentProgress,
      error: 'Local ASR runtime is not available for this platform',
    }
  }

  if (!isRuntimeReady(paths, runtimeAsset)) {
    missing.push('runtime')
  }
  if (!isModelReady(paths)) {
    missing.push('model')
  }

  return {
    supported: true,
    ready: missing.length === 0,
    downloading: Boolean(activeDownload),
    modelName: LOCAL_ASR.MODEL_NAME,
    installDir: paths.installDir,
    executablePath: paths.executablePath,
    modelPath: paths.modelPath,
    missing,
    downloadSizeBytes: runtimeAsset.sizeBytes + LOCAL_ASR.MODEL_SIZE_BYTES,
    progress: currentProgress,
    error: lastError,
  }
}

export function ensureLocalASRReady(): LocalASRPaths {
  const status = getLocalASRStatus()
  if (!status.supported) {
    throw new Error(status.error || 'Local ASR is not supported on this platform')
  }
  if (!status.ready) {
    throw new Error('Local ASR model is not downloaded yet')
  }
  return getLocalASRPaths()
}

export async function downloadLocalASRAssets(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  if (activeDownload) {
    return activeDownload
  }

  activeDownload = downloadLocalASRAssetsInternal(onProgress).finally(() => {
    activeDownload = null
    currentProgress = undefined
  })

  return activeDownload
}

async function downloadLocalASRAssetsInternal(
  onProgress?: ProgressCallback,
): Promise<LocalASRStatus> {
  const runtimeAsset = getRuntimeAsset()
  if (!runtimeAsset) {
    throw new Error('Local ASR runtime is not available for this platform')
  }

  const paths = getLocalASRPaths()
  fs.mkdirSync(paths.runtimeDir, { recursive: true })
  fs.mkdirSync(paths.modelDir, { recursive: true })
  fs.mkdirSync(paths.downloadsDir, { recursive: true })

  try {
    if (!isRuntimeReady(paths, runtimeAsset)) {
      fs.rmSync(paths.runtimeDir, { recursive: true, force: true })
      fs.mkdirSync(paths.runtimeDir, { recursive: true })
      const runtimeArchivePath = path.join(paths.downloadsDir, runtimeAsset.fileName)
      await downloadFile(
        `${LOCAL_ASR.RUNTIME_BASE_URL}/${runtimeAsset.fileName}`,
        runtimeArchivePath,
        'runtime',
        runtimeAsset.sizeBytes,
        runtimeAsset.sha256,
        onProgress,
      )
      await extractRuntimeArchive(runtimeArchivePath, paths.runtimeDir, runtimeAsset.archiveType)
      fs.rmSync(runtimeArchivePath, { force: true })
      if (!fs.existsSync(paths.executablePath)) {
        throw new Error('Local ASR runtime extraction did not produce the expected executable')
      }
      if (runtimeAsset.executableSha256) {
        await verifyFileSha256(paths.executablePath, runtimeAsset.executableSha256)
      }
      await markExecutable(paths.executablePath)
    }

    if (!isModelReady(paths)) {
      fs.rmSync(paths.modelPath, { force: true })
      await downloadFile(
        LOCAL_ASR.MODEL_URL,
        paths.modelPath,
        'model',
        LOCAL_ASR.MODEL_SIZE_BYTES,
        LOCAL_ASR.MODEL_SHA256,
        onProgress,
      )
    }

    lastError = undefined
    return getLocalASRStatus()
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Local ASR download failed'
    throw error
  }
}

function getLocalASRPaths(): LocalASRPaths {
  const installDir = path.join(app.getPath('userData'), 'local-asr', 'sensevoice')
  const runtimeDir = path.join(installDir, 'runtime')
  const modelDir = path.join(installDir, 'models')
  const downloadsDir = path.join(installDir, 'downloads')
  const binaryName =
    process.platform === 'win32'
      ? `${LOCAL_ASR.RUNTIME_BINARY_BASE}.exe`
      : LOCAL_ASR.RUNTIME_BINARY_BASE

  return {
    installDir,
    runtimeDir,
    modelDir,
    downloadsDir,
    executablePath: path.join(runtimeDir, binaryName),
    modelPath: path.join(modelDir, LOCAL_ASR.MODEL_FILE),
  }
}

function getRuntimeAsset(): RuntimeAsset | null {
  if (process.platform === 'win32' && process.arch === 'x64') {
    return {
      fileName: 'funasr-llamacpp-windows-x64.zip',
      sizeBytes: LOCAL_ASR.RUNTIME_WINDOWS_SIZE_BYTES,
      archiveType: 'zip',
      sha256: LOCAL_ASR.RUNTIME_WINDOWS_SHA256,
      executableSha256: LOCAL_ASR.RUNTIME_WINDOWS_SENSEVOICE_SHA256,
    }
  }

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return {
      fileName: 'funasr-llamacpp-macos-arm64.tar.gz',
      sizeBytes: 6_816_659,
      archiveType: 'tar.gz',
      sha256: LOCAL_ASR.RUNTIME_MACOS_ARM64_SHA256,
    }
  }

  if (process.platform === 'linux' && process.arch === 'x64') {
    return {
      fileName: 'funasr-llamacpp-linux-x64.tar.gz',
      sizeBytes: LOCAL_ASR.RUNTIME_UNIX_SIZE_BYTES,
      archiveType: 'tar.gz',
      sha256: LOCAL_ASR.RUNTIME_LINUX_X64_SHA256,
    }
  }

  if (process.platform === 'linux' && process.arch === 'arm64') {
    return {
      fileName: 'funasr-llamacpp-linux-arm64.tar.gz',
      sizeBytes: 7_725_307,
      archiveType: 'tar.gz',
      sha256: LOCAL_ASR.RUNTIME_LINUX_ARM64_SHA256,
    }
  }

  return null
}

function isRuntimeReady(paths: LocalASRPaths, runtimeAsset: RuntimeAsset): boolean {
  if (!fs.existsSync(paths.executablePath)) {
    return false
  }

  if (!runtimeAsset.executableSha256) {
    return true
  }

  return fileSha256Sync(paths.executablePath) === runtimeAsset.executableSha256
}

function isModelReady(paths: LocalASRPaths): boolean {
  if (!fs.existsSync(paths.modelPath)) {
    return false
  }

  try {
    return fs.statSync(paths.modelPath).size === LOCAL_ASR.MODEL_SIZE_BYTES
  } catch {
    return false
  }
}

async function downloadFile(
  url: string,
  outputPath: string,
  phase: LocalASRDownloadProgress['phase'],
  expectedBytes: number,
  expectedSha256: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const tempPath = `${outputPath}.download`
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath)
  }

  await requestDownload(url, tempPath, phase, expectedBytes, onProgress)
  await verifyFileSha256(tempPath, expectedSha256)

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
  fs.renameSync(tempPath, outputPath)
}

function verifyFileSha256(filePath: string, expectedSha256: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      const actualSha256 = hash.digest('hex')
      if (actualSha256 === expectedSha256.toLowerCase()) {
        resolve()
        return
      }

      fs.rmSync(filePath, { force: true })
      reject(new Error('Downloaded local ASR asset failed checksum verification'))
    })
  })
}

function fileSha256Sync(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function requestDownload(
  url: string,
  outputPath: string,
  phase: LocalASRDownloadProgress['phase'],
  expectedBytes: number,
  onProgress?: ProgressCallback,
  redirectCount = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error('Too many redirects while downloading local ASR assets'))
      return
    }

    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'http:' ? http : https
    const request = client.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'VoiceKey',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume()
          const nextUrl = new URL(location, parsedUrl).toString()
          requestDownload(nextUrl, outputPath, phase, expectedBytes, onProgress, redirectCount + 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Download failed with HTTP ${statusCode}`))
          return
        }

        const headerTotal = Number(response.headers['content-length'])
        const totalBytes =
          Number.isFinite(headerTotal) && headerTotal > 0 ? headerTotal : expectedBytes
        let receivedBytes = 0
        const file = fs.createWriteStream(outputPath)

        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          currentProgress = {
            phase,
            receivedBytes,
            totalBytes,
            percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
          }
          onProgress?.(currentProgress)
        })

        response.pipe(file)
        file.on('finish', () => {
          file.close(() => resolve())
        })
        file.on('error', (error) => {
          fs.rmSync(outputPath, { force: true })
          reject(error)
        })
      },
    )

    request.on('error', (error) => {
      fs.rmSync(outputPath, { force: true })
      reject(error)
    })
  })
}

function extractRuntimeArchive(
  archivePath: string,
  destinationDir: string,
  archiveType: RuntimeAsset['archiveType'],
): Promise<void> {
  if (archiveType === 'zip') {
    const command = [
      'Expand-Archive',
      '-LiteralPath',
      quotePowerShell(archivePath),
      '-DestinationPath',
      quotePowerShell(destinationDir),
      '-Force',
    ].join(' ')
    return runProcess('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ])
  }

  return runProcess('tar', ['-xzf', archivePath, '-C', destinationDir])
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    })
    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

async function markExecutable(filePath: string): Promise<void> {
  if (process.platform === 'win32') return
  await fs.promises.chmod(filePath, 0o755)
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
