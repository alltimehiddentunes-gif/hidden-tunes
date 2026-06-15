#!/usr/bin/env python3
"""Phase 42B — Rebuild remaining desktop pages for PSD parity."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "App.tsx"
CSS = ROOT / "src" / "App.css"


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"MISSING anchor: {label}")
    return text.replace(old, new, 1)


def patch_imports(text: str) -> str:
    if "psd-search-reference.jpg" in text:
        return text
    return must_replace(
        text,
        "import emotionalWorldsReferenceUrl from './assets/emotional-worlds-reference.jpg'\nimport './App.css'",
        """import emotionalWorldsReferenceUrl from './assets/emotional-worlds-reference.jpg'
import psdSearchReferenceUrl from './assets/psd-search-reference.jpg'
import psdLibraryReferenceUrl from './assets/psd-library-reference.jpg'
import psdPlaylistsReferenceUrl from './assets/psd-playlists-reference.jpg'
import psdArtistsReferenceUrl from './assets/psd-artists-reference.jpg'
import psdAlbumsReferenceUrl from './assets/psd-albums-reference.jpg'
import psdLikedReferenceUrl from './assets/psd-liked-reference.jpg'
import './App.css'""",
        "imports",
    )


def patch_nav_helpers(text: str) -> str:
    if "type NavKey =" in text:
        return text
    anchor = "type PageId = StoredPageId\n"
    block = """type PageId = StoredPageId

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

"""
    return text.replace(anchor, block, 1)


def patch_sidebar_active(text: str) -> str:
    return must_replace(
        text,
        """function isSidebarNavActive(item: SidebarNavItem, activePage: PageId) {
  if (item.page !== activePage) return false
  if (item.page === 'library') return item.key === 'library'
  return true
}""",
        """function isSidebarNavActive(item: SidebarNavItem, activeNavKey: NavKey) {
  return item.key === activeNavKey
}""",
        "isSidebarNavActive",
    )


def patch_home_top_bar(text: str) -> str:
    return must_replace(
        text,
        """function HomeTopBar({ onOpenDiscover }: { onOpenDiscover: () => void }) {
  const [query, setQuery] = useState('')

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onOpenDiscover()
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
          placeholder="Search songs, artists, moods…"
          aria-label="Search catalog"
        />
      </form>""",
        """function HomeTopBar({
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
      </form>""",
        "HomeTopBar",
    )


def patch_sidebar(text: str) -> str:
    text = must_replace(
        text,
        """const Sidebar = memo(function Sidebar({
  activePage,
  onNavigate,
}: {
  activePage: PageId
  onNavigate: (page: PageId) => void
}) {""",
        """const Sidebar = memo(function Sidebar({
  activeNavKey,
  onNavigateNav,
}: {
  activeNavKey: NavKey
  onNavigateNav: (navKey: NavKey) => void
}) {""",
        "Sidebar props",
    )
    text = must_replace(
        text,
        "          const isActive = isSidebarNavActive(item, activePage)\n          return (\n            <button\n              key={item.key}\n              type=\"button\"\n              className={`nav-item${isActive ? ' active' : ''}`}\n              aria-current={isActive ? 'page' : undefined}\n              onClick={() => onNavigate(item.page)}",
        "          const isActive = isSidebarNavActive(item, activeNavKey)\n          return (\n            <button\n              key={item.key}\n              type=\"button\"\n              className={`nav-item${isActive ? ' active' : ''}`}\n              aria-current={isActive ? 'page' : undefined}\n              onClick={() => onNavigateNav(item.key as NavKey)}",
        "Sidebar nav click",
    )
    text = must_replace(
        text,
        '        <button type="button" className="sidebar-premium-cta" aria-label="Go Premium">',
        '        <button\n          type="button"\n          className={`sidebar-premium-cta${activeNavKey === \'premium\' ? \' is-active\' : \'\'}`}\n          aria-label="Go Premium"\n          aria-current={activeNavKey === \'premium\' ? \'page\' : undefined}\n          onClick={() => onNavigateNav(\'premium\')}\n        >',
        "Sidebar premium CTA",
    )
    return text


def patch_discover_page(text: str) -> str:
    old_return = """  return (
    <PageFrame>
      <PageHeader
        eyebrow="Explore"
        title="Discover"
        description="Browse the cached Hidden Tunes catalog — filter and sort locally without extra API calls."
      />
      <EmotionalLanesSection"""
    if "psd-search-destination" in text:
        return text
    insert_before = """  return (
    <PageFrame>
      <PageHeader
        eyebrow="Explore"
        title="Discover"
        description="Browse the cached Hidden Tunes catalog — filter and sort locally without extra API calls."
      />
      <EmotionalLanesSection"""
    # Replace entire DiscoverPage return block through closing PageFrame
    start = text.find("function DiscoverPage(")
    end = text.find("\nfunction EmotionalWorldsPage", start)
    discover = text[start:end]
    if "psd-search-destination" in discover:
        return text

    new_discover_tail = discover.split("  return (", 1)[0]
    new_discover = new_discover_tail + DISCOVER_PAGE_RETURN
    return text[:start] + new_discover + text[end:]


DISCOVER_PAGE_RETURN = r'''  const { artists, albums, artistNames } = useCatalog()
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
        <section className="psd-page-hero psd-page-hero--search" aria-labelledby="search-results-heading">
          <div
            className="psd-page-hero-backdrop"
            style={{ backgroundImage: `url(${psdSearchReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="psd-page-hero-veil" aria-hidden="true" />
          <div className="psd-page-hero-copy">
            <p className="psd-page-eyebrow">Discover</p>
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
          </div>
        </section>

        <div className="psd-tab-row" role="tablist" aria-label="Search categories">
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
            {showCatalogSkeleton ? <CatalogSkeleton count={6} variant="song" /> : null}
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
                return (
                  <article key={album.id} className="psd-mini-card psd-mini-card--album">
                    <ArtworkImage
                      src={resolveAlbumArtwork(album, indexes)}
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
              {PLAYLISTS.slice(0, 6).map((playlist, index) => (
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

'''


def patch_library_page(text: str) -> str:
    old = """function LibraryPage() {
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
}"""
    if "psd-library-destination" in text:
        return text
    return text.replace(old, LIBRARY_PAGE, 1)


LIBRARY_PAGE = r'''function LibraryPage() {
  const { songs, albums, artists, indexes, artistNames, showCatalogSkeleton } = useCatalog()
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
        <section className="psd-page-hero psd-page-hero--library" aria-labelledby="library-heading">
          <div
            className="psd-page-hero-backdrop"
            style={{ backgroundImage: `url(${psdLibraryReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="psd-page-hero-veil" aria-hidden="true" />
          <div className="psd-page-hero-copy">
            <h1 id="library-heading" className="psd-page-title psd-page-title--library">
              <span className="psd-page-title-main">My Library</span>
            </h1>
            <p className="psd-page-subtitle">
              Everything you have saved, replayed, and downloaded — organized for emotional recall.
            </p>
          </div>
        </section>

        <div className="psd-tab-row" role="tablist" aria-label="Library sections">
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
'''


def patch_other_pages(text: str) -> str:
    if "function LikedPage" in text:
        return text
    anchor = "function TvPage() {"
    return text.replace(anchor, EXTRA_PAGES + anchor, 1)


EXTRA_PAGES = r'''
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
              <button type="button" className="psd-btn psd-btn--gold" disabled={likedSongs.length === 0} onClick={() => likedSongs[0] && playLikedSong(likedSongs[0], 0)}>
                Play
              </button>
              <button type="button" className="psd-btn psd-btn--ghost" disabled={likedSongs.length === 0} onClick={() => likedSongs[0] && playLikedSong(likedSongs[0], 0)}>
                Shuffle
              </button>
            </div>
          </div>
        </section>
        <section className="psd-panel">
          {showCatalogSkeleton ? <CatalogSkeleton count={8} variant="song" /> : (
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

'''


def patch_artists_albums_playlists(text: str) -> str:
    if "psd-artists-destination" in text:
        return text
    text = text.replace(
        """function ArtistsPage({ onOpenArtist }: { onOpenArtist: (artist: ApiArtist) => void }) {
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
    </PageFrame>
  )
}""",
        ARTISTS_PAGE,
        1,
    )
    text = text.replace(
        """function AlbumsPage({ onOpenAlbum }: { onOpenAlbum: (album: ApiAlbum) => void }) {
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
            indexes={indexes}
            onSelect={onOpenAlbum}
            listKey={listKey}
          />
        )}
      </CatalogSection>
    </PageFrame>
  )
}""",
        ALBUMS_PAGE,
        1,
    )
    text = text.replace(
        """function PlaylistsPage() {
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
}""",
        PLAYLISTS_PAGE,
        1,
    )
    return text


ARTISTS_PAGE = r'''function ArtistsPage({ onOpenArtist }: { onOpenArtist: (artist: ApiArtist) => void }) {
  const { artists, songs, albums, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
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
    () => (featuredArtist ? resolveSongsForArtist(songs, featuredArtist.id).slice(0, 8) : []),
    [featuredArtist, songs],
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

        <div className="psd-tab-row" role="tablist" aria-label="Artist sections">
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
            {artistAlbums.map((album) => (
              <article key={album.id} className="psd-mini-card psd-mini-card--album">
                <ArtworkImage src={resolveAlbumArtwork(album, indexes)} alt="" seed={album.id} />
                <strong>{album.title}</strong>
              </article>
            ))}
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
}'''


ALBUMS_PAGE = r'''function AlbumsPage({ onOpenAlbum }: { onOpenAlbum: (album: ApiAlbum) => void }) {
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
        <section className="psd-page-hero psd-page-hero--albums" aria-labelledby="albums-heading">
          <div className="psd-page-hero-backdrop" style={{ backgroundImage: `url(${psdAlbumsReferenceUrl})` }} aria-hidden="true" />
          <div className="psd-page-hero-veil" aria-hidden="true" />
          <div className="psd-page-hero-copy">
            <h1 id="albums-heading" className="psd-page-title psd-page-title--albums">Albums</h1>
            <p className="psd-page-subtitle">Immersive records from the cached catalog.</p>
          </div>
        </section>

        <div className="psd-albums-toolbar">
          <div className="psd-tab-row" role="tablist" aria-label="Album filters">
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
}'''


PLAYLISTS_PAGE = r'''function PlaylistsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
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
          <div className="psd-playlist-detail-backdrop" style={{ backgroundImage: `url(${psdPlaylistsReferenceUrl})` }} aria-hidden="true" />
          <div className="psd-playlist-detail-veil" aria-hidden="true" />
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

        <div className="psd-tab-row" role="tablist" aria-label="Playlist sections">
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
}'''


def patch_router_and_shell(text: str) -> str:
    text = must_replace(
        text,
        """function PageContent({
  page,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood: _onOpenMood,
}: {
  page: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {
  void _onOpenMood
  switch (page) {
    case 'home':
      return (
        <HomePage onOpenSong={onOpenSong} />
      )
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
      return <PlaylistsPage />
    case 'tv':
      return <TvPage />
    case 'settings':
      return <SettingsPage />
    default:
      return (
        <HomePage onOpenSong={onOpenSong} />
      )
  }
}""",
        """function PageContent({
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
}""",
        "PageContent",
    )

    text = must_replace(
        text,
        """  return (
    <PageContent
      page={activePage}
      onOpenSong={onOpenSong}
      onOpenAlbum={onOpenAlbum}
      onOpenArtist={onOpenArtist}
      onOpenMood={onOpenMood}
    />
  )
}""",
        """  return (
    <PageContent
      page={activePage}
      activeNavKey={activeNavKey}
      onOpenSong={onOpenSong}
      onOpenAlbum={onOpenAlbum}
      onOpenArtist={onOpenArtist}
      onOpenMood={onOpenMood}
    />
  )
}""",
        "CatalogDetailRouter PageContent",
    )

    text = must_replace(
        text,
        """function CatalogDetailRouter({
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
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenCinema?: () => void
}) {""",
        """function CatalogDetailRouter({
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
}) {""",
        "CatalogDetailRouter props",
    )

    text = must_replace(
        text,
        """  const [activePage, setActivePage] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.activePage,
    'home' as PageId,
    parseStoredPageId,
  )
  const [activeView, setActiveView] = useState<ActiveView>('page')""",
        """  const [activePage, setActivePage] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.activePage,
    'home' as PageId,
    parseStoredPageId,
  )
  const [activeNavKey, setActiveNavKey] = useState<NavKey>(() => resolveDefaultNavKey(activePage))
  const [activeView, setActiveView] = useState<ActiveView>('page')""",
        "AppShell activeNavKey",
    )

    text = must_replace(
        text,
        """  const navigatePage = useCallback((page: PageId) => {
    setActivePage(page)
    backToPage()
  }, [backToPage, setActivePage])""",
        """  const navigateNav = useCallback((navKey: NavKey) => {
    const page = resolvePageFromNavKey(navKey)
    setActivePage(page)
    setActiveNavKey(navKey)
    backToPage()
  }, [backToPage, setActivePage])

  const navigatePage = useCallback((page: PageId, navKey?: NavKey) => {
    setActivePage(page)
    setActiveNavKey(navKey ?? resolveDefaultNavKey(page))
    backToPage()
  }, [backToPage, setActivePage])""",
        "navigateNav",
    )

    text = must_replace(
        text,
        """        <Sidebar activePage={activePage} onNavigate={navigatePage} />""",
        """        <Sidebar activeNavKey={activeNavKey} onNavigateNav={navigateNav} />""",
        "Sidebar usage",
    )

    old_shell = """            <main
              className={`main-scroll${
                activePage === 'home' && activeView === 'page' ? ' main-scroll--home' : ''
              }${
                activePage === 'mood' && activeView === 'page' ? ' main-scroll--mood' : ''
              }`}
            >
              {(activePage === 'home' || activePage === 'mood') && activeView === 'page' ? (
                <HomeTopBar onOpenDiscover={() => navigatePage('discover')} />
              ) : null}
              {activePage !== 'home' && activePage !== 'mood' ? <CatalogStatusBar /> : null}
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage} data-view={activeView}>
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
                  onOpenCinema={() => setCinemaOpen(true)}
                />
              </div>
            </main>"""

    new_shell = """            <main
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
            </main>"""

    return text.replace(old_shell, new_shell, 1)


def patch_css() -> None:
    css = CSS.read_text(encoding="utf-8")
    if "Phase 42B" in css:
        print("CSS already patched")
        return
    css += PHASE42B_CSS
    CSS.write_text(css, encoding="utf-8")
    print("CSS patched")


PHASE42B_CSS = r"""

/* —— Phase 42B: Remaining PSD destination pages —— */
.main-scroll--psd {
  padding-top: clamp(12px, 1.8vw, 18px);
  padding-inline: clamp(16px, 2.4vw, 28px);
}

.page-view[data-nav] .catalog-status-bar,
.page-view[data-nav="home"] ~ .catalog-stale-banner,
.main-scroll--psd .catalog-status-bar {
  display: none;
}

.main-scroll--psd .catalog-stale-banner {
  margin-bottom: 12px;
}

.sidebar-premium-cta.is-active {
  border-color: rgba(255, 186, 61, 0.48);
  box-shadow: 0 0 24px rgba(255, 186, 61, 0.16);
}

.psd-page-hero {
  position: relative;
  min-height: clamp(200px, 22vh, 260px);
  margin-inline: calc(-1 * clamp(16px, 2.4vw, 28px));
  width: calc(100% + 2 * clamp(16px, 2.4vw, 28px));
  margin-bottom: clamp(18px, 2.6vw, 28px);
  overflow: hidden;
}

.psd-page-hero-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center top;
  transform: scale(1.02);
}

.psd-page-hero-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(5, 5, 9, 0.92) 0%, rgba(5, 5, 9, 0.45) 50%, rgba(5, 5, 9, 0.72) 100%),
    linear-gradient(180deg, transparent 30%, rgba(5, 5, 9, 0.82) 100%);
}

.psd-page-hero-copy {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: clamp(200px, 22vh, 260px);
  padding: clamp(24px, 3.5vw, 42px);
  max-width: min(640px, 90%);
}

.psd-page-eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(245, 197, 66, 0.72);
}

.psd-page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  color: rgba(250, 248, 255, 0.96);
}

.psd-page-title--library .psd-page-title-main {
  position: relative;
  display: inline-block;
}

.psd-page-title--library .psd-page-title-main::after {
  content: '';
  position: absolute;
  left: -2%;
  right: -4%;
  bottom: -0.1em;
  height: 0.34em;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 24' preserveAspectRatio='none'%3E%3Cpath d='M4 18C36 8 72 4 108 10s72 8 88 4' fill='none' stroke='%23FFBA3D' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.psd-page-subtitle,
.psd-search-query-line {
  margin: 10px 0 0;
  max-width: 52ch;
  color: rgba(245, 243, 250, 0.62);
  line-height: 1.55;
}

.psd-search-query-line strong {
  color: var(--accent-gold-bright);
}

.psd-tab-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-bottom: 18px;
  padding-bottom: 4px;
}

.psd-tab {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 13, 20, 0.72);
  color: rgba(245, 243, 250, 0.68);
  font-size: 13px;
}

.psd-tab.is-active {
  border-color: rgba(109, 74, 255, 0.42);
  background: linear-gradient(135deg, rgba(109, 74, 255, 0.38), rgba(166, 58, 136, 0.24));
  color: rgba(250, 248, 255, 0.94);
}

.psd-panel {
  margin-bottom: clamp(22px, 3vw, 32px);
}

.psd-panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.psd-panel-header h2 {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 18px;
  color: rgba(245, 243, 250, 0.92);
}

.psd-panel-header span,
.psd-section-label {
  font-size: 12px;
  color: var(--psd-metadata);
}

.psd-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.psd-stat-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 13, 20, 0.72);
}

.psd-stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-gold-bright);
}

.psd-card-grid {
  display: grid;
  gap: 14px;
}

.psd-card-grid--6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.psd-cover-card {
  min-width: 0;
}

.psd-cover-card .art-frame {
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 8px;
}

.psd-cover-card strong {
  display: block;
  font-size: 13px;
}

.psd-cover-card span {
  display: block;
  font-size: 11px;
  color: var(--psd-metadata);
}

.psd-top-result-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 13, 20, 0.72);
  text-align: left;
}

.psd-top-result-card .art-frame {
  width: 72px;
  flex-shrink: 0;
}

.psd-top-result-type {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent-gold-bright);
}

.psd-song-table {
  list-style: none;
  margin: 0;
  padding: 0;
}

.psd-song-row {
  display: grid;
  grid-template-columns: 36px 48px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 8px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
}

.psd-song-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.psd-song-row .art-frame {
  width: 48px;
}

.psd-song-copy strong {
  display: block;
  font-size: 14px;
}

.psd-song-copy span {
  display: block;
  font-size: 12px;
  color: var(--psd-metadata);
}

.psd-song-duration {
  font-size: 12px;
  color: var(--psd-metadata);
}

.psd-mini-grid {
  display: grid;
  gap: 14px;
}

.psd-mini-grid--artists {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.psd-mini-grid--albums,
.psd-mini-grid--playlists {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.psd-mini-card {
  min-width: 0;
  text-align: center;
}

.psd-mini-card .artist-avatar,
.psd-mini-card .art-frame,
.psd-playlist-art {
  margin: 0 auto 8px;
}

.psd-playlist-art {
  aspect-ratio: 1;
  width: 100%;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(109, 74, 255, 0.18);
}

.psd-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.psd-btn {
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.psd-btn--gold {
  border: 1px solid rgba(255, 186, 61, 0.42);
  background: linear-gradient(145deg, var(--accent-gold-bright), var(--accent-gold-deep));
  color: #1a1208;
}

.psd-btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(245, 243, 250, 0.86);
}

.psd-artist-hero,
.psd-playlist-detail-hero,
.psd-liked-hero {
  position: relative;
  min-height: clamp(240px, 28vh, 320px);
  margin-inline: calc(-1 * clamp(16px, 2.4vw, 28px));
  width: calc(100% + 2 * clamp(16px, 2.4vw, 28px));
  margin-bottom: 22px;
  overflow: hidden;
}

.psd-artist-hero-backdrop,
.psd-playlist-detail-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

.psd-artist-hero-veil,
.psd-playlist-detail-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(5, 5, 9, 0.35) 0%, rgba(5, 5, 9, 0.88) 100%);
}

.psd-artist-hero-inner,
.psd-playlist-detail-copy,
.psd-liked-hero-copy {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  gap: 18px;
  min-height: clamp(240px, 28vh, 320px);
  padding: clamp(24px, 3.5vw, 42px);
}

.psd-artist-hero-inner .artist-avatar {
  width: clamp(120px, 14vw, 168px);
  height: clamp(120px, 14vw, 168px);
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(255, 186, 61, 0.35);
}

.psd-liked-hero-art {
  position: absolute;
  inset: 0;
  background-size: 120% auto;
  background-position: 18% 22%;
}

.psd-liked-hero-copy {
  flex-direction: column;
  align-items: flex-start;
}

.psd-track-table-wrap {
  overflow-x: auto;
}

.psd-track-table {
  width: 100%;
  border-collapse: collapse;
}

.psd-track-table th,
.psd-track-table td {
  padding: 10px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: left;
  font-size: 13px;
}

.psd-track-table th {
  color: var(--psd-metadata);
  font-weight: 500;
}

.psd-track-title-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  padding: 0;
}

.psd-track-title-btn .art-frame {
  width: 40px;
}

.psd-inferred-hero,
.psd-premium-hero {
  margin-bottom: 24px;
  padding: clamp(24px, 3vw, 36px);
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 13, 20, 0.72);
}

.psd-premium-hero {
  position: relative;
  overflow: hidden;
  border-color: rgba(255, 186, 61, 0.28);
  background:
    radial-gradient(circle at 80% 20%, rgba(255, 186, 61, 0.16), transparent 42%),
    rgba(13, 13, 20, 0.92);
}

.psd-premium-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 80%, rgba(109, 74, 255, 0.18), transparent 50%);
  pointer-events: none;
}

.psd-premium-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.psd-premium-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 186, 61, 0.18);
  background: rgba(255, 186, 61, 0.06);
}

.psd-album-grid-wrap .card-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.psd-footer-count {
  margin-top: 8px;
  font-size: 12px;
  color: var(--psd-metadata);
}

@media (max-width: 1200px) {
  .psd-stat-grid,
  .psd-card-grid--6,
  .psd-mini-grid--albums,
  .psd-mini-grid--playlists,
  .psd-album-grid-wrap .card-row,
  .psd-premium-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .psd-stat-grid,
  .psd-card-grid--6,
  .psd-mini-grid--artists,
  .psd-mini-grid--albums,
  .psd-mini-grid--playlists,
  .psd-album-grid-wrap .card-row,
  .psd-premium-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
"""


def main() -> None:
    text = APP.read_text(encoding="utf-8")
    text = patch_imports(text)
    text = patch_nav_helpers(text)
    text = patch_sidebar_active(text)
    text = patch_home_top_bar(text)
    text = patch_sidebar(text)
    text = patch_discover_page(text)
    text = patch_library_page(text)
    text = patch_artists_albums_playlists(text)
    text = patch_other_pages(text)
    text = patch_router_and_shell(text)
    APP.write_text(text, encoding="utf-8")
    patch_css()
    print("Phase 42B patch applied")


if __name__ == "__main__":
    main()
