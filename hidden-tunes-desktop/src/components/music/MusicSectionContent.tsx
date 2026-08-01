import { memo, useCallback, useEffect, useMemo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortAlbumsList, sortArtistsList, sortSongsList } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool, resolveAlbumDisplayArtist, resolveSongsForAlbum } from '../../lib/catalogIndexes'
import {
  formatSongCardSecondary,
  normalizeCatalogArtistLabel,
  normalizeCatalogDisplayText,
} from '../../lib/catalogDisplayText'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  buildGenreTiles,
  buildMoodVibeCards,
  buildNewReleaseCards,
  buildPopularChartCards,
} from '../../lib/music/musicPageSections'
import type { MusicSectionId } from '../../lib/music/types'
import { createMusicGenreIntent, getMusicGenreByLabelOrAlias } from '../../lib/musicGenres'
import { resolveRecentlyPlayedSongs } from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { useMusicLikes } from '../../lib/home/useMusicLikes'
import { EDITORIAL_PLAYLIST_SPECS, resolveEditorialPlaylistTracks } from '../../lib/home/editorialPlaylists'
import { useCatalogWindow } from '../../lib/musicCatalog/useCatalogWindow'
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

type MusicSectionContentProps = {
  section: MusicSectionId
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  songsHasMore?: boolean
  albumsHasMore?: boolean
  artistsHasMore?: boolean
  songsPageLoading?: boolean
  albumsPageLoading?: boolean
  artistsPageLoading?: boolean
  pageError?: string | null
  loadMoreSongs?: () => void
  loadMoreAlbums?: () => void
  loadMoreArtists?: () => void
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onBrowseSearch: (query: string) => void
  /** Route to the real Electron Downloads destination (never a fake music stub). */
  onOpenDownloads?: () => void
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CatalogLoadMore({
  shown,
  hasMore,
  loading,
  onShowMore,
  error,
}: {
  shown: number
  hasMore: boolean
  loading?: boolean
  onShowMore: () => void
  error?: string | null
}) {
  if (!hasMore && !error) return null
  return (
    <div className="catalog-show-more" style={{ marginTop: 16 }}>
      <span className="catalog-show-more-count">
        {loading ? `Loading more… · ${shown} loaded` : `${shown} loaded`}
      </span>
      {error ? <span className="catalog-show-more-count">{error}</span> : null}
      {hasMore ? (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={onShowMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}

export const MusicSectionContent = memo(function MusicSectionContent({
  section,
  songs,
  albums,
  artists,
  indexes,
  songsHasMore = false,
  albumsHasMore = false,
  artistsHasMore = false,
  songsPageLoading = false,
  albumsPageLoading = false,
  artistsPageLoading = false,
  pageError = null,
  loadMoreSongs,
  loadMoreAlbums,
  loadMoreArtists,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onBrowseSearch,
  onOpenDownloads,
}: MusicSectionContentProps) {
  const { recentlyPlayed } = useMusicLocalState()
  const { likedSongIds } = useMusicLikes()
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  // Music Downloads always belongs to the real Downloads destination — never a stub catalogue.
  useEffect(() => {
    if (section === 'downloads' && onOpenDownloads) {
      onOpenDownloads()
    }
  }, [section, onOpenDownloads])

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
    () => buildNewReleaseCards(songs, albums, indexes, 24),
    [albums, indexes, songs],
  )
  const chartCards = useMemo(() => buildPopularChartCards(songs, indexes, 12), [indexes, songs])
  const moodCards = useMemo(() => buildMoodVibeCards(songs, 12), [songs])
  const genreTiles = useMemo(() => buildGenreTiles(indexes, recentlyPlayed, 20), [indexes, recentlyPlayed])
  const sortedSongs = useMemo(() => sortSongsList(songs, 'latest'), [songs])
  const sortedArtists = useMemo(() => sortArtistsList(artists, 'tracks'), [artists])
  const sortedAlbums = useMemo(() => sortAlbumsList(albums, 'latest'), [albums])
  const songWindow = useCatalogWindow(sortedSongs, `songs:${sortedSongs.length}:${songsHasMore}`, {
    hasServerMore: songsHasMore,
    serverLoading: songsPageLoading,
    onNeedServerMore: loadMoreSongs,
  })
  const artistWindow = useCatalogWindow(sortedArtists, `artists:${sortedArtists.length}:${artistsHasMore}`, {
    hasServerMore: artistsHasMore,
    serverLoading: artistsPageLoading,
    onNeedServerMore: loadMoreArtists,
  })
  const albumWindow = useCatalogWindow(sortedAlbums, `albums:${sortedAlbums.length}:${albumsHasMore}`, {
    hasServerMore: albumsHasMore,
    serverLoading: albumsPageLoading,
    onNeedServerMore: loadMoreAlbums,
  })
  const recentSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 32),
    [indexes.songsById, recentlyPlayed],
  )
  const likedSongs = useMemo(
    () => likedSongIds
      .map((songId) => indexes.songsById.get(songId))
      .filter((song): song is ApiSong => Boolean(song)),
    [indexes.songsById, likedSongIds],
  )

  const editorialPlaylists = useMemo(() => {
    return EDITORIAL_PLAYLIST_SPECS.map((spec) => {
      const tracks = resolveEditorialPlaylistTracks(songs, spec.sceneId).slice(0, 16)
      return tracks.length >= 4 ? { spec, tracks } : null
    }).filter((entry): entry is { spec: typeof EDITORIAL_PLAYLIST_SPECS[number]; tracks: ApiSong[] } => Boolean(entry))
  }, [songs])

  switch (section) {
    case 'new-releases':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>New Releases</h1>
            <p>Recently added albums and singles from your catalog.</p>
          </header>
          <div className="music-discover-release-rail music-discover-release-rail--wide">
            {newReleases.map((release) => (
              <article key={release.id} className="music-discover-release-card">
                <button
                  type="button"
                  className="music-discover-release-hit"
                  onClick={() => playFromQueue(release.song, release.queue, release.queueTitle)}
                  aria-label={`Play ${release.title} by ${release.artist}`}
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
        </div>
      )

    case 'top-charts':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Popular on Hidden Tunes</h1>
            <p>Genre and catalog popularity — not official national chart rankings.</p>
          </header>
          <div className="music-discover-chart-rail music-discover-chart-rail--wide">
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
        </div>
      )

    case 'genres-moods':
      return (
        <div className="music-section-page" data-music-genres="canonical">
          <header className="music-section-page-header">
            <h1>Genres</h1>
            <p>Open a dedicated catalogue for each genre. Results load from the live catalog — not a text search stub.</p>
          </header>
          <MusicPageSection title="Genre catalogue">
            <div className="music-discover-genre-grid music-discover-genre-grid--wide">
              {genreTiles.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  className="music-discover-genre-tile"
                  onClick={() => {
                    const definition = getMusicGenreByLabelOrAlias(genre.label)
                    onBrowseSearch(definition ? createMusicGenreIntent(definition.slug) : genre.label)
                  }}
                  aria-label={`Open ${genre.label} catalogue`}
                >
                  {genre.artworkUrl ? (
                    <MusicArt src={genre.artworkUrl} seed={genre.id} label={genre.label} size="chip" />
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
        </div>
      )

    case 'moods':
      return (
        <div className="music-section-page" data-music-moods="emotional-lanes">
          <header className="music-section-page-header">
            <h1>Moods</h1>
            <p>Emotional lanes matched to real catalogue tracks. Play starts a mood queue on this page.</p>
          </header>
          {moodCards.length > 0 ? (
            <div className="music-discover-mood-rail music-discover-mood-rail--wide">
              {moodCards.map((mood) => (
                <article key={mood.id} className={`music-discover-mood-card music-discover-mood-card--${mood.mood}`}>
                  <button
                    type="button"
                    className="music-discover-mood-hit"
                    onClick={() => playFromQueue(mood.tracks[0], mood.tracks, mood.label)}
                    aria-label={`Play ${mood.label} mood — ${mood.tracks.length} tracks`}
                  >
                    <h3>{mood.label}</h3>
                    <p>{mood.subtitle}</p>
                    <span>{mood.tracks.length} tracks</span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="music-section-empty">No mood lanes have enough matching tracks yet.</p>
          )}
        </div>
      )

    case 'songs':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Songs</h1>
            <p>Your music catalog, sorted by recently added.</p>
          </header>
          <div className="music-discover-song-list" role="list">
            {songWindow.visible.map((song) => {
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
                    <strong>{song.title}</strong>
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
          <CatalogLoadMore
            shown={songWindow.shown}
            hasMore={songWindow.hasMore}
            loading={songsPageLoading}
            onShowMore={songWindow.showMore}
            error={pageError}
          />
        </div>
      )

    case 'artists':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Artists</h1>
            <p>Artists in your catalog, ranked by track count.</p>
          </header>
          <div className="music-discover-artist-rail music-discover-artist-rail--wide">
            {artistWindow.visible.map((artist) => (
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
              </button>
            ))}
          </div>
          <CatalogLoadMore
            shown={artistWindow.shown}
            hasMore={artistWindow.hasMore}
            loading={artistsPageLoading}
            onShowMore={artistWindow.showMore}
            error={pageError}
          />
        </div>
      )

    case 'albums':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Albums</h1>
            <p>Albums in your catalog, sorted by recently added.</p>
          </header>
          <div className="music-discover-album-grid">
            {albumWindow.visible.map((album) => {
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
          <CatalogLoadMore
            shown={albumWindow.shown}
            hasMore={albumWindow.hasMore}
            loading={albumsPageLoading}
            onShowMore={albumWindow.showMore}
            error={pageError}
          />
        </div>
      )

    case 'liked':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Liked Songs</h1>
            <p>Songs you heart on this device. Cloud sync is not connected yet.</p>
          </header>
          {likedSongs.length > 0 ? (
            <div className="music-discover-song-list" role="list">
              {likedSongs.map((song) => {
                const duration = formatDuration(song.durationSeconds)
                return (
                  <button
                    key={song.id}
                    type="button"
                    className="music-discover-song-row"
                    role="listitem"
                    onClick={() => playFromQueue(song, likedSongs, 'Liked Songs')}
                    aria-label={`Play ${song.title} by ${song.artist}`}
                  >
                    <MusicArt src={song.artwork} seed={song.id} label={song.title} size="list" />
                    <span className="music-discover-song-row-meta">
                      <strong>{song.title}</strong>
                      <span>
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ''}
                      </span>
                    </span>
                    {duration ? <time className="music-discover-song-row-duration">{duration}</time> : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="music-section-empty">
              No liked songs yet. Tap the heart on the player bar while music is playing.
            </p>
          )}
        </div>
      )

    case 'playlists':
      return (
        <div className="music-section-page" data-music-playlists="editorial-scenes">
          <header className="music-section-page-header">
            <h1>Scenes</h1>
            <p>
              Editorial listening scenes built from your catalog. Your personal playlists live in Library → Playlists.
            </p>
          </header>
          <div className="music-discover-playlist-grid">
            {editorialPlaylists.map(({ spec, tracks }) => (
              <article key={spec.id} className="music-discover-playlist-card">
                <button
                  type="button"
                  className="music-discover-playlist-hit"
                  onClick={() => playFromQueue(tracks[0], tracks, spec.title)}
                  aria-label={`Play playlist ${spec.title}`}
                >
                  <MusicArt src={tracks[0]?.artwork ?? null} seed={spec.id} label={spec.title} size="rail" />
                  <div>
                    <strong>{spec.title}</strong>
                    <span>{spec.description}</span>
                    <em>{tracks.length} songs</em>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </div>
      )

    case 'recent':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Recently Played</h1>
            <p>Music you have listened to on this device.</p>
          </header>
          {recentSongs.length > 0 ? (
            <div className="music-discover-song-list" role="list">
              {recentSongs.map((song) => {
                const duration = formatDuration(song.durationSeconds)
                return (
                  <button
                    key={song.id}
                    type="button"
                    className="music-discover-song-row"
                    role="listitem"
                    onClick={() => playFromQueue(song, recentSongs, 'Recently Played')}
                    aria-label={`Play ${song.title} by ${song.artist}`}
                  >
                    <MusicArt src={song.artwork} seed={song.id} label={song.title} size="list" />
                    <span className="music-discover-song-row-meta">
                      <strong>{song.title}</strong>
                      <span>
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ''}
                      </span>
                    </span>
                    {duration ? <time className="music-discover-song-row-duration">{duration}</time> : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="music-section-empty">Play music to build your recently played list.</p>
          )}
        </div>
      )

    case 'downloads':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Downloads</h1>
            <p>
              Offline listening uses the shared Downloads library for this desktop install — the same
              destination as Library and the sidebar.
            </p>
          </header>
          <p className="music-section-empty">
            Opening Downloads…
          </p>
          {onOpenDownloads ? (
            <button type="button" className="btn-primary btn-sm" onClick={onOpenDownloads}>
              Open Downloads
            </button>
          ) : null}
        </div>
      )

    default:
      return null
  }
})
