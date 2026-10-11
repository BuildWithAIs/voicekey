import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { downloadFromSources } from './download-sources'

export type ASRAsset = { name: string; sizeBytes: number; sha256: string; urls: readonly string[] }

export async function verifyASRAsset(
  filePath: string,
  file: ASRAsset,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  try {
    if ((await fs.promises.stat(filePath)).size !== file.sizeBytes) return false
    const hash = createHash('sha256')
    for await (const chunk of fs.createReadStream(filePath, { signal })) hash.update(chunk)
    return hash.digest('hex') === file.sha256
  } catch (error) {
    signal.throwIfAborted()
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

// Only the unfinished file is discarded. Verified files survive cancel, failure
// and app restart; they are checked again before being reused.
export async function downloadASRAsset(
  file: ASRAsset,
  outputPath: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
  onVerify?: () => void,
  reusePath?: string,
): Promise<number> {
  onVerify?.()
  if (await verifyASRAsset(outputPath, file, signal)) {
    onBytes(file.sizeBytes)
    return file.sizeBytes
  }
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  if (reusePath && (await verifyASRAsset(reusePath, file, signal))) {
    await fs.promises.copyFile(reusePath, outputPath)
    signal.throwIfAborted()
    onBytes(file.sizeBytes)
    return file.sizeBytes
  }
  const temporary = `${outputPath}.part`
  await downloadFromSources(file.urls, async (source) => {
    signal.throwIfAborted()
    onBytes(0)
    try {
      await requestFile(source, temporary, file.sizeBytes, signal, onBytes)
      onVerify?.()
      if (!(await verifyASRAsset(temporary, file, signal)))
        throw new Error('Model file verification failed')
      await fs.promises.rename(temporary, outputPath)
    } finally {
      await fs.promises.rm(temporary, { force: true })
    }
  })
  return file.sizeBytes
}

async function requestFile(
  url: string,
  destination: string,
  expectedBytes: number,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
  redirects = 0,
): Promise<void> {
  signal.throwIfAborted()
  if (redirects > 8 || new URL(url).protocol !== 'https:')
    throw new Error('Invalid model download redirect')
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const request = https.get(
      url,
      { signal, headers: { 'User-Agent': 'VoiceKey' }, timeout: 30_000 },
      resolve,
    )
    request.on('timeout', () => request.destroy(new Error('Model download stalled for 30 seconds')))
    request.on('error', reject)
  })
  const status = response.statusCode ?? 0
  if (status >= 300 && status < 400 && response.headers.location) {
    response.resume()
    return requestFile(
      new URL(response.headers.location, url).toString(),
      destination,
      expectedBytes,
      signal,
      onBytes,
      redirects + 1,
    )
  }
  if (status < 200 || status >= 300) {
    response.resume()
    throw new Error(`Model download failed: HTTP ${status}`)
  }
  let received = 0
  let lastUpdate = 0
  response.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received > expectedBytes) {
      response.destroy(new Error('Model download exceeds expected size'))
      return
    }
    if (Date.now() - lastUpdate > 100 || received === expectedBytes) {
      lastUpdate = Date.now()
      onBytes(received)
    }
  })
  await pipeline(response, fs.createWriteStream(destination), { signal })
}
