export const WEB_NAVIGATION_PAGE_KEYS = [
  'home',
  'music',
  'radio',
  'podcasts',
  'audiobooks',
  'motivationals',
  'lectures',
  'tv',
  'sports',
  'worlds',
  'search',
  'library',
  'liked',
  'recent',
  'downloads',
  'playlists',
  'artists',
  'albums',
  'premium',
  'settings',
  'about',
  'originals',
  'support',
  'contact',
  'privacy',
  'terms',
  'account-deletion',
] as const

export type WebNavigationPageKey = (typeof WEB_NAVIGATION_PAGE_KEYS)[number]

export type WebNavigationRoute =
  | { kind: 'page'; page: WebNavigationPageKey }
  | { kind: 'track'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'album'; id: string }
  | { kind: 'podcast-show'; id: string }
  | { kind: 'audiobook'; id: string }
  | { kind: 'motivational-program'; id: string }
  | { kind: 'lecture-series'; id: string }
  | { kind: 'radio-station'; id: string }
  | { kind: 'podcast-episode'; showId: string; episodeId: string }
  | { kind: 'audiobook-chapter'; bookId: string; chapterId: string }
  | { kind: 'tv-channel'; id: string }
  | { kind: 'emotional-world'; id: string }
  | { kind: 'playlist'; id: string }

export type WebNavigationRequest = (target: WebNavigationRoute) => boolean

export interface HiddenTunesNavigationBridge {
  getCurrentRoute(): WebNavigationRoute
  navigate(target: WebNavigationRoute): boolean
  initialize(target: WebNavigationRoute): boolean
  subscribe(listener: (route: WebNavigationRoute) => void): () => void
}

type WebNavigationBootstrap = {
  enabled?: boolean
  initialRoute?: unknown
}

declare global {
  interface Window {
    __HT_WEB_NAVIGATION_BOOTSTRAP__?: WebNavigationBootstrap
    HiddenTunesNavigation?: HiddenTunesNavigationBridge
  }
}

const listeners = new Set<(route: WebNavigationRoute) => void>()
let currentRoute: WebNavigationRoute = { kind: 'page', page: 'home' }
let requestNavigation: WebNavigationRequest | null = null

function cleanId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseWebNavigationRoute(value: unknown): WebNavigationRoute | null {
  if (!value || typeof value !== 'object') return null
  const target = value as Record<string, unknown>
  if (target.kind === 'page') {
    const page = target.page
    return typeof page === 'string' && (WEB_NAVIGATION_PAGE_KEYS as readonly string[]).includes(page)
      ? { kind: 'page', page: page as WebNavigationPageKey }
      : null
  }
  if (target.kind === 'podcast-episode') {
    const showId = cleanId(target.showId)
    const episodeId = cleanId(target.episodeId)
    return showId && episodeId ? { kind: target.kind, showId, episodeId } : null
  }
  if (target.kind === 'audiobook-chapter') {
    const bookId = cleanId(target.bookId)
    const chapterId = cleanId(target.chapterId)
    return bookId && chapterId ? { kind: target.kind, bookId, chapterId } : null
  }
  const id = cleanId(target.id)
  if (!id) return null
  switch (target.kind) {
    case 'track':
    case 'artist':
    case 'album':
    case 'podcast-show':
    case 'audiobook':
    case 'motivational-program':
    case 'lecture-series':
    case 'radio-station':
    case 'tv-channel':
    case 'emotional-world':
    case 'playlist':
      return { kind: target.kind, id }
    default:
      return null
  }
}

export function getWebNavigationInitialRoute() {
  if (typeof window === 'undefined' || window.__HT_WEB_NAVIGATION_BOOTSTRAP__?.enabled !== true) return null
  return parseWebNavigationRoute(window.__HT_WEB_NAVIGATION_BOOTSTRAP__.initialRoute)
}

export function isWebNavigationBridgeEnabled() {
  return typeof window !== 'undefined' && window.__HT_WEB_NAVIGATION_BOOTSTRAP__?.enabled === true
}

export function installWebNavigationBridge(request: WebNavigationRequest) {
  if (typeof window === 'undefined' || window.__HT_WEB_NAVIGATION_BOOTSTRAP__?.enabled !== true) {
    return () => undefined
  }
  requestNavigation = request
  const bridge: HiddenTunesNavigationBridge = {
    getCurrentRoute: () => currentRoute,
    navigate: (target) => {
      const parsed = parseWebNavigationRoute(target)
      return parsed ? Boolean(requestNavigation?.(parsed)) : false
    },
    initialize: (target) => {
      const parsed = parseWebNavigationRoute(target)
      return parsed ? Boolean(requestNavigation?.(parsed)) : false
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  window.HiddenTunesNavigation = bridge
  window.dispatchEvent(new CustomEvent('hidden-tunes-navigation-ready'))
  return () => {
    // The Web shell may remount AppShell while its launch/catalog gate settles.
    // Keep the singleton bridge alive for the document lifetime so History remains connected.
  }
}

export function publishWebNavigationRoute(route: WebNavigationRoute) {
  if (typeof window === 'undefined' || window.__HT_WEB_NAVIGATION_BOOTSTRAP__?.enabled !== true) return
  currentRoute = route
  const detailIdentity = route.kind === 'podcast-episode'
    ? `${route.showId}:${route.episodeId}`
    : route.kind === 'audiobook-chapter'
      ? `${route.bookId}:${route.chapterId}`
      : route.kind === 'page'
        ? route.page
        : route.id
  window.document.documentElement.dataset.webNavigationPublished = route.kind === 'page'
    ? `page:${detailIdentity}`
    : `${route.kind}:${detailIdentity}`
  listeners.forEach((listener) => listener(route))
}
