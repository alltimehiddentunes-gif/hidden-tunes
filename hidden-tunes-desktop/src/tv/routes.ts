import type { WebNavigationRoute } from '../lib/webNavigationBridge'
import { EMOTIONAL_WORLDS } from '../lib/emotionalWorlds'

const TV_EMOTIONAL_WORLD_IDS = new Set(EMOTIONAL_WORLDS.map((world) => world.id))

export const TV_PAGE_PATHS = new Set([
  '/', '/explore', '/search', '/player', '/library', '/music', '/tv', '/radio',
  '/podcasts', '/audiobooks', '/motivationals', '/lectures', '/emotional-worlds', '/about', '/activate',
])

export function normalizeTvPath(pathname: string) {
  const clean = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return clean || '/'
}

export function isTvCanonicalPath(pathname: string) {
  const path = normalizeTvPath(pathname)
  return TV_PAGE_PATHS.has(path)
    || /^\/artist\/[^/]+$/.test(path)
    || /^\/album\/[^/]+$/.test(path)
    || isKnownEmotionalWorldPath(path)
}

export function tvRouteFromPath(pathname: string): WebNavigationRoute {
  const path = normalizeTvPath(pathname)
  const artist = path.match(/^\/artist\/([^/]+)$/)
  if (artist) {
    const id = decodeId(artist[1])
    return id ? { kind: 'artist', id } : { kind: 'page', page: 'not-found' }
  }
  const album = path.match(/^\/album\/([^/]+)$/)
  if (album) {
    const id = decodeId(album[1])
    return id ? { kind: 'album', id } : { kind: 'page', page: 'not-found' }
  }
  const emotionalWorld = path.match(/^\/emotional-worlds\/([^/]+)$/)
  if (emotionalWorld) {
    const id = decodeId(emotionalWorld[1])
    return id && TV_EMOTIONAL_WORLD_IDS.has(id as (typeof EMOTIONAL_WORLDS)[number]['id'])
      ? { kind: 'emotional-world', id }
      : { kind: 'page', page: 'not-found' }
  }
  const pages: Record<string, WebNavigationRoute> = {
    '/': { kind: 'page', page: 'home' },
    '/explore': { kind: 'page', page: 'music' },
    '/player': { kind: 'page', page: 'home' },
    '/search': { kind: 'page', page: 'search' },
    '/library': { kind: 'page', page: 'library' },
    '/music': { kind: 'page', page: 'music' },
    '/tv': { kind: 'page', page: 'tv' },
    '/radio': { kind: 'page', page: 'radio' },
    '/podcasts': { kind: 'page', page: 'podcasts' },
    '/audiobooks': { kind: 'page', page: 'audiobooks' },
    '/motivationals': { kind: 'page', page: 'motivationals' },
    '/lectures': { kind: 'page', page: 'lectures' },
    '/emotional-worlds': { kind: 'page', page: 'worlds' },
    '/about': { kind: 'page', page: 'about' },
    '/activate': { kind: 'page', page: 'settings' },
  }
  return pages[path] ?? { kind: 'page', page: 'not-found' }
}

function isKnownEmotionalWorldPath(path: string) {
  const match = path.match(/^\/emotional-worlds\/([^/]+)$/)
  const id = decodeId(match?.[1])
  return Boolean(id && TV_EMOTIONAL_WORLD_IDS.has(id as (typeof EMOTIONAL_WORLDS)[number]['id']))
}

function decodeId(value: string | undefined) {
  try {
    const decoded = decodeURIComponent(value ?? '').trim()
    return decoded && !decoded.includes('/') && !decoded.includes('\\') ? decoded : null
  } catch {
    return null
  }
}

export function tvPathForRoute(route: WebNavigationRoute) {
  if (route.kind === 'artist') return `/artist/${encodeURIComponent(route.id)}`
  if (route.kind === 'album') return `/album/${encodeURIComponent(route.id)}`
  if (route.kind === 'emotional-world') return `/emotional-worlds/${encodeURIComponent(route.id)}`
  if (route.kind !== 'page') return null
  const pagePaths: Record<string, string> = {
    home: '/', music: '/explore', search: '/search', library: '/library', tv: '/tv',
    radio: '/radio', podcasts: '/podcasts', audiobooks: '/audiobooks',
    motivationals: '/motivationals', lectures: '/lectures', about: '/about',
    worlds: '/emotional-worlds',
  }
  return pagePaths[route.page] ?? null
}
