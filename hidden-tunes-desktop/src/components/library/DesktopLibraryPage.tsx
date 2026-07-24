import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import type { ApiSong } from '../../lib/api'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  dispatchLibraryItem,
  enrichSongLibraryItem,
  type DesktopLibraryFilterId,
  type DesktopLibraryItem,
  typeLabel,
  useDesktopLibrary,
} from '../../lib/library'
import { removeLibraryItemMirrored } from '../../lib/library/removeMirrored'
import { buildPodcastQueueSongs } from '../../lib/podcasts/podcastPlaybackAdapter'
import type { PodcastEpisodeMeta } from '../../lib/podcasts/types'
import { buildRadioQueueSongs } from '../../lib/radio/radioPlaybackAdapter'
import type { RadioStationMeta } from '../../lib/radio/types'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type DesktopLibraryPageProps = {
  query?: string
  songsById: Map<string, ApiSong>
  onPlaySong: (song: ApiSong) => void
  onPlayRadio: (stationId: string, title: string, artwork: string | null, meta?: {
    country?: string | null
    category?: string | null
    isMature?: boolean
    contentRating?: string | null
  }) => void
  onPlayPodcastEpisode: (episodeId: string, title: string, showId: string | null, showTitle: string | null, artwork: string | null) => void
  onOpenPodcastShow: (showId: string) => void
  onOpenAudiobook: (bookId: string) => void
  onPlayTv: (channelId: string, title: string, artwork: string | null) => void
  onOpenMotivational: (programId: string) => void
  onOpenLecture: (seriesId: string) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

const FILTERS: { id: DesktopLibraryFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Music' },
  { id: 'radio', label: 'Radio' },
  { id: 'podcast_show', label: 'Podcasts' },
  { id: 'podcast_episode', label: 'Episodes' },
  { id: 'audiobook', label: 'Audiobooks' },
  { id: 'tv', label: 'TV' },
  { id: 'motivational', label: 'Motivationals' },
  { id: 'lecture', label: 'Lectures' },
]

const MAX_VISIBLE = 120

function matchesQuery(item: DesktopLibraryItem, query: string) {
  if (!query) return true
  const hay = [
    item.title,
    item.subtitle,
    'artist' in item ? item.artist : null,
    'showTitle' in item ? item.showTitle : null,
    'channelName' in item ? item.channelName : null,
    'speaker' in item ? item.speaker : null,
    'author' in item ? item.author : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(query)
}

function LibraryRow({
  item,
  onOpen,
  onEnqueue,
  onRemove,
  ArtworkImage,
}: {
  item: DesktopLibraryItem
  onOpen: () => void
  onEnqueue?: () => void
  onRemove: () => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="ht-library-row" data-library-type={item.type}>
      <button type="button" className="ht-library-row-hit" onClick={onOpen}>
        <div className="ht-library-row-art">
          <ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} />
        </div>
        <div className="ht-library-row-copy">
          <span className="ht-library-row-type">{typeLabel(item.type)}</span>
          <h3>{item.title}</h3>
          <p>{item.subtitle || typeLabel(item.type)}</p>
        </div>
      </button>
      {onEnqueue ? (
        <button
          type="button"
          className="ht-library-row-enqueue"
          aria-label={`Add ${item.title} to queue`}
          onClick={onEnqueue}
        >
          Queue
        </button>
      ) : null}
      <button
        type="button"
        className="ht-library-row-remove"
        aria-label={`Remove ${item.title} from Library`}
        onClick={onRemove}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 21s-7-4.5-9.5-9C1 8 3 4 7 4c2 0 3.5 1.5 5 3 1.5-1.5 3-3 5-3 4 0 6 4 3.5 8C19 16.5 12 21 12 21z" />
        </svg>
      </button>
    </article>
  )
}

export const DesktopLibraryPage = memo(function DesktopLibraryPage({
  query = '',
  songsById,
  onPlaySong,
  onPlayRadio,
  onPlayPodcastEpisode,
  onOpenPodcastShow,
  onOpenAudiobook,
  onPlayTv,
  onOpenMotivational,
  onOpenLecture,
  ArtworkImage,
}: DesktopLibraryPageProps) {
  const library = useDesktopLibrary()
  const { enqueue } = useDesktopPlayback()
  const [filter, setFilter] = useState<DesktopLibraryFilterId>('all')
  const [actionError, setActionError] = useState<string | null>(null)
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null)

  const availableFilters = useMemo(() => {
    return FILTERS.filter((entry) => {
      if (entry.id === 'all') return true
      return (library.countByType[entry.id] ?? 0) > 0
    })
  }, [library.countByType])

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = library.filterItems(filter)
    const enriched = base.map((item) => {
      if (item.type !== 'song') return item
      return enrichSongLibraryItem(item, songsById.get(item.id))
    })
    return enriched.filter((item) => matchesQuery(item, q)).slice(0, MAX_VISIBLE)
  }, [filter, library, query, songsById])

  const handleOpen = useCallback(
    (item: DesktopLibraryItem) => {
      setActionError(null)
      const action = dispatchLibraryItem(item)
      switch (action.kind) {
        case 'play_song': {
          const catalogSong = songsById.get(action.item.id)
          if (!catalogSong) {
            setActionError('That song is no longer in the music catalog.')
            return
          }
          onPlaySong(catalogSong)
          return
        }
        case 'play_radio':
          onPlayRadio(action.item.id, action.item.title, action.item.artwork ?? null, {
            country: action.item.country ?? null,
            category: action.item.category ?? null,
            isMature: action.item.isMature,
            contentRating: action.item.contentRating ?? null,
          })
          return
        case 'open_podcast_show':
          onOpenPodcastShow(action.item.id)
          return
        case 'play_podcast_episode':
          onPlayPodcastEpisode(
            action.item.id,
            action.item.title,
            action.item.showId ?? null,
            action.item.showTitle ?? null,
            action.item.artwork ?? null,
          )
          return
        case 'open_audiobook':
          onOpenAudiobook(action.item.id)
          return
        case 'play_tv':
          onPlayTv(action.item.id, action.item.title, action.item.artwork ?? null)
          return
        case 'open_motivational':
          onOpenMotivational(action.item.id)
          return
        case 'open_lecture':
          onOpenLecture(action.item.id)
          return
        case 'unsupported':
          setActionError(action.message)
          return
        default:
          setActionError('Unable to open this Library item.')
      }
    },
    [
      onOpenAudiobook,
      onOpenLecture,
      onOpenMotivational,
      onOpenPodcastShow,
      onPlayPodcastEpisode,
      onPlayRadio,
      onPlaySong,
      onPlayTv,
      songsById,
    ],
  )

  const handleRemove = useCallback((item: DesktopLibraryItem) => {
    removeLibraryItemMirrored(item)
  }, [])

  const handleEnqueue = useCallback(
    (item: DesktopLibraryItem) => {
      setActionError(null)
      setQueueFeedback(null)
      if (item.type === 'song') {
        const catalogSong = songsById.get(item.id)
        if (!catalogSong) {
          setActionError('That song is no longer in the music catalog.')
          return
        }
        const result = enqueue(catalogSong)
        setQueueFeedback(result.added ? 'Added to queue' : 'Already in queue')
        return
      }
      if (item.type === 'radio') {
        const station: RadioStationMeta = {
          id: item.id,
          name: item.title,
          artworkUrl: item.artwork ?? null,
          country: item.country ?? null,
          countryCode: null,
          language: null,
          tags: [],
          categories: item.category ? [item.category] : [],
          bitrate: null,
          codec: null,
          qualityScore: 0,
          reliabilityScore: 0,
          isFeatured: false,
          isMature: Boolean(item.isMature),
          contentRating: item.contentRating ?? null,
          popularity: { votes: 0, clickCount: 0 },
        }
        const [song] = buildRadioQueueSongs([station])
        if (!song) {
          setActionError('Unable to queue this radio station.')
          return
        }
        const result = enqueue(song)
        setQueueFeedback(result.added ? 'Added to queue' : 'Already in queue')
        return
      }
      if (item.type === 'podcast_episode') {
        const episode: PodcastEpisodeMeta = {
          id: item.id,
          showId: item.showId || '',
          showTitle: item.showTitle ?? null,
          title: item.title,
          description: null,
          artworkUrl: item.artwork ?? null,
          durationSeconds: null,
          publishedAt: null,
          episodeNumber: null,
          seasonNumber: null,
          isVerified: false,
          lastCheckedAt: null,
        }
        const [song] = buildPodcastQueueSongs([episode])
        if (!song) {
          setActionError('Unable to queue this podcast episode.')
          return
        }
        const result = enqueue(song)
        setQueueFeedback(result.added ? 'Added to queue' : 'Already in queue')
        return
      }
      setActionError('Open this item to play it — queue add is available for Music, Radio, and Episodes.')
    },
    [enqueue, songsById],
  )

  const totalVisible = library.filterItems('all').length

  return (
    <div className="ht-library-destination">
      <header className="ht-library-header" aria-labelledby="ht-library-heading">
        <h1 id="ht-library-heading" className="ht-library-title">Library</h1>
        <p className="ht-library-subtitle">
          Your saved music, radio, podcasts, and more — kept by type on this device.
        </p>
      </header>

      <div className="ht-library-tabs" role="tablist" aria-label="Library filters">
        {availableFilters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`ht-library-tab${filter === entry.id ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
            {entry.id !== 'all' ? (
              <span className="ht-library-tab-count">{library.countByType[entry.id] ?? 0}</span>
            ) : (
              <span className="ht-library-tab-count">{totalVisible}</span>
            )}
          </button>
        ))}
      </div>

      {actionError ? (
        <div className="ht-library-error" role="alert">{actionError}</div>
      ) : null}
      {queueFeedback ? (
        <div className="ht-library-queue-feedback" role="status">{queueFeedback}</div>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="ht-library-empty catalog-empty">
          <h2>{totalVisible === 0 ? 'Your Library is empty' : 'No matches'}</h2>
          <p>
            {totalVisible === 0
              ? 'Heart songs from the player, save radio stations, follow podcasts, or favorite TV channels to collect them here.'
              : 'Try another filter or clear the search.'}
          </p>
        </div>
      ) : (
        <div className="ht-library-list" role="list">
          {visibleItems.map((item) => {
            const canEnqueue =
              item.type === 'song'
              || item.type === 'radio'
              || item.type === 'podcast_episode'
            return (
              <LibraryRow
                key={library.itemKey(item)}
                item={item}
                onOpen={() => handleOpen(item)}
                onEnqueue={canEnqueue ? () => handleEnqueue(item) : undefined}
                onRemove={() => handleRemove(item)}
                ArtworkImage={ArtworkImage}
              />
            )
          })}
        </div>
      )}
    </div>
  )
})
