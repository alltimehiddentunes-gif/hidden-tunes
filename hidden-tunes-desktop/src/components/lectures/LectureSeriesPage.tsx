import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import { fetchAllLectureSeriesSessions } from '../../lib/lectures/lectureCatalogApi'
import {
  formatLectureDuration,
  formatLectureSeriesSubtitle,
  formatLectureSessionMetaLine,
  lectureCategoryLabel,
} from '../../lib/lectures/lectureFormatters'
import { parseLectureSongId } from '../../lib/lectures/lecturePlaybackAdapter'
import {
  getLectureProgress,
  getLectureSessionProgress,
  isLectureSessionCompleted,
  isLectureSeriesSaved,
  toggleSavedLectureSeries,
  type LectureSavedEntry,
} from '../../lib/lectures/lectureProgressStorage'
import type { LectureItem, PlayLectureSessionHandler } from '../../lib/lectures/types'
import { useLectureSeriesData } from '../../lib/lectures/useLectureSeriesData'
import { LectureEmptyState } from './LectureEmptyState'
import { LectureErrorState } from './LectureErrorState'
import { LectureLoadingSkeleton } from './LectureLoadingSkeleton'

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
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function SessionRow({
  session,
  seriesArtworkUrl,
  onPlay,
  tuning,
  isActive,
  isCompleted,
  progressPercent,
  ArtworkImage,
}: {
  session: LectureItem
  seriesArtworkUrl: string | null
  onPlay: () => void
  tuning: boolean
  isActive: boolean
  isCompleted: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  const sessionLabel =
    session.sessionNumber != null ? `Session ${session.sessionNumber}` : 'Session'

  return (
    <article
      className={`lectures-session-row${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}`}
    >
      <div className="lectures-session-row-art">
        <ArtworkImage
          src={session.artworkUrl ?? seriesArtworkUrl}
          alt=""
          seed={session.id}
          label={session.title}
        />
      </div>
      <div className="lectures-session-row-copy">
        <h3>
          {sessionLabel}
          {isActive ? <span className="lectures-session-badge">Now playing</span> : null}
          {isCompleted ? <span className="lectures-session-badge">Completed</span> : null}
        </h3>
        <p>{session.title}</p>
        <span>{formatLectureSessionMetaLine(session)}</span>
        {progressPercent > 0 && !isCompleted ? (
          <div className="lectures-session-progress" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="lectures-session-row-play"
        disabled={tuning}
        onClick={onPlay}
        aria-label={`Play ${session.title}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </article>
  )
}

export const LectureSeriesPage = memo(function LectureSeriesPage({
  seriesId,
  onBack,
  onPlayLectureSession,
  ArtworkImage,
}: LectureSeriesPageProps) {
  const [tuningSessionId, setTuningSessionId] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => isLectureSeriesSaved(seriesId))
  const { currentTrack } = useDesktopPlayback()
  const {
    series,
    sessions,
    pagination,
    loading,
    loadingMore,
    error,
    loadMoreSessions,
  } = useLectureSeriesData(seriesId)

  const seriesProgress = useMemo(
    () => (series ? getLectureProgress(series.id) : null),
    [series],
  )

  const activeIds = useMemo(() => parseLectureSongId(currentTrack?.id ?? ''), [currentTrack?.id])

  const playSession = useCallback(
    async (session: LectureItem, resumePositionSeconds?: number | null) => {
      if (!series) return
      setTuningSessionId(session.id)
      try {
        const allSessions = await fetchAllLectureSeriesSessions(series.id)
        const startIndex = Math.max(0, allSessions.findIndex((entry) => entry.id === session.id))
        const queue = allSessions.slice(startIndex)
        onPlayLectureSession(series, session, queue, 0, series.title, {
          resumePositionSeconds,
        })
      } finally {
        window.setTimeout(() => setTuningSessionId(null), 800)
      }
    },
    [onPlayLectureSession, series],
  )

  const resumeCourse = useCallback(() => {
    if (!series || !seriesProgress) return
    const session =
      sessions.find((entry) => entry.id === seriesProgress.sessionId) ?? sessions[0]
    if (!session) return
    void playSession(session, seriesProgress.positionSeconds)
  }, [playSession, series, seriesProgress, sessions])

  const startCourse = useCallback(() => {
    if (!series || sessions.length === 0) return
    void playSession(sessions[0], null)
  }, [playSession, series, sessions])

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

  if (loading) {
    return (
      <div className="lectures-series-page">
        <LectureLoadingSkeleton count={4} />
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="lectures-series-page">
        <button type="button" className="lectures-back-btn" onClick={onBack}>
          Back
        </button>
        <LectureErrorState message={error ?? 'Lecture course not found.'} />
      </div>
    )
  }

  const totalDurationLabel = formatLectureDuration(series.totalDurationSeconds)

  return (
    <div className="lectures-series-page">
      <button type="button" className="lectures-back-btn" onClick={onBack}>
        Back to Lectures
      </button>

      <section className="lectures-series-hero">
        <div className="lectures-series-hero-art">
          <ArtworkImage
            src={series.artworkUrl}
            alt=""
            seed={series.id}
            label={series.title}
            variant="wide"
            priority
          />
        </div>
        <div className="lectures-series-hero-copy">
          <span className="lectures-hero-eyebrow">
            {lectureCategoryLabel(series.category?.slug)}
          </span>
          <h1>{series.title}</h1>
          <p>{formatLectureSeriesSubtitle(series)}</p>
          {series.description ? <p className="lectures-series-description">{series.description}</p> : null}
          <div className="lectures-series-meta">
            {series.sessionCount > 0 ? (
              <span className="lectures-meta-pill">
                {series.sessionCount} {series.sessionCount === 1 ? 'session' : 'sessions'}
              </span>
            ) : null}
            {totalDurationLabel ? (
              <span className="lectures-meta-pill">{totalDurationLabel}</span>
            ) : null}
            {series.language ? <span className="lectures-meta-pill">{series.language}</span> : null}
            {series.difficulty ? <span className="lectures-meta-pill">{series.difficulty}</span> : null}
          </div>
          <div className="lectures-hero-actions">
            {seriesProgress && !seriesProgress.completed ? (
              <button type="button" className="lectures-btn lectures-btn--primary" onClick={resumeCourse}>
                Resume Course
              </button>
            ) : (
              <button
                type="button"
                className="lectures-btn lectures-btn--primary"
                disabled={sessions.length === 0}
                onClick={startCourse}
              >
                Start Course
              </button>
            )}
            <button type="button" className="lectures-btn lectures-btn--ghost" onClick={toggleSaved}>
              {saved ? 'Saved' : 'Save Course'}
            </button>
          </div>
        </div>
      </section>

      <section className="lectures-section">
        <div className="lectures-section-header">
          <h2>Sessions</h2>
          {pagination?.hasMore ? (
            <button type="button" className="lectures-btn lectures-btn--ghost" onClick={loadMoreSessions}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <LectureEmptyState title="This course has no sessions yet." />
        ) : (
          <div className="lectures-session-list">
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
                : false

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
                  isActive={
                    activeIds?.seriesId === series.id && activeIds.sessionId === session.id
                  }
                  isCompleted={completed}
                  progressPercent={percent}
                  ArtworkImage={ArtworkImage}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
})
