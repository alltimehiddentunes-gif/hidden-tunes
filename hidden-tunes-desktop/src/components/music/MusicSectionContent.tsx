import { memo, useCallback, useMemo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import { sortAlbumsList, sortArtistsList, sortSongsList } from '../../lib/api'
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
import { resolveRecentlyPlayedSongs } from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { EDITORIAL_PLAYLIST_SPECS, resolveEditorialPlaylistTracks } from '../../lib/home/editorialPlaylists'
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

type MusicSectionContentProps = {
  section: MusicSectionId
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onBrowseSearch: (query: string) => void
}

export const MusicSectionContent = memo(function MusicSectionContent({
  section,
  songs,
  albums,
  artists,
  indexes,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onBrowseSearch,
}: MusicSectionContentProps) {
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

  const newReleases = useMemo(
    () => buildNewReleaseCards(songs, albums, indexes, 24),
    [albums, indexes, songs],
  )
  const chartCards = useMemo(() => buildPopularChartCards(songs, indexes, 12), [indexes, songs])
  const moodCards = useMemo(() => buildMoodVibeCards(songs, 12), [songs])
  const genreTiles = useMemo(() => buildGenreTiles(indexes, recentlyPlayed, 20), [indexes, recentlyPlayed])
  const allSongs = useMemo(() => sortSongsList(songs, 'latest').slice(0, 48), [songs])
  const allArtists = useMemo(() => sortArtistsList(artists, 'tracks').slice(0, 32), [artists])
  const allAlbums = useMemo(() => sortAlbumsList(albums, 'latest').slice(0, 32), [albums])
  const recentSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, 32),
    [indexes.songsById, recentlyPlayed],
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
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Genres & Moods</h1>
            <p>Browse by genre or emotional lane.</p>
          </header>
          <MusicPageSection title="Moods & Vibes">
            <div className="music-discover-mood-rail music-discover-mood-rail--wide">
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
          <MusicPageSection title="Genres">
            <div className="music-discover-genre-grid music-discover-genre-grid--wide">
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
        </div>
      )

    case 'songs':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Songs</h1>
            <p>Your music catalog, sorted by recently added.</p>
          </header>
          <div className="music-discover-song-grid">
            {allSongs.map((song) => (
              <button
                key={song.id}
                type="button"
                className="music-discover-song-chip"
                onClick={() => playFromQueue(song, allSongs, 'Songs')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
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
            {allArtists.map((artist) => (
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
            {allAlbums.map((album) => (
              <button
                key={album.id}
                type="button"
                className="music-discover-album-chip"
                onClick={() => onOpenAlbum(album)}
                aria-label={`Open album ${album.title}`}
              >
                <ArtworkImage src={album.artwork} alt="" seed={album.id} label={album.title} />
                <strong>{album.title}</strong>
                <span>{indexes.artistNames.get(album.artistId ?? '') ?? album.title}</span>
              </button>
            ))}
          </div>
        </div>
      )

    case 'liked':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Liked Songs</h1>
            <p>Browse songs from your catalog. Dedicated liked-state sync is not connected yet.</p>
          </header>
          <div className="music-discover-song-grid">
            {allSongs.slice(0, 32).map((song) => (
              <button
                key={song.id}
                type="button"
                className="music-discover-song-chip"
                onClick={() => playFromQueue(song, allSongs, 'Liked Songs')}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </button>
            ))}
          </div>
        </div>
      )

    case 'playlists':
      return (
        <div className="music-section-page">
          <header className="music-section-page-header">
            <h1>Playlists</h1>
            <p>Editorial collections built from your catalog scenes.</p>
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
                  <ArtworkImage src={tracks[0]?.artwork ?? null} alt="" seed={spec.id} label={spec.title} />
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
            <div className="music-discover-song-grid">
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
            <p>Offline downloads are not connected on desktop yet.</p>
          </header>
          <p className="music-section-empty">No downloaded tracks available in this build.</p>
        </div>
      )

    default:
      return null
  }
})
