import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  buildArtistNameLookup,
  fetchCatalogBundle,
  filterAlbumsByQuery,
  filterArtistsByQuery,
  filterSongsByQuery,
  sortAlbumsList,
  sortArtistsList,
  sortSongsList,
  type AlbumSort,
  type ApiAlbum,
  type ApiArtist,
  type ApiSong,
  type ArtistSort,
  type SongSort,
} from './lib/api'
import './App.css'

type CatalogContextValue = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  artistNames: Map<string, string>
  loading: boolean
  error: string | null
  loaded: boolean
  retry: () => void
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
  const [songs, setSongs] = useState<ApiSong[]>([])
  const [albums, setAlbums] = useState<ApiAlbum[]>([])
  const [artists, setArtists] = useState<ApiArtist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const retry = useCallback(() => setReloadKey((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    fetchCatalogBundle()
      .then((bundle) => {
        if (!active) return
        setSongs(bundle.songs)
        setAlbums(bundle.albums)
        setArtists(bundle.artists)
        setLoaded(true)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the Hidden Tunes catalog.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const artistNames = useMemo(() => buildArtistNameLookup(artists), [artists])

  const value = useMemo(
    () => ({
      songs,
      albums,
      artists,
      artistNames,
      loading,
      error,
      loaded,
      retry,
    }),
    [songs, albums, artists, artistNames, loading, error, loaded, retry],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

type PageId =
  | 'home'
  | 'discover'
  | 'mood'
  | 'library'
  | 'artists'
  | 'albums'
  | 'playlists'
  | 'tv'
  | 'settings'

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
  { title: 'Velvet Midnight', subtitle: 'Slow burn · intimate', listeners: '2.4k', mood: 'violet' },
  { title: 'Oceanic Calm', subtitle: 'Breath & space', listeners: '1.8k', mood: 'cyan' },
  { title: 'Rose Neon', subtitle: 'Passion pulse', listeners: '3.1k', mood: 'rose' },
  { title: 'Forest Echo', subtitle: 'Organic drift', listeners: '920', mood: 'mint' },
  { title: 'Chrome Dreams', subtitle: 'Futurist glide', listeners: '1.2k', mood: 'cyan' },
  { title: 'Ember Heart', subtitle: 'Warm ache', listeners: '2.0k', mood: 'rose' },
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

function ArtworkImage({
  src,
  alt,
  seed,
  variant = 'square',
}: {
  src: string | null
  alt: string
  seed: string
  variant?: 'square' | 'wide'
}) {
  const [failed, setFailed] = useState(false)
  const tone = catalogFallbackTone(seed)

  if (!src || failed) {
    return (
      <div className={`art-fallback art-fallback--${tone} art-fallback--${variant}`} aria-hidden="true">
        <MusicNoteIcon className="card-art-icon" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className="card-art-img"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function ApiSongGrid({
  songs,
  onSelect,
}: {
  songs: ApiSong[]
  onSelect: (song: ApiSong) => void
}) {
  if (songs.length === 0) {
    return (
      <CatalogEmpty
        title="No songs match"
        detail="Try a different search or sort order on the loaded catalog."
      />
    )
  }

  return (
    <div className="card-row card-row--compact">
      {songs.map((song) => (
        <button
          key={song.id}
          type="button"
          className="discovery-card discovery-card--api"
          onClick={() => onSelect(song)}
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
  )
}

function ApiAlbumGrid({
  albums,
  artistNames,
  onSelect,
}: {
  albums: ApiAlbum[]
  artistNames: Map<string, string>
  onSelect: (album: ApiAlbum) => void
}) {
  if (albums.length === 0) {
    return (
      <CatalogEmpty
        title="No albums match"
        detail="Adjust your search or sorting to explore the cached catalog."
      />
    )
  }

  return (
    <div className="card-row card-row--compact">
      {albums.map((album) => {
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
  )
}

function ApiArtistGrid({
  artists,
  onSelect,
}: {
  artists: ApiArtist[]
  onSelect: (artist: ApiArtist) => void
}) {
  if (artists.length === 0) {
    return (
      <CatalogEmpty
        title="No artists match"
        detail="Try another name or switch the sort order."
      />
    )
  }

  return (
    <div className="artist-grid artist-grid--compact">
      {artists.map((artist) => (
        <button
          key={artist.id}
          type="button"
          className="artist-card artist-card--api"
          onClick={() => onSelect(artist)}
        >
          <span className="artist-avatar" aria-hidden="true" data-tone={catalogFallbackTone(artist.id)}>
            {artist.artwork ? (
              <img
                src={artist.artwork}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <span className="artist-initial">{artist.name.charAt(0)}</span>
          </span>
          <span className="artist-name">{artist.name}</span>
          <span className="artist-meta">
            {artist.songCount > 0 ? `${artist.songCount} tracks` : 'Artist'}
          </span>
        </button>
      ))}
    </div>
  )
}

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
        {section.cards.map((card) => (
          <article key={card.title} className="discovery-card" data-mood={card.mood}>
            <div className="card-art">
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Sidebar({
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
}

function Hero() {
  return (
    <section className="hero" aria-label="Featured">
      <div className="hero-bg" />
      <div className="hero-glow" />
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

function HomePage({ onOpenSong }: { onOpenSong: (song: ApiSong) => void }) {
  const { songs, loading, error, retry } = useCatalog()
  const [sort, setSort] = useState<SongSort>('latest')
  const featured = useMemo(
    () => sortSongsList(songs, sort).slice(0, 12),
    [songs, sort],
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
        sortOptions={[
          { value: 'latest', label: 'Latest' },
          { value: 'az', label: 'A–Z' },
        ]}
        onSortChange={(value) => setSort(value as SongSort)}
        resultCount={featured.length}
      />
      <CatalogSection
        title="Featured"
        hint="Cached catalog · read-only"
        loading={loading}
        error={error}
        onRetry={retry}
        count={featured.length}
      >
        {!loading && !error && songs.length === 0 ? (
          <CatalogEmpty
            title="Catalog is empty"
            detail="The API responded but returned no songs yet."
          />
        ) : (
          <ApiSongGrid songs={featured} onSelect={onOpenSong} />
        )}
      </CatalogSection>
      {HOME_SECTIONS.slice(1, 3).map((section) => (
        <DiscoveryGrid key={section.title} section={section} />
      ))}
    </PageFrame>
  )
}

function DiscoverPage({ onOpenSong }: { onOpenSong: (song: ApiSong) => void }) {
  const { songs, loading, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SongSort>('latest')

  const visibleSongs = useMemo(() => {
    const filtered = filterSongsByQuery(songs, query)
    return sortSongsList(filtered, sort)
  }, [songs, query, sort])

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
        searchPlaceholder="Filter by title, artist, or album…"
        sortLabel="Sort"
        sortValue={sort}
        sortOptions={[
          { value: 'latest', label: 'Latest' },
          { value: 'az', label: 'A–Z' },
        ]}
        onSortChange={(value) => setSort(value as SongSort)}
        resultCount={visibleSongs.length}
      />
      <CatalogSection
        title="Catalog songs"
        hint="Client-side filter on loaded data"
        loading={loading}
        error={error}
        onRetry={retry}
        count={visibleSongs.length}
      >
        {!loading && !error && songs.length === 0 ? (
          <CatalogEmpty
            title="No songs in catalog"
            detail="Retry once the API finishes loading or returns data."
          />
        ) : (
          <ApiSongGrid songs={visibleSongs} onSelect={onOpenSong} />
        )}
      </CatalogSection>
    </PageFrame>
  )
}

function MoodRoomsPage({ onOpenMood }: { onOpenMood: (mood: MoodRoom) => void }) {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Atmosphere"
        title="Mood Rooms"
        description="Step into shared emotional spaces — ambient rooms tuned for how you feel, with others listening in sync."
      />
      <PreviewBanner text="Rooms are UI previews — live sync arrives in a future release" />
      <div className="mood-room-grid">
        {MOOD_ROOMS.map((room, index) => (
          <button
            key={room.title}
            type="button"
            className="mood-room-card"
            data-mood={room.mood}
            onClick={() => onOpenMood(room)}
          >
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
        ))}
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
  const { artists, loading, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ArtistSort>('az')

  const visibleArtists = useMemo(() => {
    const filtered = filterArtistsByQuery(artists, query)
    return sortArtistsList(filtered, sort)
  }, [artists, query, sort])

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
        sortOptions={[
          { value: 'az', label: 'A–Z' },
          { value: 'tracks', label: 'Most tracks' },
        ]}
        onSortChange={(value) => setSort(value as ArtistSort)}
        resultCount={visibleArtists.length}
      />
      {loading ? <CatalogSkeleton count={10} variant="artist" /> : null}
      {!loading && error ? <CatalogError message={error} onRetry={retry} /> : null}
      {!loading && !error && artists.length === 0 ? (
        <CatalogEmpty
          title="No artists in catalog"
          detail="The API responded but returned no artists yet."
        />
      ) : null}
      {!loading && !error && artists.length > 0 ? (
        <ApiArtistGrid artists={visibleArtists} onSelect={onOpenArtist} />
      ) : null}
      <PlaceholderNote
        title="Expanded artist pages"
        detail="Bios, tours, and emotional tags will layer in without leaving the desktop shell."
      />
    </PageFrame>
  )
}

function AlbumsPage({ onOpenAlbum }: { onOpenAlbum: (album: ApiAlbum) => void }) {
  const { albums, artistNames, loading, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<AlbumSort>('latest')

  const visibleAlbums = useMemo(() => {
    const filtered = filterAlbumsByQuery(albums, query, artistNames)
    return sortAlbumsList(filtered, sort)
  }, [albums, query, artistNames, sort])

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
        sortOptions={[
          { value: 'latest', label: 'Latest' },
          { value: 'az', label: 'A–Z' },
        ]}
        onSortChange={(value) => setSort(value as AlbumSort)}
        resultCount={visibleAlbums.length}
      />
      <CatalogSection
        title="Catalog albums"
        hint="Cached read-only data"
        loading={loading}
        error={error}
        onRetry={retry}
        count={visibleAlbums.length}
      >
        {!loading && !error && albums.length === 0 ? (
          <CatalogEmpty
            title="No albums in catalog"
            detail="Retry once the API finishes loading or returns data."
          />
        ) : (
          <ApiAlbumGrid albums={visibleAlbums} artistNames={artistNames} onSelect={onOpenAlbum} />
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

function SettingsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Tune your desktop sanctuary — appearance, playback, and account options (UI placeholders)."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className="settings-nav-item active">
            General
          </button>
          <button type="button" className="settings-nav-item">
            Appearance
          </button>
          <button type="button" className="settings-nav-item">
            Playback
          </button>
          <button type="button" className="settings-nav-item">
            Account
          </button>
        </nav>
        <div className="settings-panels">
          <section className="settings-panel">
            <h2>Appearance</h2>
            <p className="settings-panel-desc">Control how Hidden Tunes feels on desktop.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Cinematic dark theme</span>
                <small>Optimized for low-light listening</small>
              </div>
              <span className="settings-badge">Active</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Accent glow intensity</span>
                <small>Subtle highlights on cards & nav</small>
              </div>
              <div className="settings-slider" aria-hidden="true">
                <div className="settings-slider-fill" style={{ width: '70%' }} />
              </div>
            </div>
          </section>
          <section className="settings-panel">
            <h2>Playback</h2>
            <p className="settings-panel-desc">Playback controls are visual-only in this build.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Crossfade between tracks</span>
                <small>Seamless emotional transitions</small>
              </div>
              <span className="settings-muted">Off · preview</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Normalize loudness</span>
                <small>Balanced volume across catalog</small>
              </div>
              <span className="settings-muted">Coming soon</span>
            </div>
          </section>
          <section className="settings-panel settings-panel--wide">
            <h2>Account</h2>
            <p className="settings-panel-desc">Sign in when API wiring is enabled.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Sign in to Hidden Tunes</span>
                <small>Sync library across devices</small>
              </div>
              <button type="button" className="btn-secondary btn-sm">
                Connect
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Desktop app version</span>
                <small>Hidden Tunes Desktop shell</small>
              </div>
              <span className="settings-muted">0.0.1</span>
            </div>
          </section>
        </div>
      </div>
    </PageFrame>
  )
}

function PlayerBar() {
  return (
    <footer className="player-bar" aria-label="Player">
      <div className="player-track">
        <div className="player-artwork" aria-hidden="true" />
        <div className="player-meta">
          <h4>Ethereal Horizon</h4>
          <p>Luna Veil</p>
        </div>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button type="button" className="control-btn" aria-label="Previous track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button type="button" className="control-btn play" aria-label="Play">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          </button>
          <button type="button" className="control-btn" aria-label="Next track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
            </svg>
          </button>
        </div>
        <div className="progress-wrap">
          <span className="progress-time">1:24</span>
          <div className="progress-track" role="progressbar" aria-valuenow={38} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" />
          </div>
          <span className="progress-time">3:42</span>
        </div>
      </div>

      <div className="player-volume">
        <button type="button" className="control-btn" aria-label="Volume">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
          </svg>
        </button>
        <div className="volume-slider" aria-hidden="true">
          <div className="volume-fill" />
        </div>
      </div>
    </footer>
  )
}

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

function hashToIndex(seed: string, modulo: number) {
  let acc = 0
  for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0
  return modulo > 0 ? acc % modulo : 0
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
      <section className="detail-hero">
        <div className="detail-artwork">
          <ArtworkImage src={song.artwork} alt="" seed={song.id} />
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

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Waveform</h3>
          <span>UI placeholder</span>
        </div>
        <div className="fake-waveform" aria-hidden="true">
          {Array.from({ length: 48 }, (_, i) => (
            <span key={i} style={{ height: `${22 + ((i * 13) % 46)}%` }} />
          ))}
        </div>
      </section>
    </PageFrame>
  )
}

function AlbumDetailView({
  album,
  onBack,
  songs,
  artistNames,
}: {
  album: ApiAlbum
  onBack: () => void
  songs: ApiSong[]
  artistNames: Map<string, string>
}) {
  const artistName = album.artistId ? artistNames.get(album.artistId) : null
  const created = formatDateLabel(album.createdAt)

  const tracks = useMemo(() => {
    const byAlbum = songs.filter((s) => s.album === album.title)
    return sortSongsList(byAlbum, 'az').slice(0, 24)
  }, [songs, album.title])

  return (
    <PageFrame>
      <DetailTopBar title="Album" subtitle="Read-only preview" onBack={onBack} />
      <section className="detail-hero detail-hero--album">
        <div className="detail-artwork detail-artwork--wide">
          <ArtworkImage src={album.artwork} alt="" seed={album.id} variant="wide" />
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
              <strong>{tracks.length}</strong>
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
                <div className="detail-track">
                  <span className="detail-track-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="detail-track-title">{track.title}</span>
                  <span className="detail-track-meta">{track.artist}</span>
                </div>
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
  songs,
  albums,
  onOpenSong,
  onOpenAlbum,
}: {
  artist: ApiArtist
  onBack: () => void
  songs: ApiSong[]
  albums: ApiAlbum[]
  onOpenSong: (song: ApiSong) => void
  onOpenAlbum: (album: ApiAlbum) => void
}) {
  const topSongs = useMemo(() => {
    const byArtist = songs.filter((s) => s.artist === artist.name)
    return sortSongsList(byArtist, 'latest').slice(0, 12)
  }, [songs, artist.name])

  const artistAlbums = useMemo(() => {
    if (!artist.id) return []
    return albums.filter((a) => a.artistId === artist.id).slice(0, 12)
  }, [albums, artist.id])

  return (
    <PageFrame>
      <DetailTopBar title="Artist" subtitle="Read-only preview" onBack={onBack} />
      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <span className="artist-avatar" aria-hidden="true" data-tone={catalogFallbackTone(artist.id)}>
            {artist.artwork ? <img src={artist.artwork} alt="" loading="lazy" decoding="async" /> : null}
            <span className="artist-initial">{artist.name.charAt(0)}</span>
          </span>
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <div className="detail-meta">
            <div className="detail-meta-item">
              <span>Tracks</span>
              <strong>{artist.songCount || topSongs.length}</strong>
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
        <ApiSongGrid songs={topSongs} onSelect={onOpenSong} />
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
            artistNames={new Map([[artist.id, artist.name]])}
            onSelect={onOpenAlbum}
          />
        )}
      </section>
    </PageFrame>
  )
}

function MoodDetailView({
  mood,
  onBack,
  songs,
  onOpenSong,
}: {
  mood: MoodRoom
  onBack: () => void
  songs: ApiSong[]
  onOpenSong: (song: ApiSong) => void
}) {
  const curated = useMemo(() => {
    const list = sortSongsList(songs, 'latest')
    if (list.length === 0) return []
    const start = hashToIndex(mood.title, list.length)
    const slice = [...list.slice(start), ...list.slice(0, start)].slice(0, 12)
    return slice
  }, [songs, mood.title])

  const descriptionByMood: Record<Mood, string> = {
    violet: 'Velvet signals, neon hush, and after-hours romance.',
    cyan: 'Clean air, moonlit focus, and oceanic clarity.',
    rose: 'Heat, heart, and luminous emotional peaks.',
    mint: 'Green calm, organic drift, and restorative quiet.',
  }

  return (
    <PageFrame>
      <DetailTopBar title="Mood Room" subtitle="UI-only room detail" onBack={onBack} />
      <section className={`detail-hero detail-hero--mood detail-hero--${mood.mood}`}>
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
        <ApiSongGrid songs={curated} onSelect={onOpenSong} />
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
  onBack: () => void
  activePage: PageId
  onOpenSong: (song: ApiSong) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {
  const { songs, albums, artistNames } = useCatalog()

  if (activeView === 'song' && selectedSong) {
    return <SongDetailView song={selectedSong} onBack={onBack} />
  }

  if (activeView === 'album' && selectedAlbum) {
    return (
      <AlbumDetailView
        album={selectedAlbum}
        onBack={onBack}
        songs={songs}
        artistNames={artistNames}
      />
    )
  }

  if (activeView === 'artist' && selectedArtist) {
    return (
      <ArtistDetailView
        artist={selectedArtist}
        onBack={onBack}
        songs={songs}
        albums={albums}
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
        songs={songs}
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
  onOpenSong: (song: ApiSong) => void
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
  const [activePage, setActivePage] = useState<PageId>('home')
  const [activeView, setActiveView] = useState<ActiveView>('page')
  const [selectedSong, setSelectedSong] = useState<ApiSong | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<ApiAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<ApiArtist | null>(null)
  const [selectedMood, setSelectedMood] = useState<MoodRoom | null>(null)

  const openSong = useCallback((song: ApiSong) => {
    setSelectedSong(song)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('song')
  }, [])

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
  }, [backToPage])

  return (
    <CatalogProvider>
      <div className="app-shell">
        <Sidebar activePage={activePage} onNavigate={navigatePage} />
        <div className="main-area">
          <main className="main-scroll">
            <div key={activePage} className="page-view">
              <CatalogDetailRouter
                activeView={activeView}
                selectedSong={selectedSong}
                selectedAlbum={selectedAlbum}
                selectedArtist={selectedArtist}
                selectedMood={selectedMood}
                onBack={backToPage}
                activePage={activePage}
                onOpenSong={openSong}
                onOpenAlbum={openAlbum}
                onOpenArtist={openArtist}
                onOpenMood={openMood}
              />
            </div>
          </main>
        </div>
      </div>
      <PlayerBar />
    </CatalogProvider>
  )
}

export default App
