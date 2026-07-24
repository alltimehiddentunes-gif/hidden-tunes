const DEFAULT_CATALOG_BASE_URL = 'https://admin.hiddentunes.com'
const REQUEST_TIMEOUT_MS = 20_000

const APPROVED_HOSTS = new Set(['admin.hiddentunes.com'])
const SPORTS_PLAY_PATH_RE = /^\/api\/sports\/fixtures\/[^/]+\/play\/?$/
const SPORTS_PILOT_HEADER = 'X-Hidden-Tunes-Sports-Pilot'

function resolveCatalogBaseUrl() {
  const override = String(process.env.VITE_CATALOG_ADMIN_API_URL || process.env.HT_CATALOG_ADMIN_API_URL || '').trim()
  if (!override) return DEFAULT_CATALOG_BASE_URL
  return override.replace(/\/+$/, '')
}

function isApprovedCatalogUrl(urlString) {
  try {
    const parsed = new URL(urlString)
    return parsed.protocol === 'https:' && APPROVED_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

function buildCatalogUrl(path) {
  const baseUrl = resolveCatalogBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${baseUrl}/`).toString()
}

function resolveSportsPilotToken() {
  // Main-process only — never accept token from renderer IPC args.
  const candidates = [
    process.env.HT_SPORTS_PRIVATE_PILOT_TOKEN,
    process.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN,
  ]
  for (const candidate of candidates) {
    const token = String(candidate || '').trim()
    if (token.length >= 16) return token
  }
  return null
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
