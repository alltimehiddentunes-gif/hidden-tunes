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
import { audioVersionAvailability } from './lib/audioVersions'
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
  getTimeAwareHomeScene,
  resolveVisualScene,
  type VisualSceneId,
} from './lib/visualScenes'
import './App.css'

const APP_NAME = 'Hidden Tunes Desktop'
const APP_VERSION = '0.0.1'
const APP_PREVIEW_COPY = 'Desktop preview · catalog browsing only'
const PLAYER_BAR_FALLBACK_TITLE = 'Ethereal Horizon'
const PLAYER_BAR_FALLBACK_ARTIST = 'Luna Veil'
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

type NavItem = {
  id: PageId
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

function moodRoomScene(room: Pick<MoodRoom, 'title' | 'mood' | 'sceneId'>): VisualSceneId {
  return room.sceneId ?? resolveVisualScene({ seed: room.title, mood: room.mood })
}

const MAIN_NAV: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    id: 'mood',
    label: 'Mood Rooms',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3a6 6 0 016 6c0 4-3 6-6 12-3-6-6-8-6-12a6 6 0 016-6z" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V5h4l2 14 4-14h4v14" />
      </svg>
    ),
  },
  {
    id: 'artists',
    label: 'Artists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    id: 'albums',
    label: 'Albums',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'playlists',
    label: 'Playlists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    id: 'tv',
    label: 'Hidden Tunes TV',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M10 9l6 4-6 4V9z" />
      </svg>
    ),
  },
]

const SETTINGS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

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

const MOOD_ROOMS: MoodRoom[] = [
  {
    title: 'Velvet Midnight',
    subtitle: 'Slow burn · intimate',
    listeners: '2.4k',
    mood: 'violet',
    sceneId: 'midnight-drive',
  },
  {
    title: 'Oceanic Calm',
    subtitle: 'Breath & space',
    listeners: '1.8k',
    mood: 'cyan',
    sceneId: 'ocean-reflection',
  },
  {
    title: 'Rose Neon',
    subtitle: 'Passion pulse',
    listeners: '3.1k',
    mood: 'rose',
    sceneId: 'neon-city',
  },
  {
    title: 'Forest Echo',
    subtitle: 'Organic drift',
    listeners: '920',
    mood: 'mint',
    sceneId: 'healing-sunday',
  },
  {
    title: 'Chrome Dreams',
    subtitle: 'Futurist glide',
    listeners: '1.2k',
    mood: 'cyan',
    sceneId: 'neon-city',
  },
  {
    title: 'Ember Heart',
    subtitle: 'Warm ache',
    listeners: '2.0k',
    mood: 'rose',
    sceneId: 'slow-love',
  },
]

const LIBRARY_ITEMS = [
  { title: 'Ethereal Horizon', meta: 'Luna Veil · Liked 2 days ago', mood: 'violet' as Mood },
  { title: 'Glass Cathedral', meta: 'Noir Ensemble · Added yesterday', mood: 'cyan' as Mood },
  { title: 'Slow Bloom', meta: 'Aria North · Downloaded', mood: 'rose' as Mood },
  { title: 'Phantom Waltz', meta: 'The Dusk Line · Recent play', mood: 'mint' as Mood },
  { title: 'Satellite Prayer', meta: 'Orbit Kids · Liked last week', mood: 'violet' as Mood },
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
        {message || 'The Hidden Tunes API may be waking up on Render. Wait a moment, then retry.'}
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
  onSelect,
  listKey = 'albums',
  paginate = true,
}: {
  albums: ApiAlbum[]
  artistNames: Map<string, string>
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
          const artistName = album.artistId
            ? artistNames.get(album.artistId)
            : null
          return (
            <button
              key={album.id}
              type="button"
              className="discovery-card discovery-card--api"
              onClick={() => onSelect(album)}
            >
              <div className="card-art card-art--album">
                <ArtworkImage src={album.artwork} alt="" seed={album.id} variant="wide" />
              </div>
              <div className="card-info">
                <h3>{album.title}</h3>
                <p className="card-meta-primary">{artistName || 'Hidden Tunes'}</p>
                <p className="card-meta-secondary">
                  {album.releaseYear ? `Released ${album.releaseYear}` : 'Album'}
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

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="content-inner">{children}</div>
}

function PreviewBanner({ text }: { text: string }) {
  return (
    <div className="preview-banner" role="status">
      <span className="preview-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
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
  activePage,
  onNavigate,
}: {
  activePage: PageId
  onNavigate: (page: PageId) => void
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <div className="brand-text">
          <span className="brand-title">Hidden Tunes</span>
          <span className="brand-sub">Desktop</span>
        </div>
      </div>

      <p className="sidebar-preview-copy" aria-label={APP_PREVIEW_COPY}>
        {APP_PREVIEW_COPY}
      </p>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {MAIN_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item${activePage === 'settings' ? ' active' : ''}`}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          {SETTINGS_ICON}
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
})

function Hero() {
  const homeSceneId = useMemo(() => getTimeAwareHomeScene(), [])

  return (
    <section className="hero" aria-label="Featured" data-scene={homeSceneId}>
      <VisualSceneBackdrop
        sceneId={homeSceneId}
        seed="home-hero"
        variant="hero"
        timeAware
      />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow">Emotional streaming · Desktop</p>
          <h1>Hidden Tunes</h1>
          <p className="hero-tagline">
            A cinematic sanctuary for music that moves you — discover moods, rooms,
            and stories crafted for how you feel right now.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-primary">
              Explore
            </button>
            <button type="button" className="btn-secondary">
              Continue Listening
            </button>
          </div>
        </div>
        <div className="hero-artwork" aria-hidden="true">
          <div className="hero-artwork-ring" />
          <MusicNoteIcon className="artwork-placeholder" />
        </div>
      </div>
    </section>
  )
}

function HomePage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [sort, setSort] = useState<SongSort>('latest')
  const featured = useMemo(
    () => sortSongsList(songs, sort).slice(0, 12),
    [songs, sort],
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

  return (
    <PageFrame>
      <Hero />
      <CatalogToolbar
        hideSearch
        searchValue=""
        onSearchChange={() => undefined}
        searchPlaceholder=""
        sortLabel="Featured sort"
        sortValue={sort}
        sortOptions={SONG_SORT_OPTIONS}
        onSortChange={(value) => setSort(value as SongSort)}
        resultCount={featured.length}
      />
      <CatalogSection
        title="Featured"
        hint="Cached catalog · read-only"
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
    </PageFrame>
  )
}

function DiscoverPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const {
    songs,
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

  const listKey = useMemo(() => `${debouncedQuery}:${sort}`, [debouncedQuery, sort])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playDiscoverSong = useCallback(
    (song: ApiSong, index: number) => {
      const record = visibleRecords[index] ?? visibleRecords.find((entry) => entry.id === song.id)
      const playableSong = record ? metadataRecordToApiSong(record) : song
      const queueSongs = metadataRecordsToApiSongs(visibleRecords)

      onOpenSong(
        playableSong,
        queueSongs,
        index,
        'discover',
        'Discover',
        {
          seedType: 'discover',
          seedTracks: buildQueueSeedPool('discover', queueSongs, indexes, playableSong),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, visibleRecords],
  )

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Explore"
        title="Discover"
        description="Browse the cached Hidden Tunes catalog — filter and sort locally without extra API calls."
      />
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
      <CatalogSection
        title="Catalog songs"
        hint="Client-side filter on loaded data"
        loading={showCatalogSkeleton}
        error={showCatalogError ? error : null}
        onRetry={retry}
        count={visibleRecords.length}
      >
        {!showCatalogSkeleton && !showCatalogError && songs.length === 0 ? (
          <CatalogEmpty
            title="No songs in catalog"
            detail="Retry once the API finishes loading or returns data."
          />
        ) : showNoMatches ? (
          <CatalogEmpty
            title="No songs match"
            detail="Try a different search term across title, artist, album, genre, or mood."
          />
        ) : (
          <ApiSongGrid
            songs={visibleSongs}
            onSelect={playDiscoverSong}
            listKey={listKey}
            showEmpty={false}
          />
        )}
      </CatalogSection>
    </PageFrame>
  )
}

function MoodRoomsPage({ onOpenMood }: { onOpenMood: (mood: MoodRoom) => void }) {
  const pageSceneId = useMemo(() => getTimeAwareHomeScene(), [])

  return (
    <PageFrame>
      <div className="mood-rooms-stage">
        <VisualSceneBackdrop
          sceneId={pageSceneId}
          seed="mood-rooms-page"
          variant="ambient"
          timeAware
        />
        <PageHeader
          eyebrow="Atmosphere"
          title="Mood Rooms"
          description="Step into shared emotional spaces — ambient rooms tuned for how you feel, with others listening in sync."
        />
      </div>
      <PreviewBanner text="Rooms are UI previews — live sync arrives in a future release" />
      <div className="mood-room-grid">
        {MOOD_ROOMS.map((room, index) => {
          const sceneId = moodRoomScene(room)
          return (
          <button
            key={room.title}
            type="button"
            className="mood-room-card"
            data-mood={room.mood}
            data-scene={sceneId}
            onClick={() => onOpenMood(room)}
          >
            <VisualSceneBackdrop sceneId={sceneId} seed={room.title} variant="card" />
            <div className="mood-room-top">
              <span className="mood-room-index">0{index + 1}</span>
              <span className="live-pill">
                <span className="live-dot" aria-hidden="true" />
                Live
              </span>
            </div>
            <div className="mood-room-body">
              <div className="mood-room-icon-wrap">
                <MusicNoteIcon className="card-art-icon" />
              </div>
              <h3>{room.title}</h3>
              <p>{room.subtitle}</p>
              <span className="mood-listeners">{room.listeners} listening</span>
              <span className="btn-secondary btn-sm mood-enter" aria-hidden="true">
                Enter room
              </span>
            </div>
          </button>
          )
        })}
      </div>
    </PageFrame>
  )
}

function LibraryPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Your collection"
        title="Library"
        description="Everything you have saved, downloaded, and replayed — organized for emotional recall."
      />
      <div className="tab-row" role="tablist" aria-label="Library filters">
        <button type="button" className="tab active" role="tab" aria-selected="true">
          All
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Liked
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Downloaded
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Recent
        </button>
      </div>
      <ul className="media-list">
        {LIBRARY_ITEMS.map((item, index) => (
          <li key={item.title}>
            <button type="button" className="media-row">
              <span className="media-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="media-art" data-mood={item.mood} aria-hidden="true">
                <MusicNoteIcon className="card-art-icon" />
              </span>
              <span className="media-copy">
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </span>
              <span className="media-duration">3:42</span>
            </button>
          </li>
        ))}
      </ul>
      <PlaceholderNote
        title="More from your library"
        detail="Additional saves and offline items will appear here once your account is connected."
      />
    </PageFrame>
  )
}

function ArtistsPage({ onOpenArtist }: { onOpenArtist: (artist: ApiArtist) => void }) {
  const { artists, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
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

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const visibleArtists = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q && q.length < 2) return []
    const filtered = filterArtistsByQuery(artists, debouncedQuery)
    return sortArtistsList(filtered, sort)
  }, [artists, debouncedQuery, sort])

  const listKey = useMemo(() => `${debouncedQuery}:${sort}`, [debouncedQuery, sort])

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Creators"
        title="Artists"
        description="Browse creators from the cached catalog — filter and sort instantly on desktop."
      />
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
      {showCatalogSkeleton ? <CatalogSkeleton count={10} variant="artist" /> : null}
      {showCatalogError ? <CatalogError message={error || ''} onRetry={retry} /> : null}
      {!showCatalogSkeleton && !showCatalogError && artists.length === 0 ? (
        <CatalogEmpty
          title="No artists in catalog"
          detail="The API responded but returned no artists yet."
        />
      ) : null}
      {!showCatalogSkeleton && !showCatalogError && artists.length > 0 ? (
        <ApiArtistGrid artists={visibleArtists} onSelect={onOpenArtist} listKey={listKey} />
      ) : null}
      <PlaceholderNote
        title="Expanded artist pages"
        detail="Bios, tours, and emotional tags will layer in without leaving the desktop shell."
      />
    </PageFrame>
  )
}

function AlbumsPage({ onOpenAlbum }: { onOpenAlbum: (album: ApiAlbum) => void }) {
  const { albums, artistNames, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
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

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const visibleAlbums = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q && q.length < 2) return []
    const filtered = filterAlbumsByQuery(albums, debouncedQuery, artistNames)
    return sortAlbumsList(filtered, sort)
  }, [albums, debouncedQuery, artistNames, sort])

  const listKey = useMemo(() => `${debouncedQuery}:${sort}`, [debouncedQuery, sort])

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Full journeys"
        title="Albums"
        description="Immersive records from the cached catalog — filter by title or artist locally."
      />
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
      <CatalogSection
        title="Catalog albums"
        hint="Cached read-only data"
        loading={showCatalogSkeleton}
        error={showCatalogError ? error : null}
        onRetry={retry}
        count={visibleAlbums.length}
      >
        {!showCatalogSkeleton && !showCatalogError && albums.length === 0 ? (
          <CatalogEmpty
            title="No albums in catalog"
            detail="Retry once the API finishes loading or returns data."
          />
        ) : (
          <ApiAlbumGrid
            albums={visibleAlbums}
            artistNames={artistNames}
            onSelect={onOpenAlbum}
            listKey={listKey}
          />
        )}
      </CatalogSection>
    </PageFrame>
  )
}

function PlaylistsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Curated paths"
        title="Playlists"
        description="Hand-built emotional sequences — yours and ours, woven for every chapter of your day."
      />
      <div className="playlist-grid">
        {PLAYLISTS.map((playlist) => (
          <article key={playlist.title} className="playlist-card" data-mood={playlist.mood}>
            <div className="playlist-art">
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{playlist.title}</h3>
              <p>{playlist.tracks}</p>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
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
  return (
    <div
      className={'audio-quality-selector' + (compact ? ' audio-quality-selector--compact' : '')}
      role='group'
      aria-label='Desktop audio quality'
    >
      {AUDIO_QUALITY_MODES.map((mode) => {
        const active = mode === value

        return (
          <button
            key={mode}
            type='button'
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

function AudioVersionAvailabilityStatus({ song }: { song: ApiSong | null }) {
  if (!song) return null

  const versions = song.audioVersions
  if (!versions) {
    return song.audioUrl ? (
      <div className="audio-version-status audio-version-status--legacy" aria-label="Audio version availability">
        <span className="audio-version-pill available">Legacy</span>
      </div>
    ) : null
  }

  const availability = audioVersionAvailability(versions)
  const items = [
    { key: 'ultraLight', label: 'ultraLight', available: availability.hasUltraLight },
    { key: 'standard', label: 'standard', available: availability.hasStandard },
    { key: 'highQuality', label: 'highQuality', available: availability.hasHighQuality },
    { key: 'lossless', label: 'lossless', available: availability.hasLossless },
  ]

  return (
    <div className="audio-version-status" aria-label="Audio version availability">
      {items.map((item) => (
        <span
          key={item.key}
          className={'audio-version-pill' + (item.available ? ' available' : '')}
          aria-label={`${item.label} ${item.available ? 'available' : 'not available'}`}
        >
          {item.label}
        </span>
      ))}
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

const PlayerBar = memo(function PlayerBar({ track }: { track: ApiSong | null }) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    isPlaying,
    isLoading,
    error,
    positionSeconds,
    durationSeconds,
    volume,
    audioQualityMode,
    setAudioQualityMode,
    pause,
    resume,
    seekTo,
    setVolume,
    next,
    previous,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = track ?? currentTrack
  const title = displayTrack?.title ?? PLAYER_BAR_FALLBACK_TITLE
  const artist = displayTrack?.artist ?? PLAYER_BAR_FALLBACK_ARTIST
  const progressMax = durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < currentQueue.length - 1
  const showQueuePosition = currentQueue.length > 1 && currentIndex >= 0
  const queueLabel = QUEUE_CONTEXT_LABELS[queueContext]
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

  const handlePlayPause = () => {
    if (isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    resume()
  }

  return (
    <footer
      className={`player-bar player-bar--${barState}`}
      aria-label="Player"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
    >
      <p className="player-preview-copy" aria-hidden="true">
        {APP_PREVIEW_COPY}
      </p>
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
            <p style={{ fontSize: 11, color: 'rgba(245, 243, 250, 0.66)' }}>
              {queueLabel} · Track {currentIndex + 1} of {currentQueue.length}
            </p>
          ) : null}
          {error ? <p className="player-error">{error}</p> : null}
        </div>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            className="control-btn"
            onClick={previous}
            disabled={!hasPrevious}
            aria-label={hasPrevious ? 'Previous track' : 'Previous track (not available yet)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button
            type="button"
            className={`control-btn play${isPlaying ? ' is-active' : ''}`}
            onClick={handlePlayPause}
            disabled={!displayTrack || isLoading}
            aria-label={
              isLoading
                ? 'Loading track'
                : isPlaying
                  ? 'Pause'
                  : 'Play'
            }
          >
            {isLoading ? (
              <span className="player-spinner" aria-hidden="true" />
            ) : isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="control-btn"
            onClick={next}
            disabled={!hasNext}
            aria-label={hasNext ? 'Next track' : 'Next track (not available yet)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
            </svg>
          </button>
        </div>
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
        <div className="player-quality" aria-label="Selected audio quality">
          <span className="player-quality-label">Quality</span>
          <AudioQualitySelector
            value={audioQualityMode}
            onChange={setAudioQualityMode}
            compact
          />
          <AudioVersionAvailabilityStatus song={displayTrack} />
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

const QueueUpNextPanel = memo(function QueueUpNextPanel() {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    getUpcomingTracks,
  } = useDesktopPlayback()

  if (currentQueue.length <= 1 || currentIndex < 0) return null

  const queueLabel = QUEUE_CONTEXT_LABELS[queueContext]
  const activeTrack = currentTrack ?? currentQueue[currentIndex]
  const upcomingTracks = getUpcomingTracks().slice(0, 4)

  if (!activeTrack || upcomingTracks.length === 0) return null

  return (
    <aside className="queue-rail" aria-label="Up Next">
      <div className="queue-rail-header">
        <h2>Up Next</h2>
        <span>{queueLabel}</span>
      </div>

      <div className="queue-now">
        <p className="queue-now-label">Now playing</p>
        <p className="queue-now-title">{activeTrack.title}</p>
        <p className="queue-now-artist">{activeTrack.artist}</p>
      </div>

      <ol className="queue-list">
        {upcomingTracks.map((track, index) => (
          <li className="queue-item" key={`${track.id}-${index}`}>
            <span className="queue-index" aria-hidden="true">
              {String(currentIndex + index + 2).padStart(2, '0')}
            </span>
            <span className="queue-track">
              <span className="queue-track-title">{track.title}</span>
              <span className="queue-track-artist">{track.artist}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  )
})
type ActiveView = 'page' | 'song' | 'album' | 'artist' | 'mood'

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

function SongDetailView({
  song,
  onBack,
}: {
  song: ApiSong
  onBack: () => void
}) {
  const created = formatDateLabel(song.createdAt)

  return (
    <PageFrame>
      <DetailTopBar title="Song" subtitle="Read-only preview" onBack={onBack} />
      <section className="detail-hero detail-hero--song">
        <div className="detail-artwork">
          <ArtworkImage src={song.artwork} alt="" seed={song.id} priority />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Hidden Tunes</p>
          <h1 className="detail-h1">{song.title}</h1>
          <p className="detail-byline">
            <span className="detail-pill">{song.artist}</span>
            <span className="detail-pill detail-pill--muted">{song.album}</span>
          </p>
          <div className="detail-meta">
            <div className="detail-meta-item">
              <span>Type</span>
              <strong>Song</strong>
            </div>
            <div className="detail-meta-item">
              <span>Catalog</span>
              <strong>Read-only</strong>
            </div>
            <div className="detail-meta-item">
              <span>Added</span>
              <strong>{created || '—'}</strong>
            </div>
          </div>
          <div className="detail-controls">
            <button type="button" className="control-btn" aria-label="Previous (UI only)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button type="button" className="control-btn play" aria-label="Play (UI only)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            </button>
            <button type="button" className="control-btn" aria-label="Next (UI only)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

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
  const artistName = album.artistId ? artistNames.get(album.artistId) : null
  const created = formatDateLabel(album.createdAt)

  const albumSongs = useMemo(() => {
    const byAlbum = resolveSongsForAlbum(
      album,
      indexes.songsByAlbumId,
      indexes.songsByAlbumName,
    )
    return sortSongsList(byAlbum, 'az')
  }, [album, indexes.songsByAlbumId, indexes.songsByAlbumName])
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
      <DetailTopBar title="Album" subtitle="Read-only preview" onBack={onBack} />
      <section className="detail-hero detail-hero--album">
        <div className="detail-artwork detail-artwork--wide">
          <ArtworkImage src={album.artwork} alt="" seed={album.id} variant="wide" priority />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Album</p>
          <h1 className="detail-h1">{album.title}</h1>
          <p className="detail-byline">
            <span className="detail-pill">{artistName || 'Hidden Tunes'}</span>
            <span className="detail-pill detail-pill--muted">
              {album.releaseYear ? `Released ${album.releaseYear}` : 'Release year —'}
            </span>
          </p>
          <div className="detail-meta">
            <div className="detail-meta-item">
              <span>Tracks</span>
              <strong>{albumSongs.length}</strong>
            </div>
            <div className="detail-meta-item">
              <span>Added</span>
              <strong>{created || '—'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Track list</h3>
          <span>UI only · derived from cached songs</span>
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
      <DetailTopBar title="Artist" subtitle="Read-only preview" onBack={onBack} />
      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <ArtistAvatar artist={artist} />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <div className="detail-meta">
            <div className="detail-meta-item">
              <span>Tracks</span>
              <strong>{artist.songCount || artistSongs.length}</strong>
            </div>
            <div className="detail-meta-item">
              <span>Albums</span>
              <strong>{artistAlbums.length}</strong>
            </div>
            <div className="detail-meta-item">
              <span>Status</span>
              <strong>Preview</strong>
            </div>
          </div>
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
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {
  if (activeView === 'song' && selectedSong) {
    return <SongDetailView song={selectedSong} onBack={onBack} />
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
      onOpenSong={onOpenSong}
      onOpenAlbum={onOpenAlbum}
      onOpenArtist={onOpenArtist}
      onOpenMood={onOpenMood}
    />
  )
}

function PageContent({
  page,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood,
}: {
  page: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {
  switch (page) {
    case 'home':
      return <HomePage onOpenSong={onOpenSong} />
    case 'discover':
      return <DiscoverPage onOpenSong={onOpenSong} />
    case 'mood':
      return <MoodRoomsPage onOpenMood={onOpenMood} />
    case 'library':
      return <LibraryPage />
    case 'artists':
      return <ArtistsPage onOpenArtist={onOpenArtist} />
    case 'albums':
      return <AlbumsPage onOpenAlbum={onOpenAlbum} />
    case 'playlists':
      return <PlaylistsPage />
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
  const [activeView, setActiveView] = useState<ActiveView>('page')
  const [selectedSong, setSelectedSong] = useState<ApiSong | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<ApiAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<ApiArtist | null>(null)
  const [selectedMood, setSelectedMood] = useState<MoodRoom | null>(null)
  const [desktopSelectedTrack, setDesktopSelectedTrack] = useState<ApiSong | null>(null)

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

  const navigatePage = useCallback((page: PageId) => {
    setActivePage(page)
    backToPage()
  }, [backToPage, setActivePage])

  return (
    <>
      <div className="app-shell">
        <Sidebar activePage={activePage} onNavigate={navigatePage} />
        <div className="main-area">
          <div className="main-composition">
            <main className="main-scroll">
              <CatalogStatusBar />
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage}>
                <CatalogDetailRouter
                  activeView={activeView}
                  selectedSong={selectedSong}
                  selectedAlbum={selectedAlbum}
                  selectedArtist={selectedArtist}
                  selectedMood={selectedMood}
                  desktopSelectedTrack={desktopSelectedTrack}
                  onBack={backToPage}
                  activePage={activePage}
                  onOpenSong={selectAndPlay}
                  onOpenAlbum={openAlbum}
                  onOpenArtist={openArtist}
                  onOpenMood={openMood}
                />
              </div>
            </main>
            <QueueUpNextPanel />
          </div>
        </div>
      </div>
      <PlayerBar track={desktopSelectedTrack} />
    </>
  )
}

export default App
