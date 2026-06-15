#!/usr/bin/env python3
"""Phase 42A — Emotional Worlds PSD page reconstruction."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch_app_tsx() -> None:
    path = ROOT / "src" / "App.tsx"
    text = path.read_text(encoding="utf-8")

    if "emotional-worlds-reference.jpg" not in text:
        text = text.replace(
            "import heroPhotoUrl from './assets/hero.png'\n",
            "import heroPhotoUrl from './assets/hero.png'\n"
            "import emotionalWorldsReferenceUrl from './assets/emotional-worlds-reference.jpg'\n",
        )

    if "EMOTIONAL_WORLDS_CHIPS" not in text:
        anchor = "function MoodRoomsPage("
        constants = '''type EmotionalWorldChipId =
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

function resolveEmotionalWorldScene(sceneId: string) {
  return findListeningScene(buildListeningScenes([]), sceneId)
    ?? LISTENING_SCENE_DEFINITIONS.find((entry) => entry.id === sceneId)
}

'''
        text = text.replace(anchor, constants + anchor)

    old_mood_page = '''function MoodRoomsPage({ onOpenMood }: { onOpenMood: (mood: MoodRoom) => void }) {
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
            </div>
            <div className="mood-room-body">
              <div className="mood-room-icon-wrap">
                <MusicNoteIcon className="card-art-icon" />
              </div>
              <h3>{room.title}</h3>
              <p>{room.subtitle}</p>
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
}'''

    new_mood_page = '''function EmotionalWorldsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
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
}'''

    if old_mood_page not in text:
        raise SystemExit('MoodRoomsPage block not found')
    text = text.replace(old_mood_page, new_mood_page)

    text = text.replace(
        "    case 'mood':\n      return <MoodRoomsPage onOpenMood={onOpenMood} />",
        "    case 'mood':\n      return <EmotionalWorldsPage onOpenSong={onOpenSong} />",
    )

    text = text.replace(
        '''          placeholder="Search songs, albums, artists…"''',
        '''          placeholder="Search songs, artists, moods…"''',
    )

    text = text.replace(
        '''              {activePage === 'home' && activeView === 'page' ? (
                <HomeTopBar onOpenDiscover={() => navigatePage('discover')} />
              ) : null}
              {activePage !== 'home' ? <CatalogStatusBar /> : null}''',
        '''              {(activePage === 'home' || activePage === 'mood') && activeView === 'page' ? (
                <HomeTopBar onOpenDiscover={() => navigatePage('discover')} />
              ) : null}
              {activePage !== 'home' && activePage !== 'mood' ? <CatalogStatusBar /> : null}''',
    )

    text = text.replace(
        '''              className={`main-scroll${activePage === 'home' && activeView === 'page' ? ' main-scroll--home' : ''}`}''',
        '''              className={`main-scroll${
                activePage === 'home' && activeView === 'page' ? ' main-scroll--home' : ''
              }${
                activePage === 'mood' && activeView === 'page' ? ' main-scroll--mood' : ''
              }`}''',
    )

    if "function TheaterModeRailCard" not in text:
        theater_component = '''
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

'''
        text = text.replace(
            "const QueueUpNextPanel = memo(function QueueUpNextPanel() {",
            theater_component + "const QueueUpNextPanel = memo(function QueueUpNextPanel({\n  onOpenCinema,\n}: {\n  onOpenCinema?: () => void\n}) {",
        )

        text = text.replace(
            '''        </section>
      </div>
    </aside>
  )
})
type ActiveView''',
            '''        </section>

        {onOpenCinema ? <TheaterModeRailCard onEnter={onOpenCinema} /> : null}
      </div>
    </aside>
  )
})
type ActiveView''',
        )

    text = text.replace(
        "            <QueueUpNextPanel />",
        "            <QueueUpNextPanel onOpenCinema={() => setCinemaOpen(true)} />",
    )

    if "LISTENING_SCENE_DEFINITIONS" not in text:
        text = text.replace(
            "  buildListeningScenes,\n",
            "  buildListeningScenes,\n  LISTENING_SCENE_DEFINITIONS,\n",
        )

    if "resolveEmotionalWorldScene" in text:
        text = text.replace(
            '''function resolveEmotionalWorldScene(sceneId: string) {
  return findListeningScene(buildListeningScenes([]), sceneId)
    ?? LISTENING_SCENE_DEFINITIONS.find((entry) => entry.id === sceneId)
}

''',
            "",
        )

    path.write_text(text, encoding="utf-8")


def patch_app_css() -> None:
    path = ROOT / "src" / "App.css"
    css = path.read_text(encoding="utf-8")
    block = '''
/* —— Phase 42A: Emotional Worlds PSD page —— */
.main-scroll--mood {
  padding-top: clamp(12px, 1.8vw, 18px);
  padding-inline: clamp(16px, 2.4vw, 28px);
}

.page-view[data-page="mood"] .catalog-status-bar,
.page-view[data-page="mood"] .catalog-stale-banner {
  display: none;
}

.emotional-worlds-destination {
  position: relative;
}

.page-view[data-page="mood"] .emotional-worlds-hero {
  position: relative;
  min-height: clamp(220px, 24vh, 280px);
  margin-inline: calc(-1 * clamp(16px, 2.4vw, 28px));
  width: calc(100% + 2 * clamp(16px, 2.4vw, 28px));
  margin-bottom: clamp(22px, 3vw, 32px);
  overflow: hidden;
  isolation: isolate;
  border-radius: 0;
}

.emotional-worlds-hero-backdrop {
  position: absolute;
  inset: 0;
  background-size: 148% auto;
  background-position: 14% 7%;
  background-repeat: no-repeat;
  transform: scale(1.03);
}

.emotional-worlds-hero-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(5, 5, 9, 0.9) 0%, rgba(5, 5, 9, 0.45) 42%, rgba(5, 5, 9, 0.2) 72%, rgba(5, 5, 9, 0.55) 100%),
    linear-gradient(180deg, rgba(109, 74, 255, 0.14) 0%, transparent 48%, rgba(5, 5, 9, 0.78) 100%),
    radial-gradient(ellipse 68% 58% at 78% 40%, rgba(166, 58, 136, 0.32), transparent 62%);
  pointer-events: none;
}

.emotional-worlds-hero-copy {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: clamp(220px, 24vh, 280px);
  padding: clamp(28px, 4vw, 48px) clamp(30px, 4.2vw, 52px);
  max-width: min(620px, 88%);
}

.emotional-worlds-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.35rem, 4.8vw, 3.65rem);
  font-weight: 600;
  line-height: 1.06;
  letter-spacing: -0.04em;
  color: rgba(250, 248, 255, 0.96);
}

.emotional-worlds-title-emotional {
  position: relative;
  display: inline-block;
}

.emotional-worlds-title-emotional::after {
  content: '';
  position: absolute;
  left: -2%;
  right: -4%;
  bottom: -0.12em;
  height: 0.34em;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 24' preserveAspectRatio='none'%3E%3Cpath d='M4 18C36 8 72 4 108 10s72 8 88 4' fill='none' stroke='%23FFBA3D' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  opacity: 0.92;
  pointer-events: none;
}

.emotional-worlds-description {
  margin: clamp(12px, 1.8vw, 18px) 0 0;
  max-width: 52ch;
  font-family: var(--font-ui);
  font-size: clamp(14px, 1.5vw, 16px);
  line-height: 1.6;
  color: rgba(245, 243, 250, 0.62);
}

.emotional-worlds-chips {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: clamp(22px, 3vw, 30px);
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.emotional-worlds-chip {
  flex: 0 0 auto;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(13, 13, 20, 0.72);
  color: rgba(245, 243, 250, 0.72);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.emotional-worlds-chip.is-active {
  border-color: rgba(109, 74, 255, 0.42);
  background: linear-gradient(135deg, rgba(109, 74, 255, 0.42), rgba(166, 58, 136, 0.28));
  color: rgba(250, 248, 255, 0.94);
  box-shadow: 0 0 24px rgba(109, 74, 255, 0.18);
}

.emotional-worlds-chips-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(245, 243, 250, 0.42);
  flex-shrink: 0;
}

.emotional-worlds-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: clamp(14px, 1.6vw, 20px);
}

.emotional-world-card {
  position: relative;
  min-width: 0;
}

.emotional-world-card-select {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.emotional-world-card-art {
  position: relative;
  aspect-ratio: 3 / 4.1;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0d0d14;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 16px 34px rgba(0, 0, 0, 0.32);
}

.emotional-world-card-art .art-frame,
.emotional-world-card-art .visual-scene--thumb,
.emotional-world-card-art .card-art-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.emotional-world-card-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, transparent 36%, rgba(5, 5, 9, 0.22) 70%, rgba(5, 5, 9, 0.76) 100%),
    radial-gradient(ellipse 90% 70% at 50% 100%, rgba(109, 74, 255, 0.14), transparent 58%);
  pointer-events: none;
}

.emotional-world-card-copy {
  padding: 11px 3px 0;
}

.emotional-world-card-copy h3 {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: rgba(245, 243, 250, 0.92);
}

.emotional-world-card-tags {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--psd-metadata);
}

.emotional-world-card-count {
  margin-top: 3px;
  font-size: 11px;
  color: rgba(245, 243, 250, 0.38);
}

.emotional-world-play-btn {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 186, 61, 0.42);
  background: linear-gradient(145deg, var(--accent-gold-bright), var(--accent-gold-deep));
  color: #1a1208;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.34),
    0 0 16px rgba(255, 186, 61, 0.18);
}

.emotional-world-card.is-active .emotional-world-card-art {
  border-color: rgba(109, 74, 255, 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px rgba(109, 74, 255, 0.22),
    0 0 28px rgba(109, 74, 255, 0.22),
    0 18px 38px rgba(0, 0, 0, 0.34);
}

.emotional-world-card--skeleton .emotional-world-card-art {
  background: linear-gradient(180deg, rgba(23, 23, 36, 0.9), rgba(13, 13, 20, 0.96));
}

.emotional-world-card--skeleton .emotional-world-card-line {
  height: 12px;
  margin-top: 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.rail-theater-card {
  margin-top: auto;
  padding: 14px;
  border-radius: calc(var(--radius-lg) + 2px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(20, 18, 30, 0.72), rgba(10, 10, 16, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.rail-theater-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.rail-theater-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: rgba(245, 243, 250, 0.9);
}

.rail-theater-chevron {
  color: var(--accent-gold-bright);
}

.rail-theater-art {
  height: 88px;
  border-radius: 14px;
  background-size: 320% auto;
  background-position: 72% 68%;
  background-repeat: no-repeat;
  margin-bottom: 10px;
}

.rail-theater-copy {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(245, 243, 250, 0.52);
}

.rail-theater-enter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(245, 197, 66, 0.34);
  background: rgba(255, 186, 61, 0.08);
  color: var(--accent-gold-bright);
  font-size: 12px;
  font-weight: 600;
}

.now-playing-rail-inner {
  flex: 1;
}

@media (max-width: 1280px) {
  .emotional-worlds-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1000px) {
  .emotional-worlds-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .emotional-worlds-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .emotional-worlds-hero-copy {
    max-width: 100%;
  }
}
'''
    if "Phase 42A: Emotional Worlds PSD page" not in css:
        css += block
    path.write_text(css, encoding="utf-8")


def main() -> None:
    patch_app_tsx()
    patch_app_css()
    print("Phase 42A patch applied.")


if __name__ == "__main__":
    main()
