import type { WebNavigationRoute } from './webNavigationBridge'

const EMOTIONAL_WORLD_IDS = new Set(['calm', 'chill', 'happy', 'romantic', 'motivational', 'melancholy', 'energetic'])

const PAGE_PATHS: ReadonlyArray<readonly [string, WebNavigationRoute]> = [
  ['/', { kind: 'page', page: 'home' }],
  ['/music', { kind: 'page', page: 'music' }],
  ['/explore', { kind: 'page', page: 'music' }],
  ['/radio', { kind: 'page', page: 'radio' }],
  ['/podcasts', { kind: 'page', page: 'podcasts' }],
  ['/audiobooks', { kind: 'page', page: 'audiobooks' }],
  ['/motivationals', { kind: 'page', page: 'motivationals' }],
  ['/lectures', { kind: 'page', page: 'lectures' }],
  ['/tv', { kind: 'page', page: 'tv' }],
  ['/emotional-worlds', { kind: 'page', page: 'worlds' }],
  ['/search', { kind: 'page', page: 'search' }],
  ['/library', { kind: 'page', page: 'library' }],
  ['/favorites', { kind: 'page', page: 'liked' }],
  ['/history', { kind: 'page', page: 'recent' }],
  ['/downloads', { kind: 'page', page: 'downloads' }],
  ['/playlists', { kind: 'page', page: 'playlists' }],
  ['/artists', { kind: 'page', page: 'artists' }],
  ['/albums', { kind: 'page', page: 'albums' }],
  ['/premium', { kind: 'page', page: 'premium' }],
  ['/settings', { kind: 'page', page: 'settings' }],
  ['/about', { kind: 'page', page: 'about' }],
  ['/download', { kind: 'page', page: 'download' }],
  ['/originals', { kind: 'page', page: 'originals' }],
  ['/support', { kind: 'page', page: 'support' }],
  ['/contact', { kind: 'page', page: 'contact' }],
  ['/privacy', { kind: 'page', page: 'privacy' }],
  ['/terms', { kind: 'page', page: 'terms' }],
  ['/account-deletion', { kind: 'page', page: 'account-deletion' }],
]

const PAGE_BY_PATH = new Map(PAGE_PATHS)
const PATH_BY_PAGE = new Map(PAGE_PATHS.map(([path, route]) => [route.kind === 'page' ? route.page : '', path]))

const PAGE_ALIASES = new Map<string, WebNavigationRoute>([
  ['/worlds', { kind: 'page', page: 'worlds' }],
  ['/profile', { kind: 'page', page: 'settings' }],
  ['/auth', { kind: 'page', page: 'settings' }],
  ['/auth/callback', { kind: 'page', page: 'settings' }],
  ['/reset-password', { kind: 'page', page: 'settings' }],
])
const AUTH_CALLBACK_PATHS = new Set(['/auth', '/auth/callback', '/reset-password'])

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
}

function decodePathId(value: string | undefined) {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value)
    const containsInvalidCharacter = decoded.includes('\\')
      || decoded.includes('/')
      || Array.from(decoded).some((character) => character.charCodeAt(0) <= 31)
    return decoded && !containsInvalidCharacter ? decoded : null
  } catch {
    return null
  }
}

export function routeFromBrowserLocation(pathname = window.location.pathname): WebNavigationRoute | null {
  const normalized = normalizePath(pathname)
  const page = PAGE_BY_PATH.get(normalized) ?? PAGE_ALIASES.get(normalized)
  if (page) return page

  let match = normalized.match(/^\/podcasts\/([^/]+)\/episodes\/([^/]+)$/)
  if (match) {
    const showId = decodePathId(match[1])
    const episodeId = decodePathId(match[2])
    return showId && episodeId ? { kind: 'podcast-episode', showId, episodeId } : null
  }
  match = normalized.match(/^\/audiobooks\/([^/]+)\/chapters\/([^/]+)$/)
  if (match) {
    const bookId = decodePathId(match[1])
    const chapterId = decodePathId(match[2])
    return bookId && chapterId ? { kind: 'audiobook-chapter', bookId, chapterId } : null
  }

  const emotionalWorldMatch = normalized.match(/^\/emotional-worlds\/([^/]+)$/)
  if (emotionalWorldMatch) {
    const id = decodePathId(emotionalWorldMatch[1])
    return id && EMOTIONAL_WORLD_IDS.has(id)
      ? { kind: 'emotional-world', id }
      : { kind: 'page', page: 'not-found' }
  }

  const detailRoutes: ReadonlyArray<readonly [RegExp, WebNavigationRoute['kind']]> = [
    [/^\/tracks\/([^/]+)$/, 'track'],
    [/^\/artists?\/([^/]+)$/, 'artist'],
    [/^\/albums?\/([^/]+)$/, 'album'],
    [/^\/podcasts\/([^/]+)$/, 'podcast-show'],
    [/^\/audiobooks\/([^/]+)$/, 'audiobook'],
    [/^\/motivationals\/([^/]+)$/, 'motivational-program'],
    [/^\/lectures\/([^/]+)$/, 'lecture-series'],
    [/^\/radio\/stations\/([^/]+)$/, 'radio-station'],
    [/^\/tv\/channels\/([^/]+)$/, 'tv-channel'],
    [/^\/playlists\/([^/]+)$/, 'playlist'],
  ]
  for (const [pattern, kind] of detailRoutes) {
    const id = decodePathId(normalized.match(pattern)?.[1])
    if (id) return { kind, id } as WebNavigationRoute
  }
  return { kind: 'page', page: 'not-found' }
}

export function pathForWebRoute(route: WebNavigationRoute) {
  if (route.kind === 'page') {
    if (route.page === 'not-found') return normalizePath(window.location.pathname)
    return PATH_BY_PAGE.get(route.page) ?? '/'
  }
  if (route.kind === 'podcast-episode') {
    return `/podcasts/${encodeURIComponent(route.showId)}/episodes/${encodeURIComponent(route.episodeId)}`
  }
  if (route.kind === 'audiobook-chapter') {
    return `/audiobooks/${encodeURIComponent(route.bookId)}/chapters/${encodeURIComponent(route.chapterId)}`
  }
  const bases: Partial<Record<WebNavigationRoute['kind'], string>> = {
    track: '/tracks',
    artist: '/artists',
    album: '/albums',
    'podcast-show': '/podcasts',
    audiobook: '/audiobooks',
    'motivational-program': '/motivationals',
    'lecture-series': '/lectures',
    'radio-station': '/radio/stations',
    'tv-channel': '/tv/channels',
    'emotional-world': '/emotional-worlds',
    playlist: '/playlists',
  }
  const base = bases[route.kind]
  return base && 'id' in route ? `${base}/${encodeURIComponent(route.id)}` : '/'
}

export function installWebBrowserBootstrap() {
  if (typeof window === 'undefined' || window.hiddenTunesDesktop) return
  if (!/^https?:$/.test(window.location.protocol)) return

  const initialRoute = routeFromBrowserLocation()
  window.__HT_WEB_NAVIGATION_BOOTSTRAP__ = {
    enabled: true,
    initialRoute,
  }

  const connect = () => {
    const navigation = window.HiddenTunesNavigation
    if (!navigation || !initialRoute) return false
    navigation.subscribe((route) => {
      if (route.kind === 'page' && route.page === 'settings' && AUTH_CALLBACK_PATHS.has(normalizePath(window.location.pathname))) {
        return
      }
      const nextPath = pathForWebRoute(route)
      if (normalizePath(nextPath) !== normalizePath(window.location.pathname)) {
        window.history.pushState({ hiddenTunesRoute: true }, '', nextPath)
      }
    })
    window.addEventListener('popstate', () => {
      const route = routeFromBrowserLocation()
      if (route) navigation.navigate(route)
    })
    return true
  }

  if (!connect()) {
    window.addEventListener('hidden-tunes-navigation-ready', connect, { once: true })
  }
}
