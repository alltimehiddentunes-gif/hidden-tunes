import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  useDesktopPlayback,
  useDesktopPlaybackProgress,
} from '../../context/DesktopPlaybackProvider'
import { fetchAllLectureSeriesSessions } from '../../lib/lectures/lectureCatalogApi'
import {
  formatLectureDuration,
  formatLectureSeriesSubtitle,
  formatLectureSessionMetaLine,
  lectureCategoryLabel,
} from '../../lib/lectures/lectureFormatters'
import {
  isLectureQueueSong,
  isLectureVideoSong,
  parseLectureSongId,
} from '../../lib/lectures/lecturePlaybackAdapter'
import {
  getLectureProgress,
  getLectureSessionProgress,
  isLectureSessionCompleted,
  isLectureSeriesSaved,
  toggleSavedLectureSeries,
  type LectureSavedEntry,
} from '../../lib/lectures/lectureProgressStorage'
import type { LectureItem, LectureSeries, PlayLectureSessionHandler } from '../../lib/lectures/types'
import { useLectureSeriesData } from '../../lib/lectures/useLectureSeriesData'
import { useRelatedLectures } from '../../lib/lectures/useRelatedLectures'
import { formatPlaybackTime } from '../../lib/player/formatPlaybackTime'
import { LectureEmptyState } from './LectureEmptyState'
import { LectureErrorState } from './LectureErrorState'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  variant?: 'square' | 'wide'
  priority?: boolean
}

type LectureSeriesPageProps = {
  seriesId: string
  onBack: () => void
  onPlayLectureSession: PlayLectureSessionHandler
  onOpenSeries?: (seriesId: string) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

const DESCRIPTION_COLLAPSE_CHARS = 420

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  )
}

function SkipBackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
    </svg>
  )
}

function SkipForwardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 6h2v12h-2V6zM5 18l8.5-6L5 6v12z" />
    </svg>
  )
}

function SeekBackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 5v4h4" />
      <text x="9" y="15.5" fill="currentColor" stroke="none" fontSize="7" fontFamily="inherit">10</text>
    </svg>
  )
}

function SeekForwardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21 12a9 9 0 10-9-9" />
      <path d="M21 5v4h-4" />
      <text x="8.5" y="15.5" fill="currentColor" stroke="none" fontSize="7" fontFamily="inherit">10</text>
    </svg>
  )
}

function SessionRow({
  session,
  seriesArtworkUrl,
  onPlay,
  tuning,
  isActive,
  isPlaying,
  isCompleted,
  progressPercent,
  ArtworkImage,
}: {
  session: LectureItem
  seriesArtworkUrl: string | null
  onPlay: () => void
  tuning: boolean
  isActive: boolean
  isPlaying: boolean
  isCompleted: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  const sessionLabel =
    session.sessionNumber != null ? `Session ${session.sessionNumber}` : 'Session'

  return (
    <article
      className={`lecture-detail-session-row${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="lecture-detail-session-art">
        <ArtworkImage
          src={session.artworkUrl ?? seriesArtworkUrl}
          alt=""
          seed={session.id}
          label={session.title}
        />
      </div>
      <div className="lecture-detail-session-copy">
        <h3>
          <span className="lecture-detail-session-number">{sessionLabel}</span>
          {isActive && isPlaying ? (
            <span className="lecture-detail-session-badge">Now playing</span>
          ) : null}
          {isActive && !isPlaying ? (
            <span className="lecture-detail-session-badge">Paused</span>
          ) : null}
          {isCompleted ? <span className="lecture-detail-session-badge">Completed</span> : null}
        </h3>
        <p>{session.title}</p>
        <span>{formatLectureSessionMetaLine(session)}</span>
        {progressPercent > 0 && !isCompleted ? (
          <div className="lecture-detail-session-progress" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="lecture-detail-session-play"
        disabled={tuning}
        onClick={onPlay}
        aria-label={`Play ${session.title}`}
      >
        <PlayIcon />
      </button>
    </article>
  )
}

function RelatedCard({
  series,
  onOpen,
  ArtworkImage,
}: {
  series: LectureSeries
  onOpen: () => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <button type="button" className="lecture-detail-related-card" onClick={onOpen}>
      <span className="lecture-detail-related-art">
        <ArtworkImage src={series.artworkUrl} alt="" seed={series.id} label={series.title} />
      </span>
      <span className="lecture-detail-related-copy">
        <strong>{series.title}</strong>
        <span>{formatLectureSeriesSubtitle(series)}</span>
      </span>
    </button>
  )
}

export const LectureSeriesPage = memo(function LectureSeriesPage({
  seriesId,
  onBack,
  onPlayLectureSession,
  onOpenSeries,
  ArtworkImage,
}: LectureSeriesPageProps) {
  const [tuningSessionId, setTuningSessionId] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => isLectureSeriesSaved(seriesId))
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const videoMountRef = useRef<HTMLDivElement | null>(null)

  const {
    currentTrack,
    isPlaying,
    isLoading,
    error: playerError,
    pause,
    resume,
    previous,
    next,
    skipRelative,
    seekTo,
    mountTvVideo,
  } = useDesktopPlayback()
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()

  const {
    series,
    sessions,
    pagination,
    loading,
    loadingMore,
    error,
    loadMoreSessions,
  } = useLectureSeriesData(seriesId)

  const { related, loading: relatedLoading } = useRelatedLectures(series)

  const seriesProgress = useMemo(
    () => (series ? getLectureProgress(series.id) : null),
    [series],
  )

  const activeIds = useMemo(
    () => parseLectureSongId(currentTrack?.id ?? ''),
    [currentTrack?.id],
  )

  const isCurrentSeries = Boolean(
    series && activeIds?.seriesId === series.id && isLectureQueueSong(currentTrack),
  )
  const activeSessionId = isCurrentSeries ? activeIds?.sessionId ?? null : null
  const isLecturePlaying = isCurrentSeries && isPlaying
  const isLectureLoading = isCurrentSeries && isLoading
  const isVideoLecture = isCurrentSeries && isLectureVideoSong(currentTrack)

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null
    return sessions.find((entry) => entry.id === activeSessionId) ?? null
  }, [activeSessionId, sessions])

  const featuredSession = activeSession
    ?? (seriesProgress
      ? sessions.find((entry) => entry.id === seriesProgress.sessionId) ?? sessions[0] ?? null
      : sessions[0] ?? null)

  const durationForBar =
    isCurrentSeries && durationSeconds > 0
      ? durationSeconds
      : featuredSession?.durationSeconds
        ?? series?.totalDurationSeconds
        ?? 0

  const positionForBar = isCurrentSeries ? positionSeconds : (seriesProgress?.positionSeconds ?? 0)
  const progressPercent =
    durationForBar > 0
      ? Math.min(100, Math.round((positionForBar / durationForBar) * 100))
      : 0

  // Mount shared video element into the lecture surface when this lecture is video.
  useEffect(() => {
    if (!isVideoLecture) {
      mountTvVideo(null)
      return undefined
    }
    mountTvVideo(videoMountRef.current)
    return () => {
      mountTvVideo(null)
    }
  }, [isVideoLecture, mountTvVideo, activeSessionId])

  useEffect(() => {
    if (!isCurrentSeries) {
      setPlaybackError(null)
      return
    }
    if (playerError) setPlaybackError(playerError)
  }, [isCurrentSeries, playerError])

  const playSession = useCallback(
    async (session: LectureItem, resumePositionSeconds?: number | null) => {
      if (!series) return
      setPlaybackError(null)
      setTuningSessionId(session.id)
      try {
        const allSessions = await fetchAllLectureSeriesSessions(series.id)
        const startIndex = Math.max(0, allSessions.findIndex((entry) => entry.id === session.id))
        const queue = allSessions.slice(Math.max(0, startIndex))
        onPlayLectureSession(series, session, queue, 0, series.title, {
          resumePositionSeconds,
        })
      } catch (reason) {
        setPlaybackError(
          reason instanceof Error
            ? reason.message
            : 'This lecture couldn\u2019t be played right now.',
        )
      } finally {
        window.setTimeout(() => setTuningSessionId(null), 800)
      }
    },
    [onPlayLectureSession, series],
  )

  const handlePrimaryPlay = useCallback(() => {
    if (!series || !featuredSession) return

    if (isCurrentSeries && activeSessionId === featuredSession.id) {
      if (isPlaying) pause()
      else void resume()
      return
    }

    const progress = getLectureSessionProgress(series.id, featuredSession.id)
    const completed = progress
      ? isLectureSessionCompleted(progress.positionSeconds, progress.durationSeconds)
      : false
    void playSession(
      featuredSession,
      progress && !completed ? progress.positionSeconds : null,
    )
  }, [
    activeSessionId,
    featuredSession,
    isCurrentSeries,
    isPlaying,
    pause,
    playSession,
    resume,
    series,
  ])

  const handlePrevious = useCallback(() => {
    if (isCurrentSeries) {
      previous()
      return
    }
    if (!featuredSession || sessions.length === 0) return
    const index = sessions.findIndex((entry) => entry.id === featuredSession.id)
    if (index > 0) void playSession(sessions[index - 1], null)
  }, [featuredSession, isCurrentSeries, playSession, previous, sessions])

  const handleNext = useCallback(() => {
    if (isCurrentSeries) {
      next()
      return
    }
    if (!featuredSession || sessions.length === 0) return
    const index = sessions.findIndex((entry) => entry.id === featuredSession.id)
    if (index >= 0 && index + 1 < sessions.length) {
      void playSession(sessions[index + 1], null)
      return
    }
    if (related[0] && onOpenSeries) onOpenSeries(related[0].id)
  }, [featuredSession, isCurrentSeries, next, onOpenSeries, playSession, related, sessions])

  const toggleSaved = useCallback(() => {
    if (!series) return
    const entry: LectureSavedEntry = {
      seriesId: series.id,
      seriesTitle: series.title,
      speakerName: series.speaker?.name ?? null,
      artworkUrl: series.artworkUrl,
      categorySlug: series.category?.slug ?? null,
      savedAt: new Date().toISOString(),
    }
    setSaved(toggleSavedLectureSeries(entry))
  }, [series])

  const onSeekBarKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isCurrentSeries || durationForBar <= 0) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        skipRelative(-10)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        skipRelative(10)
      }
      if (event.key === 'Home') {
        event.preventDefault()
        seekTo(0)
      }
      if (event.key === 'End') {
        event.preventDefault()
        seekTo(Math.max(0, durationForBar - 1))
      }
    },
    [durationForBar, isCurrentSeries, seekTo, skipRelative],
  )

  const onSeekBarClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!isCurrentSeries || durationForBar <= 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      seekTo(ratio * durationForBar)
    },
    [durationForBar, isCurrentSeries, seekTo],
  )

  const categoryLabel = lectureCategoryLabel(series?.category?.slug)
  const description = series?.description?.trim() ?? ''
  const descriptionNeedsCollapse = description.length > DESCRIPTION_COLLAPSE_CHARS
  const visibleDescription =
    descriptionNeedsCollapse && !descriptionExpanded
      ? `${description.slice(0, DESCRIPTION_COLLAPSE_CHARS).trim()}…`
      : description

  const mediaBadgeLabel = featuredSession?.mediaType === 'video' ? 'Video' : 'Audio'
  const primaryLabel = (() => {
    if (tuningSessionId || isLectureLoading) return 'Resolving…'
    if (isCurrentSeries && isPlaying) return 'Pause'
    if (isCurrentSeries && !isPlaying) return 'Resume'
    if (seriesProgress && !seriesProgress.completed) return 'Resume'
    return 'Play'
  })()

  if (loading) {
    return (
      <div className="lecture-detail-page">
        <div className="detail-topbar">
          <button type="button" className="detail-back" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back
          </button>
        </div>
        <div className="lecture-detail-skeleton" aria-busy="true">
          <div className="lecture-detail-skeleton-art" />
          <div className="lecture-detail-skeleton-copy">
            <div className="lectures-skeleton-line lectures-skeleton-line--title" />
            <div className="lectures-skeleton-line" />
            <div className="lectures-skeleton-line" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="lecture-detail-page">
        <div className="detail-topbar">
          <button type="button" className="detail-back" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back
          </button>
        </div>
        <LectureErrorState
          message={error ?? 'We couldn\u2019t load this lecture.'}
          onRetry={() => window.location.reload()}
        />
        <button type="button" className="lectures-btn lectures-btn--ghost" onClick={onBack}>
          Back to Lectures
        </button>
      </div>
    )
  }

  return (
    <div className="lecture-detail-page">
      <div className="detail-topbar lecture-detail-topbar">
        <button type="button" className="detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back
        </button>
        <nav className="lecture-detail-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="lecture-detail-crumb" onClick={onBack}>
            Lectures
          </button>
          <span aria-hidden="true">/</span>
          <span className="lecture-detail-crumb is-muted">{categoryLabel}</span>
          <span aria-hidden="true">/</span>
          <span className="lecture-detail-crumb is-current">{series.title}</span>
        </nav>
      </div>

      <section className="lecture-detail-main" aria-labelledby="lecture-detail-title">
        <div className="lecture-detail-media">
          {isVideoLecture ? (
            <div className="lecture-detail-video-frame">
              <div ref={videoMountRef} className="lecture-detail-video-mount" />
              {isLectureLoading ? (
                <div className="lecture-detail-video-overlay" aria-live="polite">
                  Buffering…
                </div>
              ) : null}
            </div>
          ) : (
            <div className="lecture-detail-artwork">
              <ArtworkImage
                src={featuredSession?.artworkUrl ?? series.artworkUrl}
                alt={series.title}
                seed={series.id}
                label={series.title}
                variant="wide"
                priority
              />
              <span className="lecture-detail-media-badge">{mediaBadgeLabel}</span>
              {formatLectureDuration(featuredSession?.durationSeconds ?? series.totalDurationSeconds) ? (
                <span className="lecture-detail-duration-pill">
                  {formatLectureDuration(
                    featuredSession?.durationSeconds ?? series.totalDurationSeconds,
                  )}
                </span>
              ) : null}
              {progressPercent > 0 ? (
                <span className="lecture-detail-progress-pill">{progressPercent}%</span>
              ) : null}
              {isLecturePlaying ? (
                <span className="lecture-detail-playing-overlay" aria-hidden="true">
                  Playing
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="lecture-detail-copy">
          <span className="lecture-detail-eyebrow">{categoryLabel}</span>
          <h1 id="lecture-detail-title">{series.title}</h1>
          <p className="lecture-detail-subtitle">{formatLectureSeriesSubtitle(series)}</p>

          <div className="lecture-detail-meta">
            {series.speaker?.name ? <span className="lecture-detail-pill">{series.speaker.name}</span> : null}
            {series.institution?.name && series.institution.name !== series.speaker?.name ? (
              <span className="lecture-detail-pill">{series.institution.name}</span>
            ) : null}
            {series.language ? <span className="lecture-detail-pill">{series.language}</span> : null}
            {series.publishedAt ? (
              <span className="lecture-detail-pill">{series.publishedAt.slice(0, 10)}</span>
            ) : null}
            {series.sessionCount > 0 ? (
              <span className="lecture-detail-pill">
                {series.sessionCount} {series.sessionCount === 1 ? 'session' : 'sessions'}
              </span>
            ) : null}
            <span className="lecture-detail-pill">{mediaBadgeLabel}</span>
          </div>

          {featuredSession ? (
            <p className="lecture-detail-now">
              {isCurrentSeries ? 'Now' : 'Up next'}: {featuredSession.title}
            </p>
          ) : null}

          <div
            className="lecture-detail-seek"
            role="slider"
            tabIndex={isCurrentSeries ? 0 : -1}
            aria-label="Lecture progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationForBar)}
            aria-valuenow={Math.round(positionForBar)}
            aria-disabled={!isCurrentSeries}
            onClick={onSeekBarClick}
            onKeyDown={onSeekBarKeyDown}
          >
            <div className="lecture-detail-seek-track" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="lecture-detail-seek-times">
              <span>{formatPlaybackTime(positionForBar)}</span>
              <span>{durationForBar > 0 ? formatPlaybackTime(durationForBar) : '—:—'}</span>
            </div>
          </div>

          <div className="lecture-detail-transport" role="group" aria-label="Lecture playback controls">
            <button
              type="button"
              className="lecture-detail-transport-btn"
              onClick={handlePrevious}
              aria-label="Previous lecture"
            >
              <SkipBackIcon />
            </button>
            <button
              type="button"
              className="lecture-detail-transport-btn"
              disabled={!isCurrentSeries}
              onClick={() => skipRelative(-10)}
              aria-label="Seek back 10 seconds"
            >
              <SeekBackIcon />
            </button>
            <button
              type="button"
              className="lecture-detail-play-btn"
              disabled={!featuredSession || Boolean(tuningSessionId) || isLectureLoading}
              aria-pressed={isLecturePlaying}
              onClick={handlePrimaryPlay}
            >
              {isCurrentSeries && isPlaying ? <PauseIcon /> : <PlayIcon />}
              <span>{primaryLabel}</span>
            </button>
            <button
              type="button"
              className="lecture-detail-transport-btn"
              disabled={!isCurrentSeries}
              onClick={() => skipRelative(10)}
              aria-label="Seek forward 10 seconds"
            >
              <SeekForwardIcon />
            </button>
            <button
              type="button"
              className="lecture-detail-transport-btn"
              onClick={handleNext}
              aria-label="Next lecture"
            >
              <SkipForwardIcon />
            </button>
            <button
              type="button"
              className="lectures-btn lectures-btn--ghost lecture-detail-save"
              aria-pressed={saved}
              onClick={toggleSaved}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>

          {playbackError ? (
            <div className="lecture-detail-playback-error" role="alert">
              <p>{playbackError}</p>
              <div className="lecture-detail-playback-error-actions">
                <button
                  type="button"
                  className="lectures-btn lectures-btn--primary"
                  disabled={!featuredSession || Boolean(tuningSessionId)}
                  onClick={() => featuredSession && void playSession(featuredSession, null)}
                >
                  Retry playback
                </button>
                <button
                  type="button"
                  className="lectures-btn lectures-btn--ghost"
                  onClick={handleNext}
                >
                  Play next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="lecture-detail-about" aria-labelledby="lecture-about-heading">
        <h2 id="lecture-about-heading">About this lecture</h2>
        {visibleDescription ? (
          <>
            <p>{visibleDescription}</p>
            {descriptionNeedsCollapse ? (
              <button
                type="button"
                className="lecture-detail-show-more"
                onClick={() => setDescriptionExpanded((value) => !value)}
              >
                {descriptionExpanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </>
        ) : (
          <p className="lecture-detail-muted">No description available for this course.</p>
        )}
        <dl className="lecture-detail-facts">
          {series.speaker?.name ? (
            <>
              <dt>Speaker</dt>
              <dd>{series.speaker.name}</dd>
            </>
          ) : null}
          {series.institution?.name ? (
            <>
              <dt>Institution</dt>
              <dd>{series.institution.name}</dd>
            </>
          ) : null}
          {series.category?.slug ? (
            <>
              <dt>Category</dt>
              <dd>{categoryLabel}</dd>
            </>
          ) : null}
          {series.language ? (
            <>
              <dt>Language</dt>
              <dd>{series.language}</dd>
            </>
          ) : null}
          {series.publishedAt ? (
            <>
              <dt>Published</dt>
              <dd>{series.publishedAt.slice(0, 10)}</dd>
            </>
          ) : null}
          {formatLectureDuration(series.totalDurationSeconds) ? (
            <>
              <dt>Duration</dt>
              <dd>{formatLectureDuration(series.totalDurationSeconds)}</dd>
            </>
          ) : null}
          {series.difficulty ? (
            <>
              <dt>Level</dt>
              <dd>{series.difficulty}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="lecture-detail-section" aria-labelledby="lecture-sessions-heading">
        <div className="lecture-detail-section-header">
          <h2 id="lecture-sessions-heading">More in this series</h2>
          {pagination?.hasMore ? (
            <button
              type="button"
              className="lectures-btn lectures-btn--ghost"
              disabled={loadingMore}
              onClick={loadMoreSessions}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <LectureEmptyState title="This course has no sessions yet." />
        ) : (
          <div className="lecture-detail-session-list">
            {sessions.map((session) => {
              const progress = getLectureSessionProgress(series.id, session.id)
              const percent =
                progress?.durationSeconds && progress.durationSeconds > 0
                  ? Math.min(
                      100,
                      Math.round((progress.positionSeconds / progress.durationSeconds) * 100),
                    )
                  : 0
              const completed = progress
                ? isLectureSessionCompleted(progress.positionSeconds, progress.durationSeconds)
                  || progress.completed
                : false
              const isActive = activeSessionId === session.id

              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  seriesArtworkUrl={series.artworkUrl}
                  onPlay={() =>
                    playSession(
                      session,
                      progress && !completed ? progress.positionSeconds : null,
                    )
                  }
                  tuning={tuningSessionId === session.id}
                  isActive={isActive}
                  isPlaying={isActive && isPlaying}
                  isCompleted={completed}
                  progressPercent={percent}
                  ArtworkImage={ArtworkImage}
                />
              )
            })}
          </div>
        )}
      </section>

      {(relatedLoading || related.length > 0) ? (
        <section className="lecture-detail-section" aria-labelledby="lecture-related-heading">
          <div className="lecture-detail-section-header">
            <h2 id="lecture-related-heading">You may also like</h2>
          </div>
          {relatedLoading && related.length === 0 ? (
            <p className="lecture-detail-muted">Finding related lectures…</p>
          ) : (
            <div className="lecture-detail-related-grid">
              {related.map((entry) => (
                <RelatedCard
                  key={entry.id}
                  series={entry}
                  onOpen={() => onOpenSeries?.(entry.id)}
                  ArtworkImage={ArtworkImage}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
})
