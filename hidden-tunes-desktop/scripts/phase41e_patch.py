#!/usr/bin/env python3
"""Phase 41E — Home Hero + Popular Worlds reconstruction."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch_app_tsx() -> None:
    app_path = ROOT / "src" / "App.tsx"
    app = app_path.read_text(encoding="utf-8")

    if "import heroPhotoUrl from './assets/hero.png'" not in app:
        app = app.replace(
            "import './App.css'",
            "import heroPhotoUrl from './assets/hero.png'\nimport './App.css'",
        )

    if "type BuiltListeningScene" not in app:
        app = app.replace(
            "  buildListeningScenes,\n",
            "  buildListeningScenes,\n  type BuiltListeningScene,\n",
        )

    old_hero = """function Hero({
  onExplore,
  onContinueListening,
}: {
  onExplore: () => void
  onContinueListening: () => void
}) {
  const homeSceneId = useMemo(() => getTimeAwareHomeScene(), [])

  return (
    <section
      className="hero hero--cinematic"
      aria-label="Featured"
      data-scene={homeSceneId}
    >
      <VisualSceneBackdrop
        sceneId={homeSceneId}
        seed="home-hero"
        variant="hero"
        timeAware
      />
      <div className="hero-atmosphere" aria-hidden="true">
        <span className="hero-atmosphere-glow hero-atmosphere-glow--violet" />
        <span className="hero-atmosphere-glow hero-atmosphere-glow--gold" />
        <span className="hero-atmosphere-glow hero-atmosphere-glow--rose" />
        <span className="hero-atmosphere-haze" />
        <span className="hero-atmosphere-field" />
      </div>
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-stage">
          <div className="hero-copy">
            <div className="hero-brand">
              <BrandLogo className="hero-brand-logo" decorative />
              <div className="hero-brand-copy">
                <p className="hero-eyebrow">Tonight&apos;s listening room</p>
                <h1>Hidden Tunes</h1>
              </div>
            </div>
            <p className="hero-tagline">
              Settle into moods, scenes, and stories — music composed for how you
              feel, not how a dashboard ranks it.
            </p>
            <div className="hero-actions">
              <button type="button" className="btn-primary" onClick={onExplore}>
                Explore
              </button>
              <button type="button" className="btn-secondary" onClick={onContinueListening}>
                Continue Listening
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}"""

    new_hero = """function Hero() {
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
        <p className="popular-worlds-eyebrow">Popular Worlds</p>
        <h2 id="popular-worlds-heading" className="popular-worlds-title">
          Choose your atmosphere
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
                  </div>
                  <div className="world-card-copy">
                    <h3>{presentation.title}</h3>
                    <p>{presentation.subtitle}</p>
                  </div>
                </button>
                <button
                  type="button"
                  className="world-play-btn"
                  aria-label={`Play ${presentation.title}`}
                  onClick={() => onPlayWorld(world)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}"""

    if old_hero not in app:
        raise SystemExit("Hero block not found")
    app = app.replace(old_hero, new_hero)

    old_home_start = """  const [sort, setSort] = useState<SongSort>('latest')
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)"""

    new_home_start = """  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)"""

    if old_home_start not in app:
        raise SystemExit("HomePage sort state not found")
    app = app.replace(old_home_start, new_home_start, 1)

    app = app.replace(
        """  const handleExplore = useCallback(() => {
    onNavigate('discover')
  }, [onNavigate])

  const handleContinueListening = useCallback(() => {
    if (currentTrack) {
      onOpenSongDetail(currentTrack)
      return
    }
    onNavigate('discover')
  }, [currentTrack, onNavigate, onOpenSongDetail])

  const featured = useMemo(
    () => sortSongsList(songs, sort).slice(0, 12),
    [songs, sort],
  )""",
        """  const featured = useMemo(
    () => sortSongsList(songs, 'latest').slice(0, 12),
    [songs],
  )""",
        1,
    )

    old_play_radio = """  const handleStartRadio = useCallback(
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

  return (
    <div className="home-atmosphere">
      <div className="home-atmosphere-layers" aria-hidden="true">
        <span className="home-atmosphere-orb home-atmosphere-orb--violet" />
        <span className="home-atmosphere-orb home-atmosphere-orb--gold" />
        <span className="home-atmosphere-orb home-atmosphere-orb--rose" />
        <span className="home-atmosphere-mist" />
      </div>
      <PageFrame cinematic>
        <Hero
          onExplore={handleExplore}
          onContinueListening={handleContinueListening}
        />
      <EmotionalLanesSection"""

    new_play_radio = """  const handleStartRadio = useCallback(
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
      <EmotionalLanesSection"""

    if old_play_radio not in app:
        raise SystemExit("HomePage return block not found")
    app = app.replace(old_play_radio, new_play_radio, 1)

    old_home_end = """      <CatalogToolbar
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
        hint="Highlights from your collection"
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
    </div>
  )
}

function DiscoverPage"""

    new_home_end = """      <CatalogSection
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

function DiscoverPage"""

    if old_home_end not in app:
        raise SystemExit("HomePage end block not found")
    app = app.replace(old_home_end, new_home_end, 1)

    # Remove unused HomePage props if still referenced
    app = app.replace(
        """function HomePage({
  onOpenSong,
  onNavigate,
  onOpenSongDetail,
}: {
  onOpenSong: QueueSongHandler
  onNavigate: (page: PageId) => void
  onOpenSongDetail: (song: ApiSong) => void
}) {
  const { songs, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const { currentTrack } = useDesktopPlayback()""",
        """function HomePage({
  onOpenSong,
}: {
  onOpenSong: QueueSongHandler
}) {
  const { songs, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)""",
        1,
    )

    app = app.replace(
        """        <HomePage
          onOpenSong={onOpenSong}
          onNavigate={onNavigate}
          onOpenSongDetail={onOpenSongDetail}
        />""",
        """        <HomePage onOpenSong={onOpenSong} />""",
    )

    app_path.write_text(app, encoding="utf-8")
    print("App.tsx patched")


def patch_app_css() -> None:
    css_path = ROOT / "src" / "App.css"
    css = css_path.read_text(encoding="utf-8")

    block = """
/* —— Phase 41E: PSD Home Hero + Popular Worlds —— */
.home-destination {
  position: relative;
}

.main-scroll--home .catalog-stale-banner {
  display: none;
}

.page-view[data-page="home"] .hero--psd {
  position: relative;
  min-height: 40vh;
  margin-inline: calc(-1 * clamp(16px, 2.4vw, 28px));
  width: calc(100% + 2 * clamp(16px, 2.4vw, 28px));
  margin-bottom: clamp(30px, 4.5vw, 44px);
  border: none;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
  isolation: isolate;
}

.hero--psd .hero-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 38%;
  transform: scale(1.02);
}

.hero--psd .hero-photo-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(5, 5, 9, 0.88) 0%, rgba(5, 5, 9, 0.52) 38%, rgba(5, 5, 9, 0.18) 72%, rgba(5, 5, 9, 0.34) 100%),
    linear-gradient(180deg, rgba(109, 74, 255, 0.12) 0%, transparent 42%, rgba(5, 5, 9, 0.72) 100%),
    radial-gradient(ellipse 70% 55% at 78% 36%, rgba(166, 58, 136, 0.28), transparent 62%),
    radial-gradient(ellipse 55% 48% at 12% 88%, rgba(109, 74, 255, 0.18), transparent 58%);
}

.hero-inner--psd {
  position: relative;
  z-index: 2;
  align-items: flex-end;
  justify-content: flex-start;
  min-height: 40vh;
  padding: clamp(34px, 5vw, 56px) clamp(34px, 4.8vw, 58px);
}

.hero-copy--psd {
  max-width: min(540px, 78%);
}

.hero-headline {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.15rem, 4.6vw, 3.55rem);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: rgba(250, 248, 255, 0.96);
  text-wrap: balance;
}

.hero-headline-break {
  display: block;
}

.hero-headline-accent {
  display: inline-block;
  font-family: var(--font-script);
  font-size: clamp(2.35rem, 5vw, 3.85rem);
  font-weight: 400;
  font-style: italic;
  line-height: 1.02;
  letter-spacing: 0.01em;
  color: var(--accent-gold-bright);
  text-shadow: 0 8px 28px rgba(255, 186, 61, 0.22);
}

.popular-worlds-section {
  margin-bottom: clamp(34px, 4.8vw, 52px);
}

.popular-worlds-header {
  margin-bottom: clamp(20px, 2.8vw, 28px);
}

.popular-worlds-eyebrow {
  margin-bottom: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent-gold);
}

.popular-worlds-title {
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 2.4vw, 1.85rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: rgba(245, 243, 250, 0.94);
}

.popular-worlds-grid {
  display: flex;
  gap: clamp(16px, 2vw, 22px);
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
}

.popular-worlds-grid--loading .world-card--skeleton .world-card-art {
  min-height: clamp(220px, 28vw, 280px);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(23, 23, 36, 0.9), rgba(13, 13, 20, 0.96));
}

.world-card {
  position: relative;
  flex: 0 0 clamp(156px, 13.5vw, 196px);
  scroll-snap-align: start;
}

.world-card-select {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.world-card-art {
  position: relative;
  aspect-ratio: 3 / 4.15;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0d0d14;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 38px rgba(0, 0, 0, 0.34);
}

.world-card-art .art-frame,
.world-card-art .visual-scene--thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.world-card-art .card-art-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.world-card-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, transparent 42%, rgba(5, 5, 9, 0.18) 68%, rgba(5, 5, 9, 0.72) 100%),
    radial-gradient(ellipse 90% 70% at 50% 100%, rgba(109, 74, 255, 0.16), transparent 58%);
  pointer-events: none;
}

.world-card-copy {
  padding: 12px 4px 0;
}

.world-card-copy h3 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: rgba(245, 243, 250, 0.92);
}

.world-card-copy p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(245, 243, 250, 0.48);
}

.world-play-btn {
  position: absolute;
  right: 10px;
  bottom: calc(12px + 44px);
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(145deg, var(--accent-gold-bright), var(--accent-gold-deep));
  color: #1a1208;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.34),
    0 0 0 1px rgba(255, 186, 61, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.world-play-btn:hover {
  transform: scale(1.05);
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.38),
    0 0 20px rgba(255, 186, 61, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.world-card.is-active .world-card-art {
  border-color: rgba(245, 197, 66, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px rgba(245, 197, 66, 0.16),
    0 20px 42px rgba(0, 0, 0, 0.36);
}

.home-secondary {
  margin-top: clamp(18px, 2.6vw, 28px);
  padding-top: clamp(28px, 3.6vw, 40px);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.home-secondary .discovery-section {
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.home-secondary .section-header h2,
.home-secondary .emotional-lanes-header h2,
.home-secondary .scene-listening-header h2,
.home-secondary .radio-foundation-header h2 {
  font-size: clamp(1.1rem, 1.8vw, 1.35rem);
}

.home-secondary .page-eyebrow,
.home-secondary .emotional-lanes-eyebrow,
.home-secondary .scene-listening-eyebrow,
.home-secondary .radio-foundation-eyebrow {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: rgba(245, 197, 66, 0.62);
}

.home-secondary .section-hint,
.home-secondary .catalog-count,
.home-secondary .catalog-status-meta {
  display: none;
}

.page-view[data-page="home"] .home-secondary .catalog-toolbar {
  display: none;
}

@media (max-width: 900px) {
  .hero-copy--psd {
    max-width: 100%;
  }

  .hero-headline {
    font-size: clamp(1.85rem, 8vw, 2.6rem);
  }

  .hero-headline-accent {
    font-size: clamp(2rem, 8.8vw, 2.85rem);
  }
}

"""

    marker = "/* —— Phase 41C: PSD shell + home chrome —— */"
    if marker not in css:
        marker = "/* —— Atmospheric home rebuild (Phase 41A) —— */"
    if marker not in css:
        css = block + css
    else:
        css = css.replace(marker, block + marker)

    css_path.write_text(css, encoding="utf-8")
    print("App.css patched")


def patch_index_css() -> None:
    index_path = ROOT / "src" / "index.css"
    index = index_path.read_text(encoding="utf-8")
    addition = """
  --world-card-radius: 22px;
  --hero-min-height: 40vh;
"""
    if "--hero-min-height" not in index:
        index = index.replace("  --content-max-home: none;\n", "  --content-max-home: none;\n" + addition)
        index_path.write_text(index, encoding="utf-8")
        print("index.css patched")
    else:
        print("index.css already patched")


def main() -> None:
    patch_app_tsx()
    patch_app_css()
    patch_index_css()


if __name__ == "__main__":
    main()
