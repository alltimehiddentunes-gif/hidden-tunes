#!/usr/bin/env python3
"""Phase 44H — Search page PSD reconstruction + full wiring."""
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

# Remove PSD search demo constants
start = app.index('const PSD_SEARCH_QUERY = ')
end = app.index('\nconst PSD_LIBRARY_TABS = ')
app = app[:start] + app[end + 1:]

# Search helpers + rewritten DiscoverPage
helpers_and_page = '''
const SEARCH_SONG_PREVIEW_LIMIT = 5
const SEARCH_SONG_EXPANDED_LIMIT = 24
const SEARCH_ARTIST_PREVIEW_LIMIT = 4
const SEARCH_ARTIST_EXPANDED_LIMIT = 16
const SEARCH_ALBUM_PREVIEW_LIMIT = 4
const SEARCH_ALBUM_EXPANDED_LIMIT = 16

function formatSongDurationLabel(
  song: { durationSeconds: number | null } | null | undefined,
) {
  if (!song?.durationSeconds || song.durationSeconds <= 0) return '—'
  const total = Math.floor(song.durationSeconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function resolveSearchSongBadges(
  song: {
    audioVersions?: ApiSong['audioVersions']
    highQualityUrl?: string | null
    losslessUrl?: string | null
  } | null | undefined,
): string[] {
  if (!song) return ['SONG']
  const badges: string[] = ['SONG']
  if (song.audioVersions?.lossless?.url || song.losslessUrl) {
    badges.push('FLAC')
  } else if (song.audioVersions?.highQuality?.url || song.highQualityUrl) {
    badges.push('HQ')
  }
  return badges
}

function resolveSearchRowQualityBadge(
  song: {
    audioVersions?: ApiSong['audioVersions']
    highQualityUrl?: string | null
    losslessUrl?: string | null
  } | null | undefined,
) {
  const badges = resolveSearchSongBadges(song)
  return badges.find((badge) => badge !== 'SONG') ?? 'SONG'
}

function formatAlbumSearchMeta(
  album: ApiAlbum,
  artistNames: Map<string, string>,
) {
  const artistName = album.artistId ? artistNames.get(album.artistId) ?? 'Unknown artist' : 'Unknown artist'
  const year = album.releaseYear ? String(album.releaseYear) : null
  return year ? `${artistName} • ${year}` : artistName
}

'''

marker = 'function DiscoverPage({'
if 'SEARCH_SONG_PREVIEW_LIMIT' not in app:
    app = app.replace(marker, helpers_and_page + marker)

# Replace DiscoverPage function body
dp_start = app.index('function DiscoverPage({')
dp_end = app.index('\n\ntype EmotionalWorldChipId')

new_discover_page = '''function DiscoverPage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  query: externalQuery,
  setQuery: externalSetQuery,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
  query?: string
  setQuery?: (value: string) => void
}) {
  const {
    artists,
    albums,
    artistNames,
    indexes,
    searchMetadataIndex,
    showCatalogSkeleton,
    showCatalogError,
    error,
    retry,
  } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [internalQuery, setInternalQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    '',
    parseStoredSearchTerm,
  )
  const query = externalQuery ?? internalQuery
  const setQuery = externalSetQuery ?? setInternalQuery
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isSearchPending = query !== debouncedQuery
  const [sort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSort,
    'latest' as SongSort,
    parseStoredSongSort,
  )

  const searchResult = useMemo(
    () =>
      searchCatalogSongs({
        index: searchMetadataIndex,
        query: debouncedQuery,
      }),
    [debouncedQuery, searchMetadataIndex],
  )

  const visibleRecords = useMemo(
    () => sortMetadataRecords(searchResult.records, sort),
    [searchResult.records, sort],
  )

  const visibleSongs = useMemo(
    () => metadataRecordsToApiSongs(visibleRecords),
    [visibleRecords],
  )

  const trimmedQuery = debouncedQuery.trim()
  const hasEvaluatedQuery = trimmedQuery.length > 0
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playDiscoverSong = useCallback(
    (song: ApiSong, index: number) => {
      const record =
        visibleRecords.find((entry) => entry.id === song.id)
        ?? visibleRecords[index]
      const playableSong = record ? metadataRecordToApiSong(record) : song
      const queueSongs = visibleSongs
      const queueIndex = queueSongs.findIndex((entry) => entry.id === playableSong.id)
      const safeIndex = queueIndex >= 0 ? queueIndex : index

      onOpenSong(
        playableSong,
        queueSongs,
        safeIndex,
        'discover',
        trimmedQuery ? `Search · ${trimmedQuery}` : 'Search',
        {
          seedType: 'discover',
          seedTracks: buildQueueSeedPool('discover', queueSongs, indexes, playableSong),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, trimmedQuery, visibleRecords, visibleSongs],
  )

  const [searchTab, setSearchTab] = useState<'all' | 'songs' | 'artists' | 'albums'>('all')

  const matchedArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, debouncedQuery), 'az'),
    [artists, debouncedQuery],
  )
  const matchedAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, debouncedQuery, artistNames), 'latest'),
    [albums, artistNames, debouncedQuery],
  )

  const topResult = visibleSongs[0] ?? null
  const topResultRecord = visibleRecords[0] ?? null

  const songLimit = searchTab === 'songs'
    ? SEARCH_SONG_EXPANDED_LIMIT
    : SEARCH_SONG_PREVIEW_LIMIT
  const artistLimit = searchTab === 'artists'
    ? SEARCH_ARTIST_EXPANDED_LIMIT
    : SEARCH_ARTIST_PREVIEW_LIMIT
  const albumLimit = searchTab === 'albums'
    ? SEARCH_ALBUM_EXPANDED_LIMIT
    : SEARCH_ALBUM_PREVIEW_LIMIT

  const songRows = useMemo(
    () => visibleSongs.slice(0, songLimit),
    [songLimit, visibleSongs],
  )
  const artistRows = useMemo(
    () => matchedArtists.slice(0, artistLimit),
    [artistLimit, matchedArtists],
  )
  const albumRows = useMemo(
    () => matchedAlbums.slice(0, albumLimit),
    [albumLimit, matchedAlbums],
  )

  const searchTabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
  ] as const

  const showMainResults = searchTab === 'all' || searchTab === 'songs'
  const showArtistPanel = searchTab === 'all' || searchTab === 'artists'
  const showAlbumPanel = searchTab === 'all' || searchTab === 'albums'

  const showNoMatches =
    !isSearchPending &&
    !showCatalogSkeleton &&
    !showCatalogError &&
    hasEvaluatedQuery &&
    visibleSongs.length === 0 &&
    matchedArtists.length === 0 &&
    matchedAlbums.length === 0

  const isSongActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  void onNavigateNav
  void setQuery

  return (
    <div className="psd-search-destination">
      <PageFrame cinematic>
        <header className="psd-search-page-header" aria-labelledby="search-results-heading">
          <h1 id="search-results-heading" className="psd-search-page-title">
            Search Results
          </h1>
          <p className="psd-search-page-subtitle">
            {trimmedQuery ? (
              <>
                Showing results for <strong>&ldquo;{trimmedQuery}&rdquo;</strong>
              </>
            ) : (
              <>Browsing your catalog</>
            )}
          </p>
        </header>

        <div className="psd-search-tab-row" role="tablist" aria-label="Search categories">
          {searchTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`psd-search-tab${searchTab === tab.id ? ' is-active' : ''}`}
              aria-selected={searchTab === tab.id}
              onClick={() => setSearchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showCatalogSkeleton ? (
          <CatalogSkeleton count={8} variant="card" />
        ) : showCatalogError ? (
          <CatalogError message={error || ''} onRetry={retry} />
        ) : showNoMatches ? (
          <CatalogEmpty
            title="No matches found"
            detail={`Nothing in your catalog matched "${trimmedQuery}". Try another search term.`}
          />
        ) : (
          <>
            {showMainResults && topResult ? (
              <section className="psd-search-top-result" aria-label="Top result">
                <span className="psd-search-top-result-label">Top Result</span>
                <div className="psd-search-top-result-card">
                  <button
                    type="button"
                    className="psd-search-top-result-art-btn"
                    aria-label={`Play ${topResult.title}`}
                    onClick={() => playDiscoverSong(topResult, 0)}
                  >
                    <div className="psd-search-top-result-art">
                      <ArtworkImage
                        src={topResult.artwork ?? null}
                        alt=""
                        seed={topResult.id}
                        label={topResult.title}
                        priority
                      />
                      <span className="psd-search-top-result-play" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </div>
                  </button>

                  <div className="psd-search-top-result-meta">
                    <h2>{topResult.title}</h2>
                    <p className="psd-search-top-result-artist">{topResult.artist}</p>
                    <div className="psd-search-top-result-badges">
                      {resolveSearchSongBadges(topResultRecord ?? topResult).map((badge) => (
                        <span key={badge} className="psd-search-quality-badge">{badge}</span>
                      ))}
                    </div>
                  </div>

                  <div className="psd-search-top-result-wave">
                    <PsdWaveformStrip className="psd-search-top-result-waveform" />
                    <span className="psd-search-top-result-duration">
                      {formatSongDurationLabel(topResult)}
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {showMainResults && songRows.length > 0 ? (
              <section className="psd-search-songs-panel" aria-labelledby="search-songs-heading">
                <header className="psd-search-section-header">
                  <h2 id="search-songs-heading">Songs</h2>
                  {searchTab === 'all' && visibleSongs.length > SEARCH_SONG_PREVIEW_LIMIT ? (
                    <button
                      type="button"
                      className="psd-search-view-all"
                      onClick={() => setSearchTab('songs')}
                    >
                      View all
                    </button>
                  ) : null}
                </header>

                <div className="psd-search-songs-card">
                  {songRows.map((song, index) => {
                    const active = isSongActive(song.id)
                    return (
                      <button
                        key={song.id}
                        type="button"
                        className={`psd-search-song-row${active ? ' is-active' : ''}`}
                        onClick={() => playDiscoverSong(song, index)}
                      >
                        <span className="psd-search-song-leading" aria-hidden="true">
                          {active ? <PsdIconEqualizer className="psd-search-equalizer" /> : null}
                        </span>
                        <span className="psd-search-song-thumb">
                          <ArtworkImage
                            src={song.artwork ?? null}
                            alt=""
                            seed={song.id}
                            label={song.title}
                          />
                        </span>
                        <span className="psd-search-song-copy">
                          <strong>{song.title}</strong>
                          <span>{song.artist}</span>
                        </span>
                        <span className="psd-search-quality-badge psd-search-quality-badge--row">
                          {resolveSearchRowQualityBadge(song)}
                        </span>
                        <span className="psd-search-song-duration">
                          {formatSongDurationLabel(song)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {(showArtistPanel && artistRows.length > 0) || (showAlbumPanel && albumRows.length > 0) ? (
              <div className="psd-search-lower-panels">
                {showArtistPanel && artistRows.length > 0 ? (
                  <section className="psd-search-side-panel" aria-labelledby="search-artists-heading">
                    <header className="psd-search-section-header">
                      <h2 id="search-artists-heading">Artists</h2>
                      {searchTab === 'all' && matchedArtists.length > SEARCH_ARTIST_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="psd-search-view-all"
                          onClick={() => setSearchTab('artists')}
                        >
                          View all
                        </button>
                      ) : null}
                    </header>
                    <div className="psd-search-side-card">
                      {artistRows.map((artist) => (
                        <button
                          key={artist.id}
                          type="button"
                          className="psd-search-side-row"
                          onClick={() => onOpenArtist(artist)}
                        >
                          <span className="psd-search-side-avatar">
                            <ArtistAvatar artist={artist} />
                          </span>
                          <span className="psd-search-side-copy">
                            <strong>{artist.name}</strong>
                          </span>
                          <PsdIconChevronRight className="psd-search-side-chevron" />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {showAlbumPanel && albumRows.length > 0 ? (
                  <section className="psd-search-side-panel" aria-labelledby="search-albums-heading">
                    <header className="psd-search-section-header">
                      <h2 id="search-albums-heading">Albums</h2>
                      {searchTab === 'all' && matchedAlbums.length > SEARCH_ALBUM_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="psd-search-view-all"
                          onClick={() => setSearchTab('albums')}
                        >
                          View all
                        </button>
                      ) : null}
                    </header>
                    <div className="psd-search-side-card">
                      {albumRows.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          className="psd-search-side-row"
                          onClick={() => onOpenAlbum(album)}
                        >
                          <span className="psd-search-side-art">
                            <ArtworkImage
                              src={album.artwork ?? null}
                              alt=""
                              seed={album.id}
                              label={album.title}
                            />
                          </span>
                          <span className="psd-search-side-copy">
                            <strong>{album.title}</strong>
                            <span>{formatAlbumSearchMeta(album, artistNames)}</span>
                          </span>
                          <PsdIconChevronRight className="psd-search-side-chevron" />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </PageFrame>
    </div>
  )
}

'''

app = app[:dp_start] + new_discover_page + app[dp_end:]

# PageContent discover wiring
app = app.replace(
    """    case 'discover':
      return (
        <DiscoverPage
          onOpenSong={onOpenSong}
          query={discoverQuery}
          setQuery={setDiscoverQuery}
        />
      )""",
    """    case 'discover':
      return (
        <DiscoverPage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          query={discoverQuery}
          setQuery={setDiscoverQuery}
        />
      )""",
)

# AppShell default discover query
app = app.replace(
    """  const [discoverQuery, setDiscoverQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    PSD_SEARCH_QUERY,
    parseStoredSearchTerm,
  )""",
    """  const [discoverQuery, setDiscoverQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    '',
    parseStoredSearchTerm,
  )""",
)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44H: Search PSD parity + wiring cleanup —— */
.psd-search-destination .catalog-empty {
  margin-top: clamp(18px, 2.6vw, 28px);
  padding: clamp(28px, 4vw, 40px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(16, 14, 24, 0.82), rgba(8, 8, 14, 0.94));
}

.psd-search-song-row {
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);
}

.psd-search-song-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.psd-search-side-row {
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);
}

.psd-search-side-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.psd-search-view-all {
  cursor: pointer;
}

.psd-search-view-all:hover {
  color: rgba(250, 248, 255, 0.92);
}

"""
marker_css = '/* —— Phase 44I:'
if 'Phase 44H: Search PSD parity' not in css:
    if marker_css in css:
        css = css.replace(marker_css, css_block + marker_css)
    else:
        css = css.replace(
            '/* —— Phase 42B: Remaining PSD destination pages —— */',
            css_block + '/* —— Phase 42B: Remaining PSD destination pages —— */',
        )
    write(CSS, css)

print('Phase 44H search patch applied')
