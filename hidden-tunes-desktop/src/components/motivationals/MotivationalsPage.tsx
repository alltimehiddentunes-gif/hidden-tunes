import { memo, useCallback, useState, type ComponentType } from 'react'
import { fetchMotivationalProgram } from '../../lib/motivationals/motivationalCatalogApi'
import {
  formatMotivationalDuration,
  formatMotivationalProgramSubtitle,
  motivationalCategoryLabel,
} from '../../lib/motivationals/motivationalFormatters'
import { getMotivationalProgress } from '../../lib/motivationals/motivationalProgressStorage'
import type {
  MotivationalProgramMeta,
  MotivationalSessionMeta,
  PlayMotivationalSessionHandler,
} from '../../lib/motivationals/types'
import { useMotivationalLocalState } from '../../lib/motivationals/useMotivationalLocalState'
import { useMotivationalsPageData } from '../../lib/motivationals/useMotivationalsPageData'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  priority?: boolean
}

type MotivationalsPageProps = {
  query: string
  onOpenProgram: (programId: string) => void
  onPlayMotivationalSession: PlayMotivationalSessionHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function ProgramCard({
  program,
  onOpen,
  onPlay,
  tuning,
  progressPercent,
  ArtworkImage,
}: {
  program: MotivationalProgramMeta
  onOpen: (programId: string) => void
  onPlay: () => void
  tuning: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="motivationals-program-card">
      <div
        role="button"
        tabIndex={0}
        className="motivationals-program-card-hit"
        onClick={() => onOpen(program.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(program.id)
          }
        }}
      >
        <div className="motivationals-program-card-art">
          <ArtworkImage src={program.artworkUrl} alt="" seed={program.id} label={program.title} />
          {progressPercent > 0 ? (
            <span className="motivationals-progress-pill">{progressPercent}%</span>
          ) : null}
          <button
            type="button"
            className="motivationals-program-card-play"
            disabled={tuning}
            aria-label={`Play ${program.title}`}
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
        <div className="motivationals-program-card-copy">
          <h3>{program.title}</h3>
          <p>{formatMotivationalProgramSubtitle(program)}</p>
        </div>
      </div>
    </article>
  )
}

export const MotivationalsPage = memo(function MotivationalsPage({
  query,
  onOpenProgram,
  onPlayMotivationalSession,
  ArtworkImage,
}: MotivationalsPageProps) {
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [tuningProgramId, setTuningProgramId] = useState<string | null>(null)
  const { continueListening, recentlyPlayed } = useMotivationalLocalState()

  const {
    categories,
    featuredPrograms,
    visiblePrograms,
    heroProgram,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
    isSearchView,
  } = useMotivationalsPageData(query, categorySlug)

  const playProgram = useCallback(
    async (program: MotivationalProgramMeta) => {
      setTuningProgramId(program.id)
      try {
        const detail = await fetchMotivationalProgram(program.id)
        if (!detail || detail.sessions.length === 0) return
        const first = detail.sessions[0]
        const progress = getMotivationalProgress(program.id)
        const resumeSession = progress
          ? detail.sessions.find((session) => session.id === progress.sessionId) ?? first
          : first
        const startIndex = Math.max(0, detail.sessions.findIndex((session) => session.id === resumeSession.id))
        const queue = detail.sessions.slice(startIndex)
        onPlayMotivationalSession(
          detail.program,
          resumeSession,
          queue,
          0,
          detail.program.title,
          {
            resumePositionSeconds:
              progress && progress.sessionId === resumeSession.id
                ? progress.positionSeconds
                : null,
          },
        )
      } finally {
        window.setTimeout(() => setTuningProgramId(null), 800)
      }
    },
    [onPlayMotivationalSession],
  )

  const resumeProgram = useCallback(
    (programId: string) => {
      const progress = getMotivationalProgress(programId)
      if (!progress) return
      const program: MotivationalProgramMeta = {
        id: progress.programId,
        slug: progress.programId,
        title: progress.programTitle,
        subtitle: progress.speakerName,
        description: null,
        artworkUrl: progress.artworkUrl,
        creatorId: null,
        categorySlug: null,
        language: null,
        country: null,
        contentRating: null,
        programType: null,
        sessionCount: progress.sessionCount ?? 0,
        totalDurationSeconds: progress.durationSeconds,
        isFeatured: false,
        publishedAt: null,
      }
      const session: MotivationalSessionMeta = {
        id: progress.sessionId,
        programId: progress.programId,
        title: progress.sessionTitle,
        description: null,
        artworkUrl: progress.artworkUrl,
        speakerName: progress.speakerName,
        category: null,
        subcategory: null,
        categorySlug: null,
        language: null,
        country: null,
        durationSeconds: progress.durationSeconds,
        seasonNumber: null,
        episodeNumber: progress.sessionNumber,
        sortOrder: 0,
        publishedAt: null,
        isFeatured: false,
      }
      setTuningProgramId(program.id)
      onPlayMotivationalSession(program, session, [session], 0, program.title, {
        resumePositionSeconds: progress.positionSeconds,
      })
      window.setTimeout(() => setTuningProgramId(null), 800)
    },
    [onPlayMotivationalSession],
  )

  return (
    <div className="motivationals-destination">
      <section className="motivationals-hero" aria-labelledby="motivationals-page-heading">
        <div className="motivationals-hero-backdrop" aria-hidden="true" />
        <div className="motivationals-hero-copy">
          <h1 id="motivationals-page-heading">Motivationals</h1>
          <p>Premium mindset, discipline, and growth sessions for focused listening.</p>
        </div>
        {heroProgram ? (
          <div className="motivationals-hero-feature">
            <ArtworkImage
              src={heroProgram.artworkUrl}
              alt=""
              seed={heroProgram.id}
              label={heroProgram.title}
              priority
            />
            <div className="motivationals-hero-feature-copy">
              <span className="motivationals-hero-eyebrow">
                {motivationalCategoryLabel(heroProgram.categorySlug)}
              </span>
              <h2>{heroProgram.title}</h2>
              <p>{heroProgram.subtitle ?? formatMotivationalProgramSubtitle(heroProgram)}</p>
              {heroProgram.description ? (
                <p className="motivationals-hero-description">{heroProgram.description.slice(0, 180)}</p>
              ) : null}
              <div className="motivationals-hero-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={tuningProgramId === heroProgram.id}
                  onClick={() => playProgram(heroProgram)}
                >
                  Play
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onOpenProgram(heroProgram.id)}
                >
                  View Program
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {categories.length > 0 ? (
        <div className="motivationals-tabs" role="tablist" aria-label="Motivational categories">
          <button
            type="button"
            role="tab"
            aria-selected={categorySlug === null}
            className={`motivationals-tab${categorySlug === null ? ' is-active' : ''}`}
            onClick={() => setCategorySlug(null)}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={categorySlug === category.slug}
              className={`motivationals-tab${categorySlug === category.slug ? ' is-active' : ''}`}
              onClick={() => setCategorySlug(category.slug)}
            >
              {category.title}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <section className="motivationals-status motivationals-status--error" role="alert">
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="motivationals-status" aria-busy="true">
          <p>Loading Motivationals…</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          {continueListening.length > 0 ? (
            <section className="motivationals-section" aria-labelledby="motivationals-continue-heading">
              <h2 id="motivationals-continue-heading">Continue Listening</h2>
              <div className="motivationals-continue-grid">
                {continueListening.map((entry) => {
                  const remaining =
                    entry.durationSeconds && entry.durationSeconds > entry.positionSeconds
                      ? formatMotivationalDuration(entry.durationSeconds - entry.positionSeconds)
                      : null
                  const progressPercent =
                    entry.durationSeconds && entry.durationSeconds > 0
                      ? Math.min(100, Math.round((entry.positionSeconds / entry.durationSeconds) * 100))
                      : 0
                  return (
                    <article key={entry.programId} className="motivationals-continue-card">
                      <ArtworkImage
                        src={entry.artworkUrl}
                        alt=""
                        seed={entry.programId}
                        label={entry.programTitle}
                      />
                      <div>
                        <h3>{entry.programTitle}</h3>
                        <p>{entry.sessionTitle}</p>
                        {remaining ? <p>{remaining} left</p> : null}
                        <div className="motivationals-continue-progress" aria-hidden="true">
                          <span style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => resumeProgram(entry.programId)}
                      >
                        Resume
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {recentlyPlayed.length > 0 ? (
            <section className="motivationals-section" aria-labelledby="motivationals-recent-heading">
              <h2 id="motivationals-recent-heading">Recently Played</h2>
              <div className="motivationals-recent-list">
                {recentlyPlayed.map((entry) => (
                  <button
                    key={`${entry.programId}:${entry.sessionId}`}
                    type="button"
                    className="motivationals-recent-row"
                    onClick={() => onOpenProgram(entry.programId)}
                  >
                    <strong>{entry.programTitle}</strong>
                    <span>{entry.sessionTitle}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {featuredPrograms.length > 0 && !filteredView ? (
            <section className="motivationals-section" aria-labelledby="motivationals-featured-heading">
              <h2 id="motivationals-featured-heading">Featured Programs</h2>
              <div className="motivationals-program-grid">
                {featuredPrograms.map((program) => (
                  <ProgramCard
                    key={program.id}
                    program={program}
                    onOpen={onOpenProgram}
                    onPlay={() => playProgram(program)}
                    tuning={tuningProgramId === program.id}
                    progressPercent={0}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="motivationals-section" aria-labelledby="motivationals-catalog-heading">
            <div className="motivationals-section-header">
              <h2 id="motivationals-catalog-heading">
                {isSearchView ? 'Search Results' : filteredView ? 'Category Programs' : 'Browse Programs'}
              </h2>
              {contentLoading ? <span>Updating…</span> : null}
            </div>
            {contentError && visiblePrograms.length === 0 ? (
              <div className="motivationals-status motivationals-status--error" role="alert">
                <p>{contentError}</p>
              </div>
            ) : visiblePrograms.length === 0 ? (
              <div className="motivationals-status motivationals-status--empty" role="status">
                <p>
                  {query.trim()
                    ? `No motivational programs were found for “${query.trim()}”.`
                    : 'No motivational programs in this view.'}
                </p>
              </div>
            ) : (
              <>
                <div className="motivationals-program-grid">
                  {visiblePrograms.map((program) => {
                    const progress = getMotivationalProgress(program.id)
                    const percent =
                      progress?.durationSeconds && progress.durationSeconds > 0
                        ? Math.min(
                            100,
                            Math.round((progress.positionSeconds / progress.durationSeconds) * 100),
                          )
                        : 0
                    return (
                      <ProgramCard
                        key={program.id}
                        program={program}
                        onOpen={onOpenProgram}
                        onPlay={() => playProgram(program)}
                        tuning={tuningProgramId === program.id}
                        progressPercent={percent}
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
                      onClick={() => loadMore()}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
})
