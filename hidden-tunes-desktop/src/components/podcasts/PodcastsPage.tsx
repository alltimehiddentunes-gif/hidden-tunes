import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  formatPodcastDuration,
  formatPodcastEpisodeMetaLine,
  formatPodcastShowSubtitle,
  podcastCategoryIcon,
} from '../../lib/podcasts/podcastFormatters'
import {
  historyEntryToEpisodeMeta,
  progressEntryToEpisodeMeta,
} from '../../lib/podcasts/podcastProgressStorage'
import type {
  PlayPodcastEpisodeHandler,
  PodcastEpisodeMeta,
  PodcastShowMeta,
  PodcastTabId,
} from '../../lib/podcasts/types'
import { usePodcastLocalState } from '../../lib/podcasts/usePodcastLocalState'
import { usePodcastsPageData } from '../../lib/podcasts/usePodcastsPageData'
import podcastsArtwork from '../../assets/section-headers/podcasts-microphone.png'
import { SectionHero } from '../SectionHero'

const VISIBLE_TAB_COUNT = 7

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type PodcastsPageProps = {
  query: string
  onOpenPodcastShow: (showId: string) => void
  onPlayPodcastEpisode: PlayPodcastEpisodeHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function progressPercent(position: number, duration: number | null) {
  if (!duration || duration <= 0) return 0
  return Math.min(100, Math.round((position / duration) * 100))
}

function FeaturedShowCard({
  show,
  onOpen,
  ArtworkImage,
}: {
  show: PodcastShowMeta
  onOpen: (showId: string) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="podcast-featured-card">
      <button
        type="button"
        className="podcast-featured-card-hit"
        onClick={() => onOpen(show.id)}
        aria-label={`Open ${show.title}`}
      >
        <div className="podcast-featured-card-art">
          <ArtworkImage src={show.artworkUrl} alt="" seed={show.id} label={show.title} />
          {show.isFeatured ? <span className="podcast-featured-badge">Featured</span> : null}
          <span className="podcast-card-play" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <div className="podcast-featured-card-copy">
          <h3>{show.title}</h3>
          <p>{formatPodcastShowSubtitle(show)}</p>
        </div>
      </button>
    </article>
  )
}

function EpisodeRow({
  episode,
  onOpenShow,
  onPlay,
  tuning,
  isActive,
  ArtworkImage,
}: {
  episode: PodcastEpisodeMeta
  onOpenShow: (showId: string) => void
  onPlay: () => void
  tuning: boolean
  isActive: boolean
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className={`podcast-episode-row${isActive ? ' is-active' : ''}`}>
      <div className="podcast-episode-row-art">
        <ArtworkImage
          src={episode.artworkUrl}
          alt=""
          seed={episode.id}
          label={episode.title}
        />
      </div>
      <div className="podcast-episode-row-copy">
        <h3>{episode.title}</h3>
        {episode.showId ? (
          <button
            type="button"
            className="podcast-episode-show-link"
            onClick={() => onOpenShow(episode.showId)}
          >
            {episode.showTitle ?? 'View podcast show'}
          </button>
        ) : (
          <p>{episode.showTitle ?? 'Podcast episode'}</p>
        )}
      </div>
      <div className="podcast-episode-row-meta" aria-label="Episode details">
        <span>{formatPodcastEpisodeMetaLine(episode)}</span>
      </div>
      <button
        type="button"
        className="podcast-episode-row-play"
        disabled={tuning}
        onClick={onPlay}
        aria-label={`Play ${episode.title}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </article>
  )
}

export const PodcastsPage = memo(function PodcastsPage({
  query,
  onOpenPodcastShow,
  onPlayPodcastEpisode,
  ArtworkImage,
}: PodcastsPageProps) {
  const [activeTab, setActiveTab] = useState<PodcastTabId>('all')
  const [showOverflowTabs, setShowOverflowTabs] = useState(false)
  const [tuningEpisodeId, setTuningEpisodeId] = useState<string | null>(null)
  const { currentTrack } = useDesktopPlayback()
  const { continueListening, recentlyPlayed } = usePodcastLocalState()

  const {
    featuredSectionShows,
    featuredSource,
    latestEpisodes,
    categoryCards,
    visibleTabs,
    loading,
    contentLoading,
    showsLoadingMore,
    episodesLoadingMore,
    error,
    contentError,
    showsPagination,
    episodesPagination,
    hasRenderableContent,
    loadMoreShows,
    loadMoreEpisodes,
    retry,
    retryBrowse,
  } = usePodcastsPageData(activeTab, query)

  const activePodcastEpisodeId = useMemo(() => {
    if (!currentTrack?.id.startsWith('podcast-')) return null
    return currentTrack.id.slice('podcast-'.length)
  }, [currentTrack?.id])

  const playEpisode = useCallback(
    (episode: PodcastEpisodeMeta, queue: PodcastEpisodeMeta[], queueTitle: string) => {
      const startIndex = Math.max(0, queue.findIndex((entry) => entry.id === episode.id))
      setTuningEpisodeId(episode.id)
      onPlayPodcastEpisode(episode, queue, startIndex, queueTitle)
      window.setTimeout(() => setTuningEpisodeId(null), 800)
    },
    [onPlayPodcastEpisode],
  )

  const { primaryTabs, overflowTabs } = useMemo(() => {
    const primary = visibleTabs.slice(0, VISIBLE_TAB_COUNT)
    const overflow = visibleTabs.slice(VISIBLE_TAB_COUNT)
    return { primaryTabs: primary, overflowTabs: overflow }
  }, [visibleTabs])

  const featuredSubtitle = useMemo(() => {
    if (featuredSource === 'featured') return 'Handpicked shows from the catalog'
    if (featuredSource === 'fallback') return 'Verified shows from the catalog'
    if (featuredSource === 'browse') {
      return query.trim()
        ? `Shows matching “${query.trim()}”`
        : 'Shows in this category'
    }
    return 'Browse the podcast catalog'
  }, [featuredSource, query])

  const showPrimaryError = Boolean(error) && !loading
  const showPrimaryLoading = loading
  const showPageContent = !showPrimaryLoading && !(showPrimaryError && !hasRenderableContent)

  return (
    <div className="podcasts-destination">
      <SectionHero
        title="Podcasts"
        subtitle="Stories. Ideas. Conversations. For every mood and every moment."
        artwork={podcastsArtwork}
        artworkAlt=""
        objectPosition="42% center"
        titleId="podcasts-page-heading"
      />

      {showPageContent ? (
        <div className="podcasts-tabs" role="tablist" aria-label="Podcast categories">
          {primaryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`podcasts-tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id)
                setShowOverflowTabs(false)
              }}
            >
              {tab.label}
            </button>
          ))}
          {overflowTabs.length > 0 ? (
            <button
              type="button"
              className={`podcasts-tab podcasts-tab--more${showOverflowTabs ? ' is-active' : ''}`}
              aria-expanded={showOverflowTabs}
              onClick={() => setShowOverflowTabs((current) => !current)}
            >
              More
            </button>
          ) : null}
        </div>
      ) : null}

      {showOverflowTabs && overflowTabs.length > 0 ? (
        <div className="podcasts-tabs podcasts-tabs--overflow" role="tablist" aria-label="More podcast categories">
          {overflowTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`podcasts-tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id)
                setShowOverflowTabs(false)
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {showPrimaryError ? (
        <section className="podcasts-status podcasts-status--error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void retry()}>
            Retry
          </button>
        </section>
      ) : showPrimaryLoading ? (
        <section className="podcasts-status" aria-busy="true">
          <p>Loading podcast catalog…</p>
        </section>
      ) : null}

      {showPageContent ? (
        <>
          <section className="podcasts-section" aria-labelledby="podcasts-featured-heading">
            <div className="podcasts-section-header">
              <div>
                <h2 id="podcasts-featured-heading">Featured Podcasts</h2>
                <p className="podcasts-section-subtitle">{featuredSubtitle}</p>
              </div>
              {contentLoading ? <span className="podcasts-section-meta">Updating…</span> : null}
            </div>
            {contentError && featuredSectionShows.length === 0 ? (
              <div className="podcasts-status podcasts-status--error" role="alert">
                <p>{contentError}</p>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void retryBrowse()}
                >
                  Retry
                </button>
              </div>
            ) : featuredSectionShows.length === 0 ? (
              <div className="podcasts-status podcasts-status--empty" role="status">
                <p>
                  {query.trim()
                    ? `No shows match “${query.trim()}”.`
                    : 'No podcasts are available in this view right now.'}
                </p>
              </div>
            ) : (
              <>
                <div className="podcasts-featured-rail">
                  {featuredSectionShows.map((show) => (
                    <FeaturedShowCard
                      key={show.id}
                      show={show}
                      onOpen={onOpenPodcastShow}
                      ArtworkImage={ArtworkImage}
                    />
                  ))}
                </div>
                {showsPagination?.hasMore ? (
                  <div className="podcasts-section-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={showsLoadingMore}
                      onClick={() => void loadMoreShows()}
                    >
                      {showsLoadingMore ? 'Loading…' : 'Show more shows'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="podcasts-section" aria-labelledby="podcasts-latest-heading">
            <div className="podcasts-section-header">
              <div>
                <h2 id="podcasts-latest-heading">Latest Episodes</h2>
                <p className="podcasts-section-subtitle">Fresh conversations across the catalog</p>
              </div>
              {contentLoading ? <span className="podcasts-section-meta">Updating…</span> : null}
            </div>
            {contentError && latestEpisodes.length === 0 ? (
              <div className="podcasts-status podcasts-status--error" role="alert">
                <p>{contentError}</p>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void retryBrowse()}
                >
                  Retry
                </button>
              </div>
            ) : latestEpisodes.length === 0 ? (
              <div className="podcasts-status podcasts-status--empty" role="status">
                <p>
                  {query.trim()
                    ? `No episodes match “${query.trim()}”.`
                    : 'No episodes are available in this view right now.'}
                </p>
              </div>
            ) : (
              <>
                <div className="podcasts-episode-list">
                  {latestEpisodes.map((episode) => (
                    <EpisodeRow
                      key={episode.id}
                      episode={episode}
                      onOpenShow={onOpenPodcastShow}
                      onPlay={() =>
                        playEpisode(episode, latestEpisodes, 'Latest Podcast Episodes')
                      }
                      tuning={tuningEpisodeId === episode.id}
                      isActive={activePodcastEpisodeId === episode.id}
                      ArtworkImage={ArtworkImage}
                    />
                  ))}
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

          <section className="podcasts-section" aria-labelledby="podcasts-categories-heading">
            <div className="podcasts-section-header">
              <div>
                <h2 id="podcasts-categories-heading">Top Categories</h2>
                <p className="podcasts-section-subtitle">Browse by genre</p>
              </div>
            </div>
            {categoryCards.length === 0 ? (
              <div className="podcasts-status podcasts-status--empty" role="status">
                <p>Categories are not available right now.</p>
              </div>
            ) : (
              <div className="podcasts-category-grid">
                {categoryCards.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`podcasts-category-card${activeTab === category.slug ? ' is-active' : ''}`}
                    onClick={() => setActiveTab(category.slug)}
                  >
                    <span className="podcasts-category-icon" aria-hidden="true">
                      {podcastCategoryIcon(category.slug)}
                    </span>
                    <strong>{category.label}</strong>
                    {category.description ? (
                      <span className="podcasts-category-description">{category.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="podcasts-section" aria-labelledby="podcasts-continue-heading">
            <div className="podcasts-section-header">
              <div>
                <h2 id="podcasts-continue-heading">Continue Listening</h2>
                <p className="podcasts-section-subtitle">Pick up where you left off</p>
              </div>
            </div>
            {continueListening.length === 0 ? (
              <div className="podcasts-status podcasts-status--empty" role="status">
                <p>No episodes in progress yet. Start listening and your resume points will appear here.</p>
              </div>
            ) : (
              <div className="podcasts-continue-grid">
                {continueListening.map((entry) => {
                  const episode = progressEntryToEpisodeMeta(entry)
                  const percent = progressPercent(entry.positionSeconds, entry.durationSeconds)
                  const remaining =
                    entry.durationSeconds && entry.durationSeconds > entry.positionSeconds
                      ? formatPodcastDuration(entry.durationSeconds - entry.positionSeconds)
                      : formatPodcastDuration(entry.positionSeconds)

                  return (
                    <article key={entry.episodeId} className="podcasts-continue-card">
                      <div className="podcasts-continue-art">
                        <ArtworkImage
                          src={entry.artworkUrl}
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
                        <span className="podcasts-continue-meta">
                          {remaining ? `${remaining} left` : 'In progress'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() =>
                          onPlayPodcastEpisode(episode, [episode], 0, entry.showTitle, {
                            resumePositionSeconds: entry.positionSeconds,
                          })
                        }
                      >
                        Resume
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="podcasts-section" aria-labelledby="podcasts-recent-heading">
            <div className="podcasts-section-header">
              <div>
                <h2 id="podcasts-recent-heading">Recently Played</h2>
                <p className="podcasts-section-subtitle">Your recent podcast activity</p>
              </div>
            </div>
            {recentlyPlayed.length === 0 ? (
              <div className="podcasts-status podcasts-status--empty" role="status">
                <p>No recently played episodes yet. Your listening history will show up here after playback.</p>
              </div>
            ) : (
              <div className="podcasts-recent-list">
                {recentlyPlayed.map((entry) => {
                  const episode = historyEntryToEpisodeMeta(entry)
                  return (
                    <article key={`${entry.episodeId}-${entry.playedAt}`} className="podcasts-recent-row">
                      <div className="podcasts-recent-art">
                        <ArtworkImage
                          src={entry.artworkUrl}
                          alt=""
                          seed={entry.episodeId}
                          label={entry.episodeTitle}
                        />
                      </div>
                      <div className="podcasts-recent-copy">
                        <h3>{entry.episodeTitle}</h3>
                        <p>{entry.showTitle}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() =>
                          onPlayPodcastEpisode(episode, [episode], 0, 'Recently Played')
                        }
                      >
                        Play
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
})
