import { memo, useCallback, useMemo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortArtistsList } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool } from '../../lib/catalogIndexes'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  buildGenreTiles,
  buildMoodVibeCards,
  buildMusicDiscoverHero,
  buildMusicMix,
  buildNewReleaseCards,
  buildPopularChartCards,
  resolvePlaylistCount,
} from '../../lib/music/musicPageSections'
import type { MusicSectionId } from '../../lib/music/types'
import {
  buildHiddenGemSongs,
  buildPersonalMixes,
  resolveRecentlyPlayedSongs,
} from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { ArtworkImage } from '../ArtworkImage'
import { MusicPageSection } from './MusicPageSection'

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

type MusicDiscoverPageProps = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  error: string | null
  retry: () => void
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onSectionChange: (section: MusicSectionId) => void
  onBrowseSearch: (query: string) => void
  onNavigateLiked: () => void
  onNavigatePlaylists: () => void
}

export const MusicDiscoverPage = memo(function MusicDiscoverPage({
  songs,
  albums,
  artists,
  indexes,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onSectionChange,
  onBrowseSearch,
  onNavigateLiked,
  onNavigatePlaylists,
}: MusicDiscoverPageProps) {
  const { continueListening, recentlyPlayed } = useMusicLocalState()
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playFromQueue = useCallback(
    (song: ApiSong, queue: ApiSong[], queueTitle: string) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'discover', queueTitle, {
        seedType: 'discover',
        seedTracks: buildQueueSeedPool('discover', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const hero = useMemo(
    () => buildMusicDiscoverHero(songs, albums, artists, indexes, continueListening, recentlyPlayed),
    [albums, artists, continueListening, indexes, recentlyPlayed, songs],
  )

  const musicMix = useMemo(
    () => buildMusicMix(songs, artists, indexes, recentlyPlayed),
    [artists, indexes, recentlyPlayed, songs],
  )

  const newReleases = useMemo(
    () => buildNewReleaseCards(songs, albums, indexes, 12),
    [albums, indexes, songs],
  )

  const chartCards = useMemo(
    () => buildPopularChartCards(songs, indexes, 6),
    [indexes, songs],
  )

  const moodCards = useMemo(() => buildMoodVibeCards(songs, 8), [songs])
  const genreTiles = useMemo(
    () => buildGenreTiles(indexes, recentlyPlayed, 14),
    [indexes, recentlyPlayed],
  )

  const personalMixes = useMemo(
    () => buildPersonalMixes(songs, artists, indexes, recentlyPlayed).slice(0, 2),
    [artists, indexes, recentlyPlayed, songs],
  )

  const recentSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 12),
    [indexes.songsById, recentlyPlayed],
  )

  const featuredArtists = useMemo(() => sortArtistsList(artists, 'tracks').slice(0, 10), [artists])
  const hiddenGems = useMemo(
    () => buildHiddenGemSongs(songs, recentlyPlayed, 10),
    [recentlyPlayed, songs],
  )

  const playlistCount = resolvePlaylistCount()
  const catalogError = showCatalogError ? error : null

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

  return (
    <div className="music-discover" aria-label="Music discover">
      <div className="music-discover-hero-row">
        <section className="music-discover-hero" aria-label="Discover music">
          {hero ? (
            <>
              <div className="music-discover-hero-art">
                <ArtworkImage
                  src={hero.artworkUrl}
                  alt=""
                  seed={hero.song.id}
                  label={hero.title}
                  priority
                />
                <span className="music-discover-hero-veil" aria-hidden="true" />
              </div>
              <div className="music-discover-hero-copy">
                <p className="music-discover-hero-eyebrow">Discover Music</p>
                <h1>{hero.title}</h1>
                <p className="music-discover-hero-subtitle">{hero.subtitle}</p>
                <p className="music-discover-hero-brand" aria-hidden="true">Feel Every Sound</p>
                <div className="music-discover-hero-actions">
                  <button
                    type="button"
                    className="psd-btn psd-btn--gold"
                    onClick={() => playFromQueue(hero.song, hero.queue, hero.queueTitle)}
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
            </>
          ) : showCatalogSkeleton ? (
            <div className="music-discover-hero-skeleton" aria-hidden="true" />
          ) : null}
        </section>

        <aside className="music-discover-personal" aria-label="Personal music shortcuts">
          {musicMix ? (
            <div className="music-discover-mix-panel">
              <div className="music-discover-mix-art">
                <ArtworkImage
                  src={musicMix.tracks[0]?.artwork ?? null}
                  alt=""
                  seed={musicMix.id}
                  label={musicMix.title}
                />
              </div>
              <h2>My Music Mix</h2>
              <p>{musicMix.subtitle}</p>
              <button
                type="button"
                className="psd-btn psd-btn--gold music-discover-mix-play"
                onClick={() => playFromQueue(musicMix.tracks[0], musicMix.tracks, musicMix.title)}
                aria-label={`Play ${musicMix.title}`}
              >
                Play Mix
              </button>
            </div>
          ) : null}
          <div className="music-discover-quick-cards">
            <button type="button" className="music-discover-quick-card" onClick={onNavigateLiked}>
              <strong>Liked Songs</strong>
              <span>Browse your liked catalog</span>
            </button>
            <button type="button" className="music-discover-quick-card" onClick={onNavigatePlaylists}>
              <strong>Playlists</strong>
              <span>{playlistCount} editorial collections</span>
            </button>
          </div>
        </aside>
      </div>

      {newReleases.length > 0 ? (
        <MusicPageSection
          title="New Releases"
          hint="Fresh from your catalog"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
          onViewAll={() => onSectionChange('new-releases')}
        >
          <div className="music-discover-release-rail">
            {newReleases.map((release) => (
              <article key={release.id} className="music-discover-release-card">
                <button
                  type="button"
                  className="music-discover-release-hit"
                  onClick={() => playFromQueue(release.song, release.queue, release.queueTitle)}
                  aria-label={`Play ${release.title} by ${release.artist}`}
                >
                  <ArtworkImage src={release.artworkUrl} alt="" seed={release.id} label={release.title} />
                  <span className="music-discover-release-badge">New</span>
                  <div className="music-discover-release-copy">
                    <strong>{release.title}</strong>
                    <span>{release.artist}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {chartCards.length > 0 ? (
        <MusicPageSection
          title="Popular on Hidden Tunes"
          hint="Ranked from your catalog — not official national charts"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
          onViewAll={() => onSectionChange('top-charts')}
        >
          <div className="music-discover-chart-rail">
            {chartCards.map((chart) => (
              <article key={chart.id} className={`music-discover-chart-card music-discover-chart-card--${chart.accent}`}>
                <button
                  type="button"
                  className="music-discover-chart-hit"
                  onClick={() => playFromQueue(chart.tracks[0], chart.tracks, chart.title)}
                  aria-label={`Play ${chart.title}`}
                >
                  <h3>{chart.title}</h3>
                  <p>{chart.subtitle}</p>
                  <span>{chart.tracks.length} tracks</span>
                </button>
              </article>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {moodCards.length > 0 ? (
        <MusicPageSection
          title="Moods & Vibes"
          hint="Emotional lanes from your library"
          onViewAll={() => onSectionChange('genres-moods')}
        >
          <div className="music-discover-mood-rail">
            {moodCards.map((mood) => (
              <article key={mood.id} className={`music-discover-mood-card music-discover-mood-card--${mood.mood}`}>
                <button
                  type="button"
                  className="music-discover-mood-hit"
                  onClick={() => playFromQueue(mood.tracks[0], mood.tracks, mood.label)}
                  aria-label={`Play ${mood.label}`}
                >
                  <h3>{mood.label}</h3>
                  <p>{mood.subtitle}</p>
                </button>
              </article>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {genreTiles.length > 0 ? (
        <MusicPageSection
          title="Genres"
          hint="Explore your sound"
          onViewAll={() => onSectionChange('genres-moods')}
        >
          <div className="music-discover-genre-grid">
            {genreTiles.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className="music-discover-genre-tile"
                onClick={() => onBrowseSearch(genre.label)}
                aria-label={`Browse ${genre.label}`}
              >
                {genre.artworkUrl ? (
                  <ArtworkImage src={genre.artworkUrl} alt="" seed={genre.id} label={genre.label} />
                ) : (
                  <span className="music-discover-genre-fallback" aria-hidden="true">
                    {genre.label.slice(0, 1)}
                  </span>
                )}
                <span>{genre.label}</span>
              </button>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {personalMixes.length > 0 ? (
        <MusicPageSection title="Made for your listening" hint="Deterministic mixes from your history">
          <div className="music-discover-mix-rail">
            {personalMixes.map((mix) => (
              <article key={mix.id} className="music-discover-secondary-mix">
                <button
                  type="button"
                  className="music-discover-secondary-mix-hit"
                  onClick={() => playFromQueue(mix.tracks[0], mix.tracks, mix.title)}
                  aria-label={`Play ${mix.title}`}
                >
                  <ArtworkImage src={mix.tracks[0]?.artwork ?? null} alt="" seed={mix.id} label={mix.title} />
                  <div>
                    <strong>{mix.title}</strong>
                    <span>{mix.subtitle}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {recentSongs.length > 0 ? (
        <MusicPageSection
          title="Recently Played"
          onViewAll={() => onSectionChange('recent')}
        >
          <div className="music-discover-song-rail">
            {recentSongs.map((song) => (
              <button
                key={song.id}
                type="button"
                className="music-discover-song-chip"
                onClick={() => playFromQueue(song, recentSongs, 'Recently Played')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {featuredArtists.length > 0 ? (
        <MusicPageSection
          title="Featured Artists"
          onViewAll={() => onSectionChange('artists')}
        >
          <div className="music-discover-artist-rail">
            {featuredArtists.map((artist) => (
              <button
                key={artist.id}
                type="button"
                className="music-discover-artist-chip"
                onClick={() => onOpenArtist(artist)}
                aria-label={`Open ${artist.name}`}
              >
                <ArtworkImage src={artist.artwork} alt="" seed={artist.id} label={artist.name} variant="circle" />
                <strong>{artist.name}</strong>
              </button>
            ))}
          </div>
        </MusicPageSection>
      ) : null}

      {hiddenGems.length > 0 ? (
        <MusicPageSection title="Hidden gems worth hearing" hint="Unplayed tracks with strong artwork">
          <div className="music-discover-song-rail">
            {hiddenGems.map((song) => (
              <button
                key={song.id}
                type="button"
                className="music-discover-song-chip"
                onClick={() => playFromQueue(song, hiddenGems, 'Hidden gems')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicPageSection>
      ) : null}
    </div>
  )
})
