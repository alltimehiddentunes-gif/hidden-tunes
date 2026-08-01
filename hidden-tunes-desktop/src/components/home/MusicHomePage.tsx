import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import {
  buildQueueCandidatePools,
  buildQueueSeedPool,
  capSongPool,
} from '../../lib/catalogIndexes'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import {
  HOME_CATALOG_PAGE_SIZE,
  HOME_SECTION_PREVIEW_LIMIT,
  HOME_UI,
  buildAlbumsWorthStayingWith,
  buildBecauseYouListenedSongs,
  buildCreatorsInOrbit,
  buildHomeHeroCards,
  buildMoodRooms,
  buildOpenRooms,
  buildRecentlyAddedSongs,
  buildSmartMusicQueueSongs,
  type HomeAlbumWorthCard,
} from '../../lib/home/mobileHomeParity'
import {
  buildEmotionalWorldCards,
  buildPersonalMixes,
  resolveRecentlyPlayedSongs,
} from '../../lib/home/musicHomeSections'
import { useMusicLocalState } from '../../lib/home/useMusicLocalState'
import { ArtworkImage } from '../ArtworkImage'
import { formatSongCountLabel, isGenericAlbumTitle } from '../../lib/catalogDisplayText'
import { createMusicGenreIntent, MUSIC_GENRES } from '../../lib/musicGenres'

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
  { navKey: 'radio' as const, label: 'Radio', hint: 'Live worldwide radio', artwork: '/home-reference/explore-radio.webp' },
  { navKey: 'podcasts' as const, label: 'Podcasts', hint: 'Shows and episodes', artwork: '/home-reference/explore-podcasts.webp' },
  { navKey: 'audiobooks' as const, label: 'Audiobooks', hint: 'Stories brought to life', artwork: '/home-reference/explore-audiobooks.webp' },
  { navKey: 'tv' as const, label: 'TV', hint: 'Global television', artwork: '/home-reference/explore-tv.webp' },
  { navKey: 'motivationals' as const, label: 'Motivationals', hint: 'Become your best', artwork: '/home-reference/explore-motivationals.webp' },
  { navKey: 'lectures' as const, label: 'Lectures', hint: 'Learn something new every day', artwork: '/home-reference/explore-lectures.webp' },
]

const QUICK_ACCESS = [
  { navKey: 'liked' as const, label: 'Liked Songs', hint: 'Your favourites', glyph: '♥' },
  { navKey: 'recent' as const, label: 'Recently Played', hint: 'Your history', glyph: '↺' },
  { navKey: 'playlists' as const, label: 'Playlists', hint: 'Your collections', glyph: '☷' },
  { navKey: 'albums' as const, label: 'Albums', hint: 'Browse albums', glyph: '◫' },
  { navKey: 'library' as const, label: 'Library', hint: 'Your collection', glyph: '▤' },
  { navKey: 'downloads' as const, label: 'Downloads', hint: 'Saved locally', glyph: '↓' },
]

/** Editorial artwork for navigation moods only — never used as fake song/album art. */
const MOOD_ROOM_ART: Record<string, string> = {
  healing: '/home-reference/mood-worship.webp',
  'late-night': '/home-reference/mood-chill.webp',
  calm: '/home-reference/mood-sleep.webp',
  energy: '/home-reference/mood-workout.webp',
}

const HOME_GENRE_ICONS = {
  afrobeats: 'headphones',
  'hip-hop': 'hat',
  'r-and-b': 'heart',
  pop: 'star',
  rock: 'guitar',
  dance: 'globe',
  jazz: 'note',
  classical: 'piano',
  gospel: 'cross',
  country: 'hat',
  latin: 'maracas',
  reggae: 'lion',
} as const

function HomeGenreIcon({ kind }: { kind: (typeof HOME_GENRE_ICONS)[keyof typeof HOME_GENRE_ICONS] }) {
  const paths = {
    headphones: <><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v5a2 2 0 0 0 2 2h2v-8H6a2 2 0 0 0-2 2m16-1h-2v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2" /></>,
    hat: <><path d="M5 13c2-1 3-5 4-7 2 2 4 2 6 0 1 2 2 6 4 7" /><path d="M3 14c4 3 14 3 18 0-5-2-13-2-18 0Z" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    star: <path d="m12 2 3 6 7 .9-5 4.8 1.3 6.8L12 17l-6.3 3.5L7 13.7 2 8.9 9 8l3-6Z" />,
    guitar: <><path d="m14 6 4-4 4 4-4 4" /><path d="m17 7-6 6" /><path d="M12,12 C14,14 13,17 11,19 S5,22 3,20 S3,14 5,12 S9,9 10,10 S10,12 12,12 Z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    note: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    piano: <><path d="M3 5h18v14H3z" /><path d="M8 5v9m4-9v9m4-9v9M6 14v5m4-5v5m4-5v5m4-5v5" /></>,
    cross: <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2Z" />,
    maracas: <><circle cx="7" cy="7" r="4" /><circle cx="17" cy="7" r="4" /><path d="m9 10 4 11m2-11-4 11" /></>,
    lion: <><circle cx="12" cy="12" r="8" /><path d="M8 10c1-4 7-4 8 0v5c-2 3-6 3-8 0v-5Zm2 3h.01M14 13h.01M10 16h4" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[kind]}</svg>
}

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
  const { recentlyPlayed } = useMusicLocalState()
  const { currentTrack, currentQueue, isPlaying, pause, resume } = useDesktopPlayback()
  const hasActiveMediaSession = Boolean(currentTrack?.id)
  const [showEditorialMix, setShowEditorialMix] = useState(!hasActiveMediaSession)
  const [editorialMixExiting, setEditorialMixExiting] = useState(false)
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(HOME_CATALOG_PAGE_SIZE)
  const [loadingAlbumId, setLoadingAlbumId] = useState<string | null>(null)
  const [albumRailError, setAlbumRailError] = useState<string | null>(null)
  const albumPlayLockRef = useRef<string | null>(null)
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playFromQueue = useCallback(
    (
      song: ApiSong,
      queue: ApiSong[],
      queueTitle: string,
      options?: { bounded?: boolean },
    ) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      // Mobile: home_rail sections are bounded; full_catalog / hero-style are not.
      const bounded = options?.bounded ?? true
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'home', queueTitle, {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', queue, indexes, song),
        candidatePools: queuePools,
        bounded,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const playAlbumCollection = useCallback(
    (card: HomeAlbumWorthCard) => {
      // Prevent duplicate concurrent resolutions / double-click play starts.
      if (albumPlayLockRef.current) return
      albumPlayLockRef.current = card.album.id
      setLoadingAlbumId(card.album.id)
      setAlbumRailError(null)

      const tracks = card.playableTracks
      if (tracks.length === 0) {
        setAlbumRailError(
          `No playable tracks available for “${card.displayTitle}”. Current playback is unchanged.`,
        )
        albumPlayLockRef.current = null
        setLoadingAlbumId(null)
        return
      }

      const queueTitle =
        card.rawTitle && !isGenericAlbumTitle(card.rawTitle)
          ? card.rawTitle
          : card.displayTitle
      const start = tracks[0]!

      // context 'home' keeps Home mounted (selectAndPlay skips PlayerWorkspace).
      // seedType 'album' preserves album queue ownership / bounded auto-next.
      onOpenSong(start, tracks, 0, 'home', queueTitle, {
        seedType: 'album',
        seedId: card.album.id,
        seedTracks: capSongPool(tracks),
        candidatePools: queuePools,
        bounded: true,
      })

      window.setTimeout(() => {
        if (albumPlayLockRef.current === card.album.id) {
          albumPlayLockRef.current = null
        }
        setLoadingAlbumId((current) => (current === card.album.id ? null : current))
      }, 450)
    },
    [onOpenSong, queuePools],
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

  const openRooms = useMemo(() => buildOpenRooms(songs), [songs])
  const recentlyAdded = useMemo(
    () => buildRecentlyAddedSongs(songs, HOME_SECTION_PREVIEW_LIMIT),
    [songs],
  )
  const recentlyPlayedSongs = useMemo(
    () => resolveRecentlyPlayedSongs(recentlyPlayed, indexes.songsById, HOME_SECTION_PREVIEW_LIMIT),
    [indexes.songsById, recentlyPlayed],
  )
  const moodRooms = useMemo(() => buildMoodRooms(songs), [songs])
  const emotionalWorlds = useMemo(() => buildEmotionalWorldCards(songs, 8), [songs])
  const personalMixes = useMemo(
    () => buildPersonalMixes(songs, artists, indexes, recentlyPlayed),
    [artists, indexes, recentlyPlayed, songs],
  )
  const featuredMix = personalMixes[0] ?? null
  const becauseYouListened = useMemo(
    () => buildBecauseYouListenedSongs(songs, recentlyPlayed, indexes.songsById),
    [indexes.songsById, recentlyPlayed, songs],
  )
  const smartQueue = useMemo(
    () => buildSmartMusicQueueSongs(currentQueue, songs),
    [currentQueue, songs],
  )
  const creators = useMemo(
    () => buildCreatorsInOrbit(artists, indexes, recentlyPlayed),
    [artists, indexes, recentlyPlayed],
  )
  const albumsWorth = useMemo(
    () => buildAlbumsWorthStayingWith(albums, indexes, artistNames),
    [albums, artistNames, indexes],
  )
  const visibleCatalogSongs = useMemo(
    () => songs.slice(0, visibleCatalogCount),
    [songs, visibleCatalogCount],
  )
  const canLoadMore = visibleCatalogCount < songs.length

  useEffect(() => {
    let exitTimer: number | null = null
    const stateTimer = window.setTimeout(() => {
      if (!hasActiveMediaSession) {
        setShowEditorialMix(true)
        setEditorialMixExiting(false)
        return
      }
      setEditorialMixExiting(true)
      exitTimer = window.setTimeout(() => {
        setShowEditorialMix(false)
        setEditorialMixExiting(false)
      }, 220)
    }, 0)
    return () => {
      window.clearTimeout(stateTimer)
      if (exitTimer != null) window.clearTimeout(exitTimer)
    }
  }, [hasActiveMediaSession])

  const catalogError = showCatalogError ? error : null
  const heroCard = heroCards[0] ?? null
  const heroSong = heroCard?.song ?? null
  const heroIsCurrent =
    Boolean(heroSong && currentTrack?.id && String(currentTrack.id) === String(heroSong.id))
  const heroAlbum = useMemo(() => {
    if (!heroSong?.albumId) return null
    return albums.find((album) => String(album.id) === String(heroSong.albumId)) ?? null
  }, [albums, heroSong])

  const playHero = useCallback(() => {
    if (!heroSong) return
    if (heroIsCurrent) {
      if (isPlaying) pause()
      else resume()
      return
    }
    const queueTitle = heroCard?.isCurrent
      ? HOME_UI.listening.nowPlaying
      : heroCard?.label === HOME_UI.hero.recentlyPlayed
        ? 'Continue Listening'
        : heroCard?.title || 'Home Featured'
    playFromQueue(heroSong, songs.slice(0, 24), queueTitle, { bounded: false })
  }, [heroCard, heroIsCurrent, heroSong, isPlaying, pause, playFromQueue, resume, songs])

  const playFeaturedMix = useCallback(() => {
    if (featuredMix && featuredMix.tracks.length > 0) {
      const start = featuredMix.tracks[0]!
      if (currentTrack?.id && String(currentTrack.id) === String(start.id)) {
        if (isPlaying) pause()
        else resume()
        return
      }
      playFromQueue(start, featuredMix.tracks, featuredMix.title, { bounded: true })
      return
    }
    playHero()
  }, [currentTrack, featuredMix, isPlaying, pause, playFromQueue, playHero, resume])

  const mixIsCurrent =
    Boolean(
      featuredMix?.tracks[0]?.id &&
        currentTrack?.id &&
        String(currentTrack.id) === String(featuredMix.tracks[0].id),
    ) || (!featuredMix && heroIsCurrent)

  const isCurrentSong = useCallback(
    (songId: string) => Boolean(currentTrack?.id && String(currentTrack.id) === String(songId)),
    [currentTrack],
  )

  return (
    <div
      className="music-home music-home--parity music-home--content-first music-home--premium"
      aria-label="Home"
      data-home-parity="mobile"
      data-home-layout="content-first"
      data-home-polish="premium"
    >
      {heroSong && heroCard ? (
        <div
          className={`music-home-reference-top${hasActiveMediaSession && !showEditorialMix ? ' is-active-session' : ' is-idle'}`}
          data-home-media-session={hasActiveMediaSession ? 'active' : 'idle'}
        >
        <section className="music-home-product-hero music-home-listening-hero" aria-label="Listening">
          <button
            type="button"
            className="music-home-product-hero-art"
            onClick={playHero}
            aria-label={
              heroIsCurrent && isPlaying
                ? `Pause ${heroCard.title}`
                : `Play ${heroCard.title} by ${heroCard.subtitle}`
            }
          >
            <HomeArt
              src={heroSong.artwork}
              seed={heroSong.id}
              label={heroCard.title}
              priority
              size="hero"
            />
            <span className="music-home-product-hero-art-copy">
              <small>{heroCard.label}</small>
              <strong title={heroCard.title}>{heroCard.title}</strong>
              <span title={heroCard.subtitle}>{heroCard.subtitle}</span>
            </span>
          </button>
          <div className="music-home-product-hero-copy">
            <span className="music-home-product-hero-kicker">{heroCard.label}</span>
            <h1 title={heroCard.title}>{heroCard.title}</h1>
            <p>{heroCard.subtitle}</p>
            <div className="music-home-product-hero-actions">
              <button
                type="button"
                className="music-home-product-hero-primary"
                onClick={playHero}
              >
                <span aria-hidden="true">{heroIsCurrent && isPlaying ? '❚❚' : '▶'}</span>
                {heroIsCurrent ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
              </button>
              {heroAlbum ? (
                <button
                  type="button"
                  className="music-home-product-hero-secondary"
                  onClick={() => onOpenAlbum(heroAlbum)}
                >
                  Open album
                </button>
              ) : (
                <button
                  type="button"
                  className="music-home-product-hero-secondary"
                  onClick={() => onNavigateNav('search')}
                >
                  Search
                </button>
              )}
            </div>
          </div>
        </section>
        {showEditorialMix ? (
        <aside className={`music-home-mix-column${editorialMixExiting ? ' is-exiting' : ''}`} aria-label="Quick listening">
          <section className="music-home-mix-card" data-home-mix={featuredMix ? 'personal' : 'catalogue'}>
            <div className="music-home-mix-copy">
              <span className="music-home-product-hero-kicker">
                {featuredMix ? 'PERSONAL MIX' : 'CATALOGUE MIX'}
              </span>
              <h2>{featuredMix?.title ?? heroCard.title}</h2>
              <p>
                {featuredMix
                  ? featuredMix.subtitle
                  : `${heroCard.subtitle} — start from this track and continue through the catalogue.`}
              </p>
              <button type="button" onClick={playFeaturedMix}>
                <span aria-hidden="true">{mixIsCurrent && isPlaying ? '❚❚' : '▶'}</span>{' '}
                {mixIsCurrent ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
              </button>
            </div>
            <HomeArt
              src={featuredMix?.tracks[0]?.artwork ?? heroSong.artwork}
              seed={featuredMix?.tracks[0]?.id ?? heroSong.id}
              label={featuredMix?.title ?? heroCard.title}
              size="rail"
            />
          </section>
          <div className="music-home-quick-grid" aria-label="Quick access">
            {QUICK_ACCESS.map((item) => (
              <button
                key={item.navKey}
                type="button"
                className="music-home-quick-card"
                onClick={() => onNavigateNav(item.navKey)}
              >
                <span className="music-home-quick-glyph" aria-hidden="true">{item.glyph}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
        ) : (
          <div className="music-home-active-quick-access" aria-label="Quick access">
            {QUICK_ACCESS.map((item) => (
              <button
                key={item.navKey}
                type="button"
                className="music-home-active-quick-button"
                onClick={() => onNavigateNav(item.navKey)}
                aria-label={item.label}
                title={item.label}
              >
                <span aria-hidden="true">{item.glyph}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        )}
        </div>
      ) : showCatalogSkeleton ? (
        <div className="music-home-product-hero music-home-hero-carousel--skeleton" aria-busy="true" />
      ) : null}

      {/* Desktop content-first: surface a music rail immediately after chrome */}
      <MusicHomeSection
        eyebrow={HOME_UI.sections.new}
        title={HOME_UI.sections.recentlyAdded}
        onSeeAll={() => onNavigateNav('music')}
        loading={showCatalogSkeleton && recentlyAdded.length === 0}
        error={catalogError && recentlyAdded.length === 0 ? catalogError : null}
        onRetry={retry}
      >
        {recentlyAdded.length > 0 ? (
          <div className="music-home-release-rail">
            {recentlyAdded.map((song, index) => {
              const title = song.title?.trim() || 'Untitled'
              const artist = song.artist?.trim() || 'Unknown artist'
              const playing = isCurrentSong(song.id)
              return (
                <button
                  key={song.id}
                  type="button"
                  className={`music-home-release-card${index === 0 ? ' is-featured' : ''}${playing ? ' is-playing' : ''}`}
                  onClick={() => playFromQueue(song, recentlyAdded, HOME_UI.sections.recentlyAdded)}
                  aria-label={`Play ${title} by ${artist}`}
                  aria-current={playing ? 'true' : undefined}
                >
                  <HomeArt
                    src={song.artwork}
                    seed={song.id}
                    label={title}
                    priority={index === 0}
                    size="rail"
                  />
                  {index === 0 ? <span className="music-home-new-badge">NEW</span> : null}
                  {playing ? <span className="music-home-now-playing-badge">Now playing</span> : null}
                  <span className="music-home-release-copy">
                    <strong title={title}>{title}</strong>
                    <small title={artist}>{artist}</small>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="music-home-section-empty">{HOME_UI.recentlyAddedEmpty}</p>
        )}
      </MusicHomeSection>

      {recentlyPlayedSongs.length > 0 ? (
        <MusicHomeSection
          eyebrow="HISTORY"
          title="Recently Played"
          onSeeAll={() => onNavigateNav('recent')}
        >
          <div className="music-home-song-rail">
            {recentlyPlayedSongs.map((song) => {
              const playing = isCurrentSong(song.id)
              return (
                <button
                  key={`recent-${song.id}`}
                  type="button"
                  className={`music-home-song-card${playing ? ' is-playing' : ''}`}
                  onClick={() => playFromQueue(song, recentlyPlayedSongs, 'Recently Played')}
                  aria-label={`Play ${song.title} by ${song.artist}`}
                  aria-current={playing ? 'true' : undefined}
                >
                  <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                  <strong title={song.title}>{song.title}</strong>
                  <span title={song.artist}>{song.artist}</span>
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {becauseYouListened.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.listener} title={HOME_UI.sections.becauseYouListened}>
          <div className="music-home-song-rail">
            {becauseYouListened.map((song) => {
              const playing = isCurrentSong(song.id)
              return (
                <button
                  key={`because-${song.id}`}
                  type="button"
                  className={`music-home-song-card${playing ? ' is-playing' : ''}`}
                  onClick={() =>
                    playFromQueue(song, becauseYouListened, HOME_UI.sections.becauseYouListened)
                  }
                  aria-label={`Play ${song.title} by ${song.artist}`}
                  aria-current={playing ? 'true' : undefined}
                >
                  <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                  <strong title={song.title}>{song.title}</strong>
                  <span title={song.artist}>{song.artist}</span>
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {smartQueue.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.next} title={HOME_UI.sections.smartMusicQueue}>
          <div className="music-home-song-rail">
            {smartQueue.map((song) => {
              const playing = isCurrentSong(song.id)
              return (
                <button
                  key={`smart-${song.id}`}
                  type="button"
                  className={`music-home-song-card${playing ? ' is-playing' : ''}`}
                  onClick={() => playFromQueue(song, smartQueue, HOME_UI.sections.smartMusicQueue)}
                  aria-label={`Play ${song.title} by ${song.artist}`}
                  aria-current={playing ? 'true' : undefined}
                >
                  <HomeArt src={song.artwork} seed={song.id} label={song.title} />
                  <strong title={song.title}>{song.title}</strong>
                  <span title={song.artist}>{song.artist}</span>
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {albumsWorth.length > 0 ? (
        <MusicHomeSection
          eyebrow={HOME_UI.sections.collections}
          title={HOME_UI.sections.albumsWorthStaying}
        >
          <div className="music-home-album-grid">
            {albumsWorth.map((card) => {
              const isLoading = loadingAlbumId === card.album.id
              const locked = Boolean(loadingAlbumId)
              const canPlay = card.playableTracks.length > 0
              return (
                <div
                  key={card.album.id}
                  className={`music-home-album-card-wrap${isLoading ? ' is-loading' : ''}`}
                  data-album-id={card.album.id}
                  data-content-type={card.contentType}
                  data-raw-title={card.rawTitle}
                >
                  <button
                    type="button"
                    className="music-home-album-card"
                    onClick={() => onOpenAlbum(card.album)}
                    aria-label={`Open album ${card.displayTitle}`}
                  >
                    <HomeArt
                      src={card.artwork}
                      seed={card.album.id}
                      label={card.displayTitle}
                    />
                    <strong title={card.displayTitle}>{card.displayTitle}</strong>
                    {card.displaySubtitle ? (
                      <span title={card.displaySubtitle}>{card.displaySubtitle}</span>
                    ) : null}
                    {card.contentTypeLabel ? (
                      <em className="music-home-album-type">{card.contentTypeLabel}</em>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`music-home-album-play${isLoading ? ' is-loading is-pressed' : ''}`}
                    onClick={() => playAlbumCollection(card)}
                    disabled={!canPlay || (locked && !isLoading)}
                    aria-busy={isLoading}
                    aria-label={`Play album ${card.displayTitle}`}
                  >
                    <span aria-hidden="true">{isLoading ? '…' : '▶'}</span>
                    Play
                  </button>
                </div>
              )
            })}
          </div>
          {albumRailError ? (
            <p className="music-home-album-rail-error" role="alert">
              {albumRailError}
            </p>
          ) : null}
        </MusicHomeSection>
      ) : null}

      {creators.length > 0 ? (
        <MusicHomeSection eyebrow={HOME_UI.sections.creators} title={HOME_UI.sections.creatorsInOrbit}>
          <div className="music-home-artist-grid">
            {creators.map(({ artist, playableSongCount }) => {
              const countLabel = formatSongCountLabel(playableSongCount, {
                noun: 'song',
                omitZero: true,
              })
              return (
                <button
                  key={artist.id}
                  type="button"
                  className="music-home-artist-card"
                  onClick={() => onOpenArtist(artist)}
                  aria-label={
                    countLabel ? `Open ${artist.name}, ${countLabel}` : `Open ${artist.name}`
                  }
                >
                  <HomeArt src={artist.artwork} seed={artist.id} label={artist.name} />
                  <strong title={artist.name}>{artist.name}</strong>
                  {countLabel ? <span>{countLabel}</span> : null}
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {moodRooms.length > 0 ? (
        <MusicHomeSection
          eyebrow={HOME_UI.sections.forYourMood}
          title={HOME_UI.sections.moodRooms}
          onSeeAll={() => onNavigateNav('worlds')}
        >
          <div className="music-home-mood-rail" data-home-moods="catalog-matched">
            {moodRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="music-home-mood-card-reference"
                onClick={() => playFromQueue(room.songs[0]!, room.songs, room.title)}
                aria-label={`Play ${room.title} — ${room.subtitle}`}
              >
                <img
                  src={room.artwork || MOOD_ROOM_ART[room.id] || '/home-reference/mood-chill.webp'}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  <strong>{room.title}</strong>
                  <small>{room.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      {emotionalWorlds.length > 0 ? (
        <MusicHomeSection
          eyebrow="WORLDS"
          title={HOME_UI.emotionalWorlds.title}
          onSeeAll={() => onNavigateNav('worlds')}
        >
          <div className="music-home-world-rail" data-home-worlds="emotional-lanes">
            {emotionalWorlds.map((world) => {
              const tracks = world.songIds
                .map((id) => indexes.songsById.get(id) ?? songs.find((s) => s.id === id))
                .filter((entry): entry is ApiSong => Boolean(entry))
                .slice(0, 16)
              if (tracks.length === 0) return null
              const art = tracks.find((t) => t.artwork)?.artwork ?? null
              return (
                <button
                  key={world.id}
                  type="button"
                  className="music-home-world-card"
                  onClick={() => playFromQueue(tracks[0]!, tracks, world.label)}
                  aria-label={`Play ${world.label}`}
                >
                  <HomeArt src={art} seed={world.id} label={world.label} size="rail" />
                  <strong title={world.label}>{world.label}</strong>
                  <span title={world.subtitle}>{world.subtitle}</span>
                </button>
              )
            })}
          </div>
        </MusicHomeSection>
      ) : null}

      {songs.length > 0 ? (
        <MusicHomeSection
          eyebrow="EXPLORE"
          title={HOME_UI.sections.moodGenreSpotlights}
          onSeeAll={() => onNavigateNav('music')}
        >
          <div className="music-home-genre-row" data-home-genres="canonical">
            {MUSIC_GENRES.map((genre, index) => (
              <button
                key={`home-genre-${genre.slug}`}
                type="button"
                className={`music-home-genre-card music-home-genre-card--${index % 6}`}
                onClick={() => {
                  onBrowseSearch(createMusicGenreIntent(genre.slug))
                  onNavigateNav('search')
                }}
                aria-label={`Open ${genre.label} catalogue`}
              >
                <HomeGenreIcon kind={HOME_GENRE_ICONS[genre.slug as keyof typeof HOME_GENRE_ICONS]} />
                <strong>{genre.label}</strong>
              </button>
            ))}
          </div>
        </MusicHomeSection>
      ) : null}

      <MusicHomeSection eyebrow="DISCOVER" title="Explore Hidden Tunes">
        <div className="music-home-family-grid" aria-label="Explore Hidden Tunes">
          {FAMILY_SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.navKey}
              type="button"
              className="music-home-family-card music-home-family-card--editorial"
              onClick={() => onNavigateNav(shortcut.navKey)}
            >
              <img src={shortcut.artwork} alt="" loading="lazy" decoding="async" />
              <span className="music-home-family-copy">
                <strong>{shortcut.label}</strong>
                <span>{shortcut.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </MusicHomeSection>

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
              {visibleCatalogSongs.map((song) => {
                const playing = isCurrentSong(song.id)
                return (
                  <button
                    key={`catalog-${song.id}`}
                    type="button"
                    className={`music-home-all-songs-row${playing ? ' is-playing' : ''}`}
                    onClick={() => playFromQueue(song, songs, 'Full Catalog', { bounded: false })}
                    aria-label={`Play ${song.title} by ${song.artist}`}
                    aria-current={playing ? 'true' : undefined}
                  >
                    <HomeArt src={song.artwork} seed={song.id} label={song.title} size="thumb" />
                    <div className="music-home-all-songs-copy">
                      <strong title={song.title}>{song.title}</strong>
                      <span title={song.artist}>{song.artist}</span>
                    </div>
                  </button>
                )
              })}
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
