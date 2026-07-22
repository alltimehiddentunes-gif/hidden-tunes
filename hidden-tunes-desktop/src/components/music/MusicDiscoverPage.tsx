import { memo, useCallback, useMemo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortArtistsList } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool } from '../../lib/catalogIndexes'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  buildGenreTiles,
  buildMoodVibeCards,
  buildNewReleaseCards,
  buildPopularChartCards,
} from '../../lib/music/musicPageSections'
import type { MusicSectionId } from '../../lib/music/types'
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

const BROWSE_LINKS: Array<{ id: MusicSectionId; label: string; subtitle: string }> = [
  { id: 'songs', label: 'Songs', subtitle: 'Full catalog tracks' },
  { id: 'albums', label: 'Albums', subtitle: 'Browse by release' },
  { id: 'playlists', label: 'Playlists', subtitle: 'Editorial collections' },
]

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
  onOpenAlbum: _onOpenAlbum,
  onSectionChange,
  onBrowseSearch,
  onNavigateLiked: _onNavigateLiked,
  onNavigatePlaylists: _onNavigatePlaylists,
}: MusicDiscoverPageProps) {
  void _onOpenAlbum
  void _onNavigateLiked
  void _onNavigatePlaylists

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

  const newReleases = useMemo(
    () => buildNewReleaseCards(songs, albums, indexes, 12),
    [albums, indexes, songs],
  )

  const featuredRelease = newReleases[0] ?? null

  const chartCards = useMemo(
    () => buildPopularChartCards(songs, indexes, 6),
    [indexes, songs],
  )

  const moodCards = useMemo(() => buildMoodVibeCards(songs, 8), [songs])
  const genreTiles = useMemo(
    () => buildGenreTiles(indexes, [], 14),
    [indexes],
  )

  const featuredArtists = useMemo(() => sortArtistsList(artists, 'tracks').slice(0, 10), [artists])
  const catalogError = showCatalogError ? error : null

  return (
    <div className="music-discover" aria-label="Music discover">
      <header className="music-discover-page-header">
        <div>
          <p className="music-discover-page-eyebrow">Music</p>
          <h1 className="music-discover-page-title">Browse the catalog</h1>
          <p className="music-discover-page-subtitle">
            New releases, charts, genres, moods, and deep browse — not your listening history.
          </p>
        </div>
        {featuredRelease ? (
          <article className="music-discover-featured-release">
            <button
              type="button"
              className="music-discover-featured-release-hit"
              onClick={() => playFromQueue(featuredRelease.song, featuredRelease.queue, featuredRelease.queueTitle)}
              aria-label={`Play ${featuredRelease.title} by ${featuredRelease.artist}`}
            >
              <ArtworkImage
                src={featuredRelease.artworkUrl}
                alt=""
                seed={featuredRelease.id}
                label={featuredRelease.title}
                priority
              />
              <div className="music-discover-featured-release-copy">
                <span className="music-discover-featured-release-badge">Featured release</span>
                <strong>{featuredRelease.title}</strong>
                <span>{featuredRelease.artist}</span>
              </div>
            </button>
          </article>
        ) : null}
      </header>

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
      ) : showCatalogSkeleton || catalogError ? (
        <MusicPageSection
          title="New Releases"
          hint="Fresh from your catalog"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
        >
          {null}
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

      {moodCards.length > 0 ? (
        <MusicPageSection
          title="Moods"
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

      <MusicPageSection title="Deep browse" hint="Open full Songs, Albums, and Playlists">
        <div className="music-discover-browse-links">
          {BROWSE_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="music-discover-browse-link"
              onClick={() => onSectionChange(link.id)}
            >
              <strong>{link.label}</strong>
              <span>{link.subtitle}</span>
            </button>
          ))}
        </div>
      </MusicPageSection>
    </div>
  )
})
