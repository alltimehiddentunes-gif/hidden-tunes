import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function lazyTvAdaptiveEngines() {
  return {
    name: 'hidden-tunes-tv-lazy-adaptive-engines',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, '/').endsWith('/src/lib/tv/HtmlVideoPlaybackService.ts')) return null
      return code
        .replace("import Hls from 'hls.js'\n", '')
        .replace("import * as dashjs from 'dashjs'\n", '')
        .replace('private hls: Hls | null = null', 'private hls: import(\'hls.js\').default | null = null')
        .replace('private dash: dashjs.MediaPlayerClass | null = null', 'private dash: import(\'dashjs\').MediaPlayerClass | null = null')
        .replace("if (adapter === 'dash') {", "if (adapter === 'dash') {\n      const dashjs = await import('dashjs')")
        .replace('if (!Hls.isSupported()) throw nativeError', "if (typeof MediaSource === 'undefined') throw nativeError")
        .replace('if (hlsSource && Hls.isSupported()) {', "const Hls = hlsSource ? (await import('hls.js')).default : null\n    if (Hls && Hls.isSupported()) {")
    },
  }
}

function boundTvCatalogPages() {
  return {
    name: 'hidden-tunes-tv-bounded-catalog-pages',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const sourcePath = id.replace(/\\/g, '/')
      if (!sourcePath.includes('/src/lib/')) return null
      if (!sourcePath.includes('/musicCatalog/types.ts') && !/\/(radio|podcasts|audiobooks|motivationals|lectures|tv)\//.test(sourcePath)) return null
      return code
        .replace(/(DEFAULT_PAGE_LIMIT\s*=\s*)(20|40)/g, '$16')
        .replace(/(MUSIC_CATALOG_PAGE_SIZE\s*=\s*)40/g, '$16')
        .replace(/(TV_PAGE_SIZE\s*=\s*)40/g, '$16')
    },
  }
}

function routeTvMusicCatalogThroughProxy() {
  return {
    name: 'hidden-tunes-tv-music-catalog-proxy',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const sourcePath = id.replace(/\\/g, '/')
      if (sourcePath.endsWith('/src/lib/config/desktopRuntimeConfig.ts')) {
        const replaced = code.replace(
          "    return (import.meta as { env?: Record<string, string | undefined> }).env || {}",
          "    return { ...(import.meta as { env?: Record<string, string | undefined> }).env, VITE_EXPRESS_CATALOG_API_URL: 'https://api.hiddentunes.com', VITE_CATALOG_ADMIN_API_URL: 'https://admin.hiddentunes.com' }",
        )
        if (replaced === code) throw new Error('Universal TV catalog config transform did not match desktopRuntimeConfig.ts')
        return replaced
      }
      if (sourcePath.endsWith('/src/lib/emotionalWorldApi.ts')) {
        const replaced = code.replace(
          '  const base = getDesktopRuntimeConfig().adminCatalogBaseUrl',
          "  const base = '/__tv_catalog'",
        )
        if (replaced === code) throw new Error('Universal TV Emotional Worlds proxy transform did not match emotionalWorldApi.ts')
        return replaced
      }
      if (!sourcePath.endsWith('/src/lib/api.ts')) return null
      const replaced = code.replace(
        /export function getApiBaseUrl\(\): string \{\s*return getExpressCatalogBaseUrlOrThrow\(\)\s*\}/,
        "export function getApiBaseUrl(): string {\n  return '/__tv_catalog'\n}",
      )
      if (replaced === code) throw new Error('Universal TV music catalog proxy transform did not match api.ts')
      return replaced
    },
  }
}

function resolveTvArtworkBeforeReactMount() {
  return {
    name: 'hidden-tunes-tv-resolve-artwork-before-react-mount',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, '/').endsWith('/src/components/ArtworkImage.tsx')) return null
      return code
        .replace("  const [failed, setFailed] = useState(false)", "  const [failed, setFailed] = useState(false)\n  const resolvedSrc = (window as typeof window & { __HT_TV_RESOLVE_ARTWORK__?: (src: string | null, mediaId: string) => string | null }).__HT_TV_RESOLVE_ARTWORK__?.(src, seed) ?? src")
        .replace('{!src || failed ? (', '{!resolvedSrc ? (')
        .replace('          src={src}', '          src={resolvedSrc}\n          data-tv-original-artwork={src ?? \'\'}\n          data-tv-media-id={seed}\n          data-tv-artwork-field="src"')
    },
  }
}

function pinTvPrimaryPlayerArtwork() {
  return {
    name: 'hidden-tunes-tv-pin-primary-player-artwork',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const sourcePath = id.replace(/\\/g, '/')
      if (!sourcePath.endsWith('/src/components/player/DesktopPersistentPlayer.tsx') && !sourcePath.endsWith('/src/components/player/PremiumFullscreenShell.tsx')) return null
      const mediaId = sourcePath.endsWith('/PremiumFullscreenShell.tsx') ? "displayTrack?.id ?? 'premium-shell'" : "activeTrack?.id ?? 'persistent-player'"
      const media = sourcePath.endsWith('/PremiumFullscreenShell.tsx') ? 'displayTrack' : 'activeTrack'
      const selector = `(window as typeof window & { __HT_TV_SELECT_ARTWORK__?: (media: unknown, displayArtwork: string | null) => { url: string | null; field: string } }).__HT_TV_SELECT_ARTWORK__?.(${media}, displayArtwork)`
      const replaced = code.replace(
        /<ArtworkImage\s+src=\{displayArtwork\}[\s\S]*?priority\s*\/>/,
        `<img src="/__tv_art/fallback.jpg" data-tv-original-artwork={${selector}?.url ?? displayArtwork ?? ''} data-tv-artwork-field={${selector}?.field ?? 'displayArtwork'} data-tv-media-id={${mediaId}} alt="" className="card-art-img tv-primary-player-artwork" loading="eager" decoding="async" />`,
      )
      if (replaced === code) throw new Error(`Universal TV primary artwork transform did not match ${sourcePath}`)
      return replaced
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [lazyTvAdaptiveEngines(), boundTvCatalogPages(), routeTvMusicCatalogThroughProxy(), resolveTvArtworkBeforeReactMount(), pinTvPrimaryPlayerArtwork(), react()],
    build: {
      outDir: 'dist-tv',
      emptyOutDir: true,
      target: ['chrome61', 'safari11'],
      cssTarget: 'chrome61',
      modulePreload: false,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: { tv: path.resolve(process.cwd(), 'tv.html') },
        output: {
          manualChunks(id) {
            if (id.includes('/localization/locales/')) return 'tv-locales'
            if (id.includes('/node_modules/dashjs/')) return 'tv-dash'
            if (id.includes('/node_modules/hls.js/')) return 'tv-hls'
            if (id.includes('/node_modules/@supabase/')) return 'tv-auth'
            if (id.includes('/node_modules/react')) return 'tv-react'
            return undefined
          },
        },
      },
    },
    define: {
      'import.meta.env.VITE_CATALOG_ADMIN_API_URL': JSON.stringify('/__tv_catalog'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.VITE_PUBLIC_SUPABASE_ANON_KEY || ''),
    },
  }
})
