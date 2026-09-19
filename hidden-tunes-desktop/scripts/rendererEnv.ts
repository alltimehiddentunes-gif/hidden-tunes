import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

// Build-time public configuration is an exact allowlist, never a prefix trust rule.
export const PUBLIC_RENDERER_KEYS = [
  'VITE_EXPRESS_CATALOG_API_URL', 'VITE_CATALOG_ADMIN_API_URL',
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'VITE_PUBLIC_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SPORTS_STREAMS_ENABLED', 'VITE_CROSSPLAY_ENABLED',
] as const
const LOCAL_DEV_KEYS = [
  'VITE_CROSSPLAY_LOCAL_ENDPOINT', 'VITE_CROSSPLAY_LOCAL_IDENTITY',
  'VITE_CROSSPLAY_LOCAL_JWT',
]
export const PILOT_KEYS = [
  'SPORTS_PRIVATE_PILOT_TOKEN', 'HT_SPORTS_PRIVATE_PILOT_TOKEN',
  'VITE_SPORTS_PRIVATE_PILOT_TOKEN',
] as const

export function rendererDefines(env: Record<string, string>, development: boolean) {
  const keys: readonly string[] = [...PUBLIC_RENDERER_KEYS, ...(development ? LOCAL_DEV_KEYS : [])]
  return Object.fromEntries(keys.filter((key) => env[key] !== undefined)
    .map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key])]))
}

export function assertNoPilotMaterial(content: string, values: readonly string[] = []) {
  if ([...PILOT_KEYS, ...values.filter((value) => value.length >= 16)]
    .some((value) => content.includes(value))) {
    throw new Error('Renderer private-pilot material detected (value redacted)')
  }
}

export function assertRendererSource(content: string, values: readonly string[] = []) {
  assertNoPilotMaterial(content, values)
  // Reject whole process environment bridges, including bracket notation.
  if (/\bprocess\s*(?:(?:\.|\?\.)\s*env\b|(?:\?\.)?\s*\[\s*['"]env['"]\s*\])/.test(content)) {
    throw new Error('Renderer/preload process environment access is forbidden')
  }
}

export function assertRendererConfig(
  envPrefix: string | string[] | undefined,
  env: Record<string, unknown>,
  define: Record<string, unknown>,
  development: boolean,
  values: readonly string[] = [],
) {
  if (!Array.isArray(envPrefix) || envPrefix.length !== 0) {
    throw new Error('Automatic renderer environment prefixes must be disabled')
  }
  const allowed = new Set<string>([...PUBLIC_RENDERER_KEYS, ...(development ? LOCAL_DEV_KEYS : [])])
  for (const key of Object.keys(env)) {
    if (!['BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR'].includes(key)) {
      throw new Error('Unexpected automatically exposed renderer environment key')
    }
  }
  for (const [key, value] of Object.entries(define)) {
    if (!key.startsWith('import.meta.env.') || !allowed.has(key.slice('import.meta.env.'.length))) {
      throw new Error('Renderer define is outside the public allowlist')
    }
    assertNoPilotMaterial(`${key}:${JSON.stringify(value)}`, values)
  }
}

export function rendererSecretBoundary(root: string, values: readonly string[] = []): Plugin {
  function inspectTree(directory: string, publicAssets = false) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) inspectTree(file, publicAssets)
      else if (/\.(?:[cm]?[jt]sx?|html)$/.test(file)) {
        assertRendererSource(fs.readFileSync(file, 'utf8'), values)
      } else if (publicAssets) {
        assertNoPilotMaterial(fs.readFileSync(file).toString('utf8'), values)
      }
    }
  }
  return {
    name: 'hidden-tunes-renderer-secret-boundary',
    enforce: 'pre',
    configResolved(config) {
      assertRendererConfig(config.envPrefix, config.env, config.define ?? {},
        config.command === 'serve' && !config.isProduction, values)
    },
    buildStart() {
      inspectTree(path.join(root, 'src'))
      inspectTree(path.join(root, 'public'), true)
      const preload = path.join(root, 'electron/preload.js')
      if (fs.existsSync(preload)) assertRendererSource(fs.readFileSync(preload, 'utf8'), values)
    },
    transform(code, id) {
      if (id.replaceAll('\\', '/').startsWith(`${root.replaceAll('\\', '/')}/src/`)) {
        assertRendererSource(code, values)
      }
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const item of Object.values(bundle)) {
          if (item.type === 'chunk') {
            assertNoPilotMaterial(item.code, values)
            if (item.map) assertNoPilotMaterial(JSON.stringify(item.map), values)
          } else {
            assertNoPilotMaterial(typeof item.source === 'string'
              ? item.source : Buffer.from(item.source).toString('utf8'), values)
          }
        }
      },
    },
  }
}
