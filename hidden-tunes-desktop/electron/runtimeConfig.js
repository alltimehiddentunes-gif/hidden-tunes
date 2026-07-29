/**
 * Main-process desktop catalog / runtime configuration.
 * Sports private pilot token stays here — never sent to renderer.
 */

const DEV_EXPRESS_DEFAULT = 'https://hidden-tunes-api.onrender.com'
const DEV_ADMIN_DEFAULT = 'https://admin.hiddentunes.com'

const PRODUCTION_EXPRESS_ALLOWLIST = new Set([
  'api.hiddentunes.com',
  'hidden-tunes-api.onrender.com',
])
const PRODUCTION_ADMIN_ALLOWLIST = new Set(['admin.hiddentunes.com'])
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '')
}

function readEnvFrom(source, keys) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseHttpsUrl(raw, { allowLocalhost }) {
  if (!raw) return { ok: false, reason: 'missing' }
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'https-required' }
  }
  if (!allowLocalhost && LOCALHOST_RE.test(parsed.hostname)) {
    return { ok: false, reason: 'localhost-forbidden' }
  }
  return {
    ok: true,
    url: stripTrailingSlash(parsed.toString()),
    hostname: parsed.hostname,
  }
}

function resolveMainRuntimeConfig({ isPackaged, env } = {}) {
  const packaged = Boolean(isPackaged)
  const errors = []
  const warnings = []
  const source = env && typeof env === 'object' ? env : process.env

  const expressRaw = readEnvFrom(source, [
    'VITE_EXPRESS_CATALOG_API_URL',
    'HT_EXPRESS_CATALOG_API_URL',
  ])
  const adminRaw = readEnvFrom(source, [
    'VITE_CATALOG_ADMIN_API_URL',
    'HT_CATALOG_ADMIN_API_URL',
  ])

  let expressCatalogBaseUrl = null
  let adminCatalogBaseUrl = null

  if (packaged) {
    const expressCandidate = expressRaw || DEV_EXPRESS_DEFAULT
    const expressParsed = parseHttpsUrl(expressCandidate, { allowLocalhost: false })
    if (!expressParsed.ok) {
      errors.push(`Express catalog URL invalid (${expressParsed.reason}).`)
    } else if (!PRODUCTION_EXPRESS_ALLOWLIST.has(expressParsed.hostname)) {
      errors.push(`Express catalog host is not allowlisted: ${expressParsed.hostname}`)
    } else {
      expressCatalogBaseUrl = expressParsed.url
      if (!expressRaw) {
        warnings.push('Express catalog URL used the allowlisted production default.')
      }
    }

    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: false })
    if (!adminParsed.ok) {
      errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`)
    } else if (!PRODUCTION_ADMIN_ALLOWLIST.has(adminParsed.hostname)) {
      errors.push(`Admin catalog host is not allowlisted: ${adminParsed.hostname}`)
    } else {
      adminCatalogBaseUrl = adminParsed.url
    }
  } else {
    const expressCandidate = expressRaw || DEV_EXPRESS_DEFAULT
    const expressParsed = parseHttpsUrl(expressCandidate, { allowLocalhost: true })
    if (expressParsed.ok) expressCatalogBaseUrl = expressParsed.url
    else errors.push(`Express catalog URL invalid (${expressParsed.reason}).`)

    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: true })
    if (adminParsed.ok) adminCatalogBaseUrl = adminParsed.url
    else errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`)
  }

  return {
    environment: packaged ? 'production' : 'development',
    isPackaged: packaged,
    expressCatalogBaseUrl,
    adminCatalogBaseUrl,
    errors,
    warnings,
    ok: errors.length === 0 && Boolean(expressCatalogBaseUrl) && Boolean(adminCatalogBaseUrl),
  }
}

function resolveSportsPilotToken() {
  const candidates = [
    process.env.HT_SPORTS_PRIVATE_PILOT_TOKEN,
    // Dev convenience only — never rely on Vite-prefixed secrets in packaged builds.
    process.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN,
  ]
  for (const candidate of candidates) {
    const token = String(candidate || '').trim()
    if (token.length >= 16) return token
  }
  return null
}

function getRuntimeDiagnostics(isPackaged) {
  const config = resolveMainRuntimeConfig({ isPackaged })
  return {
    isPackaged: config.isPackaged,
    environment: config.environment,
    ok: config.ok,
    errors: config.errors,
    warnings: config.warnings,
    expressConfigured: Boolean(config.expressCatalogBaseUrl),
    adminConfigured: Boolean(config.adminCatalogBaseUrl),
    sportsPilotConfigured: Boolean(resolveSportsPilotToken()),
  }
}

module.exports = {
  resolveMainRuntimeConfig,
  resolveSportsPilotToken,
  getRuntimeDiagnostics,
  PRODUCTION_EXPRESS_ALLOWLIST,
  PRODUCTION_ADMIN_ALLOWLIST,
  parseHttpsUrl,
}
