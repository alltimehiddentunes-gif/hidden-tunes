import { memo, useMemo, useState } from 'react'
import { sortSongsList, type ApiSong, type SongSort } from '../lib/api'
import { VisualSceneBackdrop } from '../components/VisualSceneBackdrop'
import { getTimeAwareHomeScene, hashSeed, resolveSongScene, type VisualSceneId } from '../lib/visualScenes'
import '../styles/home.css'

type MoodTone = 'violet' | 'cyan' | 'rose' | 'mint'

type HomeMoodTheme = {
  id: string
  label: string
  tone: MoodTone
  sceneId: VisualSceneId
  match: RegExp
}

const HOME_MOOD_THEMES: HomeMoodTheme[] = [
  { id: 'heartbreak', label: 'Heartbreak', tone: 'rose', sceneId: 'rainy-apartment', match: /heart|ache|break|collapse|rain|goodbye/i },
  { id: 'healing', label: 'Healing', tone: 'cyan', sceneId: 'ocean-reflection', match: /heal|breathe|calm|ocean|tide|restore/i },
  { id: 'focus', label: 'Focus', tone: 'mint', sceneId: 'deep-focus', match: /focus|deep work|flow|monk|quiet|study/i },
  { id: 'late-night', label: 'Late Night', tone: 'cyan', sceneId: 'midnight-drive', match: /midnight|3am|night|drive|nocturne/i },
  { id: 'romantic', label: 'Romantic', tone: 'rose', sceneId: 'slow-love', match: /love|slow|rose|ember|intimate/i },
  { id: 'afro-vibes', label: 'Afro Vibes', tone: 'violet', sceneId: 'afro-sunset', match: /afro|sunset|golden|warm rhythm/i },
]

const FEATURED_SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'az', label: 'A–Z' },
] as const

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}

function pickStableSlice<T>(items: readonly T[], seed: string, count: number): T[] {
  if (count <= 0) return []
  if (items.length <= count) return [...items]
  const start = hashSeed(seed) % items.length
  const doubled = [...items.slice(start), ...items.slice(0, start)]
  return doubled.slice(0, count)
}

function CatalogArt({
  song,
  sceneId,
}: {
  song: ApiSong
  sceneId: VisualSceneId
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="card-art card-art--song">
      {!song.artwork || failed ? (
        <>
          <VisualSceneBackdrop sceneId={sceneId} seed={song.id} variant="thumb" timeAware />
          <MusicNoteIcon className="card-art-icon" />
        </>
      ) : (
        <img
          src={song.artwork}
          alt=""
          className="card-art-img"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

const HomeSongCard = memo(function HomeSongCard({
  song,
  onOpenSong,
}: {
  song: ApiSong
  onOpenSong: (song: ApiSong) => void
}) {
  const sceneId = useMemo(() => resolveSongScene(song), [song])

  return (
    <button
      type="button"
      className="discovery-card discovery-card--api"
      onClick={() => onOpenSong(song)}
    >
      <CatalogArt song={song} sceneId={sceneId} />
      <div className="card-info">
        <h3>{song.title}</h3>
        <p className="card-meta-primary">{song.artist}</p>
        <p className="card-meta-secondary">{song.album}</p>
      </div>
    </button>
  )
})

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="discovery-section" aria-label={title}>
      <div className="section-header section-header--catalog">
        <div>
          <h2>{title}</h2>
          <span className="section-hint">{hint}</span>
        </div>
      </div>
      {children}
    </section>
  )
}

function PremiumHero() {
  const sceneId = useMemo(() => getTimeAwareHomeScene(), [])

  return (
    <section className="hero home-hero" aria-label="Home hero" data-scene={sceneId}>
      <VisualSceneBackdrop sceneId={sceneId} seed="home-hero" variant="hero" timeAware />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow">Command center · Desktop</p>
          <h1>Hidden Tunes</h1>
          <p className="hero-tagline">
            Your emotional music command center — browse the saved catalog, step into moods,
            and keep the atmosphere ready while you work.
          </p>
          <div className="hero-actions">
            <span className="btn-primary" aria-hidden="true">
              Explore moods
            </span>
            <span className="btn-secondary" aria-hidden="true">
              Open latest additions
            </span>
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

export type DesktopHomePageProps = {
  songs: ApiSong[]
  albumsCount: number
  artistsCount: number
  loading: boolean
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  error: string | null
  retry: () => void
  onOpenSong: (song: ApiSong) => void
}

export function DesktopHomePage({
  songs,
  albumsCount,
  artistsCount,
  loading,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
}: DesktopHomePageProps) {
  const [featuredSort, setFeaturedSort] = useState<SongSort>('latest')

  const latest = useMemo(() => sortSongsList(songs, 'latest').slice(0, 12), [songs])

  const featured = useMemo(() => {
    const sorted = sortSongsList(songs, featuredSort)
    return pickStableSlice(sorted, `featured:${featuredSort}`, 12)
  }, [songs, featuredSort])

  const themes = useMemo(() => {
    const buckets = new Map<string, ApiSong[]>()
    for (const theme of HOME_MOOD_THEMES) buckets.set(theme.id, [])

    for (const song of songs) {
      const label = `${song.title} ${song.artist} ${song.album}`.toLowerCase()
      for (const theme of HOME_MOOD_THEMES) {
        if (theme.match.test(label)) {
          const list = buckets.get(theme.id)
          if (list && list.length < 8) list.push(song)
        }
      }
    }

    return HOME_MOOD_THEMES.map((theme) => ({
      ...theme,
      songs: buckets.get(theme.id) ?? [],
    })).filter((theme) => theme.songs.length > 0)
  }, [songs])

  const counts = {
    songs: songs.length,
    albums: albumsCount,
    artists: artistsCount,
  }

  return (
    <div>
      <PremiumHero />

      <div className="home-command">
        <section className="home-panel" aria-label="Command center">
          <div className="home-panel__inner">
            <p className="home-panel__kicker">Today</p>
            <h2 className="home-panel__title">Command center</h2>
            <p className="home-panel__desc">
              Desktop is read-only — everything here is powered by your cached catalog. Refresh anytime from the
              status bar to pull the latest.
            </p>
            <div className="home-stats" aria-label="Catalog counts">
              <div className="home-stat">
                <span>Songs</span>
                <strong>{counts.songs}</strong>
              </div>
              <div className="home-stat">
                <span>Albums</span>
                <strong>{counts.albums}</strong>
              </div>
              <div className="home-stat">
                <span>Artists</span>
                <strong>{counts.artists}</strong>
              </div>
            </div>
            <div className="home-actions">
              <button type="button" className="btn-secondary btn-sm" onClick={retry} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh catalog'}
              </button>
            </div>
          </div>
        </section>

        <section className="home-panel home-mood-panel" aria-label="Mood shortcuts">
          <div className="home-panel__inner">
            <p className="home-panel__kicker">Atmosphere</p>
            <h2 className="home-panel__title">Pick a feeling</h2>
            <p className="home-panel__desc">Jump into a mood rail. Each one keeps the visuals subtle and stable.</p>
            <div className="home-mood-rail">
              {HOME_MOOD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className="home-mood-card"
                  data-tone={theme.tone}
                  aria-label={`Mood: ${theme.label}`}
                >
                  <VisualSceneBackdrop sceneId={theme.sceneId} seed={`home-mood:${theme.id}`} variant="thumb" timeAware />
                  <span className="home-mood-card__label">{theme.label}</span>
                  <span className="home-mood-card__meta">{theme.sceneId.replace('-', ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {showCatalogSkeleton ? (
        <Section title="Loading catalog" hint="Preparing your listening atmosphere">
          <div className="skeleton-grid skeleton-grid--card" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="skeleton-card skeleton-card--card">
                <div className="skeleton-card-art" />
                <div className="skeleton-card-line skeleton-card-line--wide" />
                <div className="skeleton-card-line" />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {showCatalogError ? (
        <Section title="Catalog unavailable" hint="Render cold start can take a moment">
          <div className="catalog-error" role="alert">
            <p className="catalog-error-title">Catalog unavailable</p>
            <p className="catalog-error-detail">
              {error || 'The Hidden Tunes API may be waking up. Wait a moment, then retry.'}
            </p>
            <button type="button" className="btn-secondary btn-sm" onClick={retry}>
              Retry catalog load
            </button>
          </div>
        </Section>
      ) : null}

      {!showCatalogSkeleton && !showCatalogError && songs.length === 0 ? (
        <Section title="Catalog is empty" hint="Read-only desktop preview">
          <div className="catalog-empty">
            <p className="catalog-empty-title">Catalog is empty</p>
            <p className="catalog-empty-detail">The API responded but returned no songs yet.</p>
          </div>
        </Section>
      ) : null}

      {!showCatalogSkeleton && !showCatalogError && songs.length > 0 ? (
        <>
          <Section title="Recently added" hint="Latest songs from your cached catalog">
            <div className="card-row card-row--compact">
              {latest.map((song) => (
                <HomeSongCard key={song.id} song={song} onOpenSong={onOpenSong} />
              ))}
            </div>
          </Section>

          <Section title="Featured for this session" hint="A stable pick — changes when your catalog changes">
            <div className="catalog-toolbar-row" style={{ marginBottom: 12 }}>
              <label className="sort-control">
                <span>Featured sort</span>
                <select
                  value={featuredSort}
                  onChange={(event) => setFeaturedSort(event.target.value as SongSort)}
                >
                  {FEATURED_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="catalog-count">{featured.length} shown</span>
            </div>
            <div className="card-row card-row--compact">
              {featured.map((song) => (
                <HomeSongCard key={song.id} song={song} onOpenSong={onOpenSong} />
              ))}
            </div>
          </Section>

          {themes.map((theme) => (
            <Section
              key={theme.id}
              title={theme.label}
              hint={`Mood rail · ${theme.songs.length} matches in your catalog`}
            >
              <div className="card-row card-row--compact">
                {theme.songs.slice(0, 8).map((song) => (
                  <HomeSongCard key={song.id} song={song} onOpenSong={onOpenSong} />
                ))}
              </div>
            </Section>
          ))}
        </>
      ) : null}
    </div>
  )
}

