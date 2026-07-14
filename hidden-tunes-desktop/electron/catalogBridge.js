const DEFAULT_CATALOG_BASE_URL = 'https://admin.hiddentunes.com'
const REQUEST_TIMEOUT_MS = 20_000

const APPROVED_HOSTS = new Set(['admin.hiddentunes.com'])

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

async function fetchApprovedCatalog(path) {
  const url = buildCatalogUrl(path)
  if (!isApprovedCatalogUrl(url)) {
    throw new Error('Catalog request host is not approved.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

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

module.exports = {
  APPROVED_HOSTS,
  REQUEST_TIMEOUT_MS,
  resolveCatalogBaseUrl,
  fetchApprovedCatalog,
}
