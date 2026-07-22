export type DesktopCatalogBridgeResponse = {
  ok: boolean
  status: number
  payload: unknown
}

type DesktopCatalogBridge = {
  getJson: (path: string) => Promise<DesktopCatalogBridgeResponse>
}

export type HiddenTunesDesktopBridge = {
  catalog: DesktopCatalogBridge
}

declare global {
  interface Window {
    hiddenTunesDesktop?: HiddenTunesDesktopBridge
  }
}

export function hasDesktopCatalogBridge() {
  return typeof window !== 'undefined' && typeof window.hiddenTunesDesktop?.catalog?.getJson === 'function'
}

export async function requestCatalogJson(path: string): Promise<DesktopCatalogBridgeResponse> {
  if (!hasDesktopCatalogBridge()) {
    throw new Error('Desktop catalog bridge is unavailable.')
  }
  return window.hiddenTunesDesktop!.catalog.getJson(path)
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
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  if (hasDesktopCatalogBridge()) {
    const result = await requestCatalogJson(path)
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
    const response = await fetch(`${normalizedBase}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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
