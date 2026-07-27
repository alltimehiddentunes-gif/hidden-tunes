const {
  resolveMainRuntimeConfig,
  resolveSportsPilotToken,
} = require('./runtimeConfig')

const REQUEST_TIMEOUT_MS = 20_000
const APPROVED_HOSTS = new Set(['admin.hiddentunes.com'])
const SPORTS_PLAY_PATH_RE = /^\/api\/sports\/fixtures\/[^/]+\/play\/?$/
const SPORTS_PILOT_HEADER = 'X-Hidden-Tunes-Sports-Pilot'

function detectPackaged() {
  try {
    // Optional — node verification scripts import this without a ready Electron app.
    const electron = require('electron')
    return Boolean(electron.app?.isPackaged)
  } catch {
    return false
  }
}

function resolveCatalogBaseUrl() {
  const config = resolveMainRuntimeConfig({ isPackaged: detectPackaged() })
  if (!config.adminCatalogBaseUrl) {
    throw new Error(
      config.errors[0] || 'Admin catalog API is not configured for this desktop build.',
    )
  }
  return config.adminCatalogBaseUrl
}

function isApprovedCatalogUrl(urlString) {
  try {
    const packaged = detectPackaged()
    const parsed = new URL(urlString)
    if (parsed.protocol !== 'https:') return false
    if (packaged) {
      return APPROVED_HOSTS.has(parsed.hostname)
    }
    // Dev: allow configured admin host (defaults to admin.hiddentunes.com).
    return APPROVED_HOSTS.has(parsed.hostname) || parsed.hostname === new URL(resolveCatalogBaseUrl()).hostname
  } catch {
    return false
  }
}

function buildCatalogUrl(path) {
  const baseUrl = resolveCatalogBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${baseUrl}/`).toString()
}

function isAllowedCatalogMethod(path, method) {
  if (!path.startsWith('/api/')) return false
  if (method === 'GET') return true
  if (method === 'POST') return SPORTS_PLAY_PATH_RE.test(path)
  return false
}

function buildCatalogHeaders(extraHeaders) {
  const headers = {
    Accept: 'application/json',
    'x-ht-platform': 'desktop',
    'x-ht-storefront-country': 'ZZ',
    ...(extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {}),
  }
  const pilot = resolveSportsPilotToken()
  if (pilot) {
    headers[SPORTS_PILOT_HEADER] = pilot
  }
  return headers
}

/**
 * Approved-host catalog fetch with optional POST for Sports play only.
 * @param {{ path: string, method?: string, body?: Record<string, unknown> | null }} options
 */
async function fetchApprovedCatalogRequest(options = {}) {
  const path = typeof options.path === 'string' ? options.path.trim() : ''
  const method = String(options.method || 'GET').trim().toUpperCase() || 'GET'
  const body = options.body === undefined ? null : options.body

  if (!path.startsWith('/api/')) {
    throw new Error('Catalog path is not allowed.')
  }
  if (!isAllowedCatalogMethod(path, method)) {
    throw new Error('Catalog method is not allowed for this path.')
  }
  if (body !== null && body !== undefined) {
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Catalog body must be a plain object or null.')
    }
  }

  const url = buildCatalogUrl(path)
  if (!isApprovedCatalogUrl(url)) {
    throw new Error('Catalog request host is not approved.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const headers = buildCatalogHeaders(
      method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    )
    const init = {
      method,
      headers,
      signal: controller.signal,
    }
    if (method === 'POST' && body && typeof body === 'object') {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Catalog request timed out. Try again.')
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Unexpected catalog network error')
  } finally {
    clearTimeout(timeout)
  }
}

/** Thin GET wrapper — preserves existing call sites. */
async function fetchApprovedCatalog(path) {
  return fetchApprovedCatalogRequest({ path, method: 'GET', body: null })
}

module.exports = {
  APPROVED_HOSTS,
  REQUEST_TIMEOUT_MS,
  resolveCatalogBaseUrl,
  fetchApprovedCatalog,
  fetchApprovedCatalogRequest,
}
