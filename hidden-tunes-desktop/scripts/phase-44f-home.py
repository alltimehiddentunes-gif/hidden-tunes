#!/usr/bin/env python3
"""Phase 44F — Home page PSD reconstruction + wiring (WSL-safe)."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)

# Remove demo discovery types only (keep MoodRoom and below).
app = re.sub(
    r'\ntype DiscoveryCard = \{.*?\}\n\ntype DiscoverySection = \{.*?\}\n\n',
    '\n',
    app,
    count=1,
    flags=re.DOTALL,
)

# Remove HOME_SECTIONS constant only.
app = re.sub(
    r'\nconst HOME_SECTIONS: DiscoverySection\[\] = \[.*?\]\n\n',
    '\n',
    app,
    count=1,
    flags=re.DOTALL,
)

# Remove DiscoveryGrid function only.
app = re.sub(
    r'\nfunction DiscoveryGrid\(\{ section \}: \{ section: DiscoverySection \}\) \{.*?\n\}\n',
    '\n',
    app,
    count=1,
    flags=re.DOTALL,
)

old_hero = """function Hero() {
  return (
    <section className="hero hero--psd" aria-label="Tonight's listening invitation">
      <img
        className="hero-photo"
        src={getArtworkForHero('home')}
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
}"""

new_hero = """function Hero({
  onPlay,
  onExploreWorlds,
  canPlay,
}: {
  onPlay: () => void
  onExploreWorlds: () => void
  canPlay: boolean
}) {
  return (
    <section className="hero hero--psd" aria-label="Tonight's listening invitation">
      <img
        className="hero-photo"
        src={getArtworkForHero('home')}
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
          <div className="hero-actions psd-hero-actions">
            <button
              type="button"
              className="psd-btn psd-btn--gold"
              disabled={!canPlay}
              onClick={onPlay}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
            <button type="button" className="psd-btn psd-btn--ghost" onClick={onExploreWorlds}>
              Explore Worlds
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}"""

if old_hero not in app:
    raise SystemExit('Hero block not found')
app = app.replace(old_hero, new_hero)

artist_grid = """
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
        detail="Adjust your search or explore the cached catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact card-row--artists">
        {renderArtists.map((artist) => (
          <button
            key={artist.id}
            type="button"
            className="discovery-card discovery-card--api discovery-card--artist"
            onClick={() => onSelect(artist)}
          >
            <div className="card-art card-art--artist">
              <ArtistAvatar artist={artist} />
            </div>
            <div className="card-info">
              <h3>{artist.name}</h3>
              <p className="card-meta-primary">
                {artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}
              </p>
            </div>
          </button>
        ))}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

"""

marker = 'function CatalogSection({'
if 'const ApiArtistGrid = memo' not in app:
    app = app.replace(marker, artist_grid + marker)

old_catalog_section = """function CatalogSection({
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
      </div>"""

new_catalog_section = """function CatalogSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  count,
  onViewAll,
  viewAllLabel = 'View all',
  children,
}: {
  title: string
  hint: string
  loading: boolean
  error: string | null
  onRetry: () => void
  count?: number
  onViewAll?: () => void
  viewAllLabel?: string
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
        {onViewAll ? (
          <button type="button" className="btn-secondary btn-sm home-section-view-all" onClick={onViewAll}>
            {viewAllLabel}
          </button>
        ) : null}
      </div>"""

if old_catalog_section not in app:
    raise SystemExit('CatalogSection block not found')
app = app.replace(old_catalog_section, new_catalog_section)

old_topbar_submit = """  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onOpenDiscover?.()
    },
    [onOpenDiscover],
  )"""

new_topbar_submit = """  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = query.trim()
      if (trimmed) {
        onSearchSubmit?.(trimmed)
      }
      onOpenDiscover?.()
    },
    [onOpenDiscover, onSearchSubmit, query],
  )"""

if old_topbar_submit in app:
    app = app.replace(old_topbar_submit, new_topbar_submit)

old_topbar_props = """function HomeTopBar({
  placeholder = 'Search songs, artists, moods…',
  onOpenDiscover,
  variant = 'default',
  searchValue,
  onSearchChange,
}: {
  placeholder?: string
  onOpenDiscover?: () => void
  variant?: 'default' | 'search'
  searchValue?: string
  onSearchChange?: (value: string) => void
}) {"""

new_topbar_props = """function HomeTopBar({
  placeholder = 'Search songs, artists, moods…',
  onOpenDiscover,
  onSearchSubmit,
  variant = 'default',
  searchValue,
  onSearchChange,
}: {
  placeholder?: string
  onOpenDiscover?: () => void
  onSearchSubmit?: (query: string) => void
  variant?: 'default' | 'search'
  searchValue?: string
  onSearchChange?: (value: string) => void
}) {"""

if old_topbar_props in app:
    app = app.replace(old_topbar_props, new_topbar_props)

old_topbar_actions = """      {isSearchShell ? (
        <button type="button" className="home-top-filter-btn" aria-label="Search filters">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      ) : null}
      <div className="home-top-actions">
        <button type="button" className="home-top-icon-btn home-top-icon-btn--notify" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {isSearchShell ? <span className="home-top-notify-badge">3</span> : null}
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
      </div>"""

new_topbar_actions = """      {isSearchShell ? (
        <button type="button" className="home-top-filter-btn" aria-label="Search filters">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      ) : null}"""

if old_topbar_actions in app:
    app = app.replace(old_topbar_actions, new_topbar_actions)

old_pws_sig = """function PopularWorldsSection({
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
}) {"""

new_pws_sig = """function PopularWorldsSection({
  songs,
  loading = false,
  onPlayWorld,
  onBrowseWorlds,
}: {
  songs: ApiSong[]
  loading?: boolean
  onPlayWorld: (scene: BuiltListeningScene) => void
  onBrowseWorlds?: () => void
}) {"""

if old_pws_sig not in app:
    raise SystemExit('PopularWorldsSection signature not found')
app = app.replace(old_pws_sig, new_pws_sig)

old_pws_card = """            const worldCollage = getArtworkForPlaylistCollage(worldTracks, artworkContext)
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
                    {worldCollage.length > 1 ? (
                      <ArtworkCollage
                        urls={worldCollage}
                        seed={world.id}
                        label={presentation.title}
                      />
                    ) : (
                      <ArtworkImage
                        src={worldCollage[0] ?? null}
                        alt=""
                        seed={world.id}
                        label={presentation.title}
                        priority={worldIndex < 2}
                      />
                    )}"""

new_pws_card = """            const worldArt = getArtworkForWorld(
              { id: world.id, title: presentation.title, sceneId: world.id },
              songs,
              artworkContext,
            )
            const worldCollage = getArtworkForPlaylistCollage(worldTracks, artworkContext)
            const sceneId = world.visualSceneId ?? resolveVisualScene({
              seed: world.label,
              mood: world.mood,
            })

            return (
              <article
                key={world.id}
                role="listitem"
                className="world-card"
                data-scene={sceneId}
              >
                <button
                  type="button"
                  className="world-card-select"
                  onClick={() => onBrowseWorlds?.()}
                >
                  <div className="world-card-art">
                    {worldArt ? (
                      <ArtworkImage
                        src={worldArt}
                        alt=""
                        seed={world.id}
                        label={presentation.title}
                        priority={worldIndex < 2}
                      />
                    ) : worldCollage.length > 1 ? (
                      <ArtworkCollage
                        urls={worldCollage}
                        seed={world.id}
                        label={presentation.title}
                      />
                    ) : (
                      <ArtworkImage
                        src={worldCollage[0] ?? null}
                        alt=""
                        seed={world.id}
                        label={presentation.title}
                        priority={worldIndex < 2}
                      />
                    )}"""

if old_pws_card not in app:
    raise SystemExit('PopularWorldsSection card block not found')
app = app.replace(old_pws_card, new_pws_card)

hp_start = app.index('function HomePage({')
hp_end = app.index('\n\nfunction DiscoverPage({')
new_home_page = """function HomePage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
}) {
  const {
    songs,
    albums,
    artists,
    artistNames,
    indexes,
    showCatalogSkeleton,
    showCatalogError,
    error,
    retry,
  } = useCatalog()

  const heroQueue = useMemo(() => sortSongsList(songs, 'latest').slice(0, 12), [songs])
  const trendingSongs = useMemo(() => sortSongsList(songs, 'latest').slice(0, 6), [songs])
  const featuredArtists = useMemo(
    () => sortArtistsList(artists, 'tracks').slice(0, 6),
    [artists],
  )
  const newAlbums = useMemo(
    () => sortAlbumsList(albums, 'latest').slice(0, 6),
    [albums],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playFromQueue = useCallback(
    (song: ApiSong, queue: ApiSong[], queueTitle: string) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'home', queueTitle, {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const playHero = useCallback(() => {
    const song = heroQueue[0]
    if (!song) return
    playFromQueue(song, heroQueue, 'Home')
  }, [heroQueue, playFromQueue])

  const playTrendingSong = useCallback(
    (song: ApiSong) => {
      const queue = trendingSongs.length > 0 ? trendingSongs : [song]
      playFromQueue(song, queue, 'Trending Now')
    },
    [playFromQueue, trendingSongs],
  )

  const playWorld = useCallback(
    (scene: BuiltListeningScene) => {
      const tracks = filterSongsByListeningScene(songs, scene.id)
      if (tracks.length === 0) return
      playFromQueue(tracks[0], tracks, resolveWorldPresentation(scene).title)
    },
    [playFromQueue, songs],
  )

  return (
    <div className="home-destination">
      <PageFrame cinematic>
        <Hero
          onPlay={playHero}
          onExploreWorlds={() => onNavigateNav('worlds')}
          canPlay={heroQueue.length > 0}
        />
        <PopularWorldsSection
          songs={songs}
          loading={showCatalogSkeleton}
          onPlayWorld={playWorld}
          onBrowseWorlds={() => onNavigateNav('worlds')}
        />
        <div className="home-secondary" aria-label="Featured from your catalog">
          {trendingSongs.length > 0 || showCatalogSkeleton ? (
            <CatalogSection
              title="Trending Now"
              hint="Curated for the moment"
              loading={showCatalogSkeleton}
              error={showCatalogError ? error : null}
              onRetry={retry}
              count={trendingSongs.length}
              onViewAll={() => onNavigateNav('search')}
            >
              <ApiSongGrid
                songs={trendingSongs}
                onSelect={(song) => playTrendingSong(song)}
                listKey="home-trending"
                paginate={false}
                showEmpty={false}
              />
            </CatalogSection>
          ) : null}

          {featuredArtists.length > 0 || showCatalogSkeleton ? (
            <CatalogSection
              title="Featured Artists"
              hint="Voices in your library"
              loading={showCatalogSkeleton}
              error={showCatalogError ? error : null}
              onRetry={retry}
              count={featuredArtists.length}
              onViewAll={() => onNavigateNav('artists')}
            >
              <ApiArtistGrid
                artists={featuredArtists}
                onSelect={onOpenArtist}
                listKey="home-artists"
                paginate={false}
              />
            </CatalogSection>
          ) : null}

          {newAlbums.length > 0 || showCatalogSkeleton ? (
            <CatalogSection
              title="New Albums"
              hint="Fresh from your catalog"
              loading={showCatalogSkeleton}
              error={showCatalogError ? error : null}
              onRetry={retry}
              count={newAlbums.length}
              onViewAll={() => onNavigateNav('albums')}
            >
              <ApiAlbumGrid
                albums={newAlbums}
                artistNames={artistNames}
                indexes={indexes}
                onSelect={onOpenAlbum}
                listKey="home-albums"
                paginate={false}
              />
            </CatalogSection>
          ) : null}
        </div>
      </PageFrame>
    </div>
  )
}

"""

app = app[:hp_start] + new_home_page + app[hp_end + 2:]

app = app.replace('  void _onNavigateNav\n', '')
app = app.replace('  onNavigateNav: _onNavigateNav,\n', '  onNavigateNav,\n')
app = app.replace(
    """    case 'home':
      return <HomePage onOpenSong={onOpenSong} />""",
    """    case 'home':
      return (
        <HomePage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
        />
      )""",
)
app = app.replace(
    '      return <HomePage onOpenSong={onOpenSong} />\n    case \'tv\':',
    """      return (
        <HomePage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
        />
      )
    case 'tv':""",
)

app = app.replace(
    """                <HomeTopBar
                  placeholder={TOP_BAR_PLACEHOLDERS[activeNavKey]}
                  onOpenDiscover={() => navigatePage('discover', 'search')}""",
    """                <HomeTopBar
                  placeholder={TOP_BAR_PLACEHOLDERS[activeNavKey]}
                  onOpenDiscover={() => navigatePage('discover', 'search')}
                  onSearchSubmit={(query) => {
                    if (activeNavKey === 'home' && query) {
                      setDiscoverQuery(query)
                    }
                  }}""",
)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44F: Home PSD hero actions + featured rows —— */
.hero--psd .psd-hero-actions {
  margin-top: clamp(18px, 2.8vw, 28px);
}

.hero--psd .psd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}

.hero--psd .psd-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.home-section-view-all {
  flex-shrink: 0;
}

.card-row--artists .discovery-card--artist {
  text-align: center;
}

.card-row--artists .card-art--artist {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.card-row--artists .artist-avatar {
  width: clamp(108px, 10vw, 136px);
  height: clamp(108px, 10vw, 136px);
}

.page-view[data-page="home"] .home-secondary .section-header--catalog h2 {
  font-family: var(--font-ui);
  font-weight: 600;
  letter-spacing: -0.02em;
}

"""

if 'Phase 44F: Home PSD hero actions' not in css:
    insert_at = css.index('/* —— Phase 42A: Emotional Worlds PSD page —— */')
    css = css[:insert_at] + css_block + css[insert_at:]
    write(CSS, css)

print('Phase 44F home patch applied')
