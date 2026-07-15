import { memo, useCallback, useMemo, type ReactNode } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortAlbumsList, sortArtistsList, sortSongsList } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool } from '../../lib/catalogIndexes'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  EDITORIAL_PLAYLIST_SPECS,
  resolveEditorialPlaylistTracks,
} from '../../lib/home/editorialPlaylists'
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
  onNavigateNav: (navKey: 'home' | 'radio' | 'podcasts' | 'audiobooks' | 'tv' | 'worlds' | 'search' | 'library' | 'liked' | 'recent' | 'downloads' | 'playlists' | 'artists' | 'albums' | 'premium' | 'settings') => void
  onBrowseSearch: (query: string) => void
}

const EXPLORE_MORE_LINKS = [
  { navKey: 'radio', label: 'Radio', subtitle: 'Live stations worldwide' },
  { navKey: 'podcasts', label: 'Podcasts', subtitle: 'Shows and episodes' },
  { navKey: 'audiobooks', label: 'Audiobooks', subtitle: 'Long-form listening' },
  { navKey: 'tv', label: 'TV', subtitle: 'Live channels' },
  { navKey: 'worlds', label: 'Emotional Worlds', subtitle: 'Scene-based discovery' },
] as const

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return null
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

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
  children,
}: {
  title: string
  hint?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onViewAll?: () => void
  children: ReactNode
}) {
  return (
    <section className="music-home-section" aria-labelledby={`music-home-${title.replace(/\s+/g, '-').toLowerCase()}`}>
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
  artistNames,
  indexes,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  onBrowseSearch,
}: MusicHomePageProps) {
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

  const hero = useMemo(
    () => buildMusicHeroContent(songs, albums, artists, indexes, continueListening, recentlyPlayed),
    [albums, artists, continueListening, indexes, recentlyPlayed, songs],
  )

  const continueRows = useMemo(
    () => resolveContinueSongs(continueListening, indexes.songsById, 8),
    [continueListening, indexes.songsById],
  )

  const personalMixes = useMemo(
    () => buildPersonalMixes(songs, artists, indexes, recentlyPlayed),
    [artists, indexes, recentlyPlayed, songs],
  )

  const recentSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 16),
    [indexes.songsById, recentlyPlayed],
  )

  const recentlyAddedSongs = useMemo(() => sortSongsList(songs, 'latest').slice(0, 12), [songs])
  const popularArtists = useMemo(() => sortArtistsList(artists, 'tracks').slice(0, 16), [artists])
  const freshAlbums = useMemo(() => sortAlbumsList(albums, 'latest').slice(0, 16), [albums])
  const genreCards = useMemo(
    () => buildGenreDiscoveryCards(indexes, recentlyPlayed, 12),
    [indexes, recentlyPlayed, songs],
  )
  const emotionalLanes = useMemo(() => buildEmotionalWorldCards(songs, 8), [songs])
  const hiddenGems = useMemo(
    () => buildHiddenGemSongs(songs, recentlyPlayed, 12),
    [recentlyPlayed, songs],
  )

  const editorialCollections = useMemo(() => {
    return EDITORIAL_PLAYLIST_SPECS.map((spec) => {
      const tracks = resolveEditorialPlaylistTracks(songs, spec.sceneId).slice(0, 16)
      return tracks.length >= 4 ? { spec, tracks } : null
    }).filter((entry): entry is { spec: typeof EDITORIAL_PLAYLIST_SPECS[number]; tracks: ApiSong[] } => Boolean(entry))
  }, [songs])

  const handleHeroSecondary = useCallback(() => {
    if (!hero?.secondaryType || !hero.secondaryId) return
    if (hero.secondaryType === 'artist') {
      const artist = artists.find((entry) => entry.id === hero.secondaryId)
      if (artist) onOpenArtist(artist)
      return
    }
    const album = albums.find((entry) => entry.id === hero.secondaryId)
    if (album) onOpenAlbum(album)
  }, [albums, artists, hero, onOpenAlbum, onOpenArtist])

  const catalogError = showCatalogError ? error : null

  return (
    <div className="music-home" aria-label="Music home">
      {hero ? (
        <section className="music-home-hero" aria-label="Featured music">
          <div className="music-home-hero-art">
            <ArtworkImage
              src={hero.artworkUrl}
              alt=""
              seed={hero.song.id}
              label={hero.title}
              priority
            />
            <span className="music-home-hero-veil" aria-hidden="true" />
          </div>
          <div className="music-home-hero-copy">
            <p className="music-home-hero-eyebrow">{hero.queueTitle}</p>
            <h1>{hero.title}</h1>
            <p className="music-home-hero-subtitle">{hero.subtitle}</p>
            <div className="music-home-hero-actions">
              <button
                type="button"
                className="psd-btn psd-btn--gold"
                onClick={() => {
                  const progress = continueListening.find((entry) => entry.songId === hero.song.id)
                  if (progress) {
                    setPendingMusicResumeSeconds(progress.positionSeconds)
                  }
                  playFromQueue(hero.song, hero.queue, hero.queueTitle)
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </button>
              {hero.secondaryType && hero.secondaryLabel ? (
                <button type="button" className="psd-btn psd-btn--ghost" onClick={handleHeroSecondary}>
                  {hero.secondaryType === 'artist' ? 'View artist' : 'View album'}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : showCatalogSkeleton ? (
        <div className="music-home-hero music-home-hero--skeleton" aria-hidden="true" />
      ) : null}

      {continueRows.length > 0 ? (
        <MusicHomeSection title="Pick up where you left off" hint="Continue listening">
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

      {personalMixes.length > 0 ? (
        <MusicHomeSection title="Made for your listening" hint="Mixes from your catalog and history">
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
      ) : null}

      {recentSongs.length > 0 ? (
        <MusicHomeSection
          title="Recently played"
          hint="Your music listening history"
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

      <MusicHomeSection
        title="Recently added"
        hint="Fresh songs in your catalog"
        loading={showCatalogSkeleton}
        error={catalogError}
        onRetry={retry}
        onViewAll={() => onNavigateNav('search')}
      >
        {recentlyAddedSongs.length > 0 ? (
          <div className="music-home-song-rail">
            {recentlyAddedSongs.map((song) => (
              <button
                key={`added-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, recentlyAddedSongs, 'Recently Added')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        ) : null}
      </MusicHomeSection>

      <MusicHomeSection
        title="Artists on repeat"
        hint="Popular voices in your library"
        loading={showCatalogSkeleton}
        error={catalogError}
        onRetry={retry}
        onViewAll={() => onNavigateNav('artists')}
      >
        {popularArtists.length > 0 ? (
          <div className="music-home-artist-grid">
            {popularArtists.map((artist) => (
              <button
                key={artist.id}
                type="button"
                className="music-home-artist-card"
                onClick={() => onOpenArtist(artist)}
                aria-label={`Open ${artist.name}`}
              >
                <ArtworkImage
                  src={artist.artwork}
                  alt=""
                  seed={artist.id}
                  label={artist.name}
                  variant="circle"
                />
                <strong>{artist.name}</strong>
                <span>{artist.songCount} songs</span>
              </button>
            ))}
          </div>
        ) : null}
      </MusicHomeSection>

      <MusicHomeSection
        title="Fresh releases"
        hint="Recently added albums"
        loading={showCatalogSkeleton}
        error={catalogError}
        onRetry={retry}
        onViewAll={() => onNavigateNav('albums')}
      >
        {freshAlbums.length > 0 ? (
          <div className="music-home-album-grid">
            {freshAlbums.map((album) => {
              const artistName = album.artistId
                ? artistNames.get(album.artistId) ?? 'Unknown artist'
                : 'Unknown artist'
              return (
                <button
                  key={album.id}
                  type="button"
                  className="music-home-album-card"
                  onClick={() => onOpenAlbum(album)}
                  aria-label={`Open album ${album.title} by ${artistName}`}
                >
                  <ArtworkImage src={album.artwork} alt="" seed={album.id} label={album.title} />
                  <strong>{album.title}</strong>
                  <span>{artistName}</span>
                  {album.releaseYear ? <em>{album.releaseYear}</em> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </MusicHomeSection>

      {genreCards.length > 0 ? (
        <MusicHomeSection
          title="Explore your sound"
          hint="Genres from your catalog"
          onViewAll={() => onNavigateNav('search')}
        >
          <div className="music-home-genre-grid">
            {genreCards.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className="music-home-genre-card"
                onClick={() => onBrowseSearch(genre.label)}
                aria-label={`Browse ${genre.label}`}
              >
                {genre.artworkUrl ? (
                  <ArtworkImage src={genre.artworkUrl} alt="" seed={genre.id} label={genre.label} />
                ) : (
                  <span className="music-home-genre-fallback" aria-hidden="true">{genre.label.charAt(0)}</span>
                )}
                <div className="music-home-genre-copy">
                  <strong>{genre.label}</strong>
                  <span>{genre.count} songs</span>
                </div>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {emotionalLanes.length > 0 ? (
        <MusicHomeSection
          title="Music for how you feel"
          hint="Emotional listening lanes"
          onViewAll={() => onNavigateNav('worlds')}
        >
          <div className="music-home-mood-grid">
            {emotionalLanes.map((lane) => {
              const laneTracks = lane.songIds
                .map((id) => indexes.songsById.get(id))
                .filter((song): song is ApiSong => Boolean(song))
                .slice(0, 12)
              if (laneTracks.length === 0) return null
              return (
                <article key={lane.id} className={`music-home-mood-card music-home-mood-card--${lane.mood}`}>
                  <button
                    type="button"
                    className="music-home-mood-hit"
                    onClick={() => playFromQueue(laneTracks[0], laneTracks, lane.label)}
                    aria-label={`Play ${lane.label}`}
                  >
                    <ArtworkImage
                      src={laneTracks[0]?.artwork ?? null}
                      alt=""
                      seed={lane.id}
                      label={lane.label}
                    />
                    <div className="music-home-mood-copy">
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

      {editorialCollections.length > 0 ? (
        <MusicHomeSection title="Collections worth playing" hint="Curated mixes from your catalog">
          <div className="music-home-rail">
            {editorialCollections.map(({ spec, tracks }) => (
              <article key={spec.id} className="music-home-mix-card">
                <button
                  type="button"
                  className="music-home-mix-hit"
                  onClick={() => playFromQueue(tracks[0], tracks, spec.title)}
                  aria-label={`Play ${spec.title}`}
                >
                  <ArtworkImage src={tracks[0]?.artwork ?? null} alt="" seed={spec.id} label={spec.title} />
                  <div className="music-home-mix-copy">
                    <h3>{spec.title}</h3>
                    <p>{spec.description}</p>
                    <span>{tracks.length} songs · {formatDuration(tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0)) ?? '—'}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {hiddenGems.length > 0 ? (
        <MusicHomeSection title="Hidden gems worth hearing" hint="Quality tracks you have not played yet">
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

      <MusicHomeSection title="Explore more" hint="Other Hidden Tunes destinations">
        <div className="music-home-explore-grid">
          {EXPLORE_MORE_LINKS.map((link) => (
            <button
              key={link.navKey}
              type="button"
              className="music-home-explore-card"
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
