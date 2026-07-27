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
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
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
  { navKey: 'radio' as const, label: HOME_UI.shortcuts.radio },
  { navKey: 'podcasts' as const, label: HOME_UI.shortcuts.podcasts },
  { navKey: 'audiobooks' as const, label: HOME_UI.shortcuts.audiobooks },
  /** Desktop has no /more hub yet — Worlds is the closest non-Library discovery surface. */
  { navKey: 'worlds' as const, label: HOME_UI.shortcuts.more },
]

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
  const { recentlyPlayed } = useMusicLocalState()
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
    <div className="music-home music-home--parity" aria-label="Home" data-home-parity="mobile">
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
                  <div className="music-home-hero-card-art">
                    <ArtworkImage
                      src={card.song.artwork}
                      alt=""
                      seed={card.song.id}
                      label={card.title}
                      priority={card.key.startsWith('featured') || Boolean(card.isCurrent)}
                    />
                  </div>
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

      <div className="music-home-signal-row" aria-label="Catalog signals">
        <span className="music-home-signal-pill">{songsReadyLabel(songs.length)}</span>
        <span className="music-home-signal-pill">{HOME_UI.signals.curatedRooms}</span>
      </div>

      <button
        type="button"
        className="music-home-listening-brief"
        onClick={() => {
          if (currentTrack) return
          onBrowseSearch('')
          onNavigateNav('search')
        }}
        aria-label={listeningBrief.title}
      >
        <div className="music-home-listening-brief-copy">
          <span className="music-home-section-eyebrow">{listeningBrief.label}</span>
          <strong>{listeningBrief.title}</strong>
          <span>{listeningBrief.subtitle}</span>
        </div>
      </button>

      <div className="music-home-family-grid" aria-label="Discovery shortcuts">
        {FAMILY_SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.navKey}
            type="button"
            className="music-home-family-card"
            onClick={() => onNavigateNav(shortcut.navKey)}
          >
            <strong>{shortcut.label}</strong>
          </button>
        ))}
      </div>

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
                <ArtworkImage src={room.artwork} alt="" seed={room.id} label={room.title} />
                <strong>{room.title}</strong>
                <span>{room.subtitle}</span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

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
                key={`recently-${song.id}`}
                type="button"
                className="music-home-song-card"
                onClick={() => playFromQueue(song, recentlyAdded, HOME_UI.sections.recentlyAdded)}
                aria-label={`Play ${song.title} by ${song.artist}`}
              >
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                <strong title={song.title}>{song.title}</strong>
                <span title={song.artist}>{song.artist}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="music-home-section-empty">{HOME_UI.recentlyAddedEmpty}</p>
        )}
      </MusicHomeSection>

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
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
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
                <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
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
                <ArtworkImage src={artist.artwork} alt="" seed={artist.id} label={artist.name} />
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
                <ArtworkImage src={album.artwork} alt="" seed={album.id} label={album.title} />
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
                <ArtworkImage src={room.artwork} alt="" seed={room.id} label={room.title} />
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
                <ArtworkImage src={genre.artworkUrl} alt="" seed={genre.id} label={genre.label} />
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
                  <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
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
