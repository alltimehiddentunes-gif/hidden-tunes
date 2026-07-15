import { memo, useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  fetchAllLectureSeriesSessions,
  fetchLectureSeriesDetails,
} from '../../lib/lectures/lectureCatalogApi'
import {
  formatContinueLearningRemaining,
  formatLectureDuration,
  formatLectureSeriesSubtitle,
} from '../../lib/lectures/lectureFormatters'
import { SectionHero } from '../SectionHero'
import { useLectureLocalState } from '../../lib/lectures/lectureLocalState'
import { getLectureProgress } from '../../lib/lectures/lectureProgressStorage'
import type { LectureSeries, PlayLectureSessionHandler } from '../../lib/lectures/types'
import {
  useLecturesPageData,
  type LecturesMediaFilter,
} from '../../lib/lectures/useLecturesPageData'
import { LectureEmptyState } from './LectureEmptyState'
import { LectureErrorState } from './LectureErrorState'
import { LectureLoadingSkeleton } from './LectureLoadingSkeleton'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
  priority?: boolean
}

type LecturesPageProps = {
  query: string
  onOpenSeries: (seriesId: string) => void
  onPlayLectureSession: PlayLectureSessionHandler
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function SeriesCard({
  series,
  onOpen,
  onPlay,
  tuning,
  progressPercent,
  ArtworkImage,
}: {
  series: LectureSeries
  onOpen: (seriesId: string) => void
  onPlay: () => void
  tuning: boolean
  progressPercent: number
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  const durationLabel = formatLectureDuration(series.totalDurationSeconds)

  return (
    <article className="lectures-program-card">
      <div
        role="button"
        tabIndex={0}
        className="lectures-program-card-hit"
        onClick={() => onOpen(series.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(series.id)
          }
        }}
      >
        <div className="lectures-program-card-art">
          <ArtworkImage src={series.artworkUrl} alt="" seed={series.id} label={series.title} />
          <span className="lectures-media-badge">
            {series.mediaType === 'video' ? 'Video' : 'Audio'}
          </span>
          {durationLabel ? <span className="lectures-duration-pill">{durationLabel}</span> : null}
          {progressPercent > 0 ? (
            <span className="lectures-progress-pill">{progressPercent}%</span>
          ) : null}
          <button
            type="button"
            className="lectures-program-card-play"
            disabled={tuning}
            aria-label={`Play ${series.title}`}
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
        <div className="lectures-program-card-copy">
          <h3>{series.title}</h3>
          <p>{formatLectureSeriesSubtitle(series)}</p>
        </div>
      </div>
    </article>
  )
}

export const LecturesPage = memo(function LecturesPage({
  query,
  onOpenSeries,
  onPlayLectureSession,
  ArtworkImage,
}: LecturesPageProps) {
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [mediaFilter, setMediaFilter] = useState<LecturesMediaFilter>('all')
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const [tuningSeriesId, setTuningSeriesId] = useState<string | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const { continueLearning, recentlyPlayed } = useLectureLocalState()

  const {
    categories,
    featuredSeries,
    popularSeries,
    recentSeries,
    browseSeries,
    filteredSeries,
    speakersRail,
    institutionsRail,
    languagesRail,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
  } = useLecturesPageData(query, categorySlug, mediaFilter, languageFilter)

  const visibleSeries = filteredView ? filteredSeries : browseSeries
  const isSearchView = query.trim().length > 0

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

  const playSeries = useCallback(
    async (series: LectureSeries) => {
      setTuningSeriesId(series.id)
      try {
        const sessions = await fetchAllLectureSeriesSessions(series.id)
        if (sessions.length === 0) return

        const progress = getLectureProgress(series.id)
        const resumeSession = progress
          ? sessions.find((session) => session.id === progress.sessionId) ?? sessions[0]
          : sessions[0]
        const startIndex = Math.max(
          0,
          sessions.findIndex((session) => session.id === resumeSession.id),
        )
        const queue = sessions.slice(startIndex)

        onPlayLectureSession(series, resumeSession, queue, 0, series.title, {
          resumePositionSeconds:
            progress && progress.sessionId === resumeSession.id
              ? progress.positionSeconds
              : null,
        })
      } finally {
        window.setTimeout(() => setTuningSeriesId(null), 800)
      }
    },
    [onPlayLectureSession],
  )

  const resumeSeries = useCallback(
    async (seriesId: string) => {
      const progress = getLectureProgress(seriesId)
      if (!progress) return

      setTuningSeriesId(seriesId)
      try {
        const detail = await fetchLectureSeriesDetails(seriesId)
        if (!detail) return
        const session =
          detail.sessions.find((entry) => entry.id === progress.sessionId) ?? detail.sessions[0]
        if (!session) return

        const sessions = await fetchAllLectureSeriesSessions(seriesId)
        const startIndex = Math.max(0, sessions.findIndex((entry) => entry.id === session.id))
        onPlayLectureSession(detail.series, session, sessions.slice(startIndex), 0, detail.series.title, {
          resumePositionSeconds: progress.positionSeconds,
        })
      } finally {
        window.setTimeout(() => setTuningSeriesId(null), 800)
      }
    },
    [onPlayLectureSession],
  )

  const renderSeriesGrid = (seriesList: LectureSeries[]) => (
    <div className="lectures-program-grid">
      {seriesList.map((series) => {
        const progress = getLectureProgress(series.id)
        const percent =
          progress?.durationSeconds && progress.durationSeconds > 0
            ? Math.min(100, Math.round((progress.positionSeconds / progress.durationSeconds) * 100))
            : 0
        return (
          <SeriesCard
            key={series.id}
            series={series}
            onOpen={onOpenSeries}
            onPlay={() => playSeries(series)}
            tuning={tuningSeriesId === series.id}
            progressPercent={percent}
            ArtworkImage={ArtworkImage}
          />
        )
      })}
    </div>
  )

  if (loading) {
    return (
      <div className="lectures-destination">
        <LectureLoadingSkeleton count={10} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="lectures-destination">
        <LectureErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <div className="lectures-destination">
      <SectionHero
        title="Lectures"
        subtitle="Premium courses, academic lectures, and educational sessions for focused learning."
        titleId="lectures-page-heading"
      />

      {!filteredView && continueLearning.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Continue Learning</h2>
          </div>
          <div className="lectures-continue-rail">
            {continueLearning.map((entry) => (
              <button
                key={`${entry.seriesId}:${entry.sessionId}`}
                type="button"
                className="lectures-continue-card"
                onClick={() => resumeSeries(entry.seriesId)}
              >
                <ArtworkImage
                  src={entry.artworkUrl}
                  alt=""
                  seed={entry.seriesId}
                  label={entry.seriesTitle}
                />
                <div>
                  <strong>{entry.seriesTitle}</strong>
                  <p>{entry.sessionTitle}</p>
                  <span>
                    {formatContinueLearningRemaining(entry.positionSeconds, entry.durationSeconds)
                      ?? 'In progress'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="lectures-tabs" role="tablist" aria-label="Lecture filters">
        {(['all', 'audio', 'video'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={mediaFilter === filter}
            className={`lectures-tab${mediaFilter === filter ? ' is-active' : ''}`}
            onClick={() => setMediaFilter(filter)}
          >
            {filter === 'all' ? 'All' : filter === 'audio' ? 'Audio' : 'Video'}
          </button>
        ))}
      </div>

      {!filteredView && categories.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Browse by Subject</h2>
          </div>
          <div className="lectures-category-grid">
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                className={`lectures-category-chip${categorySlug === category.slug ? ' is-active' : ''}`}
                onClick={() =>
                  setCategorySlug((current) => (current === category.slug ? null : category.slug))
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {contentLoading ? <LectureLoadingSkeleton count={6} /> : null}
      {contentError ? <LectureErrorState message={contentError} onRetry={loadMore} /> : null}

      {!contentLoading && filteredView && visibleSeries.length === 0 ? (
        <LectureEmptyState
          title={isSearchView ? 'No matching lectures were found.' : 'No lectures found in this subject.'}
        />
      ) : null}

      {!filteredView && featuredSeries.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Featured Courses</h2>
          </div>
          {renderSeriesGrid(featuredSeries)}
        </section>
      ) : null}

      {!filteredView && popularSeries.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Popular Lectures</h2>
          </div>
          {renderSeriesGrid(popularSeries)}
        </section>
      ) : null}

      {!filteredView && speakersRail.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Top Speakers & Educators</h2>
          </div>
          {renderSeriesGrid(speakersRail)}
        </section>
      ) : null}

      {!filteredView && institutionsRail.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Universities & Institutions</h2>
          </div>
          {renderSeriesGrid(institutionsRail)}
        </section>
      ) : null}

      {!filteredView && recentSeries.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Recently Added</h2>
          </div>
          {renderSeriesGrid(recentSeries)}
        </section>
      ) : null}

      {!filteredView && languagesRail.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Languages</h2>
          </div>
          <div className="lectures-category-grid">
            {languagesRail.map((language) => (
              <button
                key={language}
                type="button"
                className={`lectures-category-chip${languageFilter === language ? ' is-active' : ''}`}
                onClick={() =>
                  setLanguageFilter((current) => (current === language ? null : language))
                }
              >
                {language}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {(filteredView || browseSeries.length > 0) && visibleSeries.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>{filteredView ? 'Results' : 'All Courses'}</h2>
            {pagination?.hasMore ? <span>Page {pagination.page}</span> : null}
          </div>
          {renderSeriesGrid(visibleSeries)}
        </section>
      ) : null}

      {!filteredView && recentlyPlayed.length > 0 ? (
        <section className="lectures-section">
          <div className="lectures-section-header">
            <h2>Recently Played</h2>
          </div>
          <div className="lectures-recent-list">
            {recentlyPlayed.map((entry) => (
              <button
                key={`${entry.seriesId}:${entry.sessionId}`}
                type="button"
                className="lectures-recent-row"
                onClick={() => onOpenSeries(entry.seriesId)}
              >
                <span>{entry.seriesTitle}</span>
                <span>{entry.sessionTitle}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div ref={loadMoreSentinelRef} className="lectures-load-sentinel" aria-hidden="true" />
      {loadingMore ? <p className="lectures-loading-more">Loading more…</p> : null}
    </div>
  )
})
