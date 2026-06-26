import { app } from 'electron'
import fs from 'fs'
import { createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'
import { LOCAL_ASR } from '../shared/constants'
import type { LocalASRDownloadProgress, LocalASRStatus } from '../shared/types'

type RuntimeAsset = {
  fileName: string
  sizeBytes: number
  archiveType: 'zip' | 'tar.gz'
  sha256: string
  executableSha256?: string
}

type LocalASREngine = 'sensevoice' | 'whisper'

type LocalASRPaths = {
  installDir: string
  runtimeDir: string
  modelDir: string
  downloadsDir: string
  healthPath: string
  executablePath: string
  modelPath: string
  whisperRuntimeDir: string
  whisperModelDir: string
  whisperHealthPath: string
  whisperExecutablePath: string
  whisperModelPath: string
}

type ProgressCallback = (progress: LocalASRDownloadProgress) => void
type LocalASRRunResult = { stdout: string; stderr: string }

let activeDownload: Promise<LocalASRStatus> | null = null
let currentProgress: LocalASRDownloadProgress | undefined
let lastError: string | undefined

export function getLocalASRStatus(): LocalASRStatus {
  const paths = getLocalASRPaths()
  const runtimeAsset = getRuntimeAsset()
  const missing: string[] = []
  const readyEngine = getReadyLocalASREngine(paths, runtimeAsset)

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

  if (!readyEngine && !isRuntimeReady(paths, runtimeAsset)) {
    missing.push('runtime')
  }
  if (!readyEngine && !isModelReady(paths)) {
    missing.push('model')
  }
  if (!readyEngine && missing.length === 0) {
    missing.push('runtime-health')
  }

  return {
    supported: true,
    ready: Boolean(readyEngine),
    downloading: Boolean(activeDownload),
    modelName:
      readyEngine === 'whisper'
        ? `${LOCAL_ASR.WHISPER_MODEL_NAME} (fallback)`
        : LOCAL_ASR.MODEL_NAME,
    installDir: paths.installDir,
    executablePath: paths.executablePath,
    modelPath: paths.modelPath,
    missing,
    downloadSizeBytes: getMaximumDownloadSizeBytes(runtimeAsset),
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
    if (status.missing.includes('runtime-health')) {
      throw new Error(
        lastError ||
          'Local ASR runtime has not passed the compatibility check. Open Settings and download/test the local model again.',
      )
    }
    throw new Error('Local ASR model is not downloaded yet')
  }
  return getLocalASRPaths()
}

export async function runLocalASR(
  audioFilePath: string,
  timeoutMs = LOCAL_ASR.TIMEOUT_MS,
): Promise<LocalASRRunResult> {
  const paths = ensureLocalASRReady()
  const runtimeAsset = getRuntimeAsset()
  const engine = getReadyLocalASREngine(paths, runtimeAsset)

  if (engine === 'whisper') {
    return await runLocalASRProcess(
      paths.whisperExecutablePath,
      ['-m', paths.whisperModelPath, '-f', audioFilePath, '-l', 'auto', '-nt', '-np', '-t', '4'],
      timeoutMs,
    )
  }

  return await runLocalASRProcess(
    paths.executablePath,
    ['-m', paths.modelPath, '-a', audioFilePath],
    timeoutMs,
  )
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
    if (getReadyLocalASREngine(paths, runtimeAsset)) {
      lastError = undefined
      return getLocalASRStatus()
    }

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

    try {
      await verifyLocalASRRuntime(paths, runtimeAsset)
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'SenseVoice runtime check failed'
      await ensureWhisperFallbackReady(paths, onProgress)
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
  const whisperRuntimeDir = path.join(installDir, 'whisper-runtime')
  const whisperModelDir = path.join(installDir, 'whisper-models')
  const binaryName =
    process.platform === 'win32'
      ? `${LOCAL_ASR.RUNTIME_BINARY_BASE}.exe`
      : LOCAL_ASR.RUNTIME_BINARY_BASE

  return {
    installDir,
    runtimeDir,
    modelDir,
    downloadsDir,
    healthPath: path.join(installDir, 'runtime-health.json'),
    executablePath: path.join(runtimeDir, binaryName),
    modelPath: path.join(modelDir, LOCAL_ASR.MODEL_FILE),
    whisperRuntimeDir,
    whisperModelDir,
    whisperHealthPath: path.join(installDir, 'whisper-runtime-health.json'),
    whisperExecutablePath: path.join(whisperRuntimeDir, 'Release', 'whisper-cli.exe'),
    whisperModelPath: path.join(whisperModelDir, LOCAL_ASR.WHISPER_MODEL_FILE),
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

function getReadyLocalASREngine(
  paths: LocalASRPaths,
  runtimeAsset: RuntimeAsset | null,
): LocalASREngine | null {
  if (
    runtimeAsset &&
    isRuntimeReady(paths, runtimeAsset) &&
    isModelReady(paths) &&
    isRuntimeHealthReady(paths, runtimeAsset)
  ) {
    return 'sensevoice'
  }

  if (isWhisperFallbackReady(paths)) {
    return 'whisper'
  }

  return null
}

function getMaximumDownloadSizeBytes(runtimeAsset: RuntimeAsset): number {
  const senseVoiceSizeBytes = runtimeAsset.sizeBytes + LOCAL_ASR.MODEL_SIZE_BYTES
  if (!isWhisperFallbackSupported()) {
    return senseVoiceSizeBytes
  }

  return (
    senseVoiceSizeBytes + LOCAL_ASR.WHISPER_RUNTIME_SIZE_BYTES + LOCAL_ASR.WHISPER_MODEL_SIZE_BYTES
  )
}

function isRuntimeHealthReady(paths: LocalASRPaths, runtimeAsset: RuntimeAsset): boolean {
  if (!fs.existsSync(paths.healthPath)) {
    return false
  }

  try {
    const health = JSON.parse(fs.readFileSync(paths.healthPath, 'utf8')) as Record<string, unknown>
    return (
      health.version === LOCAL_ASR.HEALTH_CHECK_VERSION &&
      health.runtimeSha256 === (runtimeAsset.executableSha256 ?? runtimeAsset.sha256) &&
      health.modelSha256 === LOCAL_ASR.MODEL_SHA256
    )
  } catch {
    return false
  }
}

function isWhisperFallbackSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64'
}

function isWhisperRuntimeReady(paths: LocalASRPaths): boolean {
  if (!fs.existsSync(paths.whisperExecutablePath)) {
    return false
  }

  return fileSha256Sync(paths.whisperExecutablePath) === LOCAL_ASR.WHISPER_CLI_SHA256
}

function isWhisperModelReady(paths: LocalASRPaths): boolean {
  if (!fs.existsSync(paths.whisperModelPath)) {
    return false
  }

  try {
    return fs.statSync(paths.whisperModelPath).size === LOCAL_ASR.WHISPER_MODEL_SIZE_BYTES
  } catch {
    return false
  }
}

function isWhisperFallbackReady(paths: LocalASRPaths): boolean {
  return isWhisperRuntimeReady(paths) && isWhisperModelReady(paths) && isWhisperHealthReady(paths)
}

function isWhisperHealthReady(paths: LocalASRPaths): boolean {
  if (!fs.existsSync(paths.whisperHealthPath)) {
    return false
  }

  try {
    const health = JSON.parse(fs.readFileSync(paths.whisperHealthPath, 'utf8')) as Record<
      string,
      unknown
    >
    return (
      health.version === LOCAL_ASR.HEALTH_CHECK_VERSION &&
      health.runtimeSha256 === LOCAL_ASR.WHISPER_CLI_SHA256 &&
      health.modelSha256 === LOCAL_ASR.WHISPER_MODEL_SHA256
    )
  } catch {
    return false
  }
}

async function ensureWhisperFallbackReady(
  paths: LocalASRPaths,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (!isWhisperFallbackSupported()) {
    throw new Error(
      lastError || 'SenseVoice runtime check failed and no local fallback is available',
    )
  }

  fs.mkdirSync(paths.whisperRuntimeDir, { recursive: true })
  fs.mkdirSync(paths.whisperModelDir, { recursive: true })
  fs.mkdirSync(paths.downloadsDir, { recursive: true })

  if (!isWhisperRuntimeReady(paths)) {
    fs.rmSync(paths.whisperRuntimeDir, { recursive: true, force: true })
    fs.mkdirSync(paths.whisperRuntimeDir, { recursive: true })
    const runtimeArchivePath = path.join(paths.downloadsDir, LOCAL_ASR.WHISPER_RUNTIME_FILE)
    await downloadFile(
      LOCAL_ASR.WHISPER_RUNTIME_URL,
      runtimeArchivePath,
      'runtime',
      LOCAL_ASR.WHISPER_RUNTIME_SIZE_BYTES,
      LOCAL_ASR.WHISPER_RUNTIME_SHA256,
      onProgress,
    )
    await extractRuntimeArchive(runtimeArchivePath, paths.whisperRuntimeDir, 'zip')
    fs.rmSync(runtimeArchivePath, { force: true })
    await verifyFileSha256(paths.whisperExecutablePath, LOCAL_ASR.WHISPER_CLI_SHA256)
  }

  if (!isWhisperModelReady(paths)) {
    fs.rmSync(paths.whisperModelPath, { force: true })
    await downloadFile(
      LOCAL_ASR.WHISPER_MODEL_URL,
      paths.whisperModelPath,
      'model',
      LOCAL_ASR.WHISPER_MODEL_SIZE_BYTES,
      LOCAL_ASR.WHISPER_MODEL_SHA256,
      onProgress,
    )
  }

  await verifyWhisperRuntime(paths)
}

async function verifyLocalASRRuntime(
  paths: LocalASRPaths,
  runtimeAsset: RuntimeAsset,
): Promise<void> {
  fs.rmSync(paths.healthPath, { force: true })

  const smokeAudioPath = path.join(paths.downloadsDir, 'runtime-smoke-test.wav')
  writeSmokeTestWav(smokeAudioPath)

  try {
    await runLocalASRProcess(
      paths.executablePath,
      ['-m', paths.modelPath, '-a', smokeAudioPath],
      LOCAL_ASR.SMOKE_TEST_TIMEOUT_MS,
    )
    fs.writeFileSync(
      paths.healthPath,
      JSON.stringify(
        {
          version: LOCAL_ASR.HEALTH_CHECK_VERSION,
          runtimeSha256: runtimeAsset.executableSha256 ?? runtimeAsset.sha256,
          modelSha256: LOCAL_ASR.MODEL_SHA256,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local ASR runtime check failed'
    throw new Error(`Local ASR runtime check failed: ${message}`)
  } finally {
    fs.rmSync(smokeAudioPath, { force: true })
  }
}

async function verifyWhisperRuntime(paths: LocalASRPaths): Promise<void> {
  fs.rmSync(paths.whisperHealthPath, { force: true })

  const smokeAudioPath = path.join(paths.downloadsDir, 'whisper-smoke-test.wav')
  writeSmokeTestWav(smokeAudioPath)

  try {
    await runLocalASRProcess(
      paths.whisperExecutablePath,
      ['-m', paths.whisperModelPath, '-f', smokeAudioPath, '-l', 'auto', '-nt', '-np', '-t', '4'],
      LOCAL_ASR.SMOKE_TEST_TIMEOUT_MS,
    )
    fs.writeFileSync(
      paths.whisperHealthPath,
      JSON.stringify(
        {
          version: LOCAL_ASR.HEALTH_CHECK_VERSION,
          runtimeSha256: LOCAL_ASR.WHISPER_CLI_SHA256,
          modelSha256: LOCAL_ASR.WHISPER_MODEL_SHA256,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Whisper fallback check failed'
    throw new Error(`${lastError ? `${lastError}; ` : ''}Whisper fallback check failed: ${message}`)
  } finally {
    fs.rmSync(smokeAudioPath, { force: true })
  }
}

function writeSmokeTestWav(filePath: string): void {
  const sampleRate = 16000
  const durationSeconds = 1
  const sampleCount = sampleRate * durationSeconds
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 4096)
    buffer.writeInt16LE(sample, 44 + index * 2)
  }

  fs.writeFileSync(filePath, buffer)
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

function runLocalASRProcess(
  executablePath: string,
  args: string[],
  timeoutMs: number,
): Promise<LocalASRRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      terminateChildProcess(child)
      reject(new Error(`Local ASR timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(buildLocalASRExitMessage(code, stderr)))
    })
  })
}

function terminateChildProcess(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }

  child.kill()
}

function buildLocalASRExitMessage(code: number | null, stderr: string): string {
  const normalizedStderr = stderr.trim()
  if (normalizedStderr) {
    return normalizedStderr
  }

  if (code === 0xc000001d || code === -1073741795) {
    return 'Local ASR runtime is incompatible with this CPU or Windows environment (illegal instruction 0xC000001D)'
  }

  return `Local ASR exited with code ${code ?? 'unknown'}`
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
