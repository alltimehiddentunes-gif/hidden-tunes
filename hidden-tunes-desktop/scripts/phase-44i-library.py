#!/usr/bin/env python3
"""Phase 44I — Library page PSD reconstruction + wiring."""
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

# Replace library constants block
old_constants = """const PSD_LIBRARY_TABS = ['Overview', 'Songs', 'Albums', 'Artists', 'Playlists', 'Podcasts', 'Genres'] as const

const PSD_LIBRARY_STATS = [
  { key: 'songs', label: 'Songs', value: '1,248', hint: 'All Songs', tone: 'violet' },
  { key: 'albums', label: 'Albums', value: '156', hint: 'In Collection', tone: 'purple' },
  { key: 'artists', label: 'Artists', value: '89', hint: 'Followed', tone: 'orange' },
  { key: 'playlists', label: 'Playlists', value: '32', hint: 'Created', tone: 'pink' },
  { key: 'liked', label: 'Liked Songs', value: '482', hint: 'Favorites', tone: 'magenta' },
] as const

const PSD_LIBRARY_RECENT = [
  { title: 'Midnight Reflection', artist: 'Wills Afrobeats', tone: 'violet' },
  { title: 'Afro Sunset', artist: 'Wills Afrobeats', tone: 'sunset' },
  { title: 'Healing Slowly', artist: 'Wills Afrobeats', tone: 'moon' },
  { title: 'Night Drive', artist: 'Wills Afrobeats', tone: 'neon' },
  { title: 'Jazz Café', artist: 'Wills Afrobeats', tone: 'jazz' },
  { title: 'Love Vibes', artist: 'Wills Afrobeats', tone: 'love' },
] as const

const PSD_LIBRARY_PLAYLISTS = [
  { title: 'Deep Focus', count: '22 songs', tone: 'forest' },
  { title: 'Afro Vibes', count: '28 songs', tone: 'afro' },
  { title: 'Chill & Relax', count: '40 songs', tone: 'lounge' },
  { title: 'Workout Mix', count: '25 songs', tone: 'run' },
  { title: 'Late Night Drive', count: '19 songs', tone: 'drive' },
  { title: 'Rainy Day Comfort', count: '31 songs', tone: 'rain' },
] as const"""

new_constants = """const LIBRARY_TABS = ['Overview', 'Songs', 'Albums', 'Artists', 'Playlists'] as const
type LibraryTabId = (typeof LIBRARY_TABS)[number]

const LIBRARY_CARD_TONES = [
  'violet',
  'sunset',
  'moon',
  'neon',
  'jazz',
  'love',
  'forest',
  'afro',
  'lounge',
  'run',
  'drive',
  'rain',
] as const

const LIBRARY_CURATED_PLAYLISTS = [
  { title: 'Deep Focus', tone: 'forest' },
  { title: 'Afro Vibes', tone: 'afro' },
  { title: 'Chill & Relax', tone: 'lounge' },
  { title: 'Workout Mix', tone: 'run' },
  { title: 'Late Night Drive', tone: 'drive' },
  { title: 'Rainy Day Comfort', tone: 'rain' },
] as const

const LIBRARY_RECENT_PREVIEW = 6
const LIBRARY_TAB_LIMIT = 24

function formatLibraryCount(value: number) {
  return value.toLocaleString()
}

function filterSongsByLibraryQuery(songs: ApiSong[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return songs
  return songs.filter((song) => {
    const haystack = [song.title, song.artist, song.album, song.genre, song.mood]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}"""

if old_constants not in app:
    raise SystemExit('library constants block not found')
app = app.replace(old_constants, new_constants)

helpers_marker = 'function PsdLibraryStatIcon'
library_helpers = '''
function buildLibraryStats({
  songCount,
  albumCount,
  artistCount,
  playlistCount,
}: {
  songCount: number
  albumCount: number
  artistCount: number
  playlistCount: number
}) {
  return [
    {
      key: 'songs',
      label: 'Songs',
      value: formatLibraryCount(songCount),
      hint: 'All Songs',
      tone: 'violet',
      tab: 'Songs' as LibraryTabId,
    },
    {
      key: 'albums',
      label: 'Albums',
      value: formatLibraryCount(albumCount),
      hint: 'In Collection',
      tone: 'purple',
      nav: 'albums' as NavKey,
    },
    {
      key: 'artists',
      label: 'Artists',
      value: formatLibraryCount(artistCount),
      hint: 'In Catalog',
      tone: 'orange',
      nav: 'artists' as NavKey,
    },
    {
      key: 'playlists',
      label: 'Playlists',
      value: formatLibraryCount(playlistCount),
      hint: 'Curated',
      tone: 'pink',
      tab: 'Playlists' as LibraryTabId,
    },
  ]
}

'''

if 'function buildLibraryStats' not in app:
    app = app.replace(helpers_marker, library_helpers + helpers_marker)

lp_start = app.index('function LibraryPage(')
lp_end = app.index('\n\nfunction ArtistsPage(')

new_library_page = '''function LibraryPage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  query = '',
  setPlaylistsQuery,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
  query?: string
  setPlaylistsQuery?: (value: string) => void
}) {
  const { songs, albums, artists, artistNames, indexes, artworkContext } = useCatalog()
  const [tab, setTab] = useState<LibraryTabId>('Overview')
  const recentRowRef = useRef<HTMLDivElement>(null)

  const filteredSongs = useMemo(
    () => sortSongsList(filterSongsByLibraryQuery(songs, query), 'latest'),
    [query, songs],
  )
  const filteredAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, query, artistNames), 'latest'),
    [albums, artistNames, query],
  )
  const filteredArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, query), 'az'),
    [artists, query],
  )

  const recentCards = useMemo(
    () => filteredSongs.slice(0, LIBRARY_RECENT_PREVIEW),
    [filteredSongs],
  )
  const songTabCards = useMemo(
    () => filteredSongs.slice(0, LIBRARY_TAB_LIMIT),
    [filteredSongs],
  )
  const albumTabCards = useMemo(
    () => filteredAlbums.slice(0, LIBRARY_TAB_LIMIT),
    [filteredAlbums],
  )
  const artistTabCards = useMemo(
    () => filteredArtists.slice(0, LIBRARY_TAB_LIMIT),
    [filteredArtists],
  )

  const playlistCards = useMemo(
    () => LIBRARY_CURATED_PLAYLISTS.map((playlist, index) => {
      const sliceStart = index * 4
      const playlistSongs = filteredSongs.slice(sliceStart, sliceStart + 12)
      const coverArt = getArtworkForPlaylist(
        { title: playlist.title, songs: playlistSongs },
        artworkContext,
      )
      return {
        ...playlist,
        songCount: playlistSongs.length,
        countLabel: `${playlistSongs.length} ${playlistSongs.length === 1 ? 'song' : 'songs'}`,
        collage: getArtworkForPlaylistCollage(playlistSongs, artworkContext),
        coverArt,
      }
    }),
    [artworkContext, filteredSongs],
  )

  const libraryStats = useMemo(
    () => buildLibraryStats({
      songCount: songs.length,
      albumCount: albums.length,
      artistCount: artists.length,
      playlistCount: LIBRARY_CURATED_PLAYLISTS.length,
    }),
    [albums.length, artists.length, songs.length],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playLibrarySong = useCallback(
    (song: ApiSong, queue: ApiSong[], queueTitle: string) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'manual', queueTitle, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const playRecentSong = useCallback(
    (song: ApiSong) => {
      playLibrarySong(song, filteredSongs, 'Recently Added')
    },
    [filteredSongs, playLibrarySong],
  )

  const openPlaylist = useCallback(
    (title: string) => {
      setPlaylistsQuery?.(title)
      onNavigateNav('playlists')
    },
    [onNavigateNav, setPlaylistsQuery],
  )

  const scrollRecentRow = useCallback((direction: 'prev' | 'next') => {
    const node = recentRowRef.current
    if (!node) return
    const amount = Math.max(220, node.clientWidth * 0.82)
    node.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: 'smooth',
    })
  }, [])

  const showStats = tab === 'Overview'
  const showSongs = tab === 'Overview' || tab === 'Songs'
  const showAlbums = tab === 'Overview' || tab === 'Albums'
  const showArtists = tab === 'Overview' || tab === 'Artists'
  const showPlaylists = tab === 'Overview' || tab === 'Playlists'
  const hasVisibleContent =
    filteredSongs.length > 0
    || filteredAlbums.length > 0
    || filteredArtists.length > 0
    || playlistCards.some((playlist) => playlist.songCount > 0)

  return (
    <div className="psd-library-destination">
      <PageFrame cinematic>
        <header className="psd-library-header" aria-labelledby="library-heading">
          <h1 id="library-heading" className="psd-library-title">My Library</h1>
          <p className="psd-library-subtitle">All your music, in one place.</p>
        </header>

        <div className="psd-library-toolbar">
          <div className="psd-library-tabs" role="tablist" aria-label="Library sections">
            {LIBRARY_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                className={`psd-library-tab${tab === entry ? ' is-active' : ''}`}
                aria-selected={tab === entry}
                onClick={() => setTab(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        {showStats ? (
          <section className="psd-library-stats" aria-label="Library statistics">
            {libraryStats.map((card) => (
              <button
                key={card.key}
                type="button"
                className="psd-library-stat-card"
                data-tone={card.tone}
                onClick={() => {
                  if ('nav' in card && card.nav) {
                    onNavigateNav(card.nav)
                    return
                  }
                  if ('tab' in card && card.tab) {
                    setTab(card.tab)
                  }
                }}
              >
                <span className="psd-library-stat-icon" aria-hidden="true">
                  <PsdLibraryStatIcon type={card.key} />
                </span>
                <span className="psd-library-stat-copy">
                  <span className="psd-library-stat-label">{card.label}</span>
                  <strong className="psd-library-stat-value">{card.value}</strong>
                  <span className="psd-library-stat-hint">{card.hint}</span>
                </span>
              </button>
            ))}
          </section>
        ) : null}

        {!hasVisibleContent ? (
          <CatalogEmpty
            title={query.trim() ? 'No library matches' : 'Your library is empty'}
            detail={
              query.trim()
                ? `Nothing in your catalog matched "${query.trim()}".`
                : 'Songs will appear here once your catalog loads.'
            }
          />
        ) : null}

        {showSongs && (tab === 'Songs' ? songTabCards : recentCards).length > 0 ? (
          <section className="psd-library-section" aria-labelledby="recently-added-heading">
            <header className="psd-library-section-header">
              <h2 id="recently-added-heading">
                {tab === 'Songs' ? 'Songs' : 'Recently Added'}
              </h2>
              {tab === 'Overview' && filteredSongs.length > LIBRARY_RECENT_PREVIEW ? (
                <div className="psd-library-section-actions">
                  <button
                    type="button"
                    className="psd-library-view-all"
                    onClick={() => setTab('Songs')}
                  >
                    View all
                  </button>
                  <button
                    type="button"
                    aria-label="Previous recently added"
                    className="psd-library-round-btn"
                    onClick={() => scrollRecentRow('prev')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Next recently added"
                    className="psd-library-round-btn"
                    onClick={() => scrollRecentRow('next')}
                  >
                    <PsdIconChevronRight />
                  </button>
                </div>
              ) : null}
            </header>
            <div
              ref={tab === 'Overview' ? recentRowRef : undefined}
              className={`psd-library-card-row${tab === 'Overview' ? ' psd-library-card-row--scroll' : ''}`}
            >
              {(tab === 'Songs' ? songTabCards : recentCards).map((song, index) => (
                <article
                  key={song.id}
                  className="psd-library-cover-card"
                  data-tone={LIBRARY_CARD_TONES[index % LIBRARY_CARD_TONES.length]}
                >
                  <div className="psd-library-cover-art">
                    <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="psd-library-play-btn"
                      aria-label={`Play ${song.title}`}
                      onClick={() => playRecentSong(song)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {showAlbums && tab === 'Albums' && albumTabCards.length > 0 ? (
          <section className="psd-library-section" aria-labelledby="library-albums-heading">
            <header className="psd-library-section-header">
              <h2 id="library-albums-heading">Albums</h2>
              {filteredAlbums.length > LIBRARY_TAB_LIMIT ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => onNavigateNav('albums')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row">
              {albumTabCards.map((album, index) => (
                <button
                  key={album.id}
                  type="button"
                  className="psd-library-cover-card"
                  data-tone={LIBRARY_CARD_TONES[index % LIBRARY_CARD_TONES.length]}
                  onClick={() => onOpenAlbum(album)}
                >
                  <div className="psd-library-cover-art">
                    <ArtworkImage
                      src={album.artwork}
                      alt=""
                      seed={album.id}
                      label={album.title}
                    />
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{album.title}</strong>
                    <span>{formatAlbumSearchMeta(album, artistNames)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showArtists && tab === 'Artists' && artistTabCards.length > 0 ? (
          <section className="psd-library-section" aria-labelledby="library-artists-heading">
            <header className="psd-library-section-header">
              <h2 id="library-artists-heading">Artists</h2>
              {filteredArtists.length > LIBRARY_TAB_LIMIT ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => onNavigateNav('artists')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row psd-library-card-row--artists">
              {artistTabCards.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  className="psd-library-cover-card psd-library-cover-card--artist"
                  onClick={() => onOpenArtist(artist)}
                >
                  <div className="psd-library-cover-art psd-library-cover-art--artist">
                    <ArtistAvatar artist={artist} />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{artist.name}</strong>
                    <span>{artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showPlaylists && playlistCards.some((playlist) => playlist.songCount > 0) ? (
          <section className="psd-library-section psd-library-section--playlists" aria-labelledby="your-playlists-heading">
            <header className="psd-library-section-header">
              <h2 id="your-playlists-heading">Your Playlists</h2>
              {tab === 'Overview' ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => setTab('Playlists')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row">
              {playlistCards.filter((playlist) => playlist.songCount > 0).map((playlist) => (
                <button
                  key={playlist.title}
                  type="button"
                  className="psd-library-cover-card psd-library-cover-card--playlist"
                  data-tone={playlist.tone}
                  onClick={() => openPlaylist(playlist.title)}
                >
                  <div className="psd-library-cover-art">
                    {playlist.coverArt ? (
                      <ArtworkImage
                        src={playlist.coverArt}
                        alt=""
                        seed={playlist.title}
                        label={playlist.title}
                      />
                    ) : (
                      <ArtworkCollage
                        urls={playlist.collage}
                        seed={playlist.title}
                        label={playlist.title}
                      />
                    )}
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{playlist.title}</strong>
                    <span>{playlist.countLabel}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}

'''

app = app[:lp_start] + new_library_page + app[lp_end:]

# PageContent library wiring
app = app.replace(
    """    case 'library':
      return <LibraryPage onOpenSong={onOpenSong} />""",
    """    case 'library':
      return (
        <LibraryPage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          query={libraryQuery}
          setPlaylistsQuery={setPlaylistsQuery}
        />
      )""",
)

# Thread libraryQuery through PageContent
if 'libraryQuery' not in app.split('function PageContent')[1].split('function App')[0]:
    app = app.replace(
        '  playlistsQuery = \'\',\n  setPlaylistsQuery,',
        '  playlistsQuery = \'\',\n  setPlaylistsQuery,\n  libraryQuery = \'\',',
    )
    app = app.replace(
        '  setPlaylistsQuery?: (value: string) => void\n}) {\n  void _onOpenMood',
        '  setPlaylistsQuery?: (value: string) => void\n  libraryQuery?: string\n}) {\n  void _onOpenMood',
    )
    app = app.replace(
        '  setPlaylistsQuery,\n}: {\n  page: PageId',
        "  setPlaylistsQuery,\n  libraryQuery = '',\n}: {\n  page: PageId",
    )

# CatalogDetailRouter
app = app.replace(
        '  playlistsQuery = \'\',\n  setPlaylistsQuery,\n}: {\n  activeView: ActiveView',
        '  playlistsQuery = \'\',\n  setPlaylistsQuery,\n  libraryQuery = \'\',\n}: {\n  activeView: ActiveView',
    )
app = app.replace(
        '  setPlaylistsQuery?: (value: string) => void\n}) {\n  if (activeView === \'song\'',
        '  setPlaylistsQuery?: (value: string) => void\n  libraryQuery?: string\n}) {\n  if (activeView === \'song\'',
    )

# Pass libraryQuery in CatalogDetailRouter call from AppShell
app = app.replace(
        '                  playlistsQuery={playlistsQuery}\n                  setPlaylistsQuery={setPlaylistsQuery}',
        '                  playlistsQuery={playlistsQuery}\n                  setPlaylistsQuery={setPlaylistsQuery}\n                  libraryQuery={libraryQuery}',
    )

# Pass libraryQuery through PageContent invocation
app = app.replace(
    '      setPlaylistsQuery={setPlaylistsQuery}\n    />\n  )\n}\n\nfunction PageContent({',
    '      setPlaylistsQuery={setPlaylistsQuery}\n      libraryQuery={libraryQuery}\n    />\n  )\n}\n\nfunction PageContent({',
)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44I: Library PSD parity + wiring —— */
.psd-library-stat-card {
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.psd-library-stat-card:hover {
  border-color: rgba(255, 255, 255, 0.14);
  transform: translateY(-1px);
}

.psd-library-card-row--scroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.psd-library-card-row--scroll .psd-library-cover-card {
  flex: 0 0 clamp(148px, 14vw, 188px);
  scroll-snap-align: start;
}

.psd-library-card-row--artists .psd-library-cover-art--artist {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
}

.psd-library-card-row--artists .artist-avatar {
  width: 100%;
  height: 100%;
}

.psd-library-cover-card--playlist,
.psd-library-cover-card--artist {
  border: none;
  background: none;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.psd-library-view-all:hover,
.psd-library-round-btn:hover {
  color: rgba(250, 248, 255, 0.9);
}

.psd-library-destination .catalog-empty {
  margin-bottom: clamp(18px, 2.6vw, 28px);
}

"""
if 'Phase 44I: Library PSD parity' not in css:
    marker = '/* —— Phase 44J:'
    if marker in css:
        css = css.replace(marker, css_block + marker)
    else:
        css = css.replace(
            '.psd-library-destination {',
            css_block + '.psd-library-destination {',
        )
    write(CSS, css)

print('Phase 44I library patch applied')
