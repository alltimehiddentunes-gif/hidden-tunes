import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  formatMotivationalDuration,
  formatMotivationalProgramSubtitle,
  formatMotivationalSessionMetaLine,
  motivationalCategoryLabel,
} from '../../lib/motivationals/motivationalFormatters'
import { parseMotivationalSongId } from '../../lib/motivationals/motivationalPlaybackAdapter'
import {
  getMotivationalProgress,
  getMotivationalSessionProgress,
  isMotivationalSessionCompleted,
} from '../../lib/motivationals/motivationalProgressStorage'
import type { MotivationalSessionMeta, PlayMotivationalSessionHandler } from '../../lib/motivationals/types'
import { useMotivationalProgramData } from '../../lib/motivationals/useMotivationalProgramData'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  variant?: 'square' | 'wide'
  priority?: boolean
}

type MotivationalProgramPageProps = {
  programId: string
  onBack: () => void
  onPlayMotivationalSession: PlayMotivationalSessionHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function SessionRow({
  session,
  programArtworkUrl,
  onPlay,
  tuning,
  isActive,
  isCompleted,
  progressPercent,
  ArtworkImage,
}: {
  session: MotivationalSessionMeta
  programArtworkUrl: string | null
  onPlay: () => void
  tuning: boolean
  isActive: boolean
  isCompleted: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  const sessionLabel =
    session.episodeNumber != null ? `Session ${session.episodeNumber}` : 'Session'

  return (
    <article
      className={`motivational-session-row${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}`}
    >
      <div className="motivational-session-row-art">
        <ArtworkImage
          src={session.artworkUrl ?? programArtworkUrl}
          alt=""
          seed={session.id}
          label={session.title}
        />
      </div>
      <div className="motivational-session-row-copy">
        <h3>
          {sessionLabel}
          {isActive ? <span className="motivational-session-badge">Now playing</span> : null}
          {isCompleted ? <span className="motivational-session-badge">Completed</span> : null}
        </h3>
        <p>{session.title}</p>
        <span>{formatMotivationalSessionMetaLine(session)}</span>
        {session.description ? (
          <p className="motivational-session-description">{session.description.slice(0, 140)}</p>
        ) : null}
        {progressPercent > 0 && !isCompleted ? (
          <div className="motivational-session-progress" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="motivational-session-row-play"
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

export const MotivationalProgramPage = memo(function MotivationalProgramPage({
  programId,
  onBack,
  onPlayMotivationalSession,
  ArtworkImage,
}: MotivationalProgramPageProps) {
  const [tuningSessionId, setTuningSessionId] = useState<string | null>(null)
  const { currentTrack } = useDesktopPlayback()
  const {
    program,
    sessions,
    pagination,
    loading,
    loadingMore,
    error,
    loadMoreSessions,
  } = useMotivationalProgramData(programId)

  const programProgress = useMemo(
    () => (program ? getMotivationalProgress(program.id) : null),
    [program],
  )

  const activeIds = useMemo(
    () => parseMotivationalSongId(currentTrack?.id ?? ''),
    [currentTrack?.id],
  )

  const playSession = useCallback(
    (session: MotivationalSessionMeta, resumePositionSeconds?: number | null) => {
      if (!program) return
      const startIndex = Math.max(0, sessions.findIndex((entry) => entry.id === session.id))
      const queue = sessions.slice(startIndex)
      setTuningSessionId(session.id)
      onPlayMotivationalSession(program, session, queue, 0, program.title, {
        resumePositionSeconds,
      })
      window.setTimeout(() => setTuningSessionId(null), 800)
    },
    [onPlayMotivationalSession, program, sessions],
  )

  const resumeSession = useCallback(() => {
    if (!program || !programProgress) return
    const session =
      sessions.find((entry) => entry.id === programProgress.sessionId) ?? sessions[0]
    if (!session) return
    playSession(session, programProgress.positionSeconds)
  }, [playSession, program, programProgress, sessions])

  const playFromBeginning = useCallback(() => {
    const first = sessions[0]
    if (!program || !first) return
    playSession(first, 0)
  }, [playSession, program, sessions])

  if (loading) {
    return (
      <div className="motivational-program-page">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}>Back</button>
        <p className="motivationals-status">Loading program…</p>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="motivational-program-page">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}>Back</button>
        <p className="motivationals-status motivationals-status--error" role="alert">
          {error ?? 'Program not found.'}
        </p>
      </div>
    )
  }

  return (
    <div className="motivational-program-page">
      <button type="button" className="btn-ghost btn-sm motivational-program-back" onClick={onBack}>
        Back to Motivationals
      </button>

      <header className="motivational-program-hero">
        <div className="motivational-program-cover">
          <ArtworkImage
            src={program.artworkUrl}
            alt=""
            seed={program.id}
            label={program.title}
            variant="square"
            priority
          />
        </div>
        <div className="motivational-program-hero-copy">
          <h1>{program.title}</h1>
          <p className="motivational-program-subtitle">{formatMotivationalProgramSubtitle(program)}</p>
          {program.description ? (
            <p className="motivational-program-description">{program.description}</p>
          ) : null}
          <div className="motivational-program-meta">
            {program.categorySlug ? (
              <span>{motivationalCategoryLabel(program.categorySlug)}</span>
            ) : null}
            {program.language ? <span>{program.language}</span> : null}
            {program.totalDurationSeconds ? (
              <span>{formatMotivationalDuration(program.totalDurationSeconds)}</span>
            ) : null}
            {program.sessionCount > 0 ? (
              <span>{program.sessionCount} sessions</span>
            ) : null}
            {program.publishedAt ? <span>{program.publishedAt.slice(0, 10)}</span> : null}
          </div>
          <div className="motivational-program-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={sessions.length === 0}
              onClick={playFromBeginning}
            >
              Play
            </button>
            {programProgress ? (
              <button type="button" className="btn-secondary btn-sm" onClick={resumeSession}>
                Resume
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="motivational-session-list-section" aria-labelledby="motivational-sessions-heading">
        <h2 id="motivational-sessions-heading">
          {sessions.length <= 1 ? 'Listen' : 'Sessions'}
        </h2>
        {sessions.length === 0 ? (
          <p className="motivationals-status motivationals-status--empty">
            This program has no sessions yet.
          </p>
        ) : (
          <>
            <div className="motivational-session-list">
              {sessions.map((session) => {
                const sessionProgress = getMotivationalSessionProgress(program.id, session.id)
                const isActive =
                  activeIds?.programId === program.id && activeIds.sessionId === session.id
                const isCompleted = sessionProgress
                  ? isMotivationalSessionCompleted(
                      sessionProgress.positionSeconds,
                      sessionProgress.durationSeconds,
                    ) || sessionProgress.completed
                  : false
                const progressPercent =
                  sessionProgress?.durationSeconds && sessionProgress.durationSeconds > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (sessionProgress.positionSeconds / sessionProgress.durationSeconds) * 100,
                        ),
                      )
                    : 0

                return (
                  <SessionRow
                    key={session.id}
                    session={session}
                    programArtworkUrl={program.artworkUrl}
                    onPlay={() => playSession(session)}
                    tuning={tuningSessionId === session.id}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    progressPercent={progressPercent}
                    ArtworkImage={ArtworkImage}
                  />
                )
              })}
            </div>
            {pagination?.hasMore ? (
              <div className="motivationals-section-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={loadingMore}
                  onClick={() => loadMoreSessions()}
                >
                  {loadingMore ? 'Loading…' : 'Load more sessions'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
})
