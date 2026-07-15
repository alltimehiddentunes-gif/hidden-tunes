import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { fetchMotivationalProgram } from '../../lib/motivationals/motivationalCatalogApi'
import {
  formatMotivationalDuration,
  formatMotivationalProgramSubtitle,
} from '../../lib/motivationals/motivationalFormatters'
import { getMotivationalProgress } from '../../lib/motivationals/motivationalProgressStorage'
import type {
  MotivationalProgramMeta,
  MotivationalSessionMeta,
  PlayMotivationalSessionHandler,
} from '../../lib/motivationals/types'
import { useMotivationalLocalState } from '../../lib/motivationals/useMotivationalLocalState'
import {
  useMotivationalsPageData,
  type MotivationalsMediaFilter,
} from '../../lib/motivationals/useMotivationalsPageData'
import motivationalsArtwork from '../../assets/section-headers/motivationals-mountain.png'
import { SectionHero } from '../SectionHero'

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

function mediaBadgeLabel(program: MotivationalProgramMeta) {
  if (program.mediaType === 'video' || program.mediaType === 'stream') return 'Video'
  return 'Audio'
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
  const durationLabel =
    program.totalDurationSeconds && program.totalDurationSeconds > 0
      ? formatMotivationalDuration(program.totalDurationSeconds)
      : null

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
          <span className="motivationals-media-badge">{mediaBadgeLabel(program)}</span>
          {durationLabel ? <span className="motivationals-duration-pill">{durationLabel}</span> : null}
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

function buildStandaloneSession(program: MotivationalProgramMeta): MotivationalSessionMeta {
  return {
    id: program.id,
    programId: program.id,
    title: program.title,
    description: program.description,
    artworkUrl: program.artworkUrl,
    speakerName: program.subtitle,
    category: program.categorySlug,
    subcategory: null,
    categorySlug: program.categorySlug,
    language: program.language,
    country: program.country,
    durationSeconds: program.totalDurationSeconds,
    seasonNumber: null,
    episodeNumber: null,
    sortOrder: 0,
    publishedAt: program.publishedAt,
    isFeatured: program.isFeatured,
    mediaType: program.mediaType,
  }
}

export const MotivationalsPage = memo(function MotivationalsPage({
  query,
  onOpenProgram,
  onPlayMotivationalSession,
  ArtworkImage,
}: MotivationalsPageProps) {
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [mediaFilter, setMediaFilter] = useState<MotivationalsMediaFilter>('all')
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const [countryFilter, setCountryFilter] = useState<string | null>(null)
  const [tuningProgramId, setTuningProgramId] = useState<string | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const { continueListening, recentlyPlayed } = useMotivationalLocalState()

  const {
    categories,
    featuredPrograms,
    audioPrograms,
    videoPrograms,
    visiblePrograms,
    popularSpeakers,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
    isSearchView,
    browsePrograms,
  } = useMotivationalsPageData(query, categorySlug, mediaFilter, languageFilter, countryFilter)

  const languageOptions = useMemo(() => {
    const values = new Set<string>()
    for (const program of browsePrograms) {
      if (program.language?.trim()) values.add(program.language.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [browsePrograms])

  const countryOptions = useMemo(() => {
    const values = new Set<string>()
    for (const program of browsePrograms) {
      if (program.country?.trim()) values.add(program.country.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [browsePrograms])

  useEffect(() => {
    const node = loadMoreSentinelRef.current
    if (!node || !pagination?.hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore, pagination?.hasMore])

  const playProgram = useCallback(
    async (program: MotivationalProgramMeta) => {
      setTuningProgramId(program.id)
      try {
        if (program.isStandaloneItem) {
          const session = buildStandaloneSession(program)
          const progress = getMotivationalProgress(program.id)
          onPlayMotivationalSession(program, session, [session], 0, program.title, {
            resumePositionSeconds: progress?.positionSeconds ?? null,
          })
          return
        }

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

  const renderProgramGrid = (programs: MotivationalProgramMeta[]) => (
    <div className="motivationals-program-grid">
      {programs.map((program) => {
        const progress = getMotivationalProgress(program.id)
        const percent =
          progress?.durationSeconds && progress.durationSeconds > 0
            ? Math.min(100, Math.round((progress.positionSeconds / progress.durationSeconds) * 100))
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
  )

  return (
    <div className="motivationals-destination">
      <SectionHero
        title="Motivationals"
        subtitle="Premium mindset, discipline, and growth sessions for focused listening."
        artwork={motivationalsArtwork}
        artworkAlt=""
        objectPosition="center 42%"
        titleId="motivationals-page-heading"
      />

      <div className="motivationals-filters" aria-label="Motivationals filters">
        <div className="motivationals-filter-group" role="group" aria-label="Media type">
          {(['all', 'audio', 'video'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`motivationals-filter-chip${mediaFilter === value ? ' is-active' : ''}`}
              onClick={() => setMediaFilter(value)}
            >
              {value === 'all' ? 'All' : value === 'audio' ? 'Audio' : 'Video'}
            </button>
          ))}
        </div>
        {languageOptions.length > 0 ? (
          <label className="motivationals-filter-select">
            <span>Language</span>
            <select
              value={languageFilter ?? ''}
              onChange={(event) => setLanguageFilter(event.target.value || null)}
            >
              <option value="">All languages</option>
              {languageOptions.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {countryOptions.length > 0 ? (
          <label className="motivationals-filter-select">
            <span>Country</span>
            <select
              value={countryFilter ?? ''}
              onChange={(event) => setCountryFilter(event.target.value || null)}
            >
              <option value="">All countries</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

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
              <h2 id="motivationals-featured-heading">Featured</h2>
              {renderProgramGrid(featuredPrograms)}
            </section>
          ) : null}

          {audioPrograms.length > 0 && !filteredView ? (
            <section className="motivationals-section" aria-labelledby="motivationals-audio-heading">
              <h2 id="motivationals-audio-heading">Audio Motivation</h2>
              {renderProgramGrid(audioPrograms)}
            </section>
          ) : null}

          {videoPrograms.length > 0 && !filteredView ? (
            <section className="motivationals-section" aria-labelledby="motivationals-video-heading">
              <h2 id="motivationals-video-heading">Video Motivation</h2>
              {renderProgramGrid(videoPrograms)}
            </section>
          ) : null}

          {popularSpeakers.length > 0 && !filteredView ? (
            <section className="motivationals-section" aria-labelledby="motivationals-speakers-heading">
              <h2 id="motivationals-speakers-heading">Popular Speakers</h2>
              <div className="motivationals-speaker-list">
                {popularSpeakers.map((speaker) => (
                  <span key={speaker} className="motivationals-speaker-chip">
                    {speaker}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="motivationals-section" aria-labelledby="motivationals-catalog-heading">
            <div className="motivationals-section-header">
              <h2 id="motivationals-catalog-heading">
                {isSearchView
                  ? 'Search Results'
                  : filteredView
                    ? 'Filtered Motivationals'
                    : 'All Motivationals'}
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
                {renderProgramGrid(visiblePrograms)}
                {pagination?.hasMore ? (
                  <>
                    <div ref={loadMoreSentinelRef} className="motivationals-load-more-sentinel" aria-hidden="true" />
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
                  </>
                ) : (
                  <p className="motivationals-end-state" role="status">
                    You&apos;ve reached the end of this catalog view.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
})
