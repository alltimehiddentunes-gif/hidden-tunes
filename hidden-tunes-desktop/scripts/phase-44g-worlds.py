#!/usr/bin/env python3
"""Phase 44G — Emotional Worlds PSD reconstruction + wiring."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'
REGISTRY = ROOT / 'src/data/artworkRegistry.ts'
INTEGRITY = ROOT / 'src/lib/artworkIntegrity.ts'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


# —— Registry: world-only artwork per card + fix invalid fallbacks ——
registry = read(REGISTRY)
old_world_block = """export const worldArtwork: Record<string, string> = {
  'rainy-window': '/artwork/worlds/world-midnight-lake.jpg',
  'midnight reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'city rain': '/artwork/worlds/world-midnight-lake.jpg',
  'sunday-morning': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'afro sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'heartbreak-recovery': '/artwork/worlds/world-serene-waterfall.jpg',
  'healing slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'melancholy bloom': '/artwork/worlds/world-serene-waterfall.jpg',
  'midnight-drive': '/artwork/playlists/playlist-night-drive.jpg',
  'night drive': '/artwork/playlists/playlist-night-drive.jpg',
  'city-lights': '/artwork/heroes/hero-golden-peaks.jpg',
  'sunset glow': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'ocean dreams': '/artwork/worlds/world-midnight-lake.jpg',
  'focus-room': '/artwork/worlds/world-late-night-focus.jpg',
  'velvet emotions': '/artwork/worlds/world-serene-waterfall.jpg',
  'uplift boost': '/artwork/heroes/hero-afrobeats-celebration.jpg',
}"""

new_world_block = """export const worldArtwork: Record<string, string> = {
  'ew-midnight-reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'ew-afro-sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'ew-healing-slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'ew-night-drive': '/artwork/worlds/auto-worlds-19.jpg',
  'ew-sunset-glow': '/artwork/worlds/auto-worlds-28.jpg',
  'ew-velvet-emotions': '/artwork/worlds/auto-worlds-35.jpg',
  'ew-ocean-dreams': '/artwork/worlds/auto-worlds-32.jpg',
  'ew-city-rain': '/artwork/worlds/auto-worlds-26.jpg',
  'ew-uplift-boost': '/artwork/worlds/auto-worlds-40.jpg',
  'ew-melancholy-bloom': '/artwork/worlds/auto-worlds-34.jpg',
  'rainy-window': '/artwork/worlds/world-midnight-lake.jpg',
  'midnight reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'city rain': '/artwork/worlds/auto-worlds-26.jpg',
  'sunday-morning': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'afro sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'heartbreak-recovery': '/artwork/worlds/world-serene-waterfall.jpg',
  'healing slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'melancholy bloom': '/artwork/worlds/auto-worlds-34.jpg',
  'midnight-drive': '/artwork/worlds/auto-worlds-19.jpg',
  'night drive': '/artwork/worlds/auto-worlds-19.jpg',
  'city-lights': '/artwork/worlds/auto-worlds-28.jpg',
  'sunset glow': '/artwork/worlds/auto-worlds-28.jpg',
  'ocean dreams': '/artwork/worlds/auto-worlds-32.jpg',
  'focus-room': '/artwork/worlds/world-late-night-focus.jpg',
  'velvet emotions': '/artwork/worlds/auto-worlds-35.jpg',
  'uplift boost': '/artwork/worlds/auto-worlds-40.jpg',
}"""

if old_world_block not in registry:
    if "'ew-midnight-reflection'" not in registry:
        raise SystemExit('worldArtwork block not found')
else:
    write(REGISTRY, registry.replace(old_world_block, new_world_block))

# —— Registry-only world art (no catalog song fallback) ——
integrity = read(INTEGRITY)
old_get_world = """export function getArtworkForWorld(
  world: WorldArtworkTarget,
  songs: ApiSong[],
  context?: ArtworkContext,
): string | null {
  const registryArt = resolveWorldArtwork(world)
  if (registryArt) return registryArt

  if (!world.sceneId) return null

  const worldTracks = filterSongsByListeningScene(songs, world.sceneId)
  for (const song of worldTracks) {
    const artwork = context ? getArtworkForSong(song, context) : resolveSongArtwork(song)
    if (artwork) return artwork
  }

  return null
}"""

new_get_world = """export function getArtworkForWorld(
  world: WorldArtworkTarget,
  _songs?: ApiSong[],
  _context?: ArtworkContext,
): string | null {
  return resolveWorldArtwork(world)
}"""

if old_get_world not in integrity:
    if 'return resolveWorldArtwork(world)' not in integrity:
        raise SystemExit('getArtworkForWorld block not found')
else:
    integrity = integrity.replace(old_get_world, new_get_world)
    if 'filterSongsByListeningScene' in integrity and "from './sceneListening'" in integrity:
        integrity = integrity.replace(
            "import { filterSongsByListeningScene } from './sceneListening'\n",
            '',
        )
    write(INTEGRITY, integrity)

# —— EmotionalWorldsPage ——
app = read(APP)
ew_start = app.index('function EmotionalWorldsPage(')
ew_end = app.index('\n\nfunction PsdLibraryStatIcon(')

new_ew_page = """function EmotionalWorldsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes, showCatalogSkeleton } = useCatalog()
  const [selectedChip, setSelectedChip] = useState<EmotionalWorldChipId>('all')
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playableCards = useMemo(
    () => EMOTIONAL_WORLDS_CARDS.filter(
      (card) => filterSongsByListeningScene(songs, card.sceneId).length > 0,
    ),
    [songs],
  )

  const visibleCards = useMemo(() => {
    const pool = showCatalogSkeleton ? EMOTIONAL_WORLDS_CARDS : playableCards
    if (selectedChip === 'all') return pool
    return pool.filter((card) => card.chips.includes(selectedChip))
  }, [playableCards, selectedChip, showCatalogSkeleton])

  const activeChips = useMemo(() => {
    if (showCatalogSkeleton) return EMOTIONAL_WORLDS_CHIPS
    return EMOTIONAL_WORLDS_CHIPS.filter((chip) => {
      if (chip.id === 'all') return playableCards.length > 0
      return playableCards.some((card) => card.chips.includes(chip.id))
    })
  }, [playableCards, showCatalogSkeleton])

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

  const playHero = useCallback(() => {
    const card = visibleCards.find(
      (entry) => filterSongsByListeningScene(songs, entry.sceneId).length > 0,
    ) ?? playableCards[0]
    if (!card) return
    playWorld(card)
  }, [playWorld, playableCards, songs, visibleCards])

  const heroWorldArt = useMemo(() => getArtworkForHero('emotional-worlds'), [])
  const canPlayHero = playableCards.length > 0

  return (
    <div className="emotional-worlds-destination">
      <PageFrame cinematic>
        <section className="emotional-worlds-hero" aria-labelledby="emotional-worlds-heading">
          <EntityAtmosphereBackdrop
            className="emotional-worlds-hero-backdrop"
            artworkUrl={heroWorldArt}
            label="Emotional Worlds"
            variant="hero"
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
            <div className="emotional-worlds-hero-actions psd-hero-actions">
              <button
                type="button"
                className="psd-btn psd-btn--gold"
                disabled={!canPlayHero}
                onClick={playHero}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start Listening
              </button>
            </div>
          </div>
        </section>

        {activeChips.length > 0 ? (
          <div className="emotional-worlds-chips" role="toolbar" aria-label="World categories">
            {activeChips.map((chip) => (
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
          </div>
        ) : null}

        {showCatalogSkeleton ? (
          <div className="emotional-worlds-grid emotional-worlds-grid--loading" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="emotional-world-card emotional-world-card--skeleton">
                <div className="emotional-world-card-art" />
                <div className="emotional-world-card-line" />
              </div>
            ))}
          </div>
        ) : visibleCards.length === 0 ? (
          <CatalogEmpty
            title="No worlds match"
            detail="Try another mood filter or wait for more catalog songs to load."
          />
        ) : (
          <div className="emotional-worlds-grid" role="list" aria-label="Emotional worlds">
            {visibleCards.map((card) => {
              const tracks = filterSongsByListeningScene(songs, card.sceneId)
              const worldArt = getArtworkForWorld({
                id: card.cardId,
                title: card.title,
                sceneId: card.sceneId,
              })
              const scene = buildListeningScenes(songs).find((entry) => entry.id === card.sceneId)
              const visualSceneId = scene?.visualSceneId ?? resolveVisualScene({
                seed: card.title,
                mood: scene?.mood ?? 'violet',
              })

              return (
                <article
                  key={card.cardId}
                  role="listitem"
                  className="emotional-world-card"
                  data-scene={visualSceneId}
                >
                  <div className="emotional-world-card-art">
                    <ArtworkImage
                      src={worldArt}
                      alt=""
                      seed={card.cardId}
                      label={card.title}
                    />
                    <span className="emotional-world-card-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="emotional-world-play-btn"
                      aria-label={`Play ${card.title}`}
                      onClick={() => playWorld(card)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="emotional-world-card-select"
                    onClick={() => playWorld(card)}
                  >
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

"""

app = app[:ew_start] + new_ew_page + app[ew_end + 2:]
write(APP, app)

# —— CSS PSD parity pass ——
css = read(CSS)
css_insert_marker = '/* —— Phase 42B: Remaining PSD destination pages —— */'
css_block = """
/* —— Phase 44G: Emotional Worlds PSD parity —— */
.emotional-worlds-hero-actions {
  margin-top: clamp(16px, 2.4vw, 24px);
}

.page-view[data-page="mood"] .emotional-worlds-hero {
  min-height: clamp(240px, 26vh, 300px);
}

.page-view[data-page="mood"] .emotional-worlds-hero-copy {
  min-height: clamp(240px, 26vh, 300px);
  padding-bottom: clamp(32px, 4.2vw, 52px);
}

.emotional-worlds-chip.is-active {
  border-color: rgba(255, 186, 61, 0.38);
  background: linear-gradient(135deg, rgba(109, 74, 255, 0.38), rgba(166, 58, 136, 0.24));
  color: rgba(250, 248, 255, 0.96);
  box-shadow:
    0 0 20px rgba(109, 74, 255, 0.16),
    inset 0 1px 0 rgba(255, 186, 61, 0.12);
}

.emotional-world-card-art {
  aspect-ratio: 3 / 4.15;
  border-radius: 18px;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.emotional-world-card:hover .emotional-world-card-art {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 22px 42px rgba(0, 0, 0, 0.38),
    0 0 28px rgba(109, 74, 255, 0.12);
}

.emotional-world-play-btn {
  width: 42px;
  height: 42px;
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.emotional-world-play-btn:hover {
  transform: scale(1.06);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.38),
    0 0 22px rgba(255, 186, 61, 0.28);
}

.emotional-world-card.is-active .emotional-world-card-art {
  border-color: rgba(109, 74, 255, 0.48);
}

"""

css = read(CSS)
if 'Phase 44G: Emotional Worlds PSD parity' not in css:
    css = css.replace(
        '  aspect-ratio: 3 / 4.1;\n  border-radius: 20px;',
        '  aspect-ratio: 3 / 4.15;\n  border-radius: 18px;',
    )
    css = css.replace(css_insert_marker, css_block + css_insert_marker)
    write(CSS, css)

print('Phase 44G worlds patch applied')
