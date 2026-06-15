#!/usr/bin/env python3
"""Phase 44J — Playlist page PSD reconstruction + wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)

editorial_helpers = """
type EditorialPlaylistSpec = {
  id: string
  title: string
  aliases?: readonly string[]
  description: string
  owner: string
  sceneId: string
  showMoon?: boolean
}

const EDITORIAL_PLAYLIST_SPECS: EditorialPlaylistSpec[] = [
  {
    id: 'night-drive',
    title: 'Night Drive',
    aliases: ['late night drive'],
    description: 'Late nights, open roads and the perfect soundtrack.',
    owner: 'Hidden Tunes',
    sceneId: 'midnight-drive',
    showMoon: true,
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    description: 'Clear headspace and steady concentration.',
    owner: 'Hidden Tunes',
    sceneId: 'focus-room',
  },
  {
    id: 'afro-vibes',
    title: 'Afro Vibes',
    description: 'Warm grooves and golden-hour rhythm.',
    owner: 'Hidden Tunes',
    sceneId: 'sunday-morning',
  },
  {
    id: 'chill-relax',
    title: 'Chill & Relax',
    aliases: ['chill vibes'],
    description: 'Soft calm for unwinding and reflection.',
    owner: 'Hidden Tunes',
    sceneId: 'heartbreak-recovery',
  },
  {
    id: 'workout-mix',
    title: 'Workout Mix',
    description: 'High-energy momentum to keep you moving.',
    owner: 'Hidden Tunes',
    sceneId: 'city-lights',
  },
  {
    id: 'rainy-day-comfort',
    title: 'Rainy Day Comfort',
    description: 'Rain-lit calm and gentle comfort.',
    owner: 'Hidden Tunes',
    sceneId: 'rainy-window',
  },
]

function resolveEditorialPlaylistSpec(query: string): EditorialPlaylistSpec {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return EDITORIAL_PLAYLIST_SPECS[0]
  const matched = EDITORIAL_PLAYLIST_SPECS.find((spec) => {
    if (spec.id.toLowerCase() === normalized) return true
    if (spec.title.toLowerCase() === normalized) return true
    return spec.aliases?.some((alias) => alias.toLowerCase() === normalized) ?? false
  })
  return matched ?? EDITORIAL_PLAYLIST_SPECS[0]
}

function resolveEditorialPlaylistTracks(songs: ApiSong[], sceneId: string) {
  return sortSongsList(filterSongsByListeningScene(songs, sceneId), 'latest')
}

function formatPlaylistDurationLabel(songs: ApiSong[]) {
  const totalSeconds = songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)
  if (totalSeconds <= 0) return null
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

function formatPlaylistMetaLine(songCount: number, songs: ApiSong[]) {
  const songLabel = `${songCount.toLocaleString()} ${songCount === 1 ? 'song' : 'songs'}`
  const duration = formatPlaylistDurationLabel(songs)
  return duration ? `${songLabel} · ${duration}` : songLabel
}

function filterPlaylistTracksBySearch(tracks: ApiSong[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return tracks
  return tracks.filter((song) => {
    const haystack = [song.title, song.artist, song.album, song.genre, song.mood]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}

"""

marker = "function filterSongsByLibraryQuery(songs: ApiSong[], query: string) {"
if marker not in app:
    raise SystemExit('filterSongsByLibraryQuery marker not found')
if 'EDITORIAL_PLAYLIST_SPECS' not in app:
    app = app.replace(
        "}\n\nconst PSD_PLAYLIST_TITLE",
        "}\n" + editorial_helpers + "\nconst PSD_PLAYLIST_TITLE",
    )

pp_start = app.index('function PlaylistsPage(')
pp_end = app.index('\n\nfunction LikedPage(')

new_playlists_page = """function PlaylistsPage({
  onOpenSong,
  query: selectedPlaylistQuery = '',
  setQuery: setSelectedPlaylistQuery,
}: {
  onOpenSong: QueueSongHandler
  query?: string
  setQuery?: (value: string) => void
}) {
  const { songs, indexes, artworkContext } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [trackSearch, setTrackSearch] = useState('')

  const activeSpec = useMemo(
    () => resolveEditorialPlaylistSpec(selectedPlaylistQuery),
    [selectedPlaylistQuery],
  )

  const playlistTracks = useMemo(
    () => resolveEditorialPlaylistTracks(songs, activeSpec.sceneId),
    [activeSpec.sceneId, songs],
  )

  const visibleTracks = useMemo(
    () => filterPlaylistTracksBySearch(playlistTracks, trackSearch),
    [playlistTracks, trackSearch],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playlistHeroArt = useMemo(() => {
    const registryCover = getArtworkForPlaylist(
      { id: activeSpec.id, title: activeSpec.title },
      artworkContext,
    )
    if (registryCover) return [registryCover]
    return getArtworkForPlaylistCollage(playlistTracks, artworkContext)
  }, [activeSpec.id, activeSpec.title, artworkContext, playlistTracks])

  const relatedPlaylists = useMemo(
    () => EDITORIAL_PLAYLIST_SPECS.filter((spec) => spec.id !== activeSpec.id),
    [activeSpec.id],
  )

  const playPlaylistTrack = useCallback(
    (song: ApiSong, index: number) => {
      if (playlistTracks.length === 0) return
      onOpenSong(song, playlistTracks, index, 'manual', activeSpec.title, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', playlistTracks, indexes, song),
        candidatePools: queuePools,
      })
    },
    [activeSpec.title, indexes, onOpenSong, playlistTracks, queuePools],
  )

  const playAll = useCallback(() => {
    const first = playlistTracks[0]
    if (!first) return
    playPlaylistTrack(first, 0)
  }, [playPlaylistTrack, playlistTracks])

  const selectPlaylist = useCallback(
    (title: string) => {
      setSelectedPlaylistQuery?.(title)
      setTrackSearch('')
    },
    [setSelectedPlaylistQuery],
  )

  const isTrackActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  const playlistMeta = formatPlaylistMetaLine(playlistTracks.length, playlistTracks)
  const hasPlayableTracks = playlistTracks.length > 0

  return (
    <div className="psd-playlists-destination">
      <PageFrame cinematic>
        <form className="psd-playlist-inpage-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <span className="psd-playlist-search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            value={trackSearch}
            onChange={(event) => setTrackSearch(event.target.value)}
            placeholder="Search in playlist"
            aria-label="Search in playlist"
          />
        </form>

        <section className="psd-playlist-hero" aria-labelledby="playlist-detail-heading">
          <EntityAtmosphereBackdrop
            className="psd-playlist-hero-backdrop"
            artworkUrl={playlistHeroArt[0] ?? null}
            label={activeSpec.title}
            variant="hero"
          />
          <div className="psd-playlist-hero-art" aria-hidden="true">
            <ArtworkCollage
              urls={playlistHeroArt}
              seed={activeSpec.id}
              label={activeSpec.title}
            />
          </div>
          <div className="psd-playlist-hero-copy">
            <span className="psd-playlist-eyebrow">PLAYLIST</span>
            <h1 id="playlist-detail-heading" className="psd-playlist-title">
              {activeSpec.title}
              {activeSpec.showMoon ? (
                <svg className="psd-playlist-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21 14.5A8.5 8.5 0 1111.5 4a6.5 6.5 0 109.5 10.5z" />
                </svg>
              ) : null}
            </h1>
            <p className="psd-playlist-description">{activeSpec.description}</p>
            <div className="psd-playlist-owner">
              <span className="psd-playlist-owner-avatar" aria-hidden="true">
                <PsdWaveformStrip className="psd-playlist-owner-wave" />
              </span>
              <span className="psd-playlist-owner-name">{activeSpec.owner}</span>
            </div>
            <p className="psd-playlist-meta">{playlistMeta}</p>
          </div>
        </section>

        <div className="psd-playlist-actions" role="toolbar" aria-label="Playlist actions">
          <button
            type="button"
            className="psd-playlist-btn psd-playlist-btn--play"
            disabled={!hasPlayableTracks}
            onClick={playAll}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
        </div>

        <section className="psd-playlist-table-section" aria-label="Playlist tracks">
          {!hasPlayableTracks ? (
            <CatalogEmpty
              title="No tracks available"
              detail={`${activeSpec.title} has no catalog matches yet. Tracks appear when listening-scene identity resolves in your library.`}
            />
          ) : visibleTracks.length === 0 ? (
            <CatalogEmpty
              title="No matches in playlist"
              detail={trackSearch.trim() ? `Nothing in ${activeSpec.title} matched "${trackSearch.trim()}".` : 'Try another search.'}
            />
          ) : (
            <div className="psd-playlist-table-wrap">
              <table className="psd-playlist-table">
                <thead>
                  <tr>
                    <th scope="col" className="psd-playlist-col-index">#</th>
                    <th scope="col" className="psd-playlist-col-title">TITLE</th>
                    <th scope="col" className="psd-playlist-col-artist">ARTIST</th>
                    <th scope="col" className="psd-playlist-col-duration" aria-label="Duration">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTracks.map((song, index) => {
                    const sourceIndex = playlistTracks.findIndex((entry) => entry.id === song.id)
                    const queueIndex = sourceIndex >= 0 ? sourceIndex : index
                    const active = isTrackActive(song.id)
                    return (
                      <tr
                        key={song.id}
                        className={`psd-playlist-table-row${active ? ' is-active' : ''}`}
                      >
                        <td className="psd-playlist-col-index">
                          {active ? (
                            <PsdIconEqualizer className="psd-playlist-row-equalizer" />
                          ) : (
                            queueIndex + 1
                          )}
                        </td>
                        <td className="psd-playlist-col-title">
                          <button
                            type="button"
                            className="psd-playlist-title-btn"
                            onClick={() => playPlaylistTrack(song, queueIndex)}
                          >
                            <span className="psd-playlist-row-thumb">
                              <ArtworkImage
                                src={song.artwork ?? null}
                                alt=""
                                seed={song.id}
                                label={song.title}
                              />
                            </span>
                            <span className="psd-playlist-title-copy">
                              <strong>{song.title}</strong>
                            </span>
                          </button>
                        </td>
                        <td className="psd-playlist-col-artist">{song.artist}</td>
                        <td className="psd-playlist-col-duration">{formatSongDurationLabel(song)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasPlayableTracks ? (
            <p className="psd-playlist-table-footer">{playlistMeta}</p>
          ) : null}
        </section>

        {relatedPlaylists.length > 0 ? (
          <section className="psd-playlist-related-panel" aria-labelledby="playlist-related-heading">
            <header className="psd-playlist-section-header">
              <h2 id="playlist-related-heading">More playlists</h2>
            </header>
            <div className="psd-playlist-related-grid">
              {relatedPlaylists.map((spec) => {
                const cover = getArtworkForPlaylist(
                  { id: spec.id, title: spec.title },
                  artworkContext,
                )
                const trackCount = resolveEditorialPlaylistTracks(songs, spec.sceneId).length
                return (
                  <button
                    key={spec.id}
                    type="button"
                    className="psd-playlist-related-card"
                    onClick={() => selectPlaylist(spec.title)}
                  >
                    <div className="psd-playlist-related-art">
                      {cover ? (
                        <ArtworkImage
                          src={cover}
                          alt=""
                          seed={spec.id}
                          label={spec.title}
                        />
                      ) : (
                        <ArtworkCollage
                          urls={getArtworkForPlaylistCollage(
                            resolveEditorialPlaylistTracks(songs, spec.sceneId),
                            artworkContext,
                          )}
                          seed={spec.id}
                          label={spec.title}
                        />
                      )}
                    </div>
                    <strong>{spec.title}</strong>
                    <span>
                      {trackCount} {trackCount === 1 ? 'song' : 'songs'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}

"""

app = app[:pp_start] + new_playlists_page + app[pp_end:]

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44J: Playlist PSD parity + wiring —— */
.psd-playlist-hero {
  position: relative;
}

.psd-playlist-hero-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  overflow: hidden;
}

.psd-playlist-hero-art,
.psd-playlist-hero-copy {
  position: relative;
  z-index: 1;
}

.psd-playlist-table-row.is-active {
  background: rgba(109, 74, 255, 0.12);
}

.psd-playlist-table-row {
  transition: background var(--transition-fast);
}

.psd-playlist-table-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.psd-playlist-related-panel {
  margin-top: clamp(24px, 3vw, 36px);
}

.psd-playlist-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 14px;
}

.psd-playlist-related-card {
  border: none;
  background: none;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.psd-playlist-related-card:hover .psd-playlist-related-art {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.34);
}

.psd-playlist-related-art {
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 10px;
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.psd-playlist-related-card strong {
  display: block;
  font-size: 13px;
  line-height: 1.3;
}

.psd-playlist-related-card > span {
  display: block;
  font-size: 12px;
  color: var(--psd-metadata);
}

"""
if 'Phase 44J: Playlist PSD parity' not in css:
    marker_css = '/* —— Phase 44K:'
    if marker_css in css:
        css = css.replace(marker_css, css_block + marker_css)
    else:
        css = css.replace('.psd-playlists-destination {', css_block + '.psd-playlists-destination {', 1)
    write(CSS, css)

print('Phase 44J playlist patch applied')
