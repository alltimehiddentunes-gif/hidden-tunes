import { memo, useCallback, useMemo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortAlbumsList, sortArtistsList, sortSongsList } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool, resolveAlbumDisplayArtist, resolveSongsForAlbum } from '../../lib/catalogIndexes'
import {
  formatSongCardSecondary,
  normalizeCatalogArtistLabel,
  normalizeCatalogDisplayText,
  formatSongCountLabel,
} from '../../lib/catalogDisplayText'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import { resolveRecentlyPlayedSongs } from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import {
  buildGenreTiles,
  buildMoodVibeCards,
  buildNewReleaseCards,
  buildPopularChartCards,
} from '../../lib/music/musicPageSections'
import type { MusicSectionId } from '../../lib/music/types'
import { createMusicGenreIntent, getMusicGenreByLabelOrAlias } from '../../lib/musicGenres'
import { MusicArt } from './MusicArt'
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
  onNavigateDownloads?: () => void
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  onNavigateDownloads,
}: MusicDiscoverPageProps) {
  const { recentlyPlayed } = useMusicLocalState()
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

  const recentSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 8),
    [indexes.songsById, recentlyPlayed],
  )

  const sortedSongs = useMemo(() => sortSongsList(songs, 'latest'), [songs])
  const discoverSongs = useMemo(() => sortedSongs.slice(0, 8), [sortedSongs])

  const newReleases = useMemo(
    () => buildNewReleaseCards(songs, albums, indexes, 10),
    [albums, indexes, songs],
  )

  const discoverAlbums = useMemo(() => {
    const fromCatalog = sortAlbumsList(albums, 'latest')
    if (fromCatalog.length > 0) return fromCatalog.slice(0, 10)

    const seen = new Set<string>()
    const derived: ApiAlbum[] = []
    for (const song of sortedSongs) {
      const key = (song.albumId || song.album.trim().toLowerCase() || '').trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      derived.push({
        id: song.albumId || `album-derived-${key}`,
        title: song.album || song.title,
        artwork: song.artwork,
        releaseYear: null,
        createdAt: song.createdAt,
        artistId: song.artistId,
      })
      if (derived.length >= 10) break
    }
    return derived
  }, [albums, sortedSongs])

  const chartCards = useMemo(
    () => buildPopularChartCards(songs, indexes, 6),
    [indexes, songs],
  )

  const moodCards = useMemo(() => buildMoodVibeCards(songs, 8), [songs])
  const genreTiles = useMemo(
    () => buildGenreTiles(indexes, recentlyPlayed, 12),
    [indexes, recentlyPlayed],
  )

  const featuredArtists = useMemo(() => {
    const ranked = sortArtistsList(artists, 'tracks')
    if (ranked.length > 0) return ranked.slice(0, 10)

    const seen = new Set<string>()
    const derived: ApiArtist[] = []
    for (const song of sortedSongs) {
      const key = (song.artistId || song.artist.trim().toLowerCase() || '').trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      derived.push({
        id: song.artistId || `artist-derived-${key}`,
        name: song.artist,
        artwork: song.artwork,
        songCount: 1,
        tracks: [song],
      })
      if (derived.length >= 10) break
    }
    return derived
  }, [artists, sortedSongs])
  const catalogError = showCatalogError ? error : null

  return (
    <div className="music-discover music-discover--product" aria-label="Music discover">
      <header className="music-discover-page-header music-discover-page-header--compact">
        <div>
          <h1 className="music-discover-page-title">Music</h1>
          <p className="music-discover-page-subtitle">
            Songs, albums, artists, and discovery from your catalog.
          </p>
        </div>
        <div className="music-discover-quick-links" aria-label="Music shortcuts">
          <button type="button" className="music-discover-quick-link" onClick={onNavigateLiked}>
            Liked
          </button>
          <button type="button" className="music-discover-quick-link" onClick={() => onSectionChange('recent')}>
            Recent
          </button>
          <button type="button" className="music-discover-quick-link" onClick={onNavigatePlaylists}>
            Scenes
          </button>
          {onNavigateDownloads ? (
            <button type="button" className="music-discover-quick-link" onClick={onNavigateDownloads}>
              Downloads
            </button>
          ) : null}
        </div>
      </header>

      {recentSongs.length > 0 ? (
        <MusicPageSection
          title="Continue Listening"
          hint="From this device"
          onViewAll={() => onSectionChange('recent')}
        >
          <div className="music-discover-song-list music-discover-song-list--compact" role="list">
            {recentSongs.map((song) => {
              const duration = formatDuration(song.durationSeconds)
              return (
                <button
                  key={`recent-${song.id}`}
                  type="button"
                  className="music-discover-song-row"
                  role="listitem"
                  onClick={() => playFromQueue(song, recentSongs, 'Continue Listening')}
                  aria-label={`Play ${song.title} by ${song.artist}`}
                >
                  <MusicArt src={song.artwork} seed={song.id} label={song.title} size="list" />
                  <span className="music-discover-song-row-meta">
                    <strong>{normalizeCatalogDisplayText(song.title) ?? song.title}</strong>
                    <span>
                      {formatSongCardSecondary({
                        artist: song.artist,
                        album: song.album,
                      }) ??
                        normalizeCatalogArtistLabel(song.artist, {
                          allowUnknownFallback: true,
                        })}
                    </span>
                  </span>
                  {duration ? <time className="music-discover-song-row-duration">{duration}</time> : null}
                </button>
              )
            })}
          </div>
        </MusicPageSection>
      ) : null}

      {discoverSongs.length > 0 ? (
        <MusicPageSection
          title="Songs"
          hint="Playable tracks from your catalog"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
          onViewAll={() => onSectionChange('songs')}
        >
          <div className="music-discover-song-list" role="list">
            {discoverSongs.map((song) => {
              const duration = formatDuration(song.durationSeconds)
              return (
                <button
                  key={song.id}
                  type="button"
                  className="music-discover-song-row"
                  role="listitem"
                  onClick={() => playFromQueue(song, sortedSongs, 'Songs')}
                  aria-label={`Play ${song.title} by ${song.artist}`}
                >
                  <MusicArt src={song.artwork} seed={song.id} label={song.title} size="list" />
                  <span className="music-discover-song-row-meta">
                    <strong>{normalizeCatalogDisplayText(song.title) ?? song.title}</strong>
                    <span>
                      {formatSongCardSecondary({
                        artist: song.artist,
                        album: song.album,
                      }) ??
                        normalizeCatalogArtistLabel(song.artist, {
                          allowUnknownFallback: true,
                        })}
                    </span>
                  </span>
                  {duration ? <time className="music-discover-song-row-duration">{duration}</time> : null}
                </button>
              )
            })}
          </div>
        </MusicPageSection>
      ) : showCatalogSkeleton || catalogError ? (
        <MusicPageSection
          title="Songs"
          hint="Playable tracks from your catalog"
          loading={showCatalogSkeleton}
          error={catalogError}
          onRetry={retry}
        >
          {null}
        </MusicPageSection>
      ) : null}

      {newReleases.length > 0 ? (
        <MusicPageSection
          title="New Releases"
          hint="Fresh from your catalog"
          onViewAll={() => onSectionChange('new-releases')}
        >
          <div className="music-discover-release-rail music-discover-release-rail--dense">
            {newReleases.map((release) => (
              <article key={release.id} className="music-discover-release-card">
                <button
                  type="button"
                  className="music-discover-release-hit"
                  onClick={() => {
                    if (release.kind === 'album' && release.albumId) {
                      const album = albums.find((entry) => String(entry.id) === String(release.albumId))
                      if (album) {
                        onOpenAlbum(album)
                        return
                      }
                    }
                    playFromQueue(release.song, release.queue, release.queueTitle)
                  }}
                  aria-label={
                    release.kind === 'album'
                      ? `Open album ${release.title}`
                      : `Play ${release.title} by ${release.artist}`
                  }
                >
                  <MusicArt src={release.artworkUrl} seed={release.id} label={release.title} size="rail" />
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

      {discoverAlbums.length > 0 ? (
        <MusicPageSection
          title="Albums"
          hint="Browse by release"
          onViewAll={() => onSectionChange('albums')}
        >
          <div className="music-discover-album-rail">
            {discoverAlbums.map((album) => {
              const albumSongs = resolveSongsForAlbum(
                album,
                indexes.songsByAlbumId,
                indexes.songsByAlbumName,
                indexes.artistNames,
              )
              const artistName =
                normalizeCatalogArtistLabel(
                  resolveAlbumDisplayArtist(album, albumSongs, indexes.artistNames),
                ) ??
                normalizeCatalogArtistLabel(
                  indexes.artistNames.get(album.artistId ?? '') ?? null,
                )
              return (
                <button
                  key={album.id}
                  type="button"
                  className="music-discover-album-chip"
                  onClick={() => onOpenAlbum(album)}
                  aria-label={`Open album ${album.title}`}
                >
                  <MusicArt src={album.artwork} seed={album.id} label={album.title} size="rail" />
                  <strong>{normalizeCatalogDisplayText(album.title) ?? album.title}</strong>
                  <span>
                    {artistName ?? 'Unknown artist'}
                    {album.releaseYear ? ` · ${album.releaseYear}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </MusicPageSection>
      ) : null}

      {featuredArtists.length > 0 ? (
        <MusicPageSection
          title="Artists"
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
                <MusicArt src={artist.artwork} seed={artist.id} label={artist.name} variant="circle" size="rail" />
                <strong>
                  {normalizeCatalogArtistLabel(artist.name, {
                    allowUnknownFallback: true,
                  })}
                </strong>
                {formatSongCountLabel(artist.songCount, { noun: 'song', omitZero: true }) ? (
                  <span>
                    {formatSongCountLabel(artist.songCount, {
                      noun: 'song',
                      omitZero: true,
                    })}
                  </span>
                ) : null}
              </button>
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
          <div className="music-discover-genre-grid music-discover-genre-grid--editorial">
            {genreTiles.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className="music-discover-genre-tile"
                onClick={() => {
                  const definition = getMusicGenreByLabelOrAlias(genre.label)
                  onBrowseSearch(definition ? createMusicGenreIntent(definition.slug) : genre.label)
                }}
                aria-label={`Browse ${genre.label}`}
              >
                <span className="music-discover-genre-fallback" aria-hidden="true">
                  {genre.label.slice(0, 1)}
                </span>
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
          onViewAll={() => onSectionChange('moods')}
        >
          <div className="music-discover-mood-rail music-discover-mood-rail--dense">
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

      {chartCards.length > 0 ? (
        <MusicPageSection
          title="Popular on Hidden Tunes"
          hint="Fresh catalogue picks — not an official chart"
          onViewAll={() => onSectionChange('top-charts')}
        >
          <div className="music-discover-chart-rail music-discover-chart-rail--dense">
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
    </div>
  )
})
