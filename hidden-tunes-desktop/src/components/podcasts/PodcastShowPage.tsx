import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import ContentShareActions from '../sharing/ContentShareActions'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  formatPodcastDescriptionExcerpt,
  formatPodcastEpisodeMetaLine,
  formatPodcastShowSubtitle,
} from '../../lib/podcasts/podcastFormatters'
import { listPodcastProgressForShow, progressEntryToEpisodeMeta } from '../../lib/podcasts/podcastProgressStorage'
import type { PlayPodcastEpisodeHandler, PodcastEpisodeMeta } from '../../lib/podcasts/types'
import { usePodcastLocalState } from '../../lib/podcasts/usePodcastLocalState'
import { usePodcastShowData } from '../../lib/podcasts/usePodcastShowData'
import { buildPodcastEpisodeLibraryItem, buildPodcastShowLibraryItem } from '../../lib/library/builders'
import { useDesktopLibrary } from '../../lib/library/useDesktopLibrary'
import { useDesktopDownloads } from '../../lib/downloads/useDesktopDownloads'
import { hasDesktopDownloadsBridge } from '../../lib/downloads/bridge'
import type { DesktopDownloadItem } from '../../lib/downloads/types'

function downloadProgressLabel(item: DesktopDownloadItem) {
  const total = item.fileSize || 0
  const done = item.downloadedBytes || 0
  if (total > 0) return `${Math.min(99, Math.round((done / total) * 100))}%`
  return 'Downloading…'
}

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  variant?: 'square' | 'wide'
  priority?: boolean
}

type PodcastShowPageProps = {
  showId: string
  onBack: () => void
  onPlayPodcastEpisode: PlayPodcastEpisodeHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function progressPercent(position: number, duration: number | null) {
  if (!duration || duration <= 0) return 0
  return Math.min(100, Math.round((position / duration) * 100))
}

function ShowEpisodeRow({
  episode,
  showArtworkUrl,
  onPlay,
  onToggleFavorite,
  onToggleDownload,
  downloadLabel,
  isFavorite,
  tuning,
  isActive,
  hasProgress,
  ArtworkImage,
}: {
  episode: PodcastEpisodeMeta
  showArtworkUrl: string | null
  onPlay: () => void
  onToggleFavorite: () => void
  onToggleDownload?: () => void
  downloadLabel?: string | null
  isFavorite: boolean
  tuning: boolean
  isActive: boolean
  hasProgress: boolean
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  const artwork = episode.artworkUrl ?? showArtworkUrl
  const description = formatPodcastDescriptionExcerpt(episode.description)
  const metadata = formatPodcastEpisodeMetaLine(episode)
  const playLabel = isActive ? 'Playing' : hasProgress ? 'Resume' : 'Play'

  return (
    <article className={`podcast-show-episode-row${isActive ? ' is-active' : ''}`}>
      <div className="podcast-show-episode-art">
        <ArtworkImage src={artwork} alt="" seed={episode.id} label={episode.title} />
      </div>
      <div className="podcast-show-episode-copy">
        <div className="podcast-show-episode-heading">
          <h3>
            {episode.title}
            {hasProgress ? <span className="podcast-show-episode-progress-badge">In progress</span> : null}
          </h3>
          {metadata ? <span className="podcast-show-episode-meta-line">{metadata}</span> : null}
        </div>
        {description ? <p className="podcast-show-episode-description">{description}</p> : null}
      </div>
      <div className="podcast-show-episode-actions">
        <button
          type="button"
          className="podcast-show-episode-play"
          disabled={tuning}
          onClick={onPlay}
          aria-label={`${playLabel} ${episode.title}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{tuning ? 'Loadingâ€¦' : playLabel}</span>
        </button>
        <button
          type="button"
          className={`ht-library-fav-btn${isFavorite ? ' is-active' : ''}`}
          aria-label={isFavorite ? 'Remove episode from Library' : 'Save episode to Library'}
          onClick={onToggleFavorite}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9C1 8 3 4 7 4c2 0 3.5 1.5 5 3 1.5-1.5 3-3 5-3 4 0 6 4 3.5 8C19 16.5 12 21 12 21z" /></svg>
        </button>
        {onToggleDownload && downloadLabel ? (
          <button type="button" className="btn-ghost btn-sm ht-download-inline-btn" onClick={onToggleDownload}>{downloadLabel}</button>
        ) : null}
      </div>
    </article>
  )
}

export const PodcastShowPage = memo(function PodcastShowPage({
  showId,
  onBack,
  onPlayPodcastEpisode,
  ArtworkImage,
}: PodcastShowPageProps) {
  const [tuningEpisodeId, setTuningEpisodeId] = useState<string | null>(null)
  const [episodeQuery, setEpisodeQuery] = useState('')
  const [episodeSort, setEpisodeSort] = useState<'catalog' | 'newest' | 'oldest'>('catalog')
  const { currentTrack } = useDesktopPlayback()
  usePodcastLocalState()
  const library = useDesktopLibrary()
  const downloads = useDesktopDownloads()
  const canDownload = hasDesktopDownloadsBridge()

  const {
    show,
    episodes,
    episodesPagination,
    showLoading,
    episodesLoading,
    episodesLoadingMore,
    showError,
    showNotFound,
    episodesError,
    loadMoreEpisodes,
    retryShow,
    retryEpisodes,
  } = usePodcastShowData(showId)

  const showContinueEntries = useMemo(
    () => (show ? listPodcastProgressForShow(show.id) : []),
    [show],
  )

  const progressEpisodeIds = useMemo(
    () => new Set(showContinueEntries.map((entry) => entry.episodeId)),
    [showContinueEntries],
  )

  const activePodcastEpisodeId = useMemo(() => {
    if (!currentTrack?.id.startsWith('podcast-')) return null
    return currentTrack.id.slice('podcast-'.length)
  }, [currentTrack])

  const visibleEpisodes = useMemo(() => {
    const query = episodeQuery.trim().toLowerCase()
    const filtered = query
      ? episodes.filter((episode) => `${episode.title} ${episode.description ?? ''}`.toLowerCase().includes(query))
      : [...episodes]
    if (episodeSort === 'catalog') return filtered
    return filtered.sort((a, b) => {
      const left = Date.parse(a.publishedAt ?? '') || 0
      const right = Date.parse(b.publishedAt ?? '') || 0
      return episodeSort === 'newest' ? right - left : left - right
    })
  }, [episodeQuery, episodeSort, episodes])

  const playEpisode = useCallback(
    (episode: PodcastEpisodeMeta, resumePositionSeconds?: number | null) => {
      if (!show) return
      const startIndex = Math.max(0, episodes.findIndex((entry) => entry.id === episode.id))
      setTuningEpisodeId(episode.id)
      onPlayPodcastEpisode(episode, episodes, startIndex, show.title, {
        show,
        resumePositionSeconds,
      })
      window.setTimeout(() => setTuningEpisodeId(null), 800)
    },
    [episodes, onPlayPodcastEpisode, show],
  )

  if (showLoading && !show) {
    return (
      <div className="podcast-show-destination">
        <div className="detail-topbar">
          <button type="button" className="detail-back" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back
          </button>
        </div>
        <section className="podcasts-status" aria-busy="true">
          <p>Loading podcast show…</p>
        </section>
      </div>
    )
  }

  if (showNotFound) {
    return (
      <div className="podcast-show-destination">
        <div className="detail-topbar">
          <button type="button" className="detail-back" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back
          </button>
          <div className="detail-titles">
            <h2 className="detail-title">Podcast not found</h2>
          </div>
        </div>
        <section className="podcasts-status podcasts-status--empty" role="status">
          <p>This podcast show is unavailable or no longer in the catalog.</p>
        </section>
      </div>
    )
  }

  if (showError && !show) {
    return (
      <div className="podcast-show-destination">
        <div className="detail-topbar">
          <button type="button" className="detail-back" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back
          </button>
        </div>
        <section className="podcasts-status podcasts-status--error" role="alert">
          <p>{showError}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void retryShow()}>
            Retry
          </button>
        </section>
      </div>
    )
  }

  if (!show) return null

  const categoryPills = [
    show.primaryCategory,
    ...show.categories.filter((entry) => entry !== show.primaryCategory),
  ].filter(Boolean)

  return (
    <div className="podcast-show-destination">
      <div className="detail-topbar">
        <button type="button" className="detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back
        </button>
        <div className="detail-titles">
          <h2 className="detail-title">{show.title}</h2>
          <p className="detail-subtitle">{formatPodcastShowSubtitle(show)}</p>
        </div>
      </div>

      <ContentShareActions content={{ type: 'podcast', id: show.id, title: show.title }} />

      <section className="podcast-show-hero" aria-labelledby="podcast-show-heading">
        <div className="podcast-show-hero-backdrop" aria-hidden="true" />
        <div className="podcast-show-hero-art">
          <ArtworkImage
            src={show.artworkUrl}
            alt=""
            seed={show.id}
            label={show.title}
            variant="wide"
            priority
          />
        </div>
        <div className="podcast-show-hero-copy">
          <p className="podcast-show-eyebrow">Podcast</p>
          <h1 id="podcast-show-heading">{show.title}</h1>
          <p className="podcast-show-byline">{formatPodcastShowSubtitle(show)}</p>
          {formatPodcastDescriptionExcerpt(show.description, 420) ? (
            <p className="podcast-show-description">{formatPodcastDescriptionExcerpt(show.description, 420)}</p>
          ) : null}
          <div className="podcast-show-pills">
            {categoryPills.map((category) => (
              <span key={category} className="podcast-show-pill">
                {category}
              </span>
            ))}
            {show.language ? (
              <span className="podcast-show-pill podcast-show-pill--muted">{show.language}</span>
            ) : null}
            {show.episodeCount > 0 ? (
              <span className="podcast-show-pill podcast-show-pill--muted">
                {show.episodeCount} {show.episodeCount === 1 ? 'episode' : 'episodes'}
              </span>
            ) : null}
            {show.isVerified ? (
              <span className="podcast-show-pill podcast-show-pill--verified">Verified</span>
            ) : null}
            {show.isExclusive ? (
              <span className="podcast-show-pill podcast-show-pill--exclusive">Exclusive</span>
            ) : null}
          </div>
          <div className="podcast-show-actions">
            {episodes[0] ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => playEpisode(episodes[0]!)}>
                Play Latest
              </button>
            ) : null}
            <button
              type="button"
              className={`btn-secondary btn-sm${library.isFavorite('podcast_show', show.id) ? ' is-active' : ''}`}
              onClick={() => library.toggleFavorite(buildPodcastShowLibraryItem(show))}
            >
              {library.isFavorite('podcast_show', show.id) ? 'Saved to Library' : 'Save Show'}
            </button>
          </div>
        </div>
      </section>

      {showContinueEntries.length > 0 ? <section className="podcast-show-section" aria-labelledby="podcast-show-continue-heading">
        <div className="podcast-show-section-header">
          <div>
            <h2 id="podcast-show-continue-heading">Continue Listening</h2>
            <p className="podcast-show-section-subtitle">Resume points saved on this device</p>
          </div>
        </div>
          <div className="podcasts-continue-grid">
            {showContinueEntries.map((entry) => {
              const episode = progressEntryToEpisodeMeta(entry)
              const percent = progressPercent(entry.positionSeconds, entry.durationSeconds)
              return (
                <article key={entry.episodeId} className="podcasts-continue-card">
                  <div className="podcasts-continue-art">
                    <ArtworkImage
                      src={entry.artworkUrl ?? show.artworkUrl}
                      alt=""
                      seed={entry.episodeId}
                      label={entry.episodeTitle}
                    />
                  </div>
                  <div className="podcasts-continue-copy">
                    <h3>{entry.episodeTitle}</h3>
                    <p>{entry.showTitle}</p>
                    <div className="podcasts-continue-progress" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => playEpisode(episode, entry.positionSeconds)}
                  >
                    Resume
                  </button>
                </article>
              )
            })}
          </div>
      </section> : null}

      <section className="podcast-show-section" aria-labelledby="podcast-show-episodes-heading">
        <div className="podcast-show-section-header">
          <div>
            <h2 id="podcast-show-episodes-heading">Episodes</h2>
            <p className="podcast-show-section-subtitle">Browse and continue your show</p>
          </div>
          {episodesLoading ? <span className="podcasts-section-meta">Loading…</span> : null}
        </div>

        <div className="podcast-show-episode-tools">
          <input
            type="search"
            value={episodeQuery}
            onChange={(event) => setEpisodeQuery(event.target.value)}
            placeholder="Search episodes"
            aria-label="Search episodes"
          />
          <select value={episodeSort} onChange={(event) => setEpisodeSort(event.target.value as typeof episodeSort)} aria-label="Sort episodes">
            <option value="catalog">Catalog order</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {episodesError && episodes.length === 0 ? (
          <div className="podcasts-status podcasts-status--error" role="alert">
            <p>{episodesError}</p>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void retryEpisodes()}>
              Retry
            </button>
          </div>
        ) : episodesLoading && episodes.length === 0 ? (
          <div className="podcasts-status" aria-busy="true">
            <p>Loading episodes…</p>
          </div>
        ) : episodes.length === 0 ? (
          <div className="podcasts-status podcasts-status--empty" role="status">
            <p>No episodes are available for this show right now.</p>
          </div>
        ) : (
          <>
            <div className="podcast-show-episode-list">
              {visibleEpisodes.map((episode) => {
                const downloadItem = downloads.getItem('podcast_episode', episode.id)
                const downloadLabel = !canDownload
                  ? null
                  : downloadItem?.status === 'completed'
                    ? 'Downloaded'
                    : downloadItem && ['queued', 'resolving', 'downloading'].includes(downloadItem.status)
                      ? downloadProgressLabel(downloadItem)
                      : downloadItem?.status === 'failed'
                        ? 'Retry'
                        : 'Download'
                return (
                <ShowEpisodeRow
                  key={episode.id}
                  episode={episode}
                  showArtworkUrl={show.artworkUrl}
                  onPlay={() => playEpisode(episode)}
                  onToggleFavorite={() => library.toggleFavorite(buildPodcastEpisodeLibraryItem(episode))}
                  isFavorite={library.isFavorite('podcast_episode', episode.id)}
                  onToggleDownload={canDownload ? () => {
                    if (downloadItem?.status === 'completed') return
                    if (downloadItem && ['queued', 'resolving', 'downloading'].includes(downloadItem.status)) {
                      void downloads.cancel(downloadItem.downloadId)
                      return
                    }
                    void downloads.start({
                      type: 'podcast_episode',
                      id: episode.id,
                      title: episode.title,
                      subtitle: show.title,
                      artwork: episode.artworkUrl ?? show.artworkUrl,
                      showId: show.id,
                      parentId: show.id,
                      duration: episode.durationSeconds,
                      metadata: { showTitle: show.title },
                    })
                  } : undefined}
                  downloadLabel={downloadLabel}
                  tuning={tuningEpisodeId === episode.id}
                  isActive={activePodcastEpisodeId === episode.id}
                  hasProgress={progressEpisodeIds.has(episode.id)}
                  ArtworkImage={ArtworkImage}
                />
              )})}
            </div>
            {episodesPagination?.hasMore ? (
              <div className="podcasts-section-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={episodesLoadingMore}
                  onClick={() => void loadMoreEpisodes()}
                >
                  {episodesLoadingMore ? 'Loading…' : 'Show more episodes'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
})
