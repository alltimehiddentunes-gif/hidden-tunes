import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  fetchCatalogBundle,
  filterAlbumsByQuery,
  filterArtistsByQuery,
  sortAlbumsList,
  sortArtistsList,
  sortSongsList,
  type AlbumSort,
  type ApiAlbum,
  type ApiArtist,
  type ApiSong,
  type ArtistSort,
  type CatalogBundle,
  type SongSort,
} from './lib/api'
import {
  buildSearchMetadataIndex,
  metadataRecordToApiSong,
  metadataRecordsToApiSongs,
  searchCatalogSongs,
  sortMetadataRecords,
  type CatalogMetadataIndex,
} from './lib/songMetadata'
import { withDevAudioVersionTestSongs } from './lib/devAudioVersionTestHarness'
import {
  buildCatalogIndexes,
  buildQueueSeedPool,
  CATALOG_DETAIL_TRACK_PREVIEW_LIMIT,
  capSongPool,
  resolveAlbumArtwork,
  resolveAlbumDisplayArtist,
  resolveSongsForAlbum,
  resolveSongsForArtist,
  resolveSongsForMoodRoom,
  type CatalogIndexes,
} from './lib/catalogIndexes'
import {
  logCatalogCacheHit,
  logCatalogCacheMiss,
  logCatalogFetch,
} from './lib/catalogDiagnostics'
import {
  cachedCatalogToBundle,
  clearCachedCatalog,
  readCachedCatalog,
  writeCachedCatalog,
} from './lib/catalogCache'
import {
  AUDIO_QUALITY_MODE_LABELS,
  AUDIO_QUALITY_MODES,
  DESKTOP_PREFERENCE_KEYS,
  parseStoredAlbumSort,
  type AudioQualityMode,
  parseStoredArtistSort,
  parseStoredPageId,
  parseStoredSearchTerm,
  parseStoredSongSort,
  PreferencesResetProvider,
  usePersistedPreference,
  usePreferencesReset,
  type StoredPageId,
} from './lib/localPreferences'
import { VisualSceneBackdrop } from './components/VisualSceneBackdrop'
import {
  DesktopPlaybackProvider,
  useDesktopPlayback,
} from './context/DesktopPlaybackProvider'
import type { QueueContext, QueueSeedMetadata } from './lib/desktopPlayback/types'
import {
  resolveVisualScene,
  type VisualSceneId,
} from './lib/visualScenes'
import {
  analyzeQueueSnapshot,
  describeQueueInsight,
} from './lib/queueSnapshot'
import {
  buildEmotionalLanes,
  filterSongsByEmotionalLane,
  findEmotionalLane,
} from './lib/emotionalDiscovery'
import {
  buildListeningScenes,
  type BuiltListeningScene,
  filterSongsByListeningScene,
  findListeningScene,
} from './lib/sceneListening'
import {
  buildRadioStation,
  describeRadioSeed,
  resolveRadioSeed,
  type BuiltRadioStation,
} from './lib/desktopRadio'
import {
  buildListeningContext,
  deriveListeningAtmosphere,
  type ListeningContextLines,
} from './lib/listeningContext'
import heroPhotoUrl from './assets/hero.png'
import emotionalWorldsReferenceUrl from './assets/emotional-worlds-reference.jpg'
import psdPlaylistsReferenceUrl from './assets/psd-playlists-reference.jpg'
import psdArtistsReferenceUrl from './assets/psd-artists-reference.jpg'
import psdLikedReferenceUrl from './assets/psd-liked-reference.jpg'
import './App.css'

const APP_NAME = 'Hidden Tunes Desktop'
const APP_VERSION = '0.0.1'
const GRID_INITIAL_LIMIT = 24
const GRID_SHOW_MORE_STEP = 24
const SEARCH_DEBOUNCE_MS = 250

const SONG_SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'az', label: 'A–Z' },
]

const ARTIST_SORT_OPTIONS = [
  { value: 'az', label: 'A–Z' },
  { value: 'tracks', label: 'Most tracks' },
]

const ALBUM_SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'az', label: 'A–Z' },
]

const QUEUE_CONTEXT_LABELS: Record<QueueContext, string> = {
  home: 'Home Queue',
  discover: 'Discover Queue',
  album: 'Album Queue',
  artist: 'Artist Queue',
  mood: 'Mood Queue',
  manual: 'Manual Queue',
  radio: 'Radio Queue',
  scene: 'Scene Queue',
  smart: 'Smart Queue',
}

let catalogMemoryCache: CatalogBundle | null = null
let catalogSessionFetchDone = false

type CatalogSource = 'none' | 'cache' | 'live'

type CatalogStatus = 'live' | 'saved' | 'refreshing' | 'refresh_failed'

type SongSelectHandler = (song: ApiSong, index: number) => void

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  live: 'Live catalog',
  saved: 'Saved catalog',
  refreshing: 'Refreshing',
  refresh_failed: 'Refresh failed',
}

function formatSavedCatalogTime(iso: string | null): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return new Date(time).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function resolveCatalogStatus(
  loading: boolean,
  staleCatalog: boolean,
  catalogSource: CatalogSource,
  hasCatalogData: boolean,
  showCatalogError: boolean,
): CatalogStatus {
  if (loading) return 'refreshing'
  if (staleCatalog && hasCatalogData) return 'refresh_failed'
  if (showCatalogError && !hasCatalogData) return 'refresh_failed'
  if (catalogSource === 'live') return 'live'
  if (catalogSource === 'cache' && hasCatalogData) return 'saved'
  return 'saved'
}

function resolveInitialCatalog() {
  try {
    if (catalogMemoryCache) {
      return {
        bundle: catalogMemoryCache,
        source: 'live' as CatalogSource,
        cachedAt: readCachedCatalog()?.cachedAt ?? null,
      }
    }

    const stored = readCachedCatalog()
    if (stored) {
      logCatalogCacheHit({ songCount: stored.songs.length, cachedAt: stored.cachedAt })
      return {
        bundle: cachedCatalogToBundle(stored),
        source: 'cache' as CatalogSource,
        cachedAt: stored.cachedAt,
      }
    }
    logCatalogCacheMiss()
  } catch {
    // Ignore corrupt cache/bootstrap data — app should still open.
  }

  return {
    bundle: { songs: [], albums: [], artists: [] } satisfies CatalogBundle,
    source: 'none' as CatalogSource,
    cachedAt: null as string | null,
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

function buildQueueCandidatePools(indexes: CatalogIndexes) {
  return {
    songsByGenre: indexes.songsByGenre,
    songsByArtistId: indexes.songsByArtistId,
    songsByAlbumName: indexes.songsByAlbumName,
  }
}

type CatalogContextValue = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  searchMetadataIndex: CatalogMetadataIndex
  artistNames: Map<string, string>
  songsByAlbumTitle: Map<string, ApiSong[]>
  songsByArtistName: Map<string, ApiSong[]>
  songsByArtistId: Map<string, ApiSong[]>
  albumsByArtistId: Map<string, ApiAlbum[]>
  loading: boolean
  error: string | null
  loaded: boolean
  catalogStatus: CatalogStatus
  staleCatalog: boolean
  cachedAt: string | null
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  retry: () => void
  refreshCatalog: () => void
  clearCatalogCache: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

function useCatalog() {
  const value = useContext(CatalogContext)
  if (!value) {
    throw new Error('useCatalog must be used within CatalogProvider')
  }
  return value
}

function CatalogProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => resolveInitialCatalog(), [])
  const catalogSourceRef = useRef<CatalogSource>(initial.source)

  const [songs, setSongs] = useState<ApiSong[]>(() => initial.bundle.songs)
  const [albums, setAlbums] = useState<ApiAlbum[]>(() => initial.bundle.albums)
  const [artists, setArtists] = useState<ApiArtist[]>(() => initial.bundle.artists)
  const [loading, setLoading] = useState(() => !catalogSessionFetchDone)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(
    () => initial.source !== 'none' || Boolean(catalogMemoryCache),
  )
  const [catalogSource, setCatalogSource] = useState<CatalogSource>(() => initial.source)
  const [staleCatalog, setStaleCatalog] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(() => initial.cachedAt)
  const [reloadKey, setReloadKey] = useState(0)

  const displaySongs = useMemo(() => withDevAudioVersionTestSongs(songs), [songs])
  const hasCatalogData = displaySongs.length > 0 || albums.length > 0 || artists.length > 0
  const showCatalogSkeleton = loading && !hasCatalogData
  const showCatalogError = Boolean(error) && !hasCatalogData
  const catalogStatus = useMemo(
    () =>
      resolveCatalogStatus(
        loading,
        staleCatalog,
        catalogSource,
        hasCatalogData,
        showCatalogError,
      ),
    [loading, staleCatalog, catalogSource, hasCatalogData, showCatalogError],
  )

  const applyBundle = useCallback((bundle: CatalogBundle, source: CatalogSource, savedAt: string | null) => {
    catalogMemoryCache = bundle
    catalogSourceRef.current = source
    setCatalogSource(source)
    setSongs(bundle.songs)
    setAlbums(bundle.albums)
    setArtists(bundle.artists)
    setLoaded(true)
    setStaleCatalog(false)
    setError(null)
    setCachedAt(savedAt)
  }, [])

  const refreshCatalog = useCallback(() => {
    setReloadKey((n) => n + 1)
  }, [])

  const retry = refreshCatalog

  const clearCatalogCache = useCallback(() => {
    clearCachedCatalog()
    setCachedAt(null)
    setStaleCatalog(false)

    if (catalogSourceRef.current !== 'live') {
      catalogMemoryCache = null
      catalogSessionFetchDone = false
      setSongs([])
      setAlbums([])
      setArtists([])
      setLoaded(false)
      setError(null)
      setLoading(true)
      setReloadKey((n) => n + 1)
    }
  }, [])

  useEffect(() => {
    let active = true

    if (catalogSessionFetchDone && reloadKey === 0 && catalogMemoryCache) {
      applyBundle(
        catalogMemoryCache,
        catalogSourceRef.current,
        readCachedCatalog()?.cachedAt ?? null,
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const fetchStarted = performance.now()
    fetchCatalogBundle()
      .then((bundle) => {
        if (!active) return
        writeCachedCatalog(bundle)
        catalogSessionFetchDone = true
        logCatalogFetch({
          songCount: bundle.songs.length,
          albumCount: bundle.albums.length,
          artistCount: bundle.artists.length,
          durationMs: Math.round(performance.now() - fetchStarted),
          source: 'live',
        })
        applyBundle(bundle, 'live', new Date().toISOString())
      })
      .catch((err) => {
        if (!active) return
        catalogSessionFetchDone = true

        if (catalogSourceRef.current !== 'none') {
          setStaleCatalog(true)
          setLoaded(true)
          setError(null)
          return
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the Hidden Tunes catalog.',
        )
        setLoaded(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey, applyBundle])

  const catalogIndexes = useMemo(
    () => buildCatalogIndexes(displaySongs, albums, artists),
    [displaySongs, albums, artists],
  )

  const searchMetadataIndex = useMemo(
    () => buildSearchMetadataIndex(displaySongs, artists),
    [displaySongs, artists],
  )

  const value = useMemo(
    () => ({
      songs: displaySongs,
      albums,
      artists,
      indexes: catalogIndexes,
      searchMetadataIndex,
      artistNames: catalogIndexes.artistNames,
      songsByAlbumTitle: catalogIndexes.songsByAlbumName,
      songsByArtistName: catalogIndexes.songsByArtistName,
      songsByArtistId: catalogIndexes.songsByArtistId,
      albumsByArtistId: catalogIndexes.albumsByArtistId,
      loading,
      error,
      loaded,
      catalogStatus,
      staleCatalog,
      cachedAt,
      showCatalogSkeleton,
      showCatalogError,
      retry,
      refreshCatalog,
      clearCatalogCache,
    }),
    [
      displaySongs,
      albums,
      artists,
      catalogIndexes,
      searchMetadataIndex,
      loading,
      error,
      loaded,
      catalogStatus,
      staleCatalog,
      cachedAt,
      showCatalogSkeleton,
      showCatalogError,
      retry,
      refreshCatalog,
      clearCatalogCache,
    ],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

type PageId = StoredPageId

type NavKey =
  | 'home'
  | 'worlds'
  | 'search'
  | 'library'
  | 'liked'
  | 'recent'
  | 'downloads'
  | 'playlists'
  | 'artists'
  | 'albums'
  | 'premium'
  | 'settings'

const PSD_DESTINATION_NAV_KEYS: NavKey[] = [
  'home',
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
]

const TOP_BAR_PLACEHOLDERS: Partial<Record<NavKey, string>> = {
  home: 'Search songs, artists, moods…',
  worlds: 'Search emotional worlds…',
  search: 'Search songs, artists, albums…',
  library: 'Search your library…',
  liked: 'Search liked songs…',
  recent: 'Search recently played…',
  downloads: 'Search downloads…',
  playlists: 'Search playlists…',
  artists: 'Search artists…',
  albums: 'Search albums…',
  premium: 'Search premium perks…',
}

function isPsdDestinationNav(navKey: NavKey) {
  return PSD_DESTINATION_NAV_KEYS.includes(navKey)
}

function resolveDefaultNavKey(page: PageId): NavKey {
  switch (page) {
    case 'mood':
      return 'worlds'
    case 'discover':
      return 'search'
    case 'settings':
      return 'settings'
    default:
      return page as NavKey
  }
}

function resolvePageFromNavKey(navKey: NavKey): PageId {
  switch (navKey) {
    case 'worlds':
      return 'mood'
    case 'search':
      return 'discover'
    case 'liked':
    case 'recent':
    case 'downloads':
    case 'premium':
      return 'library'
    default:
      return navKey as PageId
  }
}


type SidebarNavItem = {
  key: string
  page: PageId
  label: string
  icon: ReactNode
}

type Mood = 'violet' | 'cyan' | 'rose' | 'mint'

type DiscoveryCard = {
  title: string
  subtitle: string
  mood: Mood
}

type DiscoverySection = {
  title: string
  hint: string
  cards: DiscoveryCard[]
}

type MoodRoom = {
  title: string
  subtitle: string
  listeners: string
  mood: Mood
  sceneId: VisualSceneId
}

function BrandWaveformMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'brand-waveform'}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="14" width="3" height="10" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="9" y="8" width="3" height="22" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="15" y="12" width="3" height="14" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="21" y="5" width="3" height="28" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="27" y="10" width="3" height="18" rx="1.5" fill="url(#brandWaveGold)" />
      <path
        d="M2 18c4-6 8-9 16-9s12 3 16 9"
        stroke="url(#brandWaveStroke)"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.55"
      />
      <defs>
        <linearGradient id="brandWaveGold" x1="18" y1="4" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBA3D" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
        <linearGradient id="brandWaveStroke" x1="2" y1="9" x2="34" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5C542" />
          <stop offset="1" stopColor="#BF7F72" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function isSidebarNavActive(item: SidebarNavItem, activeNavKey: NavKey) {
  return item.key === activeNavKey
}

function moodRoomScene(room: Pick<MoodRoom, 'title' | 'mood' | 'sceneId'>): VisualSceneId {
  return room.sceneId ?? resolveVisualScene({ seed: room.title, mood: room.mood })
}

const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    key: 'home',
    page: 'home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    key: 'worlds',
    page: 'mood',
    label: 'Emotional Worlds',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 12c1.2-2.2 2.4-3.3 3.5-3.3s2.3 1.1 3.5 3.3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      </svg>
    ),
  },
  {
    key: 'search',
    page: 'discover',
    label: 'Search',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    key: 'library',
    page: 'library',
    label: 'Library',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M4 19V5h4l2 14 4-14h4v14" />
      </svg>
    ),
  },
  {
    key: 'playlists',
    page: 'playlists',
    label: 'Playlists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    key: 'artists',
    page: 'artists',
    label: 'Artists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    key: 'albums',
    page: 'albums',
    label: 'Albums',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'liked',
    page: 'library',
    label: 'Liked',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
      </svg>
    ),
  },
  {
    key: 'recent',
    page: 'library',
    label: 'Recent',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: 'downloads',
    page: 'library',
    label: 'Downloads',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 4v10" />
        <path d="M8.5 10.5L12 14l3.5-3.5" />
        <path d="M5 18h14" />
      </svg>
    ),
  },
  {
    key: 'settings',
    page: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
]

const HOME_SECTIONS: DiscoverySection[] = [
  {
    title: 'Trending Now',
    hint: 'Curated for the moment',
    cards: [
      { title: 'Neon Pulse', subtitle: 'Electric emotions', mood: 'violet' },
      { title: 'Midnight Drive', subtitle: 'Late-night energy', mood: 'cyan' },
      { title: 'Velvet Sky', subtitle: 'Dreamy atmospheres', mood: 'rose' },
      { title: 'Crystal Echo', subtitle: 'Shimmering highs', mood: 'mint' },
      { title: 'Deep Current', subtitle: 'Submerged bass', mood: 'cyan' },
    ],
  },
  {
    title: 'Emotional Picks',
    hint: 'Feel something real',
    cards: [
      { title: 'Soft Collapse', subtitle: 'Intimate & raw', mood: 'rose' },
      { title: 'Golden Hour', subtitle: 'Warm nostalgia', mood: 'violet' },
      { title: 'Silent Storm', subtitle: 'Power in restraint', mood: 'mint' },
      { title: 'Fading Light', subtitle: 'Bittersweet closure', mood: 'violet' },
    ],
  },
  {
    title: 'Night Vibes',
    hint: 'After dark selections',
    cards: [
      { title: 'Lunar Drift', subtitle: 'Weightless nights', mood: 'cyan' },
      { title: 'Smoke & Mirrors', subtitle: 'Mysterious grooves', mood: 'violet' },
      { title: 'City Glow', subtitle: 'Urban nocturne', mood: 'rose' },
      { title: '3AM Frequency', subtitle: 'Insomniac anthems', mood: 'mint' },
    ],
  },
  {
    title: 'Focus Mode',
    hint: 'Clarity without distraction',
    cards: [
      { title: 'Deep Work', subtitle: 'Minimal & steady', mood: 'mint' },
      { title: 'Flow State', subtitle: 'Rhythmic precision', mood: 'cyan' },
      { title: 'Quiet Mind', subtitle: 'Ambient clarity', mood: 'violet' },
      { title: 'Monk Mode', subtitle: 'Zero friction', mood: 'mint' },
    ],
  },
]

const PLAYLISTS = [
  { title: 'Emotional Apex', tracks: '42 tracks', mood: 'violet' as Mood },
  { title: 'Neon Aftercare', tracks: '28 tracks', mood: 'cyan' as Mood },
  { title: 'Soft Collapse', tracks: '19 tracks', mood: 'rose' as Mood },
  { title: 'Deep Focus Drift', tracks: '56 tracks', mood: 'mint' as Mood },
  { title: 'Cinematic Dust', tracks: '31 tracks', mood: 'violet' as Mood },
]

const TV_SHOWS = [
  { title: 'Live from the Mood Room', subtitle: 'Session 07 · Violet hour', mood: 'violet' as Mood },
  { title: 'Artist Residency', subtitle: 'Luna Veil · Behind the feeling', mood: 'rose' as Mood },
  { title: 'Visual Album Night', subtitle: 'Noir Ensemble · Full film', mood: 'cyan' as Mood },
  { title: 'Hidden Sessions', subtitle: 'Exclusive desktop premiere', mood: 'mint' as Mood },
]

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}
function catalogFallbackTone(seed: string): Mood {
  const code = seed.charCodeAt(0) + seed.charCodeAt(seed.length - 1 || 0)
  const tones: Mood[] = ['violet', 'cyan', 'rose', 'mint']
  return tones[code % tones.length]
}

function useVisibleSlice<T>(items: T[], resetKey: string) {
  const [limit, setLimit] = useState(GRID_INITIAL_LIMIT)

  useEffect(() => {
    setLimit(GRID_INITIAL_LIMIT)
  }, [resetKey])

  const visible = useMemo(() => items.slice(0, limit), [items, limit])
  const hasMore = limit < items.length
  const showMore = useCallback(() => {
    setLimit((current) => Math.min(current + GRID_SHOW_MORE_STEP, items.length))
  }, [items.length])

  return { visible, hasMore, showMore, total: items.length, shown: visible.length }
}

function ShowMoreRow({
  shown,
  total,
  onShowMore,
}: {
  shown: number
  total: number
  onShowMore: () => void
}) {
  if (total <= GRID_INITIAL_LIMIT) return null

  return (
    <div className="catalog-show-more">
      <span className="catalog-show-more-count">
        Showing {shown} of {total}
      </span>
      {shown < total ? (
        <button type="button" className="btn-secondary btn-sm" onClick={onShowMore}>
          Show more
        </button>
      ) : null}
    </div>
  )
}

function CatalogSkeleton({
  count = 8,
  variant = 'card',
}: {
  count?: number
  variant?: 'card' | 'artist'
}) {
  return (
    <div className={`skeleton-grid skeleton-grid--${variant}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`skeleton-card skeleton-card--${variant}`}>
          <div className="skeleton-card-art" />
          <div className="skeleton-card-line skeleton-card-line--wide" />
          <div className="skeleton-card-line" />
        </div>
      ))}
    </div>
  )
}

function CatalogError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="catalog-error" role="alert">
      <p className="catalog-error-title">Catalog unavailable</p>
      <p className="catalog-error-detail">
        {message || 'Could not reach Hidden Tunes. Wait a moment, then try again.'}
      </p>
      <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
        Retry catalog load
      </button>
    </div>
  )
}

function CatalogEmpty({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="catalog-empty">
      <p className="catalog-empty-title">{title}</p>
      <p className="catalog-empty-detail">{detail}</p>
    </div>
  )
}

function CatalogToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortLabel,
  sortValue,
  sortOptions,
  onSortChange,
  resultCount,
  hideSearch = false,
}: {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  sortLabel: string
  sortValue: string
  sortOptions: { value: string; label: string }[]
  onSortChange: (value: string) => void
  resultCount?: number
  hideSearch?: boolean
}) {
  return (
    <div className="catalog-toolbar">
      {!hideSearch ? (
        <div className="search-bar search-bar--premium" role="search">
          <span className="search-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {searchValue ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="catalog-toolbar-row">
        <label className="sort-control">
          <span>{sortLabel}</span>
          <select value={sortValue} onChange={(event) => onSortChange(event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {typeof resultCount === 'number' ? (
          <span className="catalog-count">{resultCount} shown</span>
        ) : null}
      </div>
    </div>
  )
}

const ArtworkImage = memo(function ArtworkImage({
  src,
  alt,
  seed,
  variant = 'square',
  priority = false,
}: {
  src: string | null
  alt: string
  seed: string
  variant?: 'square' | 'wide' | 'circle'
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const tone = useMemo(() => catalogFallbackTone(seed), [seed])

  return (
    <div className={`art-frame art-frame--${variant}`}>
      {!src || failed ? (
        <div
          className={`art-fallback art-fallback--${tone} art-fallback--${variant === 'circle' ? 'square' : variant}`}
          aria-hidden={alt ? undefined : true}
        >
          <MusicNoteIcon className="card-art-icon" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="card-art-img"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
})

const ArtistAvatar = memo(function ArtistAvatar({
  artist,
}: {
  artist: ApiArtist
}) {
  const tone = useMemo(() => catalogFallbackTone(artist.id), [artist.id])

  return (
    <span className="artist-avatar" aria-hidden="true" data-tone={tone}>
      <ArtworkImage
        src={artist.artwork}
        alt=""
        seed={artist.id}
        variant="circle"
      />
      <span className="artist-initial">{artist.name.charAt(0)}</span>
    </span>
  )
})

const ApiSongGrid = memo(function ApiSongGrid({
  songs,
  onSelect,
  listKey = 'songs',
  paginate = true,
  showEmpty = true,
}: {
  songs: ApiSong[]
  onSelect: SongSelectHandler
  listKey?: string
  paginate?: boolean
  showEmpty?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    songs,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderSongs = paginate ? visible : songs

  if (songs.length === 0 && showEmpty) {
    return (
      <CatalogEmpty
        title="No songs match"
        detail="Try a different search or sort order on the loaded catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact">
        {renderSongs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="discovery-card discovery-card--api"
            onClick={() => onSelect(song, songs.findIndex((entry) => entry.id === song.id))}
          >
            <div className="card-art card-art--song">
              <ArtworkImage src={song.artwork} alt="" seed={song.id} />
            </div>
            <div className="card-info">
              <h3>{song.title}</h3>
              <p className="card-meta-primary">{song.artist}</p>
              <p className="card-meta-secondary">{song.album}</p>
            </div>
          </button>
        ))}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

const ApiAlbumGrid = memo(function ApiAlbumGrid({
  albums,
  artistNames,
  indexes,
  onSelect,
  listKey = 'albums',
  paginate = true,
}: {
  albums: ApiAlbum[]
  artistNames: Map<string, string>
  indexes: CatalogIndexes
  onSelect: (album: ApiAlbum) => void
  listKey?: string
  paginate?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    albums,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderAlbums = paginate ? visible : albums

  if (albums.length === 0) {
    return (
      <CatalogEmpty
        title="No albums match"
        detail="Adjust your search or sorting to explore the cached catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact">
        {renderAlbums.map((album) => {
          const albumSongs = resolveSongsForAlbum(
            album,
            indexes.songsByAlbumId,
            indexes.songsByAlbumName,
          )
          const artistName = resolveAlbumDisplayArtist(album, albumSongs, artistNames)
          const artwork = resolveAlbumArtwork(album, albumSongs)
          const trackLabel = `${albumSongs.length} ${albumSongs.length === 1 ? 'track' : 'tracks'}`
          return (
            <button
              key={album.id}
              type="button"
              className="discovery-card discovery-card--api"
              onClick={() => onSelect(album)}
            >
              <div className="card-art card-art--album">
                <ArtworkImage src={artwork} alt="" seed={album.id} variant="wide" />
              </div>
              <div className="card-info">
                <h3>{album.title}</h3>
                <p className="card-meta-primary">{artistName || 'Unknown artist'}</p>
                <p className="card-meta-secondary">
                  {album.releaseYear ? `Released ${album.releaseYear} · ${trackLabel}` : trackLabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

const ApiArtistGrid = memo(function ApiArtistGrid({
  artists,
  onSelect,
  listKey = 'artists',
  paginate = true,
}: {
  artists: ApiArtist[]
  onSelect: (artist: ApiArtist) => void
  listKey?: string
  paginate?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    artists,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderArtists = paginate ? visible : artists

  if (artists.length === 0) {
    return (
      <CatalogEmpty
        title="No artists match"
        detail="Try another name or switch the sort order."
      />
    )
  }

  return (
    <>
      <div className="artist-grid artist-grid--compact">
        {renderArtists.map((artist) => (
          <button
            key={artist.id}
            type="button"
            className="artist-card artist-card--api"
            onClick={() => onSelect(artist)}
          >
            <ArtistAvatar artist={artist} />
            <span className="artist-name">{artist.name}</span>
            <span className="artist-meta">
              {artist.songCount > 0 ? `${artist.songCount} tracks` : 'Artist'}
            </span>
          </button>
        ))}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

function CatalogSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  count,
  children,
}: {
  title: string
  hint: string
  loading: boolean
  error: string | null
  onRetry: () => void
  count?: number
  children: ReactNode
}) {
  const hintText =
    typeof count === 'number' ? `${hint} · ${count} items` : hint

  return (
    <section className="discovery-section catalog-section" aria-labelledby={`catalog-${title}`}>
      <div className="section-header section-header--catalog">
        <div>
          <h2 id={`catalog-${title}`}>{title}</h2>
          <span className="section-hint">{hintText}</span>
        </div>
      </div>
      {loading ? <CatalogSkeleton /> : null}
      {!loading && error ? <CatalogError message={error} onRetry={onRetry} /> : null}
      {!loading && !error ? children : null}
    </section>
  )
}

function PageFrame({
  children,
  cinematic = false,
}: {
  children: ReactNode
  cinematic?: boolean
}) {
  return (
    <div className={`content-inner${cinematic ? ' content-inner--cinematic' : ''}`}>
      {children}
    </div>
  )
}

function HomeTopBar({
  placeholder = 'Search songs, artists, moods…',
  onOpenDiscover,
}: {
  placeholder?: string
  onOpenDiscover?: () => void
}) {
  const [query, setQuery] = useState('')

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onOpenDiscover?.()
    },
    [onOpenDiscover],
  )

  return (
    <header className="home-top-bar" aria-label="Home navigation">
      <form className="home-top-search" role="search" onSubmit={handleSubmit}>
        <span className="search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </form>
      <div className="home-top-actions">
        <button type="button" className="home-top-icon-btn" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>
        <button type="button" className="home-top-icon-btn" aria-label="Theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </button>
        <button type="button" className="home-top-avatar" aria-label="Profile">
          <span aria-hidden="true">H</span>
        </button>
      </div>
    </header>
  )
}

function CatalogStaleBanner() {
  const { catalogStatus, songs, albums, artists } = useCatalog()
  const hasCatalogData = songs.length > 0 || albums.length > 0 || artists.length > 0
  const showBanner = catalogStatus === 'refresh_failed' && hasCatalogData
  if (!showBanner) return null

  return (
    <div className="catalog-stale-banner" role="status">
      <span className="catalog-stale-dot" aria-hidden="true" />
      <span>
        Browsing your saved catalog — live refresh didn&apos;t complete. You can refresh again anytime.
      </span>
    </div>
  )
}

function CatalogStatusBar() {
  const { catalogStatus, cachedAt, loading, refreshCatalog, loaded } = useCatalog()
  const savedLabel = formatSavedCatalogTime(cachedAt)

  if (!loaded && !loading) return null

  return (
    <div className="catalog-status-bar" role="status" aria-live="polite">
      <div className="catalog-status-copy">
        <span className={`catalog-status-pill catalog-status-pill--${catalogStatus}`}>
          {CATALOG_STATUS_LABELS[catalogStatus]}
        </span>
        {savedLabel ? (
          <span className="catalog-status-meta">Saved catalog updated {savedLabel}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn-secondary btn-sm catalog-refresh-btn"
        onClick={refreshCatalog}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh catalog'}
      </button>
    </div>
  )
}

function CatalogStatusSettings({
  cacheNotice,
  onClearCache,
}: {
  cacheNotice: string
  onClearCache: () => void
}) {
  const { catalogStatus, cachedAt, loading, refreshCatalog } = useCatalog()
  const savedLabel = formatSavedCatalogTime(cachedAt)

  return (
    <section className="settings-panel">
      <h2>Catalog status</h2>
      <p className="settings-panel-desc">
        Read-only catalog from the Hidden Tunes API, with a local saved copy for offline browsing.
      </p>
      <dl className="settings-identity-list">
        <div className="settings-identity-row">
          <dt>Status</dt>
          <dd>
            <span className={`catalog-status-pill catalog-status-pill--${catalogStatus}`}>
              {CATALOG_STATUS_LABELS[catalogStatus]}
            </span>
          </dd>
        </div>
        <div className="settings-identity-row">
          <dt>Last saved</dt>
          <dd>{savedLabel ? savedLabel : 'Not saved locally yet'}</dd>
        </div>
      </dl>
      {savedLabel ? (
        <p className="settings-panel-desc settings-cache-meta">
          Saved catalog updated {savedLabel}
        </p>
      ) : null}
      <div className="settings-row">
        <div className="settings-label">
          <span>Refresh catalog</span>
          <small>Fetch latest read-only data · preferences stay intact</small>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm settings-reset-btn"
          onClick={refreshCatalog}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="settings-row">
        <div className="settings-label">
          <span>Clear saved catalog cache</span>
          <small>Removes local catalog only · live session data may remain until refresh</small>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm settings-reset-btn"
          onClick={onClearCache}
        >
          Clear cache
        </button>
      </div>
      {cacheNotice ? (
        <p className="settings-reset-note" role="status">
          {cacheNotice}
        </p>
      ) : null}
    </section>
  )
}

function PlaceholderNote({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="placeholder-note">
      <div className="placeholder-shimmer" aria-hidden="true" />
      <div className="placeholder-copy">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
    </header>
  )
}

function EmotionalLanesSection({
  songs,
  selectedLaneId,
  onSelectLane,
  loading = false,
}: {
  songs: ApiSong[]
  selectedLaneId: string | null
  onSelectLane: (laneId: string | null) => void
  loading?: boolean
}) {
  const lanes = useMemo(() => buildEmotionalLanes(songs), [songs])
  const selectedLane = useMemo(
    () => findEmotionalLane(lanes, selectedLaneId),
    [lanes, selectedLaneId],
  )

  if (!loading && lanes.length === 0) return null

  return (
    <section
      className="discovery-section emotional-lanes-section"
      aria-labelledby="emotional-lanes-heading"
    >
      <div className="section-header emotional-lanes-header">
        <div>
          <p className="page-eyebrow emotional-lanes-eyebrow">Emotional discovery</p>
          <h2 id="emotional-lanes-heading">Emotional lanes</h2>
          <span className="section-hint">
            Vibe groupings from catalog metadata — browse lanes, play on your terms
          </span>
        </div>
        {selectedLaneId ? (
          <button
            type="button"
            className="btn-secondary btn-sm emotional-lanes-clear"
            onClick={() => onSelectLane(null)}
          >
            Clear lane
          </button>
        ) : null}
      </div>
      {loading ? (
        <CatalogSkeleton />
      ) : (
        <div className="emotional-lanes-rail" role="list" aria-label="Emotional lanes">
          {lanes.map((lane) => {
            const sceneId = resolveVisualScene({ seed: lane.label, mood: lane.mood })
            const isActive = selectedLaneId === lane.id
            return (
              <button
                key={lane.id}
                type="button"
                role="listitem"
                className={'emotional-lane-card' + (isActive ? ' is-active' : '')}
                data-mood={lane.mood}
                data-scene={sceneId}
                aria-pressed={isActive}
                onClick={() => onSelectLane(isActive ? null : lane.id)}
              >
                <div className="emotional-lane-art" aria-hidden="true">
                  <VisualSceneBackdrop sceneId={sceneId} seed={lane.id} variant="thumb" />
                </div>
                <div className="emotional-lane-copy">
                  <h3>{lane.label}</h3>
                  <p>{lane.subtitle}</p>
                  <span className="emotional-lane-meta">
                    {lane.trackCount} {lane.trackCount === 1 ? 'track' : 'tracks'}
                  </span>
                  {lane.topSignals.length > 0 ? (
                    <span className="emotional-lane-signals">
                      {lane.topSignals.join(' · ')}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {selectedLane ? (
        <div className="emotional-lanes-for-mood" role="status">
          <h3 className="emotional-lanes-for-heading">
            For this mood · {selectedLane.label}
          </h3>
          <p className="emotional-lanes-for-detail">{selectedLane.subtitle}</p>
        </div>
      ) : null}
    </section>
  )
}

function SceneListeningSection({
  songs,
  selectedSceneId,
  onSelectScene,
  loading = false,
}: {
  songs: ApiSong[]
  selectedSceneId: string | null
  onSelectScene: (sceneId: string | null) => void
  loading?: boolean
}) {
  const scenes = useMemo(() => buildListeningScenes(songs), [songs])
  const selectedScene = useMemo(
    () => findListeningScene(scenes, selectedSceneId),
    [scenes, selectedSceneId],
  )

  if (!loading && scenes.length === 0) return null

  return (
    <section
      className="discovery-section scene-listening-section"
      aria-labelledby="scene-listening-heading"
    >
      <div className="section-header scene-listening-header">
        <div>
          <p className="page-eyebrow scene-listening-eyebrow">Scene listening</p>
          <h2 id="scene-listening-heading">Scene collections</h2>
          <span className="section-hint">
            Curated atmospheres from your catalog — step into a scene, play when ready
          </span>
        </div>
        {selectedSceneId ? (
          <button
            type="button"
            className="btn-secondary btn-sm scene-listening-clear"
            onClick={() => onSelectScene(null)}
          >
            Clear scene
          </button>
        ) : null}
      </div>
      {loading ? (
        <CatalogSkeleton />
      ) : (
        <div className="scene-listening-grid" role="list" aria-label="Listening scenes">
          {scenes.map((scene) => {
            const isActive = selectedSceneId === scene.id
            return (
              <button
                key={scene.id}
                type="button"
                role="listitem"
                className={'scene-listening-card' + (isActive ? ' is-active' : '')}
                data-mood={scene.mood}
                data-scene={scene.visualSceneId}
                aria-pressed={isActive}
                onClick={() => onSelectScene(isActive ? null : scene.id)}
              >
                <div className="scene-listening-art" aria-hidden="true">
                  <VisualSceneBackdrop
                    sceneId={scene.visualSceneId}
                    seed={scene.id}
                    variant="card"
                  />
                </div>
                <div className="scene-listening-copy">
                  <h3>{scene.label}</h3>
                  <p>{scene.subtitle}</p>
                  <span className="scene-listening-meta">
                    {scene.trackCount} {scene.trackCount === 1 ? 'track' : 'tracks'}
                  </span>
                  {scene.topSignals.length > 0 ? (
                    <span className="scene-listening-signals">
                      {scene.topSignals.join(' · ')}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {selectedScene ? (
        <div className="scene-listening-active" role="status">
          <h3 className="scene-listening-active-heading">
            In this scene · {selectedScene.label}
          </h3>
          <p className="scene-listening-active-detail">{selectedScene.subtitle}</p>
        </div>
      ) : null}
    </section>
  )
}

function RadioFoundationSection({
  songs,
  browseSongs,
  selectedLaneId,
  selectedLaneLabel,
  selectedSceneId,
  selectedSceneLabel,
  onStartRadio,
  loading = false,
}: {
  songs: ApiSong[]
  browseSongs: ApiSong[]
  selectedLaneId: string | null
  selectedLaneLabel?: string | null
  selectedSceneId: string | null
  selectedSceneLabel?: string | null
  onStartRadio: (station: BuiltRadioStation) => void
  loading?: boolean
}) {
  const [builtStation, setBuiltStation] = useState<BuiltRadioStation | null>(null)

  const seed = useMemo(
    () =>
      resolveRadioSeed({
        catalog: songs,
        browseSongs,
        selectedLaneId,
        selectedLaneLabel,
        selectedSceneId,
        selectedSceneLabel,
      }),
    [
      browseSongs,
      selectedLaneId,
      selectedLaneLabel,
      selectedSceneId,
      selectedSceneLabel,
      songs,
    ],
  )

  useEffect(() => {
    setBuiltStation(null)
  }, [seed?.id, seed?.type])

  const handleBuildStation = useCallback(() => {
    if (!seed) return
    setBuiltStation(buildRadioStation(songs, seed))
  }, [seed, songs])

  if (!loading && songs.length < 2) return null

  return (
    <section
      className="discovery-section radio-foundation-section"
      aria-labelledby="radio-foundation-heading"
    >
      <div className="section-header radio-foundation-header">
        <div>
          <p className="page-eyebrow radio-foundation-eyebrow">Radio foundation</p>
          <h2 id="radio-foundation-heading">Build a station</h2>
          <span className="section-hint">
            Preview a scored station from your catalog — start radio only when you choose
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm radio-build-btn"
          onClick={handleBuildStation}
          disabled={!seed || loading}
        >
          Build station
        </button>
      </div>

      {seed ? (
        <p className="radio-seed-line">{describeRadioSeed(seed)}</p>
      ) : (
        <p className="radio-seed-line radio-seed-line--muted">
          Select a lane or scene, or browse songs to choose a seed.
        </p>
      )}

      {builtStation ? (
        <div className="radio-station-card">
          <div className="radio-station-copy">
            <h3>{builtStation.title}</h3>
            <p>{builtStation.subtitle}</p>
            <span className="radio-station-meta">
              {builtStation.trackCount} tracks in this station preview
            </span>
          </div>
          <ol className="radio-station-preview">
            {builtStation.tracks.slice(0, 6).map((track, index) => (
              <li className="radio-station-track" key={`${track.id}-${index}`}>
                <span className="radio-station-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="radio-station-track-title">{track.title}</span>
                <span className="radio-station-track-artist">{track.artist}</span>
              </li>
            ))}
          </ol>
          {builtStation.trackCount > 6 ? (
            <p className="radio-station-more">
              +{builtStation.trackCount - 6} more in station order
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary btn-sm radio-start-btn"
            onClick={() => onStartRadio(builtStation)}
          >
            Start radio
          </button>
        </div>
      ) : null}
    </section>
  )
}

function DiscoveryGrid({ section }: { section: DiscoverySection }) {
  return (
    <section className="discovery-section" aria-labelledby={`section-${section.title}`}>
      <div className="section-header">
        <h2 id={`section-${section.title}`}>{section.title}</h2>
        <span>{section.hint}</span>
      </div>
      <div className="card-row">
        {section.cards.map((card) => {
          const sceneId = resolveVisualScene({ seed: card.title, mood: card.mood })
          return (
          <article
            key={card.title}
            className="discovery-card"
            data-mood={card.mood}
            data-scene={sceneId}
          >
            <div className="card-art">
              <VisualSceneBackdrop sceneId={sceneId} seed={card.title} variant="thumb" />
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
          </article>
          )
        })}
      </div>
    </section>
  )
}

const Sidebar = memo(function Sidebar({
  activeNavKey,
  onNavigateNav,
}: {
  activeNavKey: NavKey
  onNavigateNav: (navKey: NavKey) => void
}) {
  return (
    <aside className="sidebar sidebar--psd">
      <div className="sidebar-brand">
        <BrandWaveformMark />
        <div className="brand-text">
          <span className="brand-wordmark">Hidden Tunes</span>
          <span className="brand-tagline">Feel Every Sound</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {SIDEBAR_NAV.map((item) => {
          const isActive = isSidebarNavActive(item, activeNavKey)
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigateNav(item.key as NavKey)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-premium-cta${activeNavKey === 'premium' ? ' is-active' : ''}`}
          aria-label="Go Premium"
          aria-current={activeNavKey === 'premium' ? 'page' : undefined}
          onClick={() => onNavigateNav('premium')}
        >
          <span className="sidebar-premium-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M5 17l2-7h10l2 7" />
              <path d="M7 17h10" />
              <path d="M9 10l1.5-4h3L15 10" />
            </svg>
          </span>
          <span className="sidebar-premium-copy">
            <span className="sidebar-premium-label">Go Premium</span>
            <span className="sidebar-premium-hint">Unlock every world</span>
          </span>
        </button>

        <div className="sidebar-user" aria-label="Profile">
          <div className="sidebar-user-avatar" aria-hidden="true">
            <span>H</span>
          </div>
          <div className="sidebar-user-copy">
            <span className="sidebar-user-name">Hidden Listener</span>
            <span className="sidebar-user-badge">
              <span className="sidebar-user-badge-check" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
              </span>
              Premium User
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
})

function Hero() {
  return (
    <section className="hero hero--psd" aria-label="Tonight's listening invitation">
      <img
        className="hero-photo"
        src={heroPhotoUrl}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
      />
      <div className="hero-photo-veil" aria-hidden="true" />
      <div className="hero-inner hero-inner--psd">
        <div className="hero-copy hero-copy--psd">
          <h1 className="hero-headline">
            Where do you want to
            <span className="hero-headline-break" />
            <span className="hero-headline-accent">emotionally</span>
            <span className="hero-headline-break" />
            go tonight?
          </h1>
        </div>
      </div>
    </section>
  )
}

const POPULAR_WORLD_PRESENTATION: Record<
  string,
  { title: string; subtitle: string }
> = {
  'midnight-drive': { title: 'Night Drive', subtitle: 'Late-night highway glow' },
  'rainy-window': { title: 'Midnight Reflection', subtitle: 'Rain-lit stillness' },
  'heartbreak-recovery': { title: 'Healing Slowly', subtitle: 'Tender recovery' },
  'sunday-morning': { title: 'Afro Sunset', subtitle: 'Warm evening light' },
  'city-lights': { title: 'Ocean Dreams', subtitle: 'Deep blue drift' },
  'focus-room': { title: 'Focus Room', subtitle: 'Clear headspace' },
}

function resolveWorldPresentation(scene: BuiltListeningScene) {
  const mapped = POPULAR_WORLD_PRESENTATION[scene.id]
  return {
    title: mapped?.title ?? scene.label,
    subtitle: mapped?.subtitle ?? scene.subtitle,
  }
}

function PopularWorldsSection({
  songs,
  loading = false,
  selectedSceneId,
  onSelectScene,
  onPlayWorld,
}: {
  songs: ApiSong[]
  loading?: boolean
  selectedSceneId: string | null
  onSelectScene: (sceneId: string | null) => void
  onPlayWorld: (scene: BuiltListeningScene) => void
}) {
  const worlds = useMemo(
    () => buildListeningScenes(songs, { minTracks: 0 }).slice(0, 5),
    [songs],
  )

  if (!loading && worlds.length === 0) return null

  return (
    <section className="popular-worlds-section" aria-labelledby="popular-worlds-heading">
      <header className="popular-worlds-header">
        <h2 id="popular-worlds-heading" className="popular-worlds-eyebrow">
          Popular Worlds
        </h2>
      </header>
      {loading ? (
        <div className="popular-worlds-grid popular-worlds-grid--loading" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="world-card world-card--skeleton">
              <div className="world-card-art" />
              <div className="world-card-line" />
            </div>
          ))}
        </div>
      ) : (
        <div className="popular-worlds-grid" role="list" aria-label="Popular worlds">
          {worlds.map((world) => {
            const presentation = resolveWorldPresentation(world)
            const coverSong = world.songIds
              .map((songId) => songs.find((entry) => entry.id === songId))
              .find(Boolean)
            const isActive = selectedSceneId === world.id
            const sceneId = world.visualSceneId ?? resolveVisualScene({
              seed: world.label,
              mood: world.mood,
            })

            return (
              <article
                key={world.id}
                role="listitem"
                className={`world-card${isActive ? ' is-active' : ''}`}
                data-scene={sceneId}
              >
                <button
                  type="button"
                  className="world-card-select"
                  aria-pressed={isActive}
                  onClick={() => onSelectScene(isActive ? null : world.id)}
                >
                  <div className="world-card-art">
                    {coverSong?.artwork ? (
                      <ArtworkImage
                        src={coverSong.artwork}
                        alt=""
                        seed={world.id}
                        priority={worlds.indexOf(world) < 2}
                      />
                    ) : (
                      <VisualSceneBackdrop
                        sceneId={sceneId}
                        seed={world.id}
                        variant="thumb"
                      />
                    )}
                    <span className="world-card-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="world-play-btn"
                      aria-label={`Play ${presentation.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPlayWorld(world)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="world-card-copy">
                    <h3>{presentation.title}</h3>
                    <p>{presentation.subtitle}</p>
                  </div>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function HomePage({
  onOpenSong,
}: {
  onOpenSong: QueueSongHandler
}) {
  const { songs, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  const featured = useMemo(
    () => sortSongsList(songs, 'latest').slice(0, 12),
    [songs],
  )
  const browseSongs = useMemo(() => {
    let result = songs
    if (selectedLaneId) {
      result = filterSongsByEmotionalLane(result, selectedLaneId)
    }
    if (selectedSceneId) {
      result = filterSongsByListeningScene(result, selectedSceneId)
    }
    return result
  }, [songs, selectedLaneId, selectedSceneId])
  const selectedLane = useMemo(
    () => findEmotionalLane(buildEmotionalLanes(songs), selectedLaneId),
    [songs, selectedLaneId],
  )
  const selectedScene = useMemo(
    () => findListeningScene(buildListeningScenes(songs), selectedSceneId),
    [songs, selectedSceneId],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playHomeSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      featured,
      index,
      'home',
      'Home',
      {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', featured, indexes, song),
        candidatePools: queuePools,
      },
    ),
    [featured, indexes, onOpenSong, queuePools],
  )
  const browseQueueTitle = selectedScene
    ? `In this scene · ${selectedScene.label}`
    : selectedLane
      ? `For this mood · ${selectedLane.label}`
      : 'Home'

  const playBrowseSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      browseSongs,
      index,
      'home',
      browseQueueTitle,
      {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', browseSongs, indexes, song),
        candidatePools: queuePools,
      },
    ),
    [browseQueueTitle, browseSongs, indexes, onOpenSong, queuePools],
  )

  const handleStartRadio = useCallback(
    (station: BuiltRadioStation) => {
      if (station.tracks.length === 0) return
      onOpenSong(
        station.tracks[0],
        station.tracks,
        0,
        'radio',
        station.title,
        {
          seedType: 'discover',
          seedTracks: station.tracks,
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools],
  )

  const playWorld = useCallback(
    (scene: BuiltListeningScene) => {
      const tracks = filterSongsByListeningScene(songs, scene.id)
      if (tracks.length === 0) return
      onOpenSong(
        tracks[0],
        tracks,
        0,
        'home',
        resolveWorldPresentation(scene).title,
        {
          seedType: 'home',
          seedTracks: buildQueueSeedPool('home', tracks, indexes, tracks[0]),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, songs],
  )

  return (
    <div className="home-destination">
      <PageFrame cinematic>
        <Hero />
        <PopularWorldsSection
          songs={songs}
          loading={showCatalogSkeleton}
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
          onPlayWorld={playWorld}
        />
      <div className="home-secondary" aria-label="More listening paths">
      <EmotionalLanesSection
        songs={songs}
        selectedLaneId={selectedLaneId}
        onSelectLane={setSelectedLaneId}
        loading={showCatalogSkeleton}
      />
      <SceneListeningSection
        songs={songs}
        selectedSceneId={selectedSceneId}
        onSelectScene={setSelectedSceneId}
        loading={showCatalogSkeleton}
      />
      <RadioFoundationSection
        songs={songs}
        browseSongs={browseSongs}
        selectedLaneId={selectedLaneId}
        selectedLaneLabel={selectedLane?.label ?? null}
        selectedSceneId={selectedSceneId}
        selectedSceneLabel={selectedScene?.label ?? null}
        onStartRadio={handleStartRadio}
        loading={showCatalogSkeleton}
      />
      {(selectedLaneId || selectedSceneId) && browseSongs.length > 0 ? (
        <CatalogSection
          title={selectedSceneId ? 'In this scene' : 'For this mood'}
          hint={
            selectedScene
              ? `${selectedScene.label} · scene collection`
              : selectedLane
                ? `${selectedLane.label} · emotional lane`
                : 'Browse filter'
          }
          loading={showCatalogSkeleton}
          error={showCatalogError ? error : null}
          onRetry={retry}
          count={browseSongs.length}
        >
          <ApiSongGrid
            songs={browseSongs}
            onSelect={playBrowseSong}
            listKey={`home-browse-${selectedLaneId ?? 'all'}-${selectedSceneId ?? 'all'}`}
            paginate
          />
        </CatalogSection>
      ) : null}
      <CatalogSection
        title="From your collection"
        hint="Quiet highlights beneath the worlds"
        loading={showCatalogSkeleton}
        error={showCatalogError ? error : null}
        onRetry={retry}
        count={featured.length}
      >
        {!showCatalogSkeleton && !showCatalogError && songs.length === 0 ? (
          <CatalogEmpty
            title="Catalog is empty"
            detail="The API responded but returned no songs yet."
          />
        ) : (
          <ApiSongGrid songs={featured} onSelect={playHomeSong} listKey="home-featured" paginate={false} />
        )}
      </CatalogSection>
      {HOME_SECTIONS.slice(1, 3).map((section) => (
        <DiscoveryGrid key={section.title} section={section} />
      ))}
      </div>
      </PageFrame>
    </div>
  )
}

function DiscoverPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const {
    songs,
    artists,
    albums,
    artistNames,
    indexes,
    searchMetadataIndex,
    showCatalogSkeleton,
    showCatalogError,
    error,
    retry,
  } = useCatalog()
  const [query, setQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    '',
    parseStoredSearchTerm,
  )
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isSearchPending = query !== debouncedQuery
  const [sort, setSort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSort,
    'latest' as SongSort,
    parseStoredSongSort,
  )

  const searchResult = useMemo(
    () =>
      searchCatalogSongs({
        index: searchMetadataIndex,
        query: debouncedQuery,
      }),
    [debouncedQuery, searchMetadataIndex],
  )

  const visibleRecords = useMemo(
    () => sortMetadataRecords(searchResult.records, sort),
    [searchResult.records, sort],
  )

  const visibleSongs = useMemo(
    () => metadataRecordsToApiSongs(visibleRecords),
    [visibleRecords],
  )

  const hasEvaluatedQuery = debouncedQuery.trim().length > 0
  const showNoMatches =
    !isSearchPending &&
    hasEvaluatedQuery &&
    visibleRecords.length === 0 &&
    searchMetadataIndex.entries.length > 0

  const catalogSongs = visibleSongs
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playDiscoverSong = useCallback(
    (song: ApiSong, index: number) => {
      const record =
        visibleRecords.find((entry) => entry.id === song.id)
        ?? visibleRecords[index]
      const playableSong = record ? metadataRecordToApiSong(record) : song
      const queueSongs = catalogSongs
      const queueIndex = queueSongs.findIndex((entry) => entry.id === playableSong.id)
      const safeIndex = queueIndex >= 0 ? queueIndex : index

      onOpenSong(
        playableSong,
        queueSongs,
        safeIndex,
        'discover',
        'Discover',
        {
          seedType: 'discover',
          seedTracks: buildQueueSeedPool('discover', queueSongs, indexes, playableSong),
          candidatePools: queuePools,
        },
      )
    },
    [catalogSongs, indexes, onOpenSong, queuePools, visibleRecords],
  )

  const handleStartRadio = useCallback(
    (station: BuiltRadioStation) => {
      if (station.tracks.length === 0) return
      const record =
        visibleRecords.find((entry) => entry.id === station.tracks[0].id) ?? null
      const playableSong = record
        ? metadataRecordToApiSong(record)
        : station.tracks[0]

      onOpenSong(
        playableSong,
        station.tracks,
        0,
        'radio',
        station.title,
        {
          seedType: 'discover',
          seedTracks: station.tracks,
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, visibleRecords],
  )
  void handleStartRadio

  const [searchTab, setSearchTab] = useState<
    'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'podcasts' | 'profiles'
  >('all')

  const matchedArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, debouncedQuery), 'az').slice(0, 8),
    [artists, debouncedQuery],
  )
  const matchedAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, debouncedQuery, artistNames), 'latest').slice(0, 8),
    [albums, artistNames, debouncedQuery],
  )
  const topResult = visibleSongs[0] ?? null
  const trimmedQuery = debouncedQuery.trim()
  const searchTabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'podcasts', label: 'Podcasts' },
    { id: 'profiles', label: 'Profiles' },
  ] as const

  return (
    <div className="psd-search-destination">
      <PageFrame cinematic>
        <header className="psd-inline-header psd-inline-header--search" aria-labelledby="search-results-heading">
          <h1 id="search-results-heading" className="psd-page-title psd-page-title--search">
            Search Results
          </h1>
          {trimmedQuery ? (
            <p className="psd-search-query-line">
              Showing matches for <strong>&ldquo;{trimmedQuery}&rdquo;</strong>
            </p>
          ) : (
            <p className="psd-search-query-line psd-search-query-line--muted">
              Start typing in the toolbar or search bar to explore the catalog.
            </p>
          )}
        </header>

        <div className="psd-tab-row psd-tab-row--underline" role="tablist" aria-label="Search categories">
          {searchTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`psd-tab${searchTab === tab.id ? ' is-active' : ''}`}
              aria-selected={searchTab === tab.id}
              onClick={() => setSearchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <CatalogToolbar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Filter by title, artist, album, genre, or mood…"
          sortLabel="Sort"
          sortValue={sort}
          sortOptions={SONG_SORT_OPTIONS}
          onSortChange={(value) => setSort(value as SongSort)}
          resultCount={visibleRecords.length}
        />

        {topResult && (searchTab === 'all' || searchTab === 'songs') ? (
          <section className="psd-top-result" aria-label="Top result">
            <p className="psd-section-label">Top result</p>
            <button
              type="button"
              className="psd-top-result-card"
              onClick={() => playDiscoverSong(topResult, 0)}
            >
              <ArtworkImage src={topResult.artwork} alt="" seed={topResult.id} priority />
              <div className="psd-top-result-copy">
                <span className="psd-top-result-type">Song</span>
                <strong>{topResult.title}</strong>
                <span>{topResult.artist}</span>
              </div>
            </button>
          </section>
        ) : null}

        {(searchTab === 'all' || searchTab === 'songs') ? (
          <section className="psd-panel" aria-labelledby="search-songs-heading">
            <header className="psd-panel-header">
              <h2 id="search-songs-heading">Songs</h2>
              <span>{catalogSongs.length} tracks</span>
            </header>
            {showCatalogSkeleton ? <CatalogSkeleton count={6} variant="card" /> : null}
            {showCatalogError ? <CatalogError message={error || ''} onRetry={retry} /> : null}
            {!showCatalogSkeleton && !showCatalogError && songs.length === 0 ? (
              <CatalogEmpty title="No songs in catalog" detail="Retry once the API finishes loading or returns data." />
            ) : showNoMatches ? (
              <CatalogEmpty title="No songs match" detail="Try a different search term across title, artist, album, genre, or mood." />
            ) : (
              <ul className="psd-song-table">
                {catalogSongs.slice(0, 12).map((song, index) => (
                  <li key={song.id}>
                    <button type="button" className="psd-song-row" onClick={() => playDiscoverSong(song, index)}>
                      <span className="psd-song-index">{index + 1}</span>
                      <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                      <span className="psd-song-copy">
                        <strong>{song.title}</strong>
                        <span>{song.artist} · {song.album}</span>
                      </span>
                      <span className="psd-song-duration">
                        {song.durationSeconds ? formatPlaybackTime(song.durationSeconds) : '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {(searchTab === 'all' || searchTab === 'artists') && matchedArtists.length > 0 ? (
          <section className="psd-rail-section" aria-labelledby="search-artists-heading">
            <header className="psd-panel-header">
              <h2 id="search-artists-heading">Artists</h2>
            </header>
            <div className="psd-mini-grid psd-mini-grid--artists">
              {matchedArtists.map((artist) => (
                <article key={artist.id} className="psd-mini-card psd-mini-card--artist">
                  <ArtistAvatar artist={artist} />
                  <strong>{artist.name}</strong>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(searchTab === 'all' || searchTab === 'albums') && matchedAlbums.length > 0 ? (
          <section className="psd-rail-section" aria-labelledby="search-albums-heading">
            <header className="psd-panel-header">
              <h2 id="search-albums-heading">Albums</h2>
            </header>
            <div className="psd-mini-grid psd-mini-grid--albums">
              {matchedAlbums.map((album) => {
                const artistName = album.artistId ? artistNames.get(album.artistId) ?? 'Unknown artist' : 'Unknown artist'
                const albumSongs = resolveSongsForAlbum(
                  album,
                  indexes.songsByAlbumId,
                  indexes.songsByAlbumName,
                )
                return (
                  <article key={album.id} className="psd-mini-card psd-mini-card--album">
                    <ArtworkImage
                      src={resolveAlbumArtwork(album, albumSongs)}
                      alt=""
                      seed={album.id}
                    />
                    <strong>{album.title}</strong>
                    <span>{artistName}</span>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {(searchTab === 'all' || searchTab === 'playlists') ? (
          <section className="psd-rail-section" aria-labelledby="search-playlists-heading">
            <header className="psd-panel-header">
              <h2 id="search-playlists-heading">Playlists</h2>
            </header>
            <div className="psd-mini-grid psd-mini-grid--playlists">
              {PLAYLISTS.slice(0, 6).map((playlist) => (
                <article key={playlist.title} className="psd-mini-card psd-mini-card--playlist" data-mood={playlist.mood}>
                  <div className="psd-playlist-art" data-mood={playlist.mood}>
                    <MusicNoteIcon className="card-art-icon" />
                  </div>
                  <strong>{playlist.title}</strong>
                  <span>{playlist.tracks}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}

type EmotionalWorldChipId =
  | 'all'
  | 'calm'
  | 'chill'
  | 'happy'
  | 'romantic'
  | 'motivational'
  | 'melancholy'
  | 'energetic'

type EmotionalWorldCardSpec = {
  cardId: string
  sceneId: string
  title: string
  tags: string
  chips: EmotionalWorldChipId[]
}

const EMOTIONAL_WORLDS_CHIPS: { id: EmotionalWorldChipId; label: string }[] = [
  { id: 'all', label: 'All Worlds' },
  { id: 'calm', label: 'Calm' },
  { id: 'chill', label: 'Chill' },
  { id: 'happy', label: 'Happy' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'motivational', label: 'Motivational' },
  { id: 'melancholy', label: 'Melancholy' },
  { id: 'energetic', label: 'Energetic' },
]

const EMOTIONAL_WORLDS_CARDS: EmotionalWorldCardSpec[] = [
  {
    cardId: 'ew-midnight-reflection',
    sceneId: 'rainy-window',
    title: 'Midnight Reflection',
    tags: 'Deep • Calm • Soul',
    chips: ['calm', 'chill', 'melancholy'],
  },
  {
    cardId: 'ew-afro-sunset',
    sceneId: 'sunday-morning',
    title: 'Afro Sunset',
    tags: 'Warm • Groove • Soul',
    chips: ['happy', 'romantic'],
  },
  {
    cardId: 'ew-healing-slowly',
    sceneId: 'heartbreak-recovery',
    title: 'Healing Slowly',
    tags: 'Soft • Reflective • Calm',
    chips: ['calm', 'melancholy'],
  },
  {
    cardId: 'ew-night-drive',
    sceneId: 'midnight-drive',
    title: 'Night Drive',
    tags: 'Urban • Late Night • Electronic',
    chips: ['energetic', 'chill'],
  },
  {
    cardId: 'ew-sunset-glow',
    sceneId: 'city-lights',
    title: 'Sunset Glow',
    tags: 'Golden • Warm • R&B',
    chips: ['happy', 'romantic'],
  },
  {
    cardId: 'ew-velvet-emotions',
    sceneId: 'focus-room',
    title: 'Velvet Emotions',
    tags: 'Intimate • Warm • Soul',
    chips: ['romantic', 'calm'],
  },
  {
    cardId: 'ew-ocean-dreams',
    sceneId: 'city-lights',
    title: 'Ocean Dreams',
    tags: 'Dreamy • Deep • Calm',
    chips: ['calm', 'chill'],
  },
  {
    cardId: 'ew-city-rain',
    sceneId: 'rainy-window',
    title: 'City Rain',
    tags: 'Melancholy • Urban • Jazz',
    chips: ['melancholy', 'chill'],
  },
  {
    cardId: 'ew-uplift-boost',
    sceneId: 'focus-room',
    title: 'Uplift Boost',
    tags: 'Motivational • Bright • Pop',
    chips: ['motivational', 'energetic', 'happy'],
  },
  {
    cardId: 'ew-melancholy-bloom',
    sceneId: 'heartbreak-recovery',
    title: 'Melancholy Bloom',
    tags: 'Tender • Slow • Reflective',
    chips: ['melancholy', 'calm'],
  },
]

function EmotionalWorldsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes, showCatalogSkeleton } = useCatalog()
  const scenes = useMemo(() => buildListeningScenes(songs), [songs])
  const [selectedChip, setSelectedChip] = useState<EmotionalWorldChipId>('all')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const visibleCards = useMemo(() => {
    if (selectedChip === 'all') return EMOTIONAL_WORLDS_CARDS
    return EMOTIONAL_WORLDS_CARDS.filter((card) => card.chips.includes(selectedChip))
  }, [selectedChip])

  const playWorld = useCallback(
    (card: EmotionalWorldCardSpec) => {
      const tracks = filterSongsByListeningScene(songs, card.sceneId)
      if (tracks.length === 0) return
      onOpenSong(
        tracks[0],
        tracks,
        0,
        'mood',
        card.title,
        {
          seedType: 'mood',
          seedTracks: buildQueueSeedPool('mood', tracks, indexes, tracks[0]),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, songs],
  )

  return (
    <div className="emotional-worlds-destination">
      <PageFrame cinematic>
        <section className="emotional-worlds-hero" aria-labelledby="emotional-worlds-heading">
          <div
            className="emotional-worlds-hero-backdrop"
            style={{ backgroundImage: `url(${emotionalWorldsReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="emotional-worlds-hero-veil" aria-hidden="true" />
          <div className="emotional-worlds-hero-copy">
            <h1 id="emotional-worlds-heading" className="emotional-worlds-title">
              <span className="emotional-worlds-title-main">
                <span className="emotional-worlds-title-emotional">Emotional</span>
                {' '}Worlds
              </span>
            </h1>
            <p className="emotional-worlds-description">
              Music that matches your emotion, elevates your mood, and transports you to another world.
            </p>
          </div>
        </section>

        <div className="emotional-worlds-chips" role="toolbar" aria-label="World categories">
          {EMOTIONAL_WORLDS_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`emotional-worlds-chip${selectedChip === chip.id ? ' is-active' : ''}`}
              aria-pressed={selectedChip === chip.id}
              onClick={() => setSelectedChip(chip.id)}
            >
              {chip.label}
            </button>
          ))}
          <span className="emotional-worlds-chips-more" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </div>

        {showCatalogSkeleton ? (
          <div className="emotional-worlds-grid emotional-worlds-grid--loading" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="emotional-world-card emotional-world-card--skeleton">
                <div className="emotional-world-card-art" />
                <div className="emotional-world-card-line" />
              </div>
            ))}
          </div>
        ) : (
          <div className="emotional-worlds-grid" role="list" aria-label="Emotional worlds">
            {visibleCards.map((card) => {
              const scene = scenes.find((entry) => entry.id === card.sceneId)
              const tracks = filterSongsByListeningScene(songs, card.sceneId)
              const coverSong = tracks[0]
              const isActive = selectedCardId === card.cardId
              const visualSceneId = scene?.visualSceneId ?? resolveVisualScene({
                seed: card.title,
                mood: scene?.mood ?? 'violet',
              })

              return (
                <article
                  key={card.cardId}
                  role="listitem"
                  className={`emotional-world-card${isActive ? ' is-active' : ''}`}
                  data-scene={visualSceneId}
                >
                  <button
                    type="button"
                    className="emotional-world-card-select"
                    aria-pressed={isActive}
                    onClick={() => setSelectedCardId(isActive ? null : card.cardId)}
                  >
                    <div className="emotional-world-card-art">
                      {coverSong?.artwork ? (
                        <ArtworkImage
                          src={coverSong.artwork}
                          alt=""
                          seed={card.cardId}
                        />
                      ) : (
                        <VisualSceneBackdrop
                          sceneId={visualSceneId}
                          seed={card.cardId}
                          variant="thumb"
                        />
                      )}
                      <span className="emotional-world-card-veil" aria-hidden="true" />
                      <button
                        type="button"
                        className="emotional-world-play-btn"
                        aria-label={`Play ${card.title}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          playWorld(card)
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                    <div className="emotional-world-card-copy">
                      <h3>{card.title}</h3>
                      <p className="emotional-world-card-tags">{card.tags}</p>
                      <p className="emotional-world-card-count">
                        {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </PageFrame>
    </div>
  )
}

function LibraryPage() {
  const { songs, albums, artists, showCatalogSkeleton } = useCatalog()
  const [tab, setTab] = useState<
    'overview' | 'songs' | 'albums' | 'artists' | 'playlists' | 'podcasts' | 'genres'
  >('overview')
  const recentSongs = useMemo(() => sortSongsList([...songs], 'latest').slice(0, 6), [songs])
  const libraryTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'podcasts', label: 'Podcasts' },
    { id: 'genres', label: 'Genres' },
  ] as const
  const statCards = [
    { label: 'Songs', value: songs.length, hint: 'In your catalog' },
    { label: 'Albums', value: albums.length, hint: 'Full journeys' },
    { label: 'Artists', value: artists.length, hint: 'Creators' },
    { label: 'Playlists', value: PLAYLISTS.length, hint: 'Curated paths' },
    { label: 'Hours', value: Math.max(1, Math.round(songs.length * 3.4 / 60)), hint: 'Estimated listening' },
  ]

  return (
    <div className="psd-library-destination">
      <PageFrame cinematic>
        <header className="psd-inline-header psd-inline-header--library" aria-labelledby="library-heading">
          <h1 id="library-heading" className="psd-page-title psd-page-title--library">
            <span className="psd-page-title-main">My Library</span>
          </h1>
          <p className="psd-page-subtitle">
            Everything you have saved, replayed, and downloaded — organized for emotional recall.
          </p>
        </header>

        <div className="psd-tab-row psd-tab-row--underline" role="tablist" aria-label="Library sections">
          {libraryTabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              className={`psd-tab${tab === entry.id ? ' is-active' : ''}`}
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="psd-stat-grid">
          {statCards.map((card) => (
            <article key={card.label} className="psd-stat-card">
              <span className="psd-stat-value">{card.value}</span>
              <strong>{card.label}</strong>
              <span>{card.hint}</span>
            </article>
          ))}
        </div>

        <section className="psd-panel" aria-labelledby="recently-added-heading">
          <header className="psd-panel-header">
            <h2 id="recently-added-heading">Recently Added</h2>
            <span>{recentSongs.length} items</span>
          </header>
          {showCatalogSkeleton ? (
            <div className="psd-card-grid psd-card-grid--6" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="psd-cover-card psd-cover-card--skeleton" />
              ))}
            </div>
          ) : (
            <div className="psd-card-grid psd-card-grid--6">
              {recentSongs.map((song) => (
                <article key={song.id} className="psd-cover-card">
                  <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="psd-panel" aria-labelledby="your-playlists-heading">
          <header className="psd-panel-header">
            <h2 id="your-playlists-heading">Your Playlists</h2>
            <span>{PLAYLISTS.length} playlists</span>
          </header>
          <div className="psd-card-grid psd-card-grid--6">
            {PLAYLISTS.slice(0, 6).map((playlist, index) => {
              const coverSong = songs[index % Math.max(songs.length, 1)]
              return (
                <article key={playlist.title} className="psd-cover-card psd-cover-card--playlist" data-mood={playlist.mood}>
                  {coverSong?.artwork ? (
                    <ArtworkImage src={coverSong.artwork} alt="" seed={`${playlist.title}-${coverSong.id}`} />
                  ) : (
                    <div className="psd-playlist-art" data-mood={playlist.mood}>
                      <MusicNoteIcon className="card-art-icon" />
                    </div>
                  )}
                  <strong>{playlist.title}</strong>
                  <span>{playlist.tracks}</span>
                </article>
              )
            })}
          </div>
        </section>
      </PageFrame>
    </div>
  )
}


function ArtistsPage({ onOpenArtist }: { onOpenArtist: (artist: ApiArtist) => void }) {
  const { artists, albums, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [query, setQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.artistsSearch,
    '',
    parseStoredSearchTerm,
  )
  const [sort, setSort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.artistsSort,
    'az' as ArtistSort,
    parseStoredArtistSort,
  )
  const [tab, setTab] = useState<'overview' | 'songs' | 'albums' | 'playlists' | 'related' | 'about'>('overview')
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const visibleArtists = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q && q.length < 2) return []
    const filtered = filterArtistsByQuery(artists, debouncedQuery)
    return sortArtistsList(filtered, sort)
  }, [artists, debouncedQuery, sort])

  const featuredArtist = visibleArtists[0] ?? artists[0] ?? null
  const popularSongs = useMemo(
    () => (
      featuredArtist
        ? resolveSongsForArtist(
            featuredArtist,
            indexes.songsByArtistId,
            indexes.songsByArtistName,
          ).slice(0, 8)
        : []
    ),
    [featuredArtist, indexes.songsByArtistId, indexes.songsByArtistName],
  )
  const artistAlbums = useMemo(
    () => (featuredArtist ? albums.filter((album) => album.artistId === featuredArtist.id).slice(0, 8) : []),
    [albums, featuredArtist],
  )
  const listKey = useMemo(() => `${debouncedQuery}:${sort}`, [debouncedQuery, sort])
  const artistTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'related', label: 'Related' },
    { id: 'about', label: 'About' },
  ] as const

  return (
    <div className="psd-artists-destination">
      <PageFrame cinematic>
        {featuredArtist ? (
          <section className="psd-artist-hero" aria-labelledby="artist-profile-heading">
            <div
              className="psd-artist-hero-backdrop"
              style={{ backgroundImage: `url(${psdArtistsReferenceUrl})` }}
              aria-hidden="true"
            />
            <div className="psd-artist-hero-veil" aria-hidden="true" />
            <div className="psd-artist-hero-inner">
              <ArtistAvatar artist={featuredArtist} />
              <div className="psd-artist-hero-copy">
                <p className="psd-page-eyebrow">Artist profile</p>
                <h1 id="artist-profile-heading">{featuredArtist.name}</h1>
                <div className="psd-hero-actions">
                  <button type="button" className="psd-btn psd-btn--gold" onClick={() => onOpenArtist(featuredArtist)}>Play</button>
                  <button type="button" className="psd-btn psd-btn--ghost">Follow</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="psd-tab-row psd-tab-row--underline" role="tablist" aria-label="Artist sections">
          {artistTabs.map((entry) => (
            <button key={entry.id} type="button" role="tab" className={`psd-tab${tab === entry.id ? ' is-active' : ''}`} aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>

        <CatalogToolbar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Filter artists by name…"
          sortLabel="Sort"
          sortValue={sort}
          sortOptions={ARTIST_SORT_OPTIONS}
          onSortChange={(value) => setSort(value as ArtistSort)}
          resultCount={visibleArtists.length}
        />

        <section className="psd-panel" aria-labelledby="popular-songs-heading">
          <header className="psd-panel-header">
            <h2 id="popular-songs-heading">Popular</h2>
          </header>
          <ul className="psd-song-table">
            {popularSongs.map((song, index) => (
              <li key={song.id}>
                <button type="button" className="psd-song-row" onClick={() => onOpenArtist(featuredArtist!)}>
                  <span className="psd-song-index">{index + 1}</span>
                  <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                  <span className="psd-song-copy"><strong>{song.title}</strong><span>{song.album}</span></span>
                  <span className="psd-song-duration">{song.durationSeconds ? formatPlaybackTime(song.durationSeconds) : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="psd-rail-section" aria-labelledby="artist-albums-heading">
          <header className="psd-panel-header"><h2 id="artist-albums-heading">Albums</h2></header>
          <div className="psd-mini-grid psd-mini-grid--albums">
            {artistAlbums.map((album) => {
              const albumSongs = resolveSongsForAlbum(
                album,
                indexes.songsByAlbumId,
                indexes.songsByAlbumName,
              )
              return (
              <article key={album.id} className="psd-mini-card psd-mini-card--album">
                <ArtworkImage src={resolveAlbumArtwork(album, albumSongs)} alt="" seed={album.id} />
                <strong>{album.title}</strong>
              </article>
              )
            })}
          </div>
        </section>

        {showCatalogSkeleton ? <CatalogSkeleton count={10} variant="artist" /> : null}
        {showCatalogError ? <CatalogError message={error || ''} onRetry={retry} /> : null}
        {!showCatalogSkeleton && !showCatalogError && artists.length > 0 ? (
          <ApiArtistGrid artists={visibleArtists} onSelect={onOpenArtist} listKey={listKey} />
        ) : null}
      </PageFrame>
    </div>
  )
}

function AlbumsPage({ onOpenAlbum }: { onOpenAlbum: (album: ApiAlbum) => void }) {
  const { albums, artistNames, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [query, setQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSearch,
    '',
    parseStoredSearchTerm,
  )
  const [sort, setSort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSort,
    'latest' as AlbumSort,
    parseStoredAlbumSort,
  )
  const [tab, setTab] = useState<'all' | 'recent' | 'liked'>('all')
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const visibleAlbums = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q && q.length < 2) return []
    const filtered = filterAlbumsByQuery(albums, debouncedQuery, artistNames)
    return sortAlbumsList(filtered, sort)
  }, [albums, debouncedQuery, artistNames, sort])

  const listKey = useMemo(() => `${debouncedQuery}:${sort}`, [debouncedQuery, sort])

  return (
    <div className="psd-albums-destination">
      <PageFrame cinematic>
        <header className="psd-inline-header psd-inline-header--albums" aria-labelledby="albums-heading">
          <h1 id="albums-heading" className="psd-page-title psd-page-title--albums">Albums</h1>
          <p className="psd-page-subtitle">Browse every record in your vault.</p>
        </header>

        <div className="psd-albums-toolbar">
          <div className="psd-tab-row psd-tab-row--underline" role="tablist" aria-label="Album filters">
            {(['all', 'recent', 'liked'] as const).map((entry) => (
              <button key={entry} type="button" role="tab" className={`psd-tab${tab === entry ? ' is-active' : ''}`} aria-selected={tab === entry} onClick={() => setTab(entry)}>
                {entry === 'all' ? 'All Albums' : entry === 'recent' ? 'Recent' : 'Liked'}
              </button>
            ))}
          </div>
          <CatalogToolbar
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Filter by album or artist…"
            sortLabel="Sort"
            sortValue={sort}
            sortOptions={ALBUM_SORT_OPTIONS}
            onSortChange={(value) => setSort(value as AlbumSort)}
            resultCount={visibleAlbums.length}
          />
        </div>

        <CatalogSection title="Catalog albums" hint="Cached read-only data" loading={showCatalogSkeleton} error={showCatalogError ? error : null} onRetry={retry} count={visibleAlbums.length}>
          {!showCatalogSkeleton && !showCatalogError && albums.length === 0 ? (
            <CatalogEmpty title="No albums in catalog" detail="Retry once the API finishes loading or returns data." />
          ) : (
            <div className="psd-album-grid-wrap">
              <ApiAlbumGrid albums={visibleAlbums} artistNames={artistNames} indexes={indexes} onSelect={onOpenAlbum} listKey={listKey} />
            </div>
          )}
        </CatalogSection>
        <p className="psd-footer-count">{visibleAlbums.length} albums in view</p>
      </PageFrame>
    </div>
  )
}

function PlaylistsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes } = useCatalog()
  const playlistTitle = 'Midnight Vibes'
  const tracks = useMemo(() => sortSongsList([...songs], 'latest').slice(0, 16), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playTrack = useCallback(
    (song: ApiSong, index: number) => {
      onOpenSong(song, tracks, index, 'manual', playlistTitle, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', tracks, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools, tracks],
  )

  return (
    <div className="psd-playlists-destination">
      <PageFrame cinematic>
        <section className="psd-playlist-detail-hero" aria-labelledby="playlist-detail-heading">
          <div
            className="psd-playlist-detail-art"
            style={{ backgroundImage: `url(${psdPlaylistsReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="psd-playlist-detail-copy">
            <p className="psd-page-eyebrow">Playlist</p>
            <h1 id="playlist-detail-heading">{playlistTitle}</h1>
            <p>{tracks.length} tracks · Hidden Tunes curated</p>
            <div className="psd-hero-actions">
              <button type="button" className="psd-btn psd-btn--gold" disabled={tracks.length === 0} onClick={() => tracks[0] && playTrack(tracks[0], 0)}>Play</button>
              <button type="button" className="psd-btn psd-btn--ghost" disabled={tracks.length === 0}>Shuffle</button>
              <button type="button" className="psd-btn psd-btn--ghost">Edit</button>
            </div>
          </div>
        </section>

        <div className="psd-tab-row psd-tab-row--underline" role="tablist" aria-label="Playlist sections">
          <button type="button" role="tab" className="psd-tab is-active" aria-selected>Tracks</button>
        </div>

        <div className="psd-track-table-wrap">
          <table className="psd-track-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Title</th>
                <th scope="col">Album</th>
                <th scope="col">Date added</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((song, index) => (
                <tr key={song.id}>
                  <td>{index + 1}</td>
                  <td>
                    <button type="button" className="psd-track-title-btn" onClick={() => playTrack(song, index)}>
                      <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                      <span><strong>{song.title}</strong><span>{song.artist}</span></span>
                    </button>
                  </td>
                  <td>{song.album}</td>
                  <td>Recently</td>
                  <td>{song.durationSeconds ? formatPlaybackTime(song.durationSeconds) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageFrame>
    </div>
  )
}


function LikedPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes, showCatalogSkeleton } = useCatalog()
  const likedSongs = useMemo(() => sortSongsList([...songs], 'latest').slice(0, 24), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playLikedSong = useCallback(
    (song: ApiSong, index: number) => {
      onOpenSong(song, likedSongs, index, 'manual', 'Liked Songs', {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', likedSongs, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, likedSongs, onOpenSong, queuePools],
  )

  return (
    <div className="psd-liked-destination">
      <PageFrame cinematic>
        <section className="psd-liked-hero" aria-labelledby="liked-heading">
          <div
            className="psd-liked-hero-art"
            style={{ backgroundImage: `url(${psdLikedReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="psd-liked-hero-copy">
            <p className="psd-page-eyebrow">Collection</p>
            <h1 id="liked-heading">Liked Songs</h1>
            <p>{likedSongs.length} saved tracks from your catalog</p>
            <div className="psd-hero-actions">
              <button type="button" className="psd-btn psd-btn--violet" disabled={likedSongs.length === 0} onClick={() => likedSongs[0] && playLikedSong(likedSongs[0], 0)}>
                Play
              </button>
              <button type="button" className="psd-btn psd-btn--ghost" disabled={likedSongs.length === 0} onClick={() => likedSongs[0] && playLikedSong(likedSongs[0], 0)}>
                Shuffle
              </button>
            </div>
          </div>
        </section>
        <section className="psd-panel">
          {showCatalogSkeleton ? <CatalogSkeleton count={8} variant="card" /> : (
            <div className="psd-track-table-wrap">
              <table className="psd-track-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Title</th>
                    <th scope="col">Album</th>
                    <th scope="col">Added</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {likedSongs.map((song, index) => (
                    <tr key={song.id}>
                      <td>{index + 1}</td>
                      <td>
                        <button type="button" className="psd-track-title-btn" onClick={() => playLikedSong(song, index)}>
                          <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                          <span>
                            <strong>{song.title}</strong>
                            <span>{song.artist}</span>
                          </span>
                        </button>
                      </td>
                      <td>{song.album}</td>
                      <td>Recently</td>
                      <td>{song.durationSeconds ? formatPlaybackTime(song.durationSeconds) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </PageFrame>
    </div>
  )
}

/* Phase 42B: no dedicated PSD reference — inferred from Liked/Library row pattern */
function RecentPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes } = useCatalog()
  const recentSongs = useMemo(() => sortSongsList([...songs], 'latest').slice(0, 20), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playRecentSong = useCallback(
    (song: ApiSong, index: number) => {
      onOpenSong(song, recentSongs, index, 'manual', 'Recent Plays', {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', recentSongs, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools, recentSongs],
  )

  return (
    <div className="psd-recent-destination">
      <PageFrame cinematic>
        <section className="psd-inferred-hero" aria-labelledby="recent-heading">
          <p className="psd-page-eyebrow">Listening history</p>
          <h1 id="recent-heading">Recently Played</h1>
          <p className="psd-page-subtitle">Inferred shell — no dedicated PSD reference; styled from Liked/Library patterns.</p>
        </section>
        <ul className="psd-song-table">
          {recentSongs.map((song, index) => (
            <li key={song.id}>
              <button type="button" className="psd-song-row" onClick={() => playRecentSong(song, index)}>
                <span className="psd-song-index">{index + 1}</span>
                <ArtworkImage src={song.artwork} alt="" seed={song.id} />
                <span className="psd-song-copy">
                  <strong>{song.title}</strong>
                  <span>{song.artist} · {song.album}</span>
                </span>
                <span className="psd-song-duration">{song.durationSeconds ? formatPlaybackTime(song.durationSeconds) : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      </PageFrame>
    </div>
  )
}

/* Phase 42B: no dedicated PSD reference — inferred from Library download cues */
function DownloadsPage() {
  return (
    <div className="psd-downloads-destination">
      <PageFrame cinematic>
        <section className="psd-inferred-hero" aria-labelledby="downloads-heading">
          <p className="psd-page-eyebrow">Offline</p>
          <h1 id="downloads-heading">Downloads</h1>
          <p className="psd-page-subtitle">Inferred shell — no dedicated PSD reference; styled from sidebar/library download cues.</p>
        </section>
        <PlaceholderNote
          title="No downloads yet"
          detail="Saved offline tracks will appear here once download sync is connected."
        />
      </PageFrame>
    </div>
  )
}

/* Phase 42B: no dedicated PSD reference — gold luxury from sidebar premium CTA */
function PremiumPage() {
  return (
    <div className="psd-premium-destination">
      <PageFrame cinematic>
        <section className="psd-premium-hero" aria-labelledby="premium-heading">
          <div className="psd-premium-glow" aria-hidden="true" />
          <p className="psd-page-eyebrow">Hidden Tunes Premium</p>
          <h1 id="premium-heading">Unlock Every World</h1>
          <p className="psd-page-subtitle">Gold luxury shell inferred from sidebar premium CTA — no dedicated full-page PSD.</p>
          <div className="psd-hero-actions">
            <button type="button" className="psd-btn psd-btn--gold">Go Premium</button>
            <button type="button" className="psd-btn psd-btn--ghost">Compare plans</button>
          </div>
        </section>
        <div className="psd-premium-grid">
          {['Lossless audio', 'Every emotional world', 'Cinema listening', 'Offline downloads'].map((perk) => (
            <article key={perk} className="psd-premium-card">
              <span className="psd-premium-card-icon" aria-hidden="true">✦</span>
              <strong>{perk}</strong>
            </article>
          ))}
        </div>
      </PageFrame>
    </div>
  )
}

function TvPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Visual stories"
        title="Hidden Tunes TV"
        description="Cinematic sessions, residencies, and visual albums — the moving image of emotion."
      />
      <section className="tv-featured" aria-label="Featured broadcast">
        <div className="tv-featured-bg" />
        <div className="tv-featured-inner">
          <p className="hero-eyebrow">Now premiering</p>
          <h2>Mood Room Live — Violet Hour</h2>
          <p className="page-description">An immersive 48-minute session · UI preview only</p>
          <button type="button" className="btn-primary">
            Watch preview
          </button>
        </div>
      </section>
      <div className="card-row">
        {TV_SHOWS.map((show) => (
          <article key={show.title} className="discovery-card tv-card" data-mood={show.mood}>
            <div className="card-art tv-card-art">
              <svg className="play-badge" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            </div>
            <div className="card-info">
              <h3>{show.title}</h3>
              <p>{show.subtitle}</p>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function AudioQualitySelector({
  value,
  onChange,
  compact = false,
}: {
  value: AudioQualityMode
  onChange: (mode: AudioQualityMode) => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <select
        className="audio-quality-select"
        value={value}
        onChange={(event) => onChange(event.target.value as AudioQualityMode)}
        aria-label="Audio quality"
      >
        {AUDIO_QUALITY_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {AUDIO_QUALITY_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      className="audio-quality-selector"
      role="group"
      aria-label="Desktop audio quality"
    >
      {AUDIO_QUALITY_MODES.map((mode) => {
        const active = mode === value

        return (
          <button
            key={mode}
            type="button"
            className={'audio-quality-option' + (active ? ' active' : '')}
            aria-pressed={active}
            onClick={() => onChange(mode)}
          >
            {AUDIO_QUALITY_MODE_LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}

function SettingsPage() {
  const { audioQualityMode, setAudioQualityMode } = useDesktopPlayback()
  const { resetDesktopPreferencesState } = usePreferencesReset()
  const { clearCatalogCache } = useCatalog()
  const [resetNotice, setResetNotice] = useState('')
  const [cacheNotice, setCacheNotice] = useState('')

  const handleResetPreferences = () => {
    resetDesktopPreferencesState()
    setResetNotice('Desktop preferences cleared. UI defaults restored locally.')
  }

  const handleClearCatalogCache = () => {
    clearCatalogCache()
    setCacheNotice('Saved catalog cache cleared locally.')
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Desktop appearance and product information for this install."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className="settings-nav-item active">
            About
          </button>
          <button type="button" className="settings-nav-item" disabled>
            Appearance
          </button>
          <button type="button" className="settings-nav-item" disabled>
            Playback
          </button>
        </nav>
        <div className="settings-panels">
          <section className="settings-panel settings-panel--about">
            <h2>About &amp; identity</h2>
            <p className="settings-panel-desc">
              Installable desktop preview for browsing the Hidden Tunes catalog.
            </p>
            <dl className="settings-identity-list">
              <div className="settings-identity-row">
                <dt>App name</dt>
                <dd>{APP_NAME}</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Version</dt>
                <dd>{APP_VERSION}</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Build</dt>
                <dd>Desktop Preview Build</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Catalog</dt>
                <dd>Read-only catalog mode</dd>
              </div>
            </dl>
            <p className="settings-identity-note">
              Mobile app and playback remain separate.
            </p>
          </section>
          <section className="settings-panel">
            <h2>Desktop preferences</h2>
            <p className="settings-panel-desc">
              Saved locally on this device — sidebar page, search terms, and sort options only.
            </p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Reset desktop preferences</span>
                <small>Clears local UI state · catalog and mobile stay unchanged</small>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm settings-reset-btn"
                onClick={handleResetPreferences}
              >
                Reset
              </button>
            </div>
            {resetNotice ? (
              <p className="settings-reset-note" role="status">
                {resetNotice}
              </p>
            ) : null}
          </section>
          <CatalogStatusSettings
            cacheNotice={cacheNotice}
            onClearCache={handleClearCatalogCache}
          />
          <section className="settings-panel settings-panel--playback">
            <h2>Playback quality</h2>
            <p className="settings-panel-desc">
              Audio quality mode is saved locally for this desktop install. Playback source selection stays unchanged.
            </p>
            <div className="settings-row settings-row--stacked">
              <div className="settings-label">
                <span>Audio quality</span>
                <small>Selected: {AUDIO_QUALITY_MODE_LABELS[audioQualityMode]}</small>
              </div>
              <AudioQualitySelector
                value={audioQualityMode}
                onChange={setAudioQualityMode}
              />
            </div>
          </section>
          <section className="settings-panel">
            <h2>Appearance</h2>
            <p className="settings-panel-desc">Cinematic dark theme tuned for desktop browsing.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Cinematic dark theme</span>
                <small>Low-light, premium contrast</small>
              </div>
              <span className="settings-badge">Active</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Accent glow intensity</span>
                <small>Highlights on cards and navigation</small>
              </div>
              <div className="settings-slider" aria-hidden="true">
                <div className="settings-slider-fill" style={{ width: '70%' }} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageFrame>
  )
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}


const PlaybackTransportControls = memo(function PlaybackTransportControls({
  activeTrackId,
  className = 'player-controls',
}: {
  activeTrackId: string | null
  className?: string
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    pause,
    resume,
    next,
    previous,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && currentIndex > 0
  const hasNext =
    isActive && currentIndex >= 0 && currentIndex < currentQueue.length - 1
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading

  const handlePlayPause = () => {
    if (!isActive || isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    resume()
  }

  const playLabel = showLoading
    ? 'Loading track'
    : showPlaying
      ? 'Pause'
      : isActive
        ? 'Play'
        : 'Play (select a track)'

  return (
    <div className={`transport-controls ${className}`} role="group" aria-label="Playback controls">
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className={
          'control-btn play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
          + (!isActive ? ' is-idle' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        <span className="control-btn-icon control-btn-icon--play" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
          </svg>
        </span>
      </button>
    </div>
  )
})

const PlayerBar = memo(function PlayerBar({
  track,
  onOpenCinema,
}: {
  track: ApiSong | null
  onOpenCinema?: () => void
}) {
  const { songs } = useCatalog()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    queueTitle,
    isPlaying,
    isLoading,
    error,
    positionSeconds,
    durationSeconds,
    volume,
    audioQualityMode,
    setAudioQualityMode,
    seekTo,
    setVolume,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = track ?? currentTrack
  const title = displayTrack?.title ?? 'Nothing playing'
  const artist = displayTrack?.artist ?? 'Select a song to begin'
  const progressMax = durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const showQueuePosition = currentQueue.length > 1 && currentIndex >= 0
  const queueLabel = QUEUE_CONTEXT_LABELS[queueContext]
  const isBarActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)

  const barQueueSnapshot = useMemo(
    () =>
      isBarActive
        ? analyzeQueueSnapshot({
            queue: currentQueue,
            currentIndex,
            currentTrack,
          })
        : null,
    [currentIndex, currentQueue, currentTrack, isBarActive],
  )

  const barQueueInsight = useMemo(
    () => (barQueueSnapshot ? describeQueueInsight(barQueueSnapshot) : null),
    [barQueueSnapshot],
  )

  const playerListeningContext = useMemo(
    () =>
      buildListeningContext({
        track: displayTrack,
        catalog: songs,
        queueContext,
        queueTitle,
        queueInsight: barQueueInsight,
        isPlaying,
        isLoading,
        isActive: isBarActive,
      }),
    [
      barQueueInsight,
      displayTrack,
      isBarActive,
      isLoading,
      isPlaying,
      queueContext,
      queueTitle,
      songs,
    ],
  )

  const volumeLevel =
    volume <= 0 ? 'muted' : volume < 0.35 ? 'low' : volume > 0.7 ? 'high' : 'normal'

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
  }, [])

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!displayTrack || progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!displayTrack || progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const barState = error
    ? 'error'
    : isLoading
      ? 'loading'
      : isPlaying
        ? 'playing'
        : displayTrack
          ? 'paused'
          : 'idle'

  return (
    <footer
      className={`player-bar player-bar--${barState}`}
      aria-label="Player"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
    >
      <div className="player-track">
        <div className="player-artwork" aria-hidden="true">
          {displayTrack ? (
            <ArtworkImage src={displayTrack.artwork} alt="" seed={displayTrack.id} priority />
          ) : null}
        </div>
        <div className="player-meta">
          <h4>{title}</h4>
          <p>{artist}</p>
          {showQueuePosition ? (
            <p className="player-queue-position">
              {queueLabel} · Track {currentIndex + 1} of {currentQueue.length}
            </p>
          ) : null}
          <ListeningContextStrip
            lines={playerListeningContext}
            className="listening-context-strip listening-context-strip--player"
          />
          {error ? <p className="player-error">{error}</p> : null}
        </div>
      </div>

      <div className="player-center">
        <PlaybackTransportControls activeTrackId={displayTrack?.id ?? null} />
        <div
          className="progress-wrap"
          role="group"
          aria-label="Playback progress"
        >
          <span className="progress-time">{formatPlaybackTime(progressValue)}</span>
          <div
            ref={progressTrackRef}
            className={`progress-track${progressMax > 0 && displayTrack ? ' progress-track--interactive' : ''}`}
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progressMax)}
            aria-valuenow={Math.round(progressValue)}
            aria-disabled={!displayTrack || progressMax <= 0 || isLoading}
            onClick={handleSeekClick}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="progress-time">
            {progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}
          </span>
        </div>
      </div>

      <div className="player-right">
        {onOpenCinema ? (
          <button
            type="button"
            className="player-cinema-btn"
            onClick={onOpenCinema}
            aria-label="Open fullscreen player"
            title="Fullscreen"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
            </svg>
          </button>
        ) : null}
        <div className="player-quality">
          <AudioQualitySelector
            value={audioQualityMode}
            onChange={setAudioQualityMode}
            compact
          />
        </div>
        <div className={`player-volume player-volume--${volumeLevel}`}>
        <button
          type="button"
          className="control-btn"
          aria-label={
            volume <= 0
              ? 'Volume muted'
              : volume < 0.35
                ? 'Volume low'
                : 'Volume'
          }
          tabIndex={-1}
        >
          {volume <= 0 ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M23 9l-6 6M17 9l6 6" />
            </svg>
          ) : volume < 0.35 ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
            </svg>
          )}
        </button>
        <div
          ref={volumeTrackRef}
          className="volume-slider"
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volumePercent)}
          onClick={handleVolumeClick}
          onPointerDown={handleVolumePointerDown}
          onPointerMove={handleVolumePointerMove}
          onPointerUp={handleVolumePointerUp}
          onPointerCancel={handleVolumePointerUp}
        >
          <div
            className="volume-fill"
            style={{ width: `${volumePercent}%` }}
          />
        </div>
      </div>
      </div>
    </footer>
  )
})


function buildRailWaveformHeights(seed: string, count = 36) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((hash + index * 17) * 0.73) * 0.5 + 0.5
    const shaped = 0.28 + value * 0.72
    return Math.round(shaped * 100)
  })
}

const RailWaveformSeek = memo(function RailWaveformSeek({
  trackId,
  progressPercent,
  progressMax,
  isLoading,
  onSeek,
}: {
  trackId: string | null
  progressPercent: number
  progressMax: number
  isLoading: boolean
  onSeek: (seconds: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const heights = useMemo(
    () => buildRailWaveformHeights(trackId ?? 'idle-rail'),
    [trackId],
  )

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = trackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={trackRef}
      className="rail-waveform"
      role="slider"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={progressMax > 0 ? progressMax : 0}
      aria-valuenow={progressMax > 0 ? (progressPercent / 100) * progressMax : 0}
      aria-disabled={progressMax <= 0 || isLoading}
      onClick={handleSeekClick}
      onPointerDown={handleSeekPointerDown}
      onPointerMove={handleSeekPointerMove}
      onPointerUp={handleSeekPointerUp}
      onPointerCancel={handleSeekPointerUp}
    >
      {heights.map((height, index) => {
        const barProgress = ((index + 0.5) / heights.length) * 100
        const isPlayed = barProgress <= progressPercent
        return (
          <span
            key={index}
            className={`rail-waveform-bar${isPlayed ? ' is-played' : ''}`}
            style={{ height: `${height}%` }}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
})


function TheaterModeRailCard({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="rail-theater-card" aria-label="Theater Mode">
      <header className="rail-theater-header">
        <h3 className="rail-theater-title">Theater Mode</h3>
        <span className="rail-theater-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8l6 4-6 4M12 8l6 4-6 4" />
          </svg>
        </span>
      </header>
      <div
        className="rail-theater-art"
        style={{ backgroundImage: `url(${emotionalWorldsReferenceUrl})` }}
        aria-hidden="true"
      />
      <p className="rail-theater-copy">Experience music like never before.</p>
      <button type="button" className="rail-theater-enter" onClick={onEnter}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        Enter Theater
      </button>
    </section>
  )
}

const QueueUpNextPanel = memo(function QueueUpNextPanel({
  onOpenCinema,
}: {
  onOpenCinema?: () => void
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    getUpcomingTracks,
    seekTo,
  } = useDesktopPlayback()

  const listScrollRef = useRef<HTMLOListElement>(null)
  const activeTrackId = currentTrack?.id ?? null

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)
  const upcomingTracks = getUpcomingTracks()
  const progressMax = hasPlayback && durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0

  useEffect(() => {
    if (!listScrollRef.current) return
    listScrollRef.current.scrollTop = 0
  }, [activeTrackId, currentIndex])

  const displayTitle = activeTrack?.title ?? 'Nothing playing'
  const displayArtist = activeTrack?.artist ?? 'Select a world to begin'

  return (
    <aside
      className="queue-rail now-playing-rail"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >
      <div className="now-playing-rail-inner">
        <header className="now-playing-rail-header">
          <p className="now-playing-rail-eyebrow">Now Playing</p>
        </header>

        <section className="now-playing-stage" aria-label="Current track">
          <div className="now-playing-art-shell">
            <div className="now-playing-art-glow" aria-hidden="true" />
            <div className="now-playing-art-frame">
              {hasPlayback && activeTrack ? (
                <ArtworkImage
                  src={activeTrack.artwork}
                  alt=""
                  seed={activeTrack.id}
                  priority
                />
              ) : (
                <div className="now-playing-art-placeholder" aria-hidden="true">
                  <MusicNoteIcon className="now-playing-art-placeholder-icon" />
                </div>
              )}
              {isLoading ? (
                <span className="now-playing-art-spinner player-spinner" aria-hidden="true" />
              ) : null}
            </div>
            <button
              type="button"
              className="now-playing-heart"
              aria-label="Favorite"
              title="Favorite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
              </svg>
            </button>
          </div>

          <div className="now-playing-meta">
            <h3 className="now-playing-title">{displayTitle}</h3>
            <p className="now-playing-artist">{displayArtist}</p>
          </div>

          <RailWaveformSeek
            trackId={activeTrack?.id ?? null}
            progressPercent={progressPercent}
            progressMax={progressMax}
            isLoading={isLoading}
            onSeek={seekTo}
          />

          <div className="now-playing-times" aria-hidden="true">
            <span>{formatPlaybackTime(progressValue)}</span>
            <span>{formatPlaybackTime(progressMax)}</span>
          </div>

          <PlaybackTransportControls
            activeTrackId={activeTrack?.id ?? null}
            className="rail-transport-controls"
          />
        </section>

        <section className="up-next-section" aria-label="Up next">
          <h3 className="up-next-label">Up Next</h3>

          {upcomingTracks.length === 0 ? (
            <div className="up-next-empty" role="status">
              <p>Your queue will appear here.</p>
            </div>
          ) : (
            <ol className="up-next-list" ref={listScrollRef}>
              {upcomingTracks.map((track, index) => (
                <li className="up-next-item" key={`${track.id}-${index}`}>
                  <div className="up-next-thumb" aria-hidden="true">
                    <ArtworkImage src={track.artwork} alt="" seed={track.id} />
                  </div>
                  <div className="up-next-copy">
                    <span className="up-next-title">{track.title}</span>
                    <span className="up-next-artist">{track.artist}</span>
                  </div>
                  {track.durationSeconds != null && track.durationSeconds > 0 ? (
                    <span className="up-next-duration">
                      {formatPlaybackTime(track.durationSeconds)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        {onOpenCinema ? <TheaterModeRailCard onEnter={onOpenCinema} /> : null}
      </div>
    </aside>
  )
})
type ActiveView = 'page' | 'song' | 'album' | 'artist' | 'mood'

function ListeningContextStrip({
  lines,
  className = 'listening-context-strip',
}: {
  lines: ListeningContextLines
  className?: string
}) {
  if (
    !lines.atmosphereLine
    && lines.contextPills.length === 0
    && !lines.insightLine
  ) {
    return null
  }

  return (
    <div className={className}>
      {lines.atmosphereLine ? (
        <p className="listening-context-atmosphere">{lines.atmosphereLine}</p>
      ) : null}
      {lines.contextPills.length > 0 ? (
        <div className="listening-context-pills">
          {lines.contextPills.map((pill) => (
            <span className="listening-context-pill" key={pill}>
              {pill}
            </span>
          ))}
        </div>
      ) : null}
      {lines.insightLine ? (
        <p className="listening-context-insight">{lines.insightLine}</p>
      ) : null}
    </div>
  )
}

function formatDateLabel(value: string | null) {
  if (!value) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}


function DetailTopBar({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack: () => void
}) {
  return (
    <div className="detail-topbar">
      <button type="button" className="detail-back" onClick={onBack}>
        <span aria-hidden="true">←</span>
        Back
      </button>
      <div className="detail-titles">
        <h2 className="detail-title">{title}</h2>
        {subtitle ? <p className="detail-subtitle">{subtitle}</p> : null}
      </div>
    </div>
  )
}


const CinemaPlayerShell = memo(function CinemaPlayerShell({
  onClose,
  preferredTrack = null,
}: {
  onClose: () => void
  preferredTrack?: ApiSong | null
}) {
  const { songs } = useCatalog()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    queueTitle,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const progressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const queueSnapshot = useMemo(
    () =>
      isActive
        ? analyzeQueueSnapshot({
            queue: currentQueue,
            currentIndex,
            currentTrack,
          })
        : null,
    [currentQueue, currentIndex, currentTrack, isActive],
  )

  const queueInsight = useMemo(
    () => (queueSnapshot ? describeQueueInsight(queueSnapshot) : null),
    [queueSnapshot],
  )

  const cinemaAtmosphere = useMemo(
    () => deriveListeningAtmosphere(displayTrack, songs),
    [displayTrack, songs],
  )

  const cinemaListeningContext = useMemo(
    () =>
      buildListeningContext({
        track: displayTrack,
        catalog: songs,
        queueContext,
        queueTitle,
        queueInsight,
        isPlaying,
        isLoading,
        isActive,
      }),
    [
      displayTrack,
      isActive,
      isLoading,
      isPlaying,
      queueContext,
      queueInsight,
      queueTitle,
      songs,
    ],
  )

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isActive || progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isActive || progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!displayTrack) {
    return (
      <div
        className="cinema-player cinema-player--theater cinema-player--empty"
        role="dialog"
        aria-modal="true"
        aria-label="Fullscreen player"
      >
        <div className="cinema-player-backdrop" aria-hidden="true" />
        <button
          type="button"
          className="cinema-player-close"
          onClick={onClose}
          aria-label="Exit fullscreen player"
        >
          <span className="cinema-player-close-icon" aria-hidden="true">
            ←
          </span>
          Back
        </button>
        <div className="cinema-player-empty-stage">
          <div className="cinema-player-empty-glow" aria-hidden="true" />
          <div className="cinema-player-empty-icon" aria-hidden="true">
            <MusicNoteIcon className="cinema-player-empty-icon-svg" />
          </div>
          <h1 className="cinema-player-empty-title">Your stage is waiting</h1>
          <p className="cinema-player-empty-detail">
            Start a track to open the fullscreen listening experience.
          </p>
          <p className="cinema-player-kbd-hint">Press Esc to return</p>
        </div>
      </div>
    )
  }

  const artBackdropStyle = displayTrack.artwork
    ? { backgroundImage: `url(${displayTrack.artwork})` }
    : undefined

  const theaterLyric = useMemo(() => {
    if (cinemaListeningContext.atmosphereLine) return cinemaListeningContext.atmosphereLine
    const description = displayTrack?.description?.trim()
    if (description) return description
    return 'Feel every sound — let the room disappear around you.'
  }, [cinemaListeningContext.atmosphereLine, displayTrack?.description])

  return (
    <div
      className="cinema-player cinema-player--theater"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen player"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-scene={cinemaAtmosphere.sceneId}
      data-mood={cinemaAtmosphere.mood}
    >
      <div
        className="cinema-player-art-backdrop cinema-theater-photo"
        style={artBackdropStyle}
        aria-hidden="true"
      />
      <div className="cinema-player-backdrop cinema-theater-backdrop" aria-hidden="true" />
      <div className="cinema-theater-veil" aria-hidden="true" />
      <button
        type="button"
        className="cinema-player-close cinema-theater-close"
        onClick={onClose}
        aria-label="Exit fullscreen player"
      >
        <span className="cinema-player-close-icon" aria-hidden="true">
          ←
        </span>
        Back
        <span className="cinema-player-kbd-hint cinema-player-kbd-hint--inline">
          Esc
        </span>
      </button>
      <div className="cinema-theater-stage">
        <div className="cinema-theater-lyrics-module" aria-live="polite">
          <p className="cinema-theater-eyebrow">Now listening</p>
          <p className="cinema-theater-lyric">{theaterLyric}</p>
        </div>

        <div className="cinema-theater-credit">
          <h1 className="cinema-theater-title">{displayTrack.title}</h1>
          <p className="cinema-theater-artist">
            {displayTrack.artist}
            {displayTrack.album ? (
              <span className="cinema-theater-album"> · {displayTrack.album}</span>
            ) : null}
          </p>
        </div>

        <span className="cinema-theater-quality-badge" aria-hidden="true">
          Hi-Res
        </span>

        <PlaybackTransportControls
          activeTrackId={displayTrack.id}
          className="cinema-theater-controls"
        />

        <div
          className="cinema-theater-progress progress-wrap"
          role="group"
          aria-label="Playback progress"
        >
          <span className="progress-time">
            {formatPlaybackTime(progressValue)}
          </span>
          <div
            ref={progressTrackRef}
            className={
              'progress-track cinema-theater-progress-track'
              + (progressMax > 0 && isActive ? ' progress-track--interactive' : '')
            }
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progressMax)}
            aria-valuenow={Math.round(progressValue)}
            aria-disabled={!isActive || progressMax <= 0 || isLoading}
            onClick={handleSeekClick}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div
              className="progress-fill cinema-theater-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="progress-time">
            {progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
})

function SongDetailView({
  song,
  onBack,
  onOpenCinema,
}: {
  song: ApiSong
  onBack: () => void
  onOpenCinema?: () => void
}) {
  const { songs } = useCatalog()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    queueTitle,
    isPlaying,
    isLoading,
  } = useDesktopPlayback()

  const created = formatDateLabel(song.createdAt)
  const isActive = currentTrack?.id === song.id
  const artBackdropStyle = song.artwork
    ? { backgroundImage: `url(${song.artwork})` }
    : undefined

  const stageAtmosphere = useMemo(
    () => deriveListeningAtmosphere(song, songs),
    [song, songs],
  )

  const stageQueueSnapshot = useMemo(
    () =>
      isActive
        ? analyzeQueueSnapshot({
            queue: currentQueue,
            currentIndex,
            currentTrack,
          })
        : null,
    [currentIndex, currentQueue, currentTrack, isActive],
  )

  const stageQueueInsight = useMemo(
    () => (stageQueueSnapshot ? describeQueueInsight(stageQueueSnapshot) : null),
    [stageQueueSnapshot],
  )

  const stageListeningContext = useMemo(
    () =>
      buildListeningContext({
        track: song,
        catalog: songs,
        queueContext,
        queueTitle,
        queueInsight: stageQueueInsight,
        isPlaying,
        isLoading,
        isActive,
      }),
    [
      isActive,
      isLoading,
      isPlaying,
      queueContext,
      queueTitle,
      song,
      songs,
      stageQueueInsight,
    ],
  )

  return (
    <PageFrame>
      <DetailTopBar title="Song" onBack={onBack} />
      <div
        className="listening-stage"
        data-playing={isActive && isPlaying ? 'true' : 'false'}
        data-loading={isActive && isLoading ? 'true' : 'false'}
        data-scene={stageAtmosphere.sceneId}
        data-mood={stageAtmosphere.mood}
      >
        <VisualSceneBackdrop
          sceneId={stageAtmosphere.sceneId}
          seed={song.id}
          variant="ambient"
        />
        <div
          className="listening-stage-art-backdrop"
          style={artBackdropStyle}
          aria-hidden="true"
        />
        <div className="listening-stage-veil" aria-hidden="true" />
        {onOpenCinema ? (
          <button
            type="button"
            className="cinema-entry-btn"
            onClick={onOpenCinema}
            aria-label="Open fullscreen player"
            title="Fullscreen"
          >
            <span className="cinema-entry-btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
              </svg>
            </span>
            <span className="cinema-entry-btn-label">Fullscreen</span>
          </button>
        ) : null}
        <section
          className="detail-hero detail-hero--song"
          data-playing={isActive && isPlaying ? 'true' : 'false'}
          data-loading={isActive && isLoading ? 'true' : 'false'}
        >
          <div className="detail-artwork-stage">
            <span className="detail-artwork-aura" aria-hidden="true" />
            <div className="detail-artwork">
              <ArtworkImage src={song.artwork} alt="" seed={song.id} priority />
            </div>
          </div>
          <div className="detail-hero-copy">
            <p className="detail-eyebrow">{stageListeningContext.eyebrow}</p>
            <h1 className="detail-h1">{song.title}</h1>
            <p className="detail-byline">
              <span className="detail-pill">{song.artist}</span>
              <span className="detail-pill detail-pill--muted">{song.album}</span>
            </p>
            <ListeningContextStrip lines={stageListeningContext} />
            {created ? (
              <p className="detail-stats">Added {created}</p>
            ) : null}
            <PlaybackTransportControls
              activeTrackId={song.id}
              className="detail-controls"
            />
          </div>
        </section>
      </div>
    </PageFrame>
  )
}

function AlbumDetailView({
  album,
  onBack,
  onOpenSong,
  selectedTrackId,
}: {
  album: ApiAlbum
  onBack: () => void
  onOpenSong: QueueSongHandler
  selectedTrackId: string | null
}) {
  const { artistNames, indexes } = useCatalog()
  const created = formatDateLabel(album.createdAt)

  const albumSongs = useMemo(() => {
    const byAlbum = resolveSongsForAlbum(
      album,
      indexes.songsByAlbumId,
      indexes.songsByAlbumName,
    )
    return sortSongsList(byAlbum, 'az')
  }, [album, indexes.songsByAlbumId, indexes.songsByAlbumName])

  const artistName = useMemo(
    () => resolveAlbumDisplayArtist(album, albumSongs, artistNames),
    [album, albumSongs, artistNames],
  )

  const artwork = useMemo(
    () => resolveAlbumArtwork(album, albumSongs),
    [album, albumSongs],
  )
  const tracks = useMemo(
    () => albumSongs.slice(0, CATALOG_DETAIL_TRACK_PREVIEW_LIMIT),
    [albumSongs],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playAlbumSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      tracks,
      index,
      'album',
      album.title,
      {
        seedType: 'album',
        seedId: album.id,
        seedTracks: capSongPool(albumSongs),
        candidatePools: queuePools,
      },
    ),
    [album.id, album.title, albumSongs, onOpenSong, queuePools, tracks],
  )

  return (
    <PageFrame>
      <DetailTopBar title={album.title} onBack={onBack} />
      <section className="detail-hero detail-hero--album">
        <div className="detail-artwork detail-artwork--wide">
          <ArtworkImage src={artwork} alt="" seed={album.id} variant="wide" priority />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Album</p>
          <h1 className="detail-h1">{album.title}</h1>
          <p className="detail-byline">
            <span className="detail-pill">{artistName || 'Unknown artist'}</span>
            <span className="detail-pill detail-pill--muted">
              {album.releaseYear ? `Released ${album.releaseYear}` : 'Release year unknown'}
            </span>
          </p>
          <p className="detail-stats">
            {albumSongs.length} {albumSongs.length === 1 ? 'track' : 'tracks'}
            {created ? ` · Added ${created}` : ''}
          </p>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Track list</h3>
        </div>
        {tracks.length === 0 ? (
          <CatalogEmpty title="No tracks found" detail="This album has no matching songs in the cached list yet." />
        ) : (
          <ol className="detail-tracklist">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <button
                  type="button"
                  className="detail-track detail-track-button"
                  data-selected={selectedTrackId === track.id ? 'true' : undefined}
                  onClick={() => playAlbumSong(track, index)}
                  aria-label={`Open ${track.title} by ${track.artist}`}
                >
                  <span className="detail-track-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="detail-track-title">{track.title}</span>
                  <span className="detail-track-meta">{track.artist}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageFrame>
  )
}

function ArtistDetailView({
  artist,
  onBack,
  onOpenSong,
  onOpenAlbum,
}: {
  artist: ApiArtist
  onBack: () => void
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
}) {
  const { artistNames, indexes } = useCatalog()

  const artistSongs = useMemo(() => {
    const byArtist = resolveSongsForArtist(
      artist,
      indexes.songsByArtistId,
      indexes.songsByArtistName,
    )
    return sortSongsList(byArtist, 'latest')
  }, [artist, indexes.songsByArtistId, indexes.songsByArtistName])
  const topSongs = useMemo(() => artistSongs.slice(0, 12), [artistSongs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playArtistSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      topSongs,
      index,
      'artist',
      artist.name,
      {
        seedType: 'artist',
        seedId: artist.id,
        seedTracks: capSongPool(artistSongs),
        candidatePools: queuePools,
      },
    ),
    [artist.id, artist.name, artistSongs, onOpenSong, queuePools, topSongs],
  )

  const artistAlbums = useMemo(() => {
    if (!artist.id) return []
    return (indexes.albumsByArtistId.get(artist.id) ?? []).slice(0, 12)
  }, [indexes.albumsByArtistId, artist.id])

  return (
    <PageFrame>
      <DetailTopBar title="Artist" onBack={onBack} />
      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <ArtistAvatar artist={artist} />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <p className="detail-stats">
            {artist.songCount || artistSongs.length}{' '}
            {(artist.songCount || artistSongs.length) === 1 ? 'track' : 'tracks'} · {artistAlbums.length}{' '}
            {artistAlbums.length === 1 ? 'album' : 'albums'}
          </p>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Top songs</h3>
          <span>From cached catalog</span>
        </div>
        <ApiSongGrid
          songs={topSongs}
          onSelect={playArtistSong}
          listKey={`artist-songs-${artist.id}`}
          paginate={false}
        />
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Albums</h3>
          <span>From cached catalog</span>
        </div>
        {artistAlbums.length === 0 ? (
          <CatalogEmpty title="No albums found" detail="This artist has no linked albums in the cached list yet." />
        ) : (
          <ApiAlbumGrid
            albums={artistAlbums}
            artistNames={artistNames}
            indexes={indexes}
            onSelect={onOpenAlbum}
            listKey={`artist-albums-${artist.id}`}
            paginate={false}
          />
        )}
      </section>
    </PageFrame>
  )
}

function MoodDetailView({
  mood,
  onBack,
  onOpenSong,
}: {
  mood: MoodRoom
  onBack: () => void
  onOpenSong: QueueSongHandler
}) {
  const { songs, indexes } = useCatalog()

  const moodSongs = useMemo(
    () =>
      resolveSongsForMoodRoom(
        mood.title,
        mood.mood,
        indexes.songsByMood,
        indexes.songsByGenre,
        songs,
      ),
    [indexes.songsByGenre, indexes.songsByMood, mood.mood, mood.title, songs],
  )
  const curated = useMemo(() => moodSongs.slice(0, 12), [moodSongs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const descriptionByMood: Record<Mood, string> = useMemo(
    () => ({
      violet: 'Velvet signals, neon hush, and after-hours romance.',
      cyan: 'Clean air, moonlit focus, and oceanic clarity.',
      rose: 'Heat, heart, and luminous emotional peaks.',
      mint: 'Green calm, organic drift, and restorative quiet.',
    }),
    [],
  )

  const sceneId = moodRoomScene(mood)
  const playMoodSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      curated,
      index,
      'mood',
      mood.title,
      {
        seedType: 'mood',
        seedId: mood.title,
        seedTracks: capSongPool(moodSongs),
        candidatePools: queuePools,
      },
    ),
    [curated, mood.title, moodSongs, onOpenSong, queuePools],
  )

  return (
    <PageFrame>
      <DetailTopBar title="Mood Room" subtitle="UI-only room detail" onBack={onBack} />
      <section
        className={`detail-hero detail-hero--mood detail-hero--${mood.mood}`}
        data-scene={sceneId}
      >
        <VisualSceneBackdrop sceneId={sceneId} seed={mood.title} variant="hero" />
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Mood Room</p>
          <h1 className="detail-h1">{mood.title}</h1>
          <p className="detail-mood-desc">{descriptionByMood[mood.mood]}</p>
          <div className="detail-byline">
            <span className="detail-pill">{mood.listeners} listening</span>
            <span className="detail-pill detail-pill--muted">{mood.subtitle}</span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Curated songs</h3>
          <span>From cached catalog</span>
        </div>
        <ApiSongGrid
          songs={curated}
          onSelect={playMoodSong}
          listKey={`mood-${mood.title}`}
          paginate={false}
        />
      </section>
    </PageFrame>
  )
}

function CatalogDetailRouter({
  activeView,
  selectedSong,
  selectedAlbum,
  selectedArtist,
  selectedMood,
  desktopSelectedTrack,
  onBack,
  activePage,
  activeNavKey,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood,
  onOpenCinema,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenCinema?: () => void
}) {
  if (activeView === 'song' && selectedSong) {
    return (
      <SongDetailView
        song={selectedSong}
        onBack={onBack}
        onOpenCinema={onOpenCinema}
      />
    )
  }

  if (activeView === 'album' && selectedAlbum) {
    return (
      <AlbumDetailView
        album={selectedAlbum}
        onBack={onBack}
        onOpenSong={onOpenSong}
        selectedTrackId={desktopSelectedTrack?.id ?? null}
      />
    )
  }

  if (activeView === 'artist' && selectedArtist) {
    return (
      <ArtistDetailView
        artist={selectedArtist}
        onBack={onBack}
        onOpenSong={onOpenSong}
        onOpenAlbum={onOpenAlbum}
      />
    )
  }

  if (activeView === 'mood' && selectedMood) {
    return (
      <MoodDetailView
        mood={selectedMood}
        onBack={onBack}
        onOpenSong={onOpenSong}
      />
    )
  }

  return (
    <PageContent
      page={activePage}
      activeNavKey={activeNavKey}
      onOpenSong={onOpenSong}
      onOpenAlbum={onOpenAlbum}
      onOpenArtist={onOpenArtist}
      onOpenMood={onOpenMood}
    />
  )
}

function PageContent({
  page,
  activeNavKey,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood: _onOpenMood,
}: {
  page: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {
  void _onOpenMood
  if (activeNavKey === 'liked') return <LikedPage onOpenSong={onOpenSong} />
  if (activeNavKey === 'recent') return <RecentPage onOpenSong={onOpenSong} />
  if (activeNavKey === 'downloads') return <DownloadsPage />
  if (activeNavKey === 'premium') return <PremiumPage />

  switch (page) {
    case 'home':
      return <HomePage onOpenSong={onOpenSong} />
    case 'discover':
      return <DiscoverPage onOpenSong={onOpenSong} />
    case 'mood':
      return <EmotionalWorldsPage onOpenSong={onOpenSong} />
    case 'library':
      return <LibraryPage />
    case 'artists':
      return <ArtistsPage onOpenArtist={onOpenArtist} />
    case 'albums':
      return <AlbumsPage onOpenAlbum={onOpenAlbum} />
    case 'playlists':
      return <PlaylistsPage onOpenSong={onOpenSong} />
    case 'tv':
      return <TvPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <HomePage onOpenSong={onOpenSong} />
  }
}

function App() {
  return (
    <PreferencesResetProvider>
      <DesktopPlaybackProvider>
        <CatalogProvider>
          <AppShell />
        </CatalogProvider>
      </DesktopPlaybackProvider>
    </PreferencesResetProvider>
  )
}

function AppShell() {
  const { currentTrack, playQueue } = useDesktopPlayback()
  const { songs } = useCatalog()
  const [activePage, setActivePage] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.activePage,
    'home' as PageId,
    parseStoredPageId,
  )
  const [activeNavKey, setActiveNavKey] = useState<NavKey>(() => resolveDefaultNavKey(activePage))
  const [activeView, setActiveView] = useState<ActiveView>('page')
  const [selectedSong, setSelectedSong] = useState<ApiSong | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<ApiAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<ApiArtist | null>(null)
  const [selectedMood, setSelectedMood] = useState<MoodRoom | null>(null)
  const [desktopSelectedTrack, setDesktopSelectedTrack] = useState<ApiSong | null>(null)
  const [cinemaOpen, setCinemaOpen] = useState(false)

  const openSong = useCallback((song: ApiSong) => {
    setDesktopSelectedTrack(song)
    setSelectedSong(song)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('song')
  }, [])

  useEffect(() => {
    if (!currentTrack) return
    setDesktopSelectedTrack(currentTrack)
    setSelectedSong((previousSong) => (
      activeView === 'song' ? currentTrack : previousSong
    ))
  }, [activeView, currentTrack])

  const selectAndPlay = useCallback(
    (
      song: ApiSong,
      queue: ApiSong[] = [song],
      startIndex = 0,
      context: QueueContext = 'manual',
      queueTitle?: string,
      seedMetadata?: QueueSeedMetadata,
    ) => {
      const resolved = songs.find((entry) => entry.id === song.id) ?? song
      const playableQueue = queue.length > 0
        ? queue.map((entry) => songs.find((songEntry) => songEntry.id === entry.id) ?? entry)
        : [resolved]
      const selectedIndex = playableQueue.findIndex((entry) => entry.id === resolved.id)
      const safeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, Math.min(startIndex, playableQueue.length - 1))

      openSong(resolved)
      playQueue(playableQueue, safeIndex, context, queueTitle, seedMetadata)
    },
    [openSong, playQueue, songs],
  )

  const openAlbum = useCallback((album: ApiAlbum) => {
    setSelectedAlbum(album)
    setSelectedSong(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('album')
  }, [])

  const openArtist = useCallback((artist: ApiArtist) => {
    setSelectedArtist(artist)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedMood(null)
    setActiveView('artist')
  }, [])

  const openMood = useCallback((mood: MoodRoom) => {
    setSelectedMood(mood)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setActiveView('mood')
  }, [])

  const backToPage = useCallback(() => {
    setActiveView('page')
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
  }, [])

  const navigateNav = useCallback((navKey: NavKey) => {
    const page = resolvePageFromNavKey(navKey)
    setActivePage(page)
    setActiveNavKey(navKey)
    backToPage()
  }, [backToPage, setActivePage])

  const navigatePage = useCallback((page: PageId, navKey?: NavKey) => {
    setActivePage(page)
    setActiveNavKey(navKey ?? resolveDefaultNavKey(page))
    backToPage()
  }, [backToPage, setActivePage])

  return (
    <>
      <div className="app-shell">
        <Sidebar activeNavKey={activeNavKey} onNavigateNav={navigateNav} />
        <div className="main-area">
          <div className="main-composition">
            <main
              className={`main-scroll${
                activeNavKey === 'home' && activeView === 'page' ? ' main-scroll--home' : ''
              }${
                activeNavKey === 'worlds' && activeView === 'page' ? ' main-scroll--mood' : ''
              }${
                isPsdDestinationNav(activeNavKey) && activeView === 'page' ? ' main-scroll--psd' : ''
              }`}
            >
              {isPsdDestinationNav(activeNavKey) && activeView === 'page' ? (
                <HomeTopBar
                  placeholder={TOP_BAR_PLACEHOLDERS[activeNavKey]}
                  onOpenDiscover={() => navigatePage('discover', 'search')}
                />
              ) : null}
              {!isPsdDestinationNav(activeNavKey) ? <CatalogStatusBar /> : null}
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage} data-nav={activeNavKey} data-view={activeView}>
                <CatalogDetailRouter
                  activeView={activeView}
                  selectedSong={selectedSong}
                  selectedAlbum={selectedAlbum}
                  selectedArtist={selectedArtist}
                  selectedMood={selectedMood}
                  desktopSelectedTrack={desktopSelectedTrack}
                  onBack={backToPage}
                  activePage={activePage}
                  activeNavKey={activeNavKey}
                  onOpenSong={selectAndPlay}
                  onOpenAlbum={openAlbum}
                  onOpenArtist={openArtist}
                  onOpenMood={openMood}
                  onOpenCinema={() => setCinemaOpen(true)}
                />
              </div>
            </main>
            <QueueUpNextPanel onOpenCinema={() => setCinemaOpen(true)} />
          </div>
        </div>
      </div>
      <PlayerBar
        track={desktopSelectedTrack}
        onOpenCinema={() => setCinemaOpen(true)}
      />
      {cinemaOpen ? (
        <CinemaPlayerShell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setCinemaOpen(false)}
        />
      ) : null}
    </>
  )
}

export default App
