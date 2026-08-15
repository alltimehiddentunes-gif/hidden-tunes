import type { WebNavigationRoute } from '../lib/webNavigationBridge'

export const TV_PAGE_PATHS = new Set([
  '/', '/explore', '/search', '/player', '/library', '/music', '/tv', '/radio',
  '/podcasts', '/audiobooks', '/motivationals', '/lectures', '/about', '/activate',
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
    '/about': { kind: 'page', page: 'about' },
    '/activate': { kind: 'page', page: 'settings' },
  }
  return pages[path] ?? { kind: 'page', page: 'not-found' }
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
  if (route.kind !== 'page') return null
  const pagePaths: Record<string, string> = {
    home: '/', music: '/explore', search: '/search', library: '/library', tv: '/tv',
    radio: '/radio', podcasts: '/podcasts', audiobooks: '/audiobooks',
    motivationals: '/motivationals', lectures: '/lectures', about: '/about',
  }
  return pagePaths[route.page] ?? null
}
