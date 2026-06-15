#!/usr/bin/env python3
"""Phase 44Q — Final PSD validation surgical cleanup."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing block: {label}')
    return text.replace(old, new, 1)


app = read(APP)

# --- Albums page: live catalog copy ---
app = must_replace(
    app,
    "  const { albums, artistNames } = useCatalog()",
    "  const { albums, artistNames, indexes } = useCatalog()",
    'albums indexes',
)

app = must_replace(
    app,
    """  const resolveAlbumAtIndex = useCallback(
    (index: number) => visibleAlbums[index] ?? albums[index] ?? null,
    [albums, visibleAlbums],
  )

  const albumTabs = [""",
    """  const resolveAlbumAtIndex = useCallback(
    (index: number) => visibleAlbums[index] ?? albums[index] ?? null,
    [albums, visibleAlbums],
  )

  const albumsSubtitle = visibleAlbums.length === 1
    ? '1 album in your library.'
    : `${visibleAlbums.length} albums in your library.`
  const albumsFooterCount = visibleAlbums.length === 1
    ? '1 album'
    : `${visibleAlbums.length} albums`
  const sortLabel = sort === 'latest' ? 'Recently Added' : 'A–Z'

  const albumTabs = [""",
    'albums computed copy',
)

app = must_replace(
    app,
    '<p className="psd-albums-page-subtitle">{PSD_ALBUMS_SUBTITLE}</p>',
    '<p className="psd-albums-page-subtitle">{albumsSubtitle}</p>',
    'albums subtitle',
)

app = must_replace(
    app,
    """          <button type="button" className="psd-albums-sort-pill" aria-label="Sort albums">
            Recently Added""",
    """          <button
            type="button"
            className="psd-albums-sort-pill"
            aria-label={`Sort albums: ${sortLabel}`}
            onClick={() => setSort(sort === 'latest' ? 'az' : 'latest')}
          >
            {sortLabel}""",
    'albums sort pill',
)

app = must_replace(
    app,
    "  const [sort] = usePersistedPreference(",
    "  const [sort, setSort] = usePersistedPreference(",
    'albums setSort',
)

app = must_replace(
    app,
    """                  <div className="psd-albums-gallery-copy">
                    <strong className="psd-albums-gallery-title">{card.title}</strong>
                    <span className="psd-albums-gallery-artist">{card.artist}</span>
                    <span className="psd-albums-gallery-meta">{card.year} • {card.songs}</span>
                    <span className="psd-albums-gallery-more" aria-hidden="true"><PsdIconMore /></span>
                  </div>""",
    """                  <div className="psd-albums-gallery-copy">
                    <strong className="psd-albums-gallery-title">{album?.title ?? '—'}</strong>
                    <span className="psd-albums-gallery-artist">
                      {album ? (album.artistId ? artistNames.get(album.artistId) ?? 'Unknown artist' : 'Unknown artist') : '—'}
                    </span>
                    <span className="psd-albums-gallery-meta">
                      {album?.releaseYear ?? '—'} • {album ? countSongsForAlbum(album, indexes) : 0} songs
                    </span>
                    <span className="psd-albums-gallery-more" aria-hidden="true"><PsdIconMore /></span>
                  </div>""",
    'albums grid copy',
)

app = must_replace(
    app,
    '<p className="psd-albums-footer-count">{PSD_ALBUMS_FOOTER_COUNT}</p>',
    '<p className="psd-albums-footer-count">{albumsFooterCount}</p>',
    'albums footer',
)

# --- Liked page: live rows + meta ---
app = must_replace(
    app,
    """  const playAllLiked = useCallback(() => {
    playLikedSong(0)
  }, [playLikedSong])

  return (""",
    """  const playAllLiked = useCallback(() => {
    playLikedSong(0)
  }, [playLikedSong])

  const likedMeta = useMemo(() => {
    const count = likedSongs.length
    const totalSeconds = likedSongs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    return `${count} ${count === 1 ? 'song' : 'songs'} • ${durationLabel}`
  }, [likedSongs])

  const visibleLikedSongs = likedSongs.slice(0, PSD_LIKED_TABLE_ROWS.length)

  return (""",
    'liked meta',
)

app = must_replace(
    app,
    '<p className="psd-liked-page-meta">{PSD_LIKED_META}</p>',
    '<p className="psd-liked-page-meta">{likedMeta}</p>',
    'liked meta render',
)

app = must_replace(
    app,
    """            <button type="button" className="psd-liked-hero-edit" aria-label="Edit playlist cover">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>""",
    '',
    'liked edit btn',
)

app = must_replace(
    app,
    """                <button type="button" className="psd-liked-btn psd-liked-btn--more" aria-label="More options">
                  <PsdIconMore />
                </button>
              </div>
              <button type="button" className="psd-liked-add-playlist">
                <PsdIconPlus />
                Add to Playlist
              </button>""",
    '              </div>',
    'liked dead buttons',
)

app = must_replace(
    app,
    """                {PSD_LIKED_TABLE_ROWS.map((row, index) => {
                  const song = resolveLikedSongAtIndex(index)
                  return (
                    <tr
                      key={row.key}
                      className={`psd-liked-table-row${'active' in row && row.active ? ' is-active' : ''}`}
                    >
                      <td className="psd-liked-col-index">
                        {'active' in row && row.active ? (
                          <PsdIconEqualizer className="psd-liked-row-equalizer" />
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="psd-liked-col-title">
                        <button
                          type="button"
                          className="psd-liked-title-btn"
                          onClick={() => playLikedSong(index)}
                        >
                          <span className="psd-liked-row-thumb">
                            <ArtworkImage
                              src={song?.artwork ?? null}
                              alt=""
                              seed={song?.id ?? row.key}
                              label={song?.title ?? row.title}
                            />
                          </span>
                          <span className="psd-liked-title-copy">
                            <strong>{row.title}</strong>
                            <svg className="psd-liked-row-heart" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                            </svg>
                          </span>
                        </button>
                      </td>
                      <td className="psd-liked-col-artist">{row.artist}</td>
                      <td className="psd-liked-col-album">{row.album}</td>
                      <td className="psd-liked-col-date">{row.dateAdded}</td>
                      <td className="psd-liked-col-duration">{row.duration}</td>
                      <td className="psd-liked-col-menu">
                        <button type="button" className="psd-liked-row-menu" aria-label={`More options for ${row.title}`}>
                          <PsdIconMore />
                        </button>
                      </td>
                    </tr>
                  )
                })}""",
    """                {visibleLikedSongs.map((song, index) => (
                    <tr key={song.id} className="psd-liked-table-row">
                      <td className="psd-liked-col-index">{index + 1}</td>
                      <td className="psd-liked-col-title">
                        <button
                          type="button"
                          className="psd-liked-title-btn"
                          onClick={() => playLikedSong(index)}
                        >
                          <span className="psd-liked-row-thumb">
                            <ArtworkImage
                              src={song.artwork ?? null}
                              alt=""
                              seed={song.id}
                              label={song.title}
                            />
                          </span>
                          <span className="psd-liked-title-copy">
                            <strong>{song.title}</strong>
                            <svg className="psd-liked-row-heart" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                            </svg>
                          </span>
                        </button>
                      </td>
                      <td className="psd-liked-col-artist">{song.artist}</td>
                      <td className="psd-liked-col-album">{song.album ?? '—'}</td>
                      <td className="psd-liked-col-date">—</td>
                      <td className="psd-liked-col-duration">{formatSongDurationLabel(song)}</td>
                      <td className="psd-liked-col-menu" aria-hidden="true" />
                    </tr>
                  ))}""",
    'liked table rows',
)

# --- Recent page: live song rows ---
app = must_replace(
    app,
    """  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return PSD_RECENT_TABLE_ROWS
    return PSD_RECENT_TABLE_ROWS.filter((row) => {
      const haystack = [
        row.title,
        row.subtitle,
        row.artist,
        row.itemType,
        row.played,
      ].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])""",
    """  const normalizedQuery = query.trim().toLowerCase()
  const visibleSongs = useMemo(() => {
    const base = recentSongs.slice(0, 10)
    if (!normalizedQuery) return base
    return base.filter((song) => {
      const haystack = [song.title, song.artist, song.album ?? ''].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, recentSongs])""",
    'recent visible songs',
)

app = must_replace(
    app,
    """                {visibleRows.map((row) => {
                  const index = PSD_RECENT_TABLE_ROWS.findIndex((entry) => entry.key === row.key)
                  const song = resolveRecentSongAtIndex(index)
                  return (
                    <tr key={row.key} className="psd-recent-table-row">
                      <td className="psd-recent-col-index">{index + 1}</td>
                      <td className="psd-recent-col-title">
                        <button
                          type="button"
                          className="psd-recent-title-btn"
                          onClick={() => playRecentSong(index)}
                          disabled={row.itemType !== 'Song'}
                        >
                          <span className="psd-recent-row-thumb">
                            <ArtworkImage
                              src={song?.artwork ?? null}
                              alt=""
                              seed={song?.id ?? row.key}
                              label={song?.title ?? row.title}
                            />
                          </span>
                          <span className="psd-recent-title-copy">
                            <strong>{row.title}</strong>
                            <span>{row.subtitle}</span>
                          </span>
                        </button>
                      </td>
                      <td className="psd-recent-col-artist">{row.artist}</td>
                      <td className="psd-recent-col-type">
                        <span className="psd-recent-type-pill">
                          <PsdRecentTypeIcon type={row.itemType} />
                          <span>{row.itemType}</span>
                        </span>
                      </td>
                      <td className="psd-recent-col-played">{row.played}</td>
                      <td className="psd-recent-col-duration">{row.duration}</td>
                      <td className="psd-recent-col-menu">
                        <button type="button" className="psd-recent-row-menu" aria-label={`More options for ${row.title}`}>
                          <PsdIconMore />
                        </button>
                      </td>
                    </tr>
                  )
                })}""",
    """                {visibleSongs.map((song, index) => (
                    <tr key={song.id} className="psd-recent-table-row">
                      <td className="psd-recent-col-index">{index + 1}</td>
                      <td className="psd-recent-col-title">
                        <button
                          type="button"
                          className="psd-recent-title-btn"
                          onClick={() => playRecentSong(index)}
                        >
                          <span className="psd-recent-row-thumb">
                            <ArtworkImage
                              src={song.artwork ?? null}
                              alt=""
                              seed={song.id}
                              label={song.title}
                            />
                          </span>
                          <span className="psd-recent-title-copy">
                            <strong>{song.title}</strong>
                            <span>{song.album ?? 'Song'}</span>
                          </span>
                        </button>
                      </td>
                      <td className="psd-recent-col-artist">{song.artist}</td>
                      <td className="psd-recent-col-type">
                        <span className="psd-recent-type-pill">
                          <PsdRecentTypeIcon type="Song" />
                          <span>Song</span>
                        </span>
                      </td>
                      <td className="psd-recent-col-played">—</td>
                      <td className="psd-recent-col-duration">{formatSongDurationLabel(song)}</td>
                      <td className="psd-recent-col-menu" aria-hidden="true" />
                    </tr>
                  ))}""",
    'recent table rows',
)

app = must_replace(
    app,
    'Showing 10 of your recently played items',
    '{visibleSongs.length === 0 ? "No recent plays yet" : `Showing ${visibleSongs.length} recently played songs`}',
    'recent footer',
)

# --- Downloads: honest preview + live row titles ---
app = must_replace(
    app,
    """        <section className="psd-downloads-storage" aria-label="Storage usage">
          <div
            className="psd-downloads-ring"
            style={{ ['--downloads-ring-percent' as string]: PSD_DOWNLOADS_STORAGE_PERCENT }}
            aria-hidden="true"
          >
            <span>{PSD_DOWNLOADS_STORAGE_PERCENT}%</span>
          </div>
          <div className="psd-downloads-storage-copy">
            <strong>{PSD_DOWNLOADS_STORAGE_PERCENT}% of storage used</strong>
            <span>57.6 GB / 80 GB</span>
            <div className="psd-downloads-storage-bar">
              <div
                className="psd-downloads-storage-fill"
                style={{ width: `${PSD_DOWNLOADS_STORAGE_PERCENT}%` }}
              />
            </div>
          </div>
          <button type="button" className="psd-downloads-smart-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M12 3l1.8 4.6L18 9.4l-3.7 2.8L15.4 17 12 14.3 8.6 17l1.1-4.8L6 9.4l4.2-1.8L12 3z" />
            </svg>
            Smart Download
          </button>
        </section>""",
    """        <section className="psd-downloads-storage" aria-label="Offline downloads preview">
          <div className="psd-downloads-storage-copy">
            <strong>Offline downloads preview</strong>
            <span>Device download storage and sync are not connected in this desktop build yet.</span>
          </div>
        </section>""",
    'downloads storage',
)

app = must_replace(
    app,
    """          <button type="button" className="psd-downloads-sort">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Recently Downloaded
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>""",
    '',
    'downloads sort',
)

app = must_replace(
    app,
    '<h2 className="psd-downloads-section-title">Playlists (3)</h2>',
    '<h2 className="psd-downloads-section-title">Playlists ({PSD_DOWNLOADS_PLAYLISTS.length})</h2>',
    'downloads playlist count',
)

app = must_replace(
    app,
    '<h2 className="psd-downloads-section-title">Albums (2)</h2>',
    '<h2 className="psd-downloads-section-title">Albums ({PSD_DOWNLOADS_ALBUMS.length})</h2>',
    'downloads album count',
)

app = must_replace(
    app,
    '<h2 className="psd-downloads-section-title">Songs (6)</h2>',
    '<h2 className="psd-downloads-section-title">Songs ({PSD_DOWNLOADS_SONGS.length})</h2>',
    'downloads song count',
)

app = app.replace(
    '                      {row.title}',
    '                      {album?.title ?? song?.title ?? row.title}',
)
app = app.replace(
    '                    <span className="psd-downloads-row-meta">{row.meta}</span>',
    '                    <span className="psd-downloads-row-meta">{song ? `${song.artist}${song.album ? ` • ${song.album}` : ""}` : row.meta}</span>',
    1,
)

# Remove downloads row menu component usage
app = app.replace('                  <PsdDownloadsRowMenu />\n', '')

# --- Player2 next wiring ---
app = must_replace(
    app,
    """    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTrack = getUpcomingTracks()[0] ?? null""",
    """    getUpcomingTracks,
    next,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTrack = getUpcomingTracks()[0] ?? null""",
    'player2 next destructure',
)

app = must_replace(
    app,
    """                <button type="button" className="player2-next-play" aria-label={`Play ${nextTitle}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>""",
    """                <button
                  type="button"
                  className="player2-next-play"
                  aria-label={`Play ${nextTitle}`}
                  onClick={next}
                  disabled={!upcomingTrack || !isActive}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>""",
    'player2 next play',
)

# --- Player sources + quality badges ---
app = app.replace('{PSD_PLAYER4_SOURCE}', '{displayAlbum ?? "Your Library"}', 1)
app = app.replace('{PSD_PLAYER5_SOURCE}', '{displayAlbum ?? "Your Library"}', 1)

app = must_replace(
    app,
    """    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'visualizer' | 'details'>('lyrics')

  const displayTrack = currentTrack ?? preferredTrack""",
    """    getUpcomingTracks,
    audioQualityMode,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'visualizer' | 'details'>('lyrics')

  const displayTrack = currentTrack ?? preferredTrack""",
    'player3 audioQualityMode',
)

app = must_replace(
    app,
    """  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return []
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      active: index === 0,
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  usePlayerShellChrome(onClose)

  const handleNav = (navKey: NavKey) => {
    onClose()
    onNavigateNav?.(navKey)
  }

  const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'

  return (
    <div
      className="player3-shell\"""",
    """  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const qualityLabel = displayTrack && isActive
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return []
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      active: index === 0,
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  usePlayerShellChrome(onClose)

  const handleNav = (navKey: NavKey) => {
    onClose()
    onNavigateNav?.(navKey)
  }

  const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'

  return (
    <div
      className="player3-shell\"""",
    'player3 qualityLabel',
)

app = must_replace(
    app,
    """            <div className="player3-header-badges">
              <span className="player3-flac">FLAC</span>
              <span className="player3-spec">24-BIT / 48KHZ</span>
              <button type="button" className="player3-header-eq" aria-label="Equalizer" onClick={onOpenWaveform}>""",
    """            <div className="player3-header-badges">
              {qualityLabel ? <span className="player3-flac">{qualityLabel}</span> : null}
              <button type="button" className="player3-header-eq" aria-label="Equalizer" onClick={onOpenWaveform}>""",
    'player3 badges',
)

# Player4 quality
app = must_replace(
    app,
    """    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return []
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      duration: track.durationSeconds != null && track.durationSeconds > 0
        ? formatPlaybackTime(track.durationSeconds)
        : '—',
      active: index === 0,
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current""",
    """    getUpcomingTracks,
    audioQualityMode,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const qualityLabel = displayTrack && isActive
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return []
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      duration: track.durationSeconds != null && track.durationSeconds > 0
        ? formatPlaybackTime(track.durationSeconds)
        : '—',
      active: index === 0,
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current""",
    'player4 qualityLabel',
)

app = must_replace(
    app,
    """              <div className="player4-header-badges">
                <span>FLAC</span>
                <span className="player4-header-divider" aria-hidden="true">|</span>
                <span>24-BIT</span>
                <span className="player4-header-divider" aria-hidden="true">|</span>
                <span>96kHz</span>
              </div>""",
    """              {qualityLabel ? (
                <div className="player4-header-badges">
                  <span>{qualityLabel}</span>
                </div>
              ) : null}""",
    'player4 badges',
)

app = must_replace(
    app,
    """                  <button type="button" className="player4-art-heart" aria-label="Favorite">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 1.01 4.5 2.09C13.09 4.01 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>""",
    '',
    'player4 heart',
)

app = must_replace(
    app,
    """          <section className="player4-sound" aria-label="Sound experience">
            <div className="player4-sound-header">
              <PsdWaveformStrip className="player4-sound-wave" />
              <h3>SOUND EXPERIENCE</h3>
            </div>
            <div className="player4-sound-toggles">
              {PSD_PLAYER4_SOUND_MODES.map((mode) => (
                <button key={mode.key} type="button" className="player4-sound-toggle is-on">
                  <span className="player4-sound-toggle-icon" aria-hidden="true" />
                  <span>{mode.label}</span>
                  <span className="player4-sound-toggle-state">ON</span>
                </button>
              ))}
            </div>
          </section>""",
    '',
    'player4 sound modes',
)

# Player5 quality
app = must_replace(
    app,
    """    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const displayVolumePercent = Math.round(volumePercent)

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading
  const upcomingTracks = getUpcomingTracks()
  const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'""",
    """    getUpcomingTracks,
    audioQualityMode,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const displayVolumePercent = Math.round(volumePercent)

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const qualityLabel = displayTrack && isActive
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading
  const upcomingTracks = getUpcomingTracks()
  const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'""",
    'player5 qualityLabel',
)

app = must_replace(
    app,
    """              <div className="player5-quality-pill">
                <span className="player5-quality-flac">FLAC</span>
                <span>24-BIT / 96kHz</span>
                <PsdWaveformStrip className="player5-quality-wave" />
              </div>""",
    """              {qualityLabel ? (
                <div className="player5-quality-pill">
                  <span className="player5-quality-flac">{qualityLabel}</span>
                  <PsdWaveformStrip className="player5-quality-wave" />
                </div>
              ) : null}""",
    'player5 badges',
)

app = must_replace(
    app,
    """            <button type="button" className="player5-go-premium">Go Premium</button>""",
    """            <button
              type="button"
              className="player5-go-premium"
              onClick={() => {
                onClose()
                onNavigateNav?.('premium')
              }}
            >
              Go Premium
            </button>""",
    'player5 premium',
)

# Waveform + lyrics quality labels
app = app.replace(
    '            <strong>HIGH QUALITY</strong>\n          </button>\n          <button\n            type="button"\n            className="psd-waveform-footer-btn"',
    '            <strong>{AUDIO_QUALITY_MODE_LABELS[audioQualityMode]}</strong>\n          </button>\n          <button\n            type="button"\n            className="psd-waveform-footer-btn"',
    1,
)

app = must_replace(
    app,
    """    seekTo,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  usePlayerShellChrome(onClose)

  return (
    <div
      className="cinema-player cinema-player--lyrics psd-lyrics-page\"""",
    """    seekTo,
    audioQualityMode,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0

  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const qualityLabel = displayTrack && isActive
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  usePlayerShellChrome(onClose)

  return (
    <div
      className="cinema-player cinema-player--lyrics psd-lyrics-page\"""",
    'lyrics shell quality',
)

app = must_replace(
    app,
    """        <div className="psd-lyrics-quality-label">
          <PsdWaveformStrip className="psd-lyrics-quality-wave" />
          <strong>HIGH QUALITY</strong>
        </div>""",
    """        {qualityLabel ? (
          <div className="psd-lyrics-quality-label">
            <PsdWaveformStrip className="psd-lyrics-quality-wave" />
            <strong>{qualityLabel}</strong>
          </div>
        ) : null}""",
    'lyrics quality label',
)

write(APP, app)
print('Phase 44Q validation cleanup applied.')
