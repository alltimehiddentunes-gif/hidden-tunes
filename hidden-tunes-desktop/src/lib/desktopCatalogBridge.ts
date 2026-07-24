export type DesktopCatalogBridgeResponse = {
  ok: boolean
  status: number
  payload: unknown
}

export type CatalogJsonRequestOptions = {
  path: string
  method?: 'GET' | 'POST'
  body?: Record<string, unknown> | null
  headers?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
}

type DesktopCatalogBridge = {
  getJson: (path: string) => Promise<DesktopCatalogBridgeResponse>
  requestJson?: (options: {
    path: string
    method?: 'GET' | 'POST'
    body?: Record<string, unknown> | null
  }) => Promise<DesktopCatalogBridgeResponse>
}

export type HiddenTunesDesktopBridge = {
  catalog: DesktopCatalogBridge
}

declare global {
  interface Window {
    hiddenTunesDesktop?: HiddenTunesDesktopBridge
  }
}

const SPORTS_PILOT_HEADER = 'X-Hidden-Tunes-Sports-Pilot'

export function hasDesktopCatalogBridge() {
  return typeof window !== 'undefined' && typeof window.hiddenTunesDesktop?.catalog?.getJson === 'function'
}

function hasCatalogRequestJson() {
  return typeof window !== 'undefined' && typeof window.hiddenTunesDesktop?.catalog?.requestJson === 'function'
}

function resolveBrowserSportsPilotToken(): string | null {
  try {
    const token = String(import.meta.env?.VITE_SPORTS_PRIVATE_PILOT_TOKEN || '').trim()
    return token.length >= 16 ? token : null
  } catch {
    return null
  }
}

function buildBrowserCatalogHeaders(extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-ht-platform': 'desktop',
    'x-ht-storefront-country': 'ZZ',
    ...(extra || {}),
  }
  const pilot = resolveBrowserSportsPilotToken()
  if (pilot) headers[SPORTS_PILOT_HEADER] = pilot
  return headers
}

export async function requestCatalogJson(path: string): Promise<DesktopCatalogBridgeResponse> {
  if (!hasDesktopCatalogBridge()) {
    throw new Error('Desktop catalog bridge is unavailable.')
  }
  return window.hiddenTunesDesktop!.catalog.getJson(path)
}

export async function requestCatalogJsonRequest(
  options: CatalogJsonRequestOptions,
): Promise<DesktopCatalogBridgeResponse> {
  const path = String(options.path || '').trim()
  const method = (options.method || 'GET').toUpperCase() as 'GET' | 'POST'
  const body = options.body ?? null

  if (!path.startsWith('/api/')) {
    throw new Error('Catalog path is not allowed.')
  }
  if (method !== 'GET' && method !== 'POST') {
    throw new Error('Catalog method is not allowed.')
  }

  if (hasCatalogRequestJson()) {
    return window.hiddenTunesDesktop!.catalog.requestJson!({
      path,
      method,
      body,
    })
  }

  // Backward-compatible GET via getJson when requestJson is unavailable.
  if (method === 'GET' && hasDesktopCatalogBridge()) {
    return requestCatalogJson(path)
  }

  throw new Error('Desktop catalog request bridge is unavailable.')
}

function formatFetchFailure(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request timed out. Try again.'
  }
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return 'Unable to reach the catalog from the desktop shell. Reload the app and try again.'
  }
  if (error instanceof Error) return error.message
  return 'Unexpected catalog network error'
}

export async function requestCatalogJsonWithFallback(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ payload: unknown; status: number }> {
  return requestCatalogJsonWithFallbackRequest(baseUrl, {
    path,
    method: 'GET',
    body: null,
    timeoutMs,
    signal,
  })
}

export async function requestCatalogJsonWithFallbackRequest(
  baseUrl: string,
  options: CatalogJsonRequestOptions,
): Promise<{ payload: unknown; status: number }> {
  const path = String(options.path || '').trim()
  const method = (options.method || 'GET').toUpperCase() as 'GET' | 'POST'
  const body = options.body ?? null
  const timeoutMs = options.timeoutMs ?? 20_000
  const signal = options.signal

  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  if (!path.startsWith('/api/')) {
    throw new Error('Catalog path is not allowed.')
  }

  if (hasDesktopCatalogBridge() || hasCatalogRequestJson()) {
    const result = await requestCatalogJsonRequest({
      path,
      method,
      body,
    })
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    return { payload: result.payload, status: result.status }
  }

  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (signal) {
    signal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    const headers = buildBrowserCatalogHeaders({
      ...(options.headers || {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    })
    const response = await fetch(`${normalizedBase}${path}`, {
      method,
      headers,
      body: method === 'POST' && body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    return { payload, status: response.status }
  } catch (error) {
    const externalAborted = Boolean(signal?.aborted)
    if (externalAborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    throw new Error(formatFetchFailure(error), { cause: error })
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}
