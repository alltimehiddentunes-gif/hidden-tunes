import type { StoredPageId } from './localPreferences'

export type MusicActiveView =
  | 'page'
  | 'song'
  | 'album'
  | 'artist'
  | 'mood'
  | 'podcast-show'
  | 'audiobook-book'
  | 'motivational-program'

const MUSIC_NAV_KEYS = new Set([
  'music',
  'search',
  'artists',
  'albums',
  'playlists',
  'liked',
  'library',
  'worlds',
  'recent',
  'downloads',
])

const NON_MUSIC_DETAIL_VIEWS = new Set([
  'podcast-show',
  'audiobook-book',
  'motivational-program',
])

export function isMusicSectionNavActive(
  activeNavKey: string,
  activeView: MusicActiveView,
  activePage: StoredPageId,
): boolean {
  if (MUSIC_NAV_KEYS.has(activeNavKey)) return true
  if (activePage === 'music' || activePage === 'discover' || activePage === 'mood') return true

  if (NON_MUSIC_DETAIL_VIEWS.has(activeView)) return false

  if (
    activeView === 'song'
    || activeView === 'album'
    || activeView === 'artist'
    || activeView === 'mood'
  ) {
    const nonMusicNav = new Set(['radio', 'podcasts', 'audiobooks', 'motivationals', 'tv', 'home'])
    return !nonMusicNav.has(activeNavKey)
  }

  return false
}
