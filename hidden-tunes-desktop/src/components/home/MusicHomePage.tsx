import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import { buildQueueCandidatePools, buildQueueSeedPool } from '../../lib/catalogIndexes'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  EMOTIONAL_WORLD_CHIPS,
  HOME_CATALOG_PAGE_SIZE,
  HOME_SECTION_PREVIEW_LIMIT,
  HOME_UI,
  buildAlbumsWorthStayingWith,
  buildBecauseYouListenedSongs,
  buildCreatorsInOrbit,
  buildGenreSpotlightCards,
  buildHomeHeroCards,
  buildMoodRooms,
  buildOpenRooms,
  buildRecentlyAddedSongs,
  buildSmartMusicQueueSongs,
  songsReadyLabel,
} from '../../lib/home/mobileHomeParity'
import { resolveContinueSongs } from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { setPendingMusicResumeSeconds } from '../../lib/music/musicPlaybackSession'
import { ArtworkImage } from '../ArtworkImage'

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

type HomeNavKey =
  | 'home'
  | 'music'
  | 'radio'
  | 'podcasts'
  | 'audiobooks'
  | 'motivationals'
  | 'lectures'
  | 'tv'
  | 'sports'
  | 'worlds'
  | 'search'
  | 'library'
  | 'liked'
  | 'recent'
  | 'downloads'
  | 'playlists'
  | 'artists'
  | 'albums'
  | 'premium'
  | 'settings'

type MusicHomePageProps = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  artistNames: Map<string, string>
  indexes: CatalogIndexes
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  error: string | null
  retry: () => void
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: HomeNavKey) => void
  onBrowseSearch: (query: string) => void
}

const FAMILY_SHORTCUTS = [
  { navKey: 'radio' as const, label: HOME_UI.shortcuts.radio, hint: 'Live stations', accent: 'gold' },
  { navKey: 'podcasts' as const, label: HOME_UI.shortcuts.podcasts, hint: 'Shows & episodes', accent: 'rose' },
  { navKey: 'audiobooks' as const, label: HOME_UI.shortcuts.audiobooks, hint: 'Books & chapters', accent: 'amber' },
  /** Desktop has no /more hub yet — Worlds is the closest non-Library discovery surface. */
  { navKey: 'worlds' as const, label: HOME_UI.shortcuts.more, hint: 'Explore rooms', accent: 'cyan' },
]

/** Bound ArtworkImage — global `.art-frame` is absolute/inset and escapes without a shell. */
function HomeArt({
  src,
  seed,
  label,
  priority = false,
  size = 'rail',
}: {
  src: string | null
  seed: string
  label: string
  priority?: boolean
  size?: 'rail' | 'thumb' | 'hero'
}) {
  return (
    <span className={`music-home-art music-home-art--${size}`} aria-hidden="true">
      <ArtworkImage src={src} alt="" seed={seed} label={label} priority={priority} />
    </span>
  )
}

const MusicHomeSection = memo(function MusicHomeSection({
  eyebrow,
  title,
  meta,
  onSeeAll,
  seeAllLabel = HOME_UI.sections.seeAll,
  loading,
  error,
  onRetry,
  children,
}: {
  eyebrow?: string
  title: string
  meta?: string
  onSeeAll?: () => void
  seeAllLabel?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  children: ReactNode
}) {
  const headingId = `music-home-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <section className="music-home-section music-home-section--parity" aria-labelledby={headingId}>
      <header className="music-home-section-header">
        <div>
          {eyebrow ? <p className="music-home-section-eyebrow">{eyebrow}</p> : null}
          <h2 id={headingId}>{title}</h2>
        </div>
        <div className="music-home-section-header-end">
          {meta ? <span className="music-home-section-meta">{meta}</span> : null}
          {onSeeAll ? (
            <button type="button" className="music-home-view-all" onClick={onSeeAll}>
              {seeAllLabel}
            </button>
          ) : null}
        </div>
      </header>
      {loading ? (
        <div className="music-home-skeleton" aria-busy="true" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="music-home-skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="music-home-section-error" role="alert">
          <p>This section could not be loaded.</p>
          {onRetry ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </section>
  )
})

export const MusicHomePage = memo(function MusicHomePage({
  songs,
  albums,
  artists,
  artistNames,
  indexes,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  onBrowseSearch,
}: MusicHomePageProps) {
  const { continueListening, recentlyPlayed } = useMusicLocalState()
  const { currentTrack, currentQueue } = useDesktopPlayback()
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(HOME_CATALOG_PAGE_SIZE)
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playFromQueue = useCallback(
    (song: ApiSong, queue: ApiSong[], queueTitle: string) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'home', queueTitle, {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const continueRows = useMemo(
    () => resolveContinueSongs(continueListening, indexes.songsById, 8),
    [continueListening, indexes.songsById],
  )

  const recentHead = useMemo(() => {
    const first = recentlyPlayed[0]
    if (!first) return null
    return indexes.songsById.get(first.songId) ?? null
  }, [indexes.songsById, recentlyPlayed])

  const heroCards = useMemo(
    () => buildHomeHeroCards(songs, currentTrack, recentHead),
    [currentTrack, recentHead, songs],
  )

  const moodRooms = useMemo(() => buildMoodRooms(songs), [songs])
  const openRooms = useMemo(() => buildOpenRooms(songs), [songs])
  const recentlyAdded = useMemo(
    () => buildRecentlyAddedSongs(songs, HOME_SECTION_PREVIEW_LIMIT),
    [songs],
  )
  const becauseYouListened = useMemo(
    () => buildBecauseYouListenedSongs(songs, recentlyPlayed, indexes.songsById),
    [indexes.songsById, recentlyPlayed, songs],
  )
  const smartQueue = useMemo(
    () => buildSmartMusicQueueSongs(currentQueue, songs),
    [currentQueue, songs],
  )
  const creators = useMemo(() => buildCreatorsInOrbit(artists), [artists])
  const albumsWorth = useMemo(() => buildAlbumsWorthStayingWith(albums), [albums])
  const genreSpotlights = useMemo(
    () => buildGenreSpotlightCards(indexes, recentlyPlayed),
    [indexes, recentlyPlayed],
  )

  const visibleCatalogSongs = useMemo(
    () => songs.slice(0, visibleCatalogCount),
    [songs, visibleCatalogCount],
  )
  const canLoadMore = visibleCatalogCount < songs.length

  const listeningBrief = currentTrack?.title
    ? {
        label: HOME_UI.listening.nowPlaying,
        title: currentTrack.title,
        subtitle: currentTrack.artist || 'Hidden Tunes',
      }
    : {
        label: HOME_UI.listening.nowPlaying,
        title: HOME_UI.listening.nothingPlaying,
        subtitle: HOME_UI.listening.tapToStart,
      }

  const catalogError = showCatalogError ? error : null
  const genreTitle = genreSpotlights.personalized
    ? HOME_UI.sections.madeForYou
    : HOME_UI.sections.moodGenreSpotlights

  return (
    <div
      className="music-home music-home--parity music-home--content-first music-home--premium"
      aria-label="Home"
      data-home-parity="mobile"
      data-home-layout="content-first"
      data-home-polish="premium"
    >
      <button
        type="button"
        className="music-home-search-launcher"
        onClick={() => {
          onBrowseSearch('')
          onNavigateNav('search')
        }}
      >
        <span>{HOME_UI.searchLauncher}</span>
      </button>

      {heroCards.length > 0 ? (
        <section className="music-home-hero-carousel" aria-label="Featured">
          <div className="music-home-hero-track">
            {heroCards.map((card) => (
              <article
                key={card.key}
                className={`music-home-hero-card${card.isCurrent ? ' is-current' : ''}`}
              >
                <button
                  type="button"
                  className="music-home-hero-card-hit"
                  onClick={() =>
                    playFromQueue(
                      card.song,
                      songs.slice(0, 24),
                      card.isCurrent ? HOME_UI.hero.nowPlayingFallback : card.label,
                    )
                  }
                  aria-label={`${HOME_UI.hero.play} ${card.title}`}
                >
                  <HomeArt
                    src={card.song.artwork}
                    seed={card.song.id}
                    label={card.title}
                    size="hero"
                    priority={card.key.startsWith('featured') || Boolean(card.isCurrent)}
                  />
                  <div className="music-home-hero-card-copy">
                    <span className="music-home-hero-card-pill">{card.label}</span>
                    <strong title={card.title}>{card.title}</strong>
                    <span title={card.subtitle}>{card.subtitle}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : showCatalogSkeleton ? (
        <div className="music-home-hero-carousel music-home-hero-carousel--skeleton" aria-busy="true" />
      ) : null}

      {continueRows.length > 0 ? (
        <MusicHomeSection title="Continue Listening" eyebrow="RESUME">
          <div className="music-home-continue-grid">
            {continueRows.map(({ entry, song }) => (
              <button
                key={entry.songId}
                type="button"
                className="music-home-continue-hit"
                onClick={() => {
                  setPendingMusicResumeSeconds(entry.positionSeconds)
                  playFromQueue(song, [song], 'Continue Listening')
                }}
                aria-label={`Resume ${song.title} by ${song.artist}`}
              >
                <HomeArt src={song.artwork} seed={song.id} label={song.title} size="thumb" />
                <div className="music-home-continue-copy">
                  <strong title={song.title}>{song.title}</strong>
                  <span title={song.artist}>{song.artist}</span>
                </div>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      <div className="music-home-signal-row" aria-label="Catalog signals">
        <span className="music-home-signal-pill music-home-signal-pill--ready">
          {songsReadyLabel(songs.length)}
        </span>
        <span className="music-home-signal-pill music-home-signal-pill--rooms">
          {HOME_UI.signals.curatedRooms}
        </span>
      </div>

      <button
        type="button"
        className={`music-home-listening-brief${currentTrack ? ' is-active' : ' is-idle'}`}
        onClick={() => {
          if (currentTrack) return
          onBrowseSearch('')
          onNavigateNav('search')
        }}
        aria-label={listeningBrief.title}
      >
        <div className="music-home-listening-brief-copy">
          <span className="music-home-section-eyebrow">{listeningBrief.label}</span>
          <strong title={listeningBrief.title}>{listeningBrief.title}</strong>
          <span title={listeningBrief.subtitle}>{listeningBrief.subtitle}</span>
        </div>
      </button>

      <div className="music-home-family-grid" aria-label="Discovery shortcuts">
        {FAMILY_SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.navKey}
            type="button"
            className={`music-home-family-card music-home-family-card--${shortcut.accent}`}
            onClick={() => onNavigateNav(shortcut.navKey)}
          >
            <span className="music-home-family-mark" aria-hidden="true" />
            <span className="music-home-family-copy">
              <strong>{shortcut.label}</strong>
              <span>{shortcut.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Desktop content-first: surface a music rail immediately after chrome */}
      <MusicHomeSection
        eyebrow={HOME_UI.sections.new}
        title={HOME_UI.sections.recentlyAdded}
        meta={recentlyAdded.length > 0 ? HOME_UI.sections.play : undefined}
        loading={showCatalogSkeleton && recentlyAdded.length === 0}
        error={catalogError && recentlyAdded.length === 0 ? catalogError : null}
        onRetry={retry}
      >
        {recentlyAdded.length > 0 ? (
          <div className="music-home-song-rail">
            {recentlyAdded.map((song) => (
              <button
                key={`recently-top-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, recentlyAdded, HOME_UI.sections.recentlyAdded)}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                <strong title={song.title}>{song.title}</strong>
                <span title={song.artist}>{song.artist}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="music-home-section-empty">{HOME_UI.recentlyAddedEmpty}</p>
        )}
      </MusicHomeSection>

      <section className="music-home-section music-home-section--parity" aria-labelledby="music-home-emotional-worlds">
        <header className="music-home-section-header">
          <div>
            <h2 id="music-home-emotional-worlds">{HOME_UI.emotionalWorlds.title}</h2>
            <p className="music-home-section-hint">{HOME_UI.emotionalWorlds.subtitle}</p>
          </div>
        </header>
        <div className="music-home-emotion-chips">
          {EMOTIONAL_WORLD_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="music-home-emotion-chip"
              onClick={() => {
                onBrowseSearch(chip.query)
                onNavigateNav('worlds')
              }}
            >
              {chip.title}
            </button>
          ))}
        </div>
      </section>

      {moodRooms.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.forYourMood} title={HOME_UI.sections.moodRooms}>
          <div className="music-home-room-grid">
            {moodRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="music-home-room-card"
                onClick={() => playFromQueue(room.songs[0], room.songs, room.title)}
                aria-label={`Play ${room.title}`}
              >
                <HomeArt src={room.artwork} seed={room.id} label={room.title} />
                <strong>{room.title}</strong>
                <span>{room.subtitle}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {becauseYouListened.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.listener} title={HOME_UI.sections.becauseYouListened}>
          <div className="music-home-song-rail">
            {becauseYouListened.map((song) => (
              <button
                key={`because-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() =>
                  playFromQueue(song, becauseYouListened, HOME_UI.sections.becauseYouListened)
                }
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                <strong title={song.title}>{song.title}</strong>
                <span title={song.artist}>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {smartQueue.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.next} title={HOME_UI.sections.smartMusicQueue}>
          <div className="music-home-song-rail">
            {smartQueue.map((song) => (
              <button
                key={`smart-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, smartQueue, HOME_UI.sections.smartMusicQueue)}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                <strong title={song.title}>{song.title}</strong>
                <span title={song.artist}>{song.artist}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {creators.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.creators} title={HOME_UI.sections.creatorsInOrbit}>
          <div className="music-home-artist-grid">
            {creators.map((artist) => (
              <button
                key={artist.id}
                type="button"
                className="music-home-artist-card"
                onClick={() => onOpenArtist(artist)}
                aria-label={`Open ${artist.name}`}
              >
                <HomeArt src={artist.artwork} seed={artist.id} label={artist.name} />
                <strong title={artist.name}>{artist.name}</strong>
                <span>
                  {`${indexes.songsByArtistId.get(artist.id)?.length
                    ?? indexes.songsByArtistName.get(artist.name.trim().toLowerCase())?.length
                    ?? 0} songs`}
                </span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {albumsWorth.length > 0 ? (
        <MusicHomeSection
          eyebrow={HOME_UI.sections.collections}
          title={HOME_UI.sections.albumsWorthStaying}
        >
          <div className="music-home-album-grid">
            {albumsWorth.map((album) => (
              <button
                key={album.id}
                type="button"
                className="music-home-album-card"
                onClick={() => onOpenAlbum(album)}
                aria-label={`Open ${album.title}`}
              >
                <HomeArt src={album.artwork} seed={album.id} label={album.title} />
                <strong title={album.title}>{album.title}</strong>
                <span>
                  {album.artistId
                    ? artistNames.get(album.artistId) ?? 'Hidden Tunes'
                    : 'Hidden Tunes'}
                </span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {openRooms.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.rooms} title={HOME_UI.sections.openRooms}>
          <div className="music-home-room-grid">
            {openRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="music-home-room-card"
                onClick={() => playFromQueue(room.songs[0], room.songs, room.title)}
                aria-label={`Play ${room.title}`}
              >
                <HomeArt src={room.artwork} seed={room.id} label={room.title} />
                <strong>{room.title}</strong>
                <span>{room.subtitle}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {genreSpotlights.cards.length > 0 ? (
        <MusicHomeSection
          eyebrow={HOME_UI.sections.genres}
          title={genreTitle}
          onSeeAll={() => onNavigateNav('worlds')}
        >
          <div className="music-home-song-rail">
            {genreSpotlights.cards.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className="music-home-song-card"
                onClick={() => {
                  if (genre.songs[0]) playFromQueue(genre.songs[0], genre.songs, genre.label)
                }}
                aria-label={`Play ${genre.label}`}
              >
                <HomeArt src={genre.artworkUrl} seed={genre.id} label={genre.label} />
                <strong>{genre.label}</strong>
                <span>{genre.count} songs</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      <MusicHomeSection
        eyebrow={HOME_UI.sections.fullCatalog}
        title={HOME_UI.sections.allSongs}
        loading={showCatalogSkeleton && songs.length === 0}
        error={catalogError && songs.length === 0 ? catalogError : null}
        onRetry={retry}
      >
        {songs.length === 0 && !showCatalogSkeleton ? (
          <div className="music-home-section-error" role="status">
            <p>{HOME_UI.emptyTitle}</p>
            <p>{HOME_UI.emptyCatalogMessage}</p>
            <button type="button" className="btn-secondary btn-sm" onClick={retry}>
              {HOME_UI.refreshCatalog}
            </button>
          </div>
        ) : (
          <>
            <div className="music-home-all-songs-meta">
              {Math.min(visibleCatalogCount, songs.length)}/{songs.length}
            </div>
            <div className="music-home-all-songs-list">
              {visibleCatalogSongs.map((song) => (
                <button
                  key={`catalog-${song.id}`}
                  type="button"
                  className="music-home-all-songs-row"
                  onClick={() => playFromQueue(song, songs, 'Full Catalog')}
                  aria-label={`Play ${song.title} by ${song.artist}`}
                >
                  <HomeArt src={song.artwork} seed={song.id} label={song.title} size="thumb" />
                  <div className="music-home-all-songs-copy">
                    <strong title={song.title}>{song.title}</strong>
                    <span title={song.artist}>{song.artist}</span>
                  </div>
                </button>
              ))}
            </div>
            {canLoadMore ? (
              <button
                type="button"
                className="music-home-load-more"
                onClick={() =>
                  setVisibleCatalogCount((count) =>
                    Math.min(count + HOME_CATALOG_PAGE_SIZE, songs.length),
                  )
                }
              >
                {HOME_UI.loadMore}
              </button>
            ) : null}
          </>
        )}
      </MusicHomeSection>
    </div>
  )
})
