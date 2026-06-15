#!/usr/bin/env python3
"""Phase 44K — Artist page PSD reconstruction + wiring."""
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

old_constants = """const PSD_ARTIST_NAME = 'Wills Afrobeats'
const PSD_ARTIST_STATS = '2.4M Monthly Listeners • 24 Songs'
const PSD_ARTIST_BIO =
  'Wills Afrobeats is a soulful storyteller blending Afrobeat rhythms with modern sounds. His music captures the pulse of Lagos nights and the warmth of golden-hour reflection.'

const PSD_ARTIST_POPULAR_ROWS = [
  { key: 'ap1', rank: 1, title: 'Midnight Reflection', streams: '92.3M', duration: '3:56', explicit: true },
  { key: 'ap2', rank: 2, title: 'Afro Sunset', streams: '78.6M', duration: '3:21', explicit: true },
  { key: 'ap3', rank: 3, title: 'Love Vibes', streams: '65.4M', duration: '3:44', explicit: true },
  { key: 'ap4', rank: 4, title: 'Rain & Reflection', streams: '54.2M', duration: '4:12', explicit: true },
  { key: 'ap5', rank: 5, title: 'Night Drive', streams: '48.8M', duration: '4:01', explicit: true },
] as const

const PSD_ARTIST_ALBUM_CARDS = [
  { key: 'aa1', title: 'Reflections At Midnight', artist: 'Wills Afrobeats', year: '2024', songs: '12 songs' },
  { key: 'aa2', title: 'Afro Sunrise', artist: 'Wills Afrobeats', year: '2023', songs: '10 songs' },
  { key: 'aa3', title: 'Vibes from Lagos', artist: 'Wills Afrobeats', year: '2023', songs: '14 songs' },
  { key: 'aa4', title: 'Love & Rhythm', artist: 'Wills Afrobeats', year: '2022', songs: '11 songs' },
  { key: 'aa5', title: 'The Beginning', artist: 'Wills Afrobeats', year: '2021', songs: '9 songs' },
] as const

"""

new_constants = """const ARTIST_POPULAR_PREVIEW = 5
const ARTIST_POPULAR_EXPANDED = 12
const ARTIST_ALBUM_PREVIEW = 5

function formatArtistStatLine(songCount: number, albumCount: number) {
  return `${songCount.toLocaleString()} ${songCount === 1 ? 'song' : 'songs'} · ${albumCount} ${albumCount === 1 ? 'album' : 'albums'}`
}

function resolveArtistPrimaryGenre(songs: ApiSong[]) {
  const counts = new Map<string, number>()
  for (const song of songs) {
    const genre = song.genre?.trim()
    if (!genre) continue
    counts.set(genre, (counts.get(genre) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1])
  return ranked[0]?.[0] ?? null
}

function countSongsForAlbum(album: ApiAlbum, indexes: CatalogIndexes) {
  return resolveSongsForAlbum(album, indexes.songsByAlbumId).length
}

"""

if old_constants not in app:
    raise SystemExit('PSD_ARTIST constants block not found')
app = app.replace(old_constants, new_constants)

ap_start = app.index('function ArtistsPage(')
ap_end = app.index('\n\nfunction AlbumsPage(')

new_artists_page = """function ArtistsPage({
  onOpenArtist,
  onOpenAlbum,
  onOpenSong,
}: {
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenSong: QueueSongHandler
}) {
  const { artists, albums, indexes } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [tab, setTab] = useState<'overview' | 'songs' | 'albums'>('overview')

  const featuredArtist = useMemo(
    () => artists.find((artist) => artist.name.toLowerCase().includes('wills')) ?? artists[0] ?? null,
    [artists],
  )

  const artistSongs = useMemo(
    () => (
      featuredArtist
        ? sortSongsList(
            resolveSongsForArtist(
              featuredArtist,
              indexes.songsByArtistId,
              indexes.songsByArtistName,
            ),
            'latest',
          )
        : []
    ),
    [featuredArtist, indexes.songsByArtistId, indexes.songsByArtistName],
  )

  const popularSongs = useMemo(() => artistSongs, [artistSongs])

  const artistAlbums = useMemo(
    () => (
      featuredArtist
        ? resolveAlbumsForArtist(featuredArtist, indexes.albumsByArtistId)
        : []
    ),
    [featuredArtist, indexes.albumsByArtistId],
  )

  const primaryGenre = useMemo(
    () => resolveArtistPrimaryGenre(popularSongs),
    [popularSongs],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playArtistSong = useCallback(
    (song: ApiSong, index: number) => {
      if (!featuredArtist || popularSongs.length === 0) return
      onOpenSong(
        song,
        popularSongs,
        index,
        'artist',
        featuredArtist.name,
        {
          seedType: 'artist',
          seedId: featuredArtist.id,
          seedTracks: capSongPool(artistSongs),
          candidatePools: queuePools,
        },
      )
    },
    [artistSongs, featuredArtist, onOpenSong, popularSongs, queuePools],
  )

  const playFeaturedArtist = useCallback(() => {
    const song = popularSongs[0]
    if (!song) return
    playArtistSong(song, 0)
  }, [playArtistSong, popularSongs])

  const artistHeroArt = useMemo(
    () => (featuredArtist ? getArtworkForArtist(featuredArtist) : null),
    [featuredArtist],
  )

  const artistTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
  ] as const

  const visiblePopular = useMemo(() => {
    const limit = tab === 'songs' ? ARTIST_POPULAR_EXPANDED : ARTIST_POPULAR_PREVIEW
    return popularSongs.slice(0, limit)
  }, [popularSongs, tab])

  const visibleAlbums = useMemo(() => {
    const limit = tab === 'albums' ? artistAlbums.length : ARTIST_ALBUM_PREVIEW
    return artistAlbums.slice(0, limit)
  }, [artistAlbums, tab])

  const isSongActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  const showOverview = tab === 'overview'
  const showPopular = tab === 'overview' || tab === 'songs'
  const showAlbums = tab === 'overview' || tab === 'albums'
  const showBrowseGrid = tab === 'overview' && artists.length > 1

  return (
    <div className="psd-artists-destination">
      <PageFrame cinematic>
        {featuredArtist ? (
          <section className="psd-artist-hero" aria-labelledby="artist-profile-heading">
            <EntityAtmosphereBackdrop
              className="psd-artist-hero-backdrop"
              artworkUrl={artistHeroArt}
              label={featuredArtist.name}
              variant="hero"
            />
            <div className="psd-artist-hero-veil" aria-hidden="true" />
            <div className="psd-artist-hero-inner">
              <div className="psd-artist-portrait-wrap">
                <ArtistAvatar artist={featuredArtist} />
              </div>
              <div className="psd-artist-hero-copy">
                <h1 id="artist-profile-heading" className="psd-artist-hero-name">
                  {featuredArtist.name}
                </h1>
                <p className="psd-artist-hero-label">Artist</p>
                <p className="psd-artist-hero-stats">
                  {formatArtistStatLine(
                    featuredArtist.songCount || popularSongs.length,
                    artistAlbums.length,
                  )}
                </p>
                <div className="psd-artist-hero-actions">
                  <button
                    type="button"
                    className="psd-artist-btn psd-artist-btn--play"
                    disabled={popularSongs.length === 0}
                    onClick={playFeaturedArtist}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </button>
                  <button
                    type="button"
                    className="psd-artist-btn psd-artist-btn--follow"
                    onClick={() => onOpenArtist(featuredArtist)}
                  >
                    View Profile
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <CatalogEmpty
            title="No artists in catalog"
            detail="Artist profiles will appear once your catalog loads."
          />
        )}

        {featuredArtist ? (
          <>
            <div className="psd-artist-tab-row" role="tablist" aria-label="Artist sections">
              {artistTabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  className={`psd-artist-tab${tab === entry.id ? ' is-active' : ''}`}
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="psd-artist-content-grid">
              {showPopular && visiblePopular.length > 0 ? (
                <section className="psd-artist-popular-panel" aria-labelledby="popular-songs-heading">
                  <header className="psd-artist-section-header">
                    <h2 id="popular-songs-heading">Popular</h2>
                    {tab === 'overview' && popularSongs.length > ARTIST_POPULAR_PREVIEW ? (
                      <button
                        type="button"
                        className="psd-artist-view-all"
                        onClick={() => setTab('songs')}
                      >
                        View all
                      </button>
                    ) : null}
                  </header>
                  <div className="psd-artist-popular-card">
                    {visiblePopular.map((song, index) => (
                      <button
                        key={song.id}
                        type="button"
                        className={`psd-artist-popular-row${isSongActive(song.id) ? ' is-active' : ''}`}
                        onClick={() => playArtistSong(song, index)}
                      >
                        <span className="psd-artist-popular-rank">{index + 1}</span>
                        <span className="psd-artist-popular-thumb">
                          <ArtworkImage
                            src={song.artwork ?? null}
                            alt=""
                            seed={song.id}
                            label={song.title}
                          />
                        </span>
                        <span className="psd-artist-popular-copy">
                          <strong>{song.title}</strong>
                        </span>
                        <span className="psd-artist-popular-streams">{song.album || 'Single'}</span>
                        <span className="psd-artist-popular-duration">
                          {formatSongDurationLabel(song)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {showOverview && primaryGenre ? (
                <section className="psd-artist-about-panel" aria-labelledby="artist-about-heading">
                  <h2 id="artist-about-heading">About</h2>
                  <p className="psd-artist-about-bio">
                    {featuredArtist.name} appears across your catalog with a focus on {primaryGenre}.
                  </p>
                  <dl className="psd-artist-about-details">
                    <div>
                      <dt>Genre</dt>
                      <dd>{primaryGenre}</dd>
                    </div>
                    <div>
                      <dt>Catalog</dt>
                      <dd>
                        {formatArtistStatLine(
                          featuredArtist.songCount || popularSongs.length,
                          artistAlbums.length,
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {showAlbums && visibleAlbums.length > 0 ? (
                <section className="psd-artist-albums-panel" aria-labelledby="artist-albums-heading">
                  <header className="psd-artist-section-header">
                    <h2 id="artist-albums-heading">Albums</h2>
                    {tab === 'overview' && artistAlbums.length > ARTIST_ALBUM_PREVIEW ? (
                      <button
                        type="button"
                        className="psd-artist-view-all"
                        onClick={() => setTab('albums')}
                      >
                        View all
                      </button>
                    ) : null}
                  </header>
                  <div className="psd-artist-albums-grid">
                    {visibleAlbums.map((album) => {
                      const albumSongCount = countSongsForAlbum(album, indexes)
                      return (
                        <button
                          key={album.id}
                          type="button"
                          className="psd-artist-album-card"
                          onClick={() => onOpenAlbum(album)}
                        >
                          <div className="psd-artist-album-art">
                            <ArtworkImage
                              src={album.artwork ?? null}
                              alt=""
                              seed={album.id}
                              label={album.title}
                            />
                          </div>
                          <strong>{album.title}</strong>
                          <span>{featuredArtist.name}</span>
                          <span className="psd-artist-album-meta">
                            {album.releaseYear ? `${album.releaseYear} • ` : ''}
                            {albumSongCount} {albumSongCount === 1 ? 'song' : 'songs'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </div>

            {showBrowseGrid ? (
              <section className="psd-artist-browse-panel" aria-labelledby="artist-browse-heading">
                <header className="psd-artist-section-header">
                  <h2 id="artist-browse-heading">Artists in your catalog</h2>
                </header>
                <ApiArtistGrid
                  artists={artists}
                  onSelect={onOpenArtist}
                  listKey="artists-page-browse"
                  paginate={false}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </PageFrame>
    </div>
  )
}

"""

app = app[:ap_start] + new_artists_page + app[ap_end:]

# PageContent artists case
app = app.replace(
    '      return <ArtistsPage onOpenArtist={onOpenArtist} />',
    """      return (
        <ArtistsPage
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onOpenSong={onOpenSong}
        />
      )""",
)

# ArtistDetailView play button in hero
old_detail_hero = """      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <ArtistAvatar artist={artist} />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <p className="detail-stats">
            {artist.songCount || artistSongs.length}{' '}
            {(artist.songCount || artistSongs.length) === 1 ? 'track' : 'tracks'} · {artistAlbums.length}{' '}
            {artistAlbums.length === 1 ? 'album' : 'albums'}
          </p>
        </div>
      </section>"""

new_detail_hero = """      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <ArtistAvatar artist={artist} />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <p className="detail-stats">
            {artist.songCount || artistSongs.length}{' '}
            {(artist.songCount || artistSongs.length) === 1 ? 'track' : 'tracks'} · {artistAlbums.length}{' '}
            {artistAlbums.length === 1 ? 'album' : 'albums'}
          </p>
          <div className="detail-hero-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={topSongs.length === 0}
              onClick={() => topSongs[0] && playArtistSong(topSongs[0], 0)}
            >
              Play
            </button>
          </div>
        </div>
      </section>"""

if old_detail_hero not in app:
    raise SystemExit('ArtistDetailView hero block not found')
app = app.replace(old_detail_hero, new_detail_hero)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44K: Artist PSD parity + wiring —— */
.psd-artist-album-card {
  border: none;
  background: none;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.psd-artist-album-card:hover .psd-artist-album-art {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.34);
}

.psd-artist-album-art {
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.psd-artist-popular-row.is-active {
  background: rgba(109, 74, 255, 0.12);
}

.psd-artist-popular-row {
  transition: background var(--transition-fast);
}

.psd-artist-popular-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.psd-artist-view-all {
  cursor: pointer;
}

.psd-artist-view-all:hover {
  color: rgba(250, 248, 255, 0.92);
}

.psd-artist-browse-panel {
  margin-top: clamp(24px, 3vw, 36px);
}

.psd-artist-btn--follow {
  cursor: pointer;
}

.detail-hero-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

"""
if 'Phase 44K: Artist PSD parity' not in css:
    marker = '/* —— Phase 44L:'
    if marker in css:
        css = css.replace(marker, css_block + marker)
    else:
        css = css.replace('.psd-artists-destination {', css_block + '.psd-artists-destination {')
    write(CSS, css)

print('Phase 44K artist patch applied')
