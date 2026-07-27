/**
 * Authoritative desktop runtime configuration.
 * Renderer-safe: never includes sports private pilot token.
 */

export type DesktopRuntimeEnvironment = 'development' | 'production' | 'unknown'

export type DesktopRuntimeConfig = {
  environment: DesktopRuntimeEnvironment
  isPackaged: boolean
  isDev: boolean
  expressCatalogBaseUrl: string | null
  adminCatalogBaseUrl: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  /** Human-readable config issues (no secrets). */
  errors: string[]
  /** Soft warnings (no secrets). */
  warnings: string[]
  ok: boolean
}

export type ResolveDesktopRuntimeConfigInput = {
  isPackaged?: boolean
  isDev?: boolean
  /** Vite / process env bag (public keys only). */
  env?: Record<string, string | undefined>
  /** Optional packaged runtime hint from preload (no secrets). */
  runtimeBridge?: { isPackaged?: boolean; environment?: string } | null
}

const DEV_EXPRESS_DEFAULT = 'https://hidden-tunes-api.onrender.com'
const DEV_ADMIN_DEFAULT = 'https://admin.hiddentunes.com'

/** Hosts allowed for Express music API in packaged production. */
export const PRODUCTION_EXPRESS_ALLOWLIST = new Set([
  'api.hiddentunes.com',
  'hidden-tunes-api.onrender.com',
])

/** Hosts allowed for admin multi-family API. */
export const PRODUCTION_ADMIN_ALLOWLIST = new Set(['admin.hiddentunes.com'])

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i

function readEnv(
  env: Record<string, string | undefined>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '')
}

export function parseHttpsUrl(
  raw: string | null,
  options: { allowLocalhost: boolean },
): { ok: true; url: string; hostname: string } | { ok: false; reason: string } {
  if (!raw) return { ok: false, reason: 'missing' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'https-required' }
  }
  if (!options.allowLocalhost && LOCALHOST_RE.test(parsed.hostname)) {
    return { ok: false, reason: 'localhost-forbidden' }
  }
  return {
    ok: true,
    url: stripTrailingSlash(parsed.toString()),
    hostname: parsed.hostname,
  }
}

function detectPackaged(input: ResolveDesktopRuntimeConfigInput): boolean {
  if (typeof input.isPackaged === 'boolean') return input.isPackaged
  if (input.runtimeBridge && typeof input.runtimeBridge.isPackaged === 'boolean') {
    return input.runtimeBridge.isPackaged
  }
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
      return true
    }
  } catch {
    // ignore
  }
  return false
}

function detectDev(input: ResolveDesktopRuntimeConfigInput, isPackaged: boolean): boolean {
  if (typeof input.isDev === 'boolean') return input.isDev
  if (isPackaged) return false
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return !isPackaged
  }
}

function collectPublicEnv(
  input: ResolveDesktopRuntimeConfigInput,
): Record<string, string | undefined> {
  if (input.env) return input.env
  try {
    return (import.meta as { env?: Record<string, string | undefined> }).env || {}
  } catch {
    return {}
  }
}

/**
 * Resolve renderer-safe desktop config.
 * Never returns sports private pilot token.
 */
export function resolveDesktopRuntimeConfig(
  input: ResolveDesktopRuntimeConfigInput = {},
): DesktopRuntimeConfig {
  const isPackaged = detectPackaged(input)
  const isDev = detectDev(input, isPackaged)
  const environment: DesktopRuntimeEnvironment = isPackaged
    ? 'production'
    : isDev
      ? 'development'
      : 'unknown'
  const env = collectPublicEnv(input)
  const errors: string[] = []
  const warnings: string[] = []

  const expressRaw = readEnv(env, ['VITE_EXPRESS_CATALOG_API_URL'])
  const adminRaw = readEnv(env, [
    'VITE_CATALOG_ADMIN_API_URL',
    'HT_CATALOG_ADMIN_API_URL',
  ])
  const supabaseUrlRaw = readEnv(env, [
    'VITE_SUPABASE_URL',
    'VITE_PUBLIC_SUPABASE_URL',
  ])
  const supabaseAnonRaw = readEnv(env, [
    'VITE_SUPABASE_ANON_KEY',
    'VITE_PUBLIC_SUPABASE_ANON_KEY',
  ])

  // Reject accidental service-role key usage (must never be accepted).
  if (supabaseAnonRaw && /service[_-]?role/i.test(supabaseAnonRaw)) {
    errors.push('Supabase service-role keys are not allowed in the desktop client.')
  }

  let expressCatalogBaseUrl: string | null = null
  let adminCatalogBaseUrl: string | null = null

  if (isPackaged) {
    const expressParsed = parseHttpsUrl(expressRaw, { allowLocalhost: false })
    if (!expressParsed.ok) {
      errors.push(
        expressParsed.reason === 'missing'
          ? 'Packaged build requires VITE_EXPRESS_CATALOG_API_URL.'
          : `Express catalog URL invalid (${expressParsed.reason}).`,
      )
    } else if (!PRODUCTION_EXPRESS_ALLOWLIST.has(expressParsed.hostname)) {
      errors.push(`Express catalog host is not allowlisted: ${expressParsed.hostname}`)
    } else {
      expressCatalogBaseUrl = expressParsed.url
    }

    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: false })
    if (!adminParsed.ok) {
      errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`)
    } else if (!PRODUCTION_ADMIN_ALLOWLIST.has(adminParsed.hostname)) {
      errors.push(`Admin catalog host is not allowlisted: ${adminParsed.hostname}`)
    } else {
      adminCatalogBaseUrl = adminParsed.url
      if (!adminRaw) {
        warnings.push('Admin catalog URL used production default admin.hiddentunes.com.')
      }
    }
  } else {
    const expressCandidate = expressRaw || DEV_EXPRESS_DEFAULT
    const expressParsed = parseHttpsUrl(expressCandidate, { allowLocalhost: true })
    if (!expressParsed.ok) {
      errors.push(`Express catalog URL invalid (${expressParsed.reason}).`)
    } else {
      expressCatalogBaseUrl = expressParsed.url
      if (!expressRaw) {
        warnings.push('Development Express catalog default in use (Render).')
      }
    }

    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: true })
    if (!adminParsed.ok) {
      errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`)
    } else {
      adminCatalogBaseUrl = adminParsed.url
    }
  }

  let supabaseUrl: string | null = null
  let supabaseAnonKey: string | null = null

  if (supabaseUrlRaw) {
    const parsed = parseHttpsUrl(supabaseUrlRaw, { allowLocalhost: !isPackaged })
    if (!parsed.ok) {
      warnings.push(`Supabase URL ignored (${parsed.reason}).`)
    } else {
      supabaseUrl = parsed.url
    }
  }

  if (supabaseAnonRaw && !errors.some((e) => e.includes('service-role'))) {
    supabaseAnonKey = supabaseAnonRaw
  }

  // Renderer must never surface sports private token — assert env key is not copied into config.
  const leakedSports =
    readEnv(env, ['HT_SPORTS_PRIVATE_PILOT_TOKEN']) ||
    (isPackaged ? readEnv(env, ['VITE_SPORTS_PRIVATE_PILOT_TOKEN']) : null)
  if (leakedSports && isPackaged) {
    warnings.push(
      'Sports private pilot token must stay main-process only (ignored by renderer config).',
    )
  }

  return {
    environment,
    isPackaged,
    isDev,
    expressCatalogBaseUrl,
    adminCatalogBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    errors,
    warnings,
    ok: errors.length === 0 && Boolean(expressCatalogBaseUrl) && Boolean(adminCatalogBaseUrl),
  }
}

let cachedConfig: DesktopRuntimeConfig | null = null

export function getDesktopRuntimeConfig(force = false): DesktopRuntimeConfig {
  if (!force && cachedConfig) return cachedConfig
  let runtimeBridge: ResolveDesktopRuntimeConfigInput['runtimeBridge'] = null
  try {
    if (typeof window !== 'undefined') {
      runtimeBridge = window.hiddenTunesDesktop?.runtime?.getInfo?.() ?? null
    }
  } catch {
    runtimeBridge = null
  }
  cachedConfig = resolveDesktopRuntimeConfig({ runtimeBridge })
  return cachedConfig
}

export function resetDesktopRuntimeConfigCache() {
  cachedConfig = null
}

export function getExpressCatalogBaseUrlOrThrow(): string {
  const config = getDesktopRuntimeConfig()
  if (!config.expressCatalogBaseUrl) {
    throw new Error(
      config.errors[0] ||
        'Music catalog API is not configured for this desktop build.',
    )
  }
  return config.expressCatalogBaseUrl
}

export function getAdminCatalogBaseUrlOrThrow(): string {
  const config = getDesktopRuntimeConfig()
  if (!config.adminCatalogBaseUrl) {
    throw new Error(
      config.errors[0] ||
        'Admin catalog API is not configured for this desktop build.',
    )
  }
  return config.adminCatalogBaseUrl
}

declare global {
  interface Window {
    hiddenTunesDesktop?: {
      catalog?: unknown
      downloads?: unknown
      runtime?: {
        getInfo?: () => {
          isPackaged: boolean
          environment: string
          ok?: boolean
          errors?: string[]
          warnings?: string[]
          expressConfigured?: boolean
          adminConfigured?: boolean
          sportsPilotConfigured?: boolean
        }
      }
    }
  }
}
