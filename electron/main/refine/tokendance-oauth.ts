import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'
import axios from 'axios'
import { LLM_PROVIDERS } from '../../shared/constants'
import { extractAxiosErrorMessage } from './openai-client'

/**
 * TokenDance OAuth-style API key authorization (Authorization Code + S256 PKCE).
 *
 * The main process starts a loopback callback server on a random port, opens the
 * TokenDance authorization page in the system browser with the app attribution
 * parameters, waits for the one-time code, and exchanges it for a new API key.
 * The code_verifier never leaves this process.
 */

const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000

const CALLBACK_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Voice Key</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem">
<p>TokenDance authorization complete. You can return to Voice Key.</p>
<p>TokenDance 授权完成，可以返回 Voice Key。</p>
</body>
</html>`

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function buildAuthorizationUrl(callbackUrl: string, challenge: string): string {
  const url = new URL(LLM_PROVIDERS.TOKENDANCE_AUTH_URL)
  url.searchParams.set('callback_url', callbackUrl)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('app_url', LLM_PROVIDERS.TOKENDANCE_APP_URL)
  url.searchParams.set('key_name', LLM_PROVIDERS.TOKENDANCE_KEY_NAME)
  return url.toString()
}

async function exchangeCodeForKey(code: string, verifier: string): Promise<string> {
  const response = await axios.post<{ key?: string }>(
    LLM_PROVIDERS.TOKENDANCE_KEY_EXCHANGE_URL,
    {
      code,
      code_verifier: verifier,
      code_challenge_method: 'S256',
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      responseType: 'json',
    },
  )

  const key = response.data?.key
  if (typeof key !== 'string' || !key) {
    throw new Error('TokenDance did not return an API key')
  }

  return key
}

/**
 * Listen on a random loopback port, open the TokenDance authorization page in the
 * system browser, and resolve with the one-time code from the redirect.
 */
function waitForAuthorizationCode(server: Server, challenge: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('TokenDance authorization timed out'))
    }, AUTHORIZATION_TIMEOUT_MS)

    server.on('request', (request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const callbackCode =
        requestUrl.pathname === '/callback' ? requestUrl.searchParams.get('code') : null
      if (!callbackCode) {
        // Ignore stray requests (browser probes, favicon fallbacks, port scans):
        // only the redirect carrying the one-time code settles the flow.
        response.statusCode = 404
        response.end()
        return
      }

      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(CALLBACK_PAGE)

      clearTimeout(timeout)
      resolve(callbackCode)
    })

    server.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null
      if (!address || typeof address.port !== 'number') {
        clearTimeout(timeout)
        reject(new Error('Failed to start the TokenDance callback listener'))
        return
      }

      const callbackUrl = `http://127.0.0.1:${address.port}/callback`
      void shell
        .openExternal(buildAuthorizationUrl(callbackUrl, challenge))
        .catch((error: unknown) => {
          clearTimeout(timeout)
          reject(error instanceof Error ? error : new Error('Failed to open the browser'))
        })
    })
  })
}

let pendingAuthorization: Promise<string> | null = null

async function runAuthorization(): Promise<string> {
  const { verifier, challenge } = generatePkcePair()
  const server = createServer()
  // The temporary listener must not keep the app alive on quit.
  server.unref()

  try {
    const code = await waitForAuthorizationCode(server, challenge)
    return await exchangeCodeForKey(code, verifier)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(`TokenDance authorization failed: ${extractAxiosErrorMessage(error)}`)
    }
    throw error
  } finally {
    server.close()
  }
}

/**
 * Start the TokenDance authorization flow. Single-flight: a second call while a
 * browser authorization is still pending reuses the in-flight flow.
 */
export function authorizeTokenDanceApiKey(): Promise<string> {
  if (!pendingAuthorization) {
    pendingAuthorization = runAuthorization().finally(() => {
      pendingAuthorization = null
    })
  }

  return pendingAuthorization
}
