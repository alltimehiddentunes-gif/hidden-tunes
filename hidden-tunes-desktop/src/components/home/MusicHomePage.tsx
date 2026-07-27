import { memo, useCallback, useMemo, type ReactNode } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool } from '../../lib/catalogIndexes'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  buildEmotionalWorldCards,
  buildGenreDiscoveryCards,
  buildHiddenGemSongs,
  buildMusicHeroContent,
  buildPersonalMixes,
  resolveContinueSongs,
  resolveRecentlyPlayedSongs,
} from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { setPendingMusicResumeSeconds } from '../../lib/music/musicPlaybackSession'
import { ArtworkImage } from '../ArtworkImage'

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

type HomeNavKey =
  | 'home'
  | 'music'
  | 'radio'
  | 'podcasts'
  | 'audiobooks'
  | 'motivationals'
  | 'lectures'
  | 'tv'
  | 'sports'
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

type MusicHomePageProps = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  artistNames: Map<string, string>
  indexes: CatalogIndexes
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  error: string | null
  retry: () => void
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: HomeNavKey) => void
  onBrowseSearch: (query: string) => void
}

const FAMILY_HIGHLIGHTS = [
  { navKey: 'radio' as const, label: 'Radio', subtitle: 'Live stations' },
  { navKey: 'podcasts' as const, label: 'Podcasts', subtitle: 'Shows and episodes' },
  { navKey: 'audiobooks' as const, label: 'Audiobooks', subtitle: 'Books and chapters' },
  { navKey: 'motivationals' as const, label: 'Motivationals', subtitle: 'Focus and drive' },
  { navKey: 'lectures' as const, label: 'Lectures', subtitle: 'Learn in depth' },
  { navKey: 'tv' as const, label: 'TV', subtitle: 'Live channels' },
  { navKey: 'sports' as const, label: 'Sports', subtitle: 'Fixtures and matches' },
]

function progressPercent(position: number, duration: number | null) {
  if (!duration || duration <= 0) return 0
  return Math.min(100, Math.round((position / duration) * 100))
}

const MusicHomeSection = memo(function MusicHomeSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  onViewAll,
  prominence = 'default',
  children,
}: {
  title: string
  hint?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onViewAll?: () => void
  prominence?: 'default' | 'primary' | 'compact'
  children: ReactNode
}) {
  return (
    <section
      className={`music-home-section music-home-section--${prominence}`}
      aria-labelledby={`music-home-${title.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <header className="music-home-section-header">
        <div>
          <h2 id={`music-home-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
          {hint ? <p className="music-home-section-hint">{hint}</p> : null}
        </div>
        {onViewAll ? (
          <button type="button" className="music-home-view-all" onClick={onViewAll}>
            View all
          </button>
        ) : null}
      </header>
      {loading ? (
        <div className="music-home-skeleton" aria-busy="true" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="music-home-skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="music-home-section-error" role="alert">
          <p>This section could not be loaded.</p>
          {onRetry ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </section>
  )
})

export const MusicHomePage = memo(function MusicHomePage({
  songs,
  albums,
  artists,
  artistNames: _artistNames,
  indexes,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  onBrowseSearch: _onBrowseSearch,
}: MusicHomePageProps) {
  void _artistNames
  void _onBrowseSearch

  const { continueListening, recentlyPlayed } = useMusicLocalState()
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

  const continueRows = useMemo(
    () => resolveContinueSongs(continueListening, indexes.songsById, 8),
    [continueListening, indexes.songsById],
  )

  const continueSongIds = useMemo(
    () => new Set(continueRows.map(({ song }) => song.id)),
    [continueRows],
  )

  const featured = useMemo(
    () => buildMusicHeroContent(
      songs,
      albums,
      artists,
      indexes,
      continueListening,
      recentlyPlayed,
    ),
    [albums, artists, continueListening, indexes, recentlyPlayed, songs],
  )

  const personalMixes = useMemo(
    () => buildPersonalMixes(songs, artists, indexes, recentlyPlayed).slice(0, 3),
    [artists, indexes, recentlyPlayed, songs],
  )

  const recentSongs = useMemo(() => {
    const resolved = resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 16)
    return resolved.filter((song) => !continueSongIds.has(song.id)).slice(0, 8)
  }, [continueSongIds, indexes.songsById, recentlyPlayed])

  const genreCards = useMemo(
    () => buildGenreDiscoveryCards(indexes, recentlyPlayed, 8),
    [indexes, recentlyPlayed],
  )

  const emotionalWorlds = useMemo(
    () => buildEmotionalWorldCards(songs, 6),
    [songs],
  )

  const hiddenGems = useMemo(
    () => buildHiddenGemSongs(songs, recentlyPlayed, 10),
    [recentlyPlayed, songs],
  )

  const catalogError = showCatalogError ? error : null
  const showCatalogFallback = showCatalogSkeleton || Boolean(catalogError)

  const featuredIsContinue = Boolean(
    featured
    && continueRows[0]
    && featured.song.id === continueRows[0].song.id,
  )

  return (
    <div className="music-home music-home--organised" aria-label="Home">
      <header className="music-home-page-header">
        <h1 className="music-home-page-title">Home</h1>
        <p className="music-home-page-subtitle">Music-first listening, organised for desktop</p>
      </header>

      {continueRows.length > 0 ? (
        <MusicHomeSection
          title="Continue Listening"
          hint="Resume unfinished tracks"
          prominence="primary"
        >
          <div className="music-home-continue-grid">
            {continueRows.map(({ entry, song }) => (
              <article key={entry.songId} className="music-home-continue-card">
                <button
                  type="button"
                  className="music-home-continue-hit"
                  onClick={() => {
                    setPendingMusicResumeSeconds(entry.positionSeconds)
                    playFromQueue(song, [song], 'Continue Listening')
                  }}
                  aria-label={`Resume ${song.title} by ${song.artist}`}
                >
                  <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                  <div className="music-home-continue-copy">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                    <div
                      className="music-home-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={entry.durationSeconds ?? 100}
                      aria-valuenow={Math.round(entry.positionSeconds)}
                      aria-label="Playback progress"
                    >
                      <div
                        className="music-home-progress-fill"
                        style={{ width: `${progressPercent(entry.positionSeconds, entry.durationSeconds)}%` }}
                      />
                    </div>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {featured && !featuredIsContinue ? (
        <MusicHomeSection title="Featured" hint={featured.subtitle} prominence="primary">
          <article className="music-home-featured-banner">
            <button
              type="button"
              className="music-home-featured-hit"
              onClick={() => playFromQueue(featured.song, featured.queue, featured.queueTitle)}
              aria-label={`Play ${featured.title}`}
            >
              <ArtworkImage
                src={featured.artworkUrl}
                alt=""
                seed={featured.song.id}
                label={featured.title}
                priority
              />
              <div className="music-home-featured-copy">
                <strong>{featured.title}</strong>
                <span>{featured.subtitle}</span>
              </div>
            </button>
            {featured.secondaryType === 'album' && featured.secondaryId ? (
              <button
                type="button"
                className="music-home-featured-secondary"
                onClick={() => {
                  const album = albums.find((entry) => entry.id === featured.secondaryId)
                  if (album) onOpenAlbum(album)
                }}
              >
                View album
              </button>
            ) : null}
            {featured.secondaryType === 'artist' && featured.secondaryId ? (
              <button
                type="button"
                className="music-home-featured-secondary"
                onClick={() => {
                  const artist = artists.find((entry) => entry.id === featured.secondaryId)
                  if (artist) onOpenArtist(artist)
                }}
              >
                View artist
              </button>
            ) : null}
          </article>
        </MusicHomeSection>
      ) : null}

      {recentSongs.length > 0 ? (
        <MusicHomeSection
          title="Recently Played"
          hint="Your listening history"
          onViewAll={() => onNavigateNav('recent')}
        >
          <div className="music-home-song-rail">
            {recentSongs.map((song) => (
              <button
                key={`recent-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, recentSongs, 'Recently Played')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {personalMixes.length > 0 ? (
        <MusicHomeSection title="Recommended for You" hint="Mixes from your catalog and history">
          <div className="music-home-rail">
            {personalMixes.map((mix) => (
              <article key={mix.id} className="music-home-mix-card">
                <button
                  type="button"
                  className="music-home-mix-hit"
                  onClick={() => playFromQueue(mix.tracks[0], mix.tracks, mix.title)}
                  aria-label={`Play ${mix.title}`}
                >
                  <ArtworkImage
                    src={mix.tracks[0]?.artwork ?? null}
                    alt=""
                    seed={mix.id}
                    label={mix.title}
                  />
                  <div className="music-home-mix-copy">
                    <h3>{mix.title}</h3>
                    <p>{mix.subtitle}</p>
                    <span>{mix.tracks.length} songs</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </MusicHomeSection>
      ) : showCatalogFallback ? (
        <MusicHomeSection
          title="Recommended for You"
          hint="Mixes from your catalog and history"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
        >
          {null}
        </MusicHomeSection>
      ) : null}

      {genreCards.length > 0 ? (
        <MusicHomeSection title="Genre Spotlights" hint="Browse by sound" onViewAll={() => onNavigateNav('music')}>
          <div className="music-home-song-rail">
            {genreCards.map((genre) => {
              const genreSongs = (indexes.songsByGenre.get(genre.id) ?? []).slice(0, 12)
              return (
                <button
                  key={genre.id}
                  type="button"
                  className="music-home-song-card"
                  onClick={() => {
                    if (genreSongs[0]) playFromQueue(genreSongs[0], genreSongs, genre.label)
                  }}
                  aria-label={`Play ${genre.label}`}
                >
                  <ArtworkImage src={genre.artworkUrl} alt="" seed={genre.id} label={genre.label} />
                  <strong>{genre.label}</strong>
                  <span>{genre.count} tracks</span>
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {emotionalWorlds.length > 0 ? (
        <MusicHomeSection
          title="Emotional Worlds"
          hint="Mood-led listening"
          onViewAll={() => onNavigateNav('worlds')}
        >
          <div className="music-home-rail">
            {emotionalWorlds.map((lane) => {
              const laneTracks = lane.songIds
                .map((id) => indexes.songsById.get(id))
                .filter((song): song is ApiSong => Boolean(song))
                .slice(0, 12)
              if (laneTracks.length === 0) return null
              return (
                <article key={lane.id} className="music-home-mix-card">
                  <button
                    type="button"
                    className="music-home-mix-hit"
                    onClick={() => playFromQueue(laneTracks[0], laneTracks, lane.label)}
                    aria-label={`Play ${lane.label}`}
                  >
                    <ArtworkImage
                      src={laneTracks[0]?.artwork ?? null}
                      alt=""
                      seed={lane.id}
                      label={lane.label}
                    />
                    <div className="music-home-mix-copy">
                      <h3>{lane.label}</h3>
                      <p>{lane.subtitle}</p>
                      <span>{lane.trackCount} songs</span>
                    </div>
                  </button>
                </article>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {hiddenGems.length > 0 ? (
        <MusicHomeSection
          title="Hidden Gems"
          hint="Quality tracks you have not played yet"
          loading={showCatalogSkeleton && hiddenGems.length === 0}
          error={catalogError && hiddenGems.length === 0 ? catalogError : null}
          onRetry={retry}
        >
          <div className="music-home-song-rail">
            {hiddenGems.map((song) => (
              <button
                key={`gem-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, hiddenGems, 'Hidden Gems')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      <MusicHomeSection title="More to Explore" hint="Radio, podcasts, and learning" prominence="compact">
        <div className="music-home-jump-row">
          {FAMILY_HIGHLIGHTS.map((link) => (
            <button
              key={link.navKey}
              type="button"
              className="music-home-jump-chip"
              onClick={() => onNavigateNav(link.navKey)}
            >
              <strong>{link.label}</strong>
              <span>{link.subtitle}</span>
            </button>
          ))}
        </div>
      </MusicHomeSection>
    </div>
  )
})
