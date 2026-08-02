import { memo, useCallback, useState } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import { dispatchSportsPlayback } from '../../lib/sports/dispatchSportsPlayback'
import {
  areSportsStreamsEnabled,
  SPORTS_STREAMS_OFF_COPY,
} from '../../lib/sports/sportsFlags'
import { useDesktopSports } from '../../lib/sports/useDesktopSports'
import type { DesktopSportsFixture, SportsBrowseFilter, SportsCatalogFilters } from '../../lib/sports/types'
import { SportsFixtureCard } from './SportsFixtureCard'
import { SportsFixtureDetails } from './SportsFixtureDetails'

const FILTERS: { id: Exclude<SportsBrowseFilter, 'all'>; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'results', label: 'Results' },
]

export type DesktopSportsPageProps = {
  /** When false, live refresh pauses (route inactive). */
  pageActive?: boolean
}

export const DesktopSportsPage = memo(function DesktopSportsPage({
  pageActive = true,
}: DesktopSportsPageProps) {
  const [filter, setFilter] = useState<Exclude<SportsBrowseFilter, 'all'>>('today')
  const [draftFilters, setDraftFilters] = useState<SportsCatalogFilters>({})
  const [catalogFilters, setCatalogFilters] = useState<SportsCatalogFilters>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSeed, setSelectedSeed] = useState<DesktopSportsFixture | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const { playQueue } = useDesktopPlayback()

  const {
    fixtures,
    loading,
    loadingMore,
    error,
    enabled,
    hasMore,
    message,
    offline,
    retry,
    loadMore,
  } = useDesktopSports({ filter, pageActive, catalogFilters })

  const streamsEnabled = areSportsStreamsEnabled()

  const handlePlay = useCallback(
    async (fixture: DesktopSportsFixture) => {
      if (!areSportsStreamsEnabled()) {
        setPlayError(SPORTS_STREAMS_OFF_COPY)
        return
      }
      if (offline) {
        setPlayError('A network connection is required.')
        return
      }
      setPlayingId(fixture.id)
      setPlayError(null)
      const controller = new AbortController()
      try {
        const result = await dispatchSportsPlayback({
          fixture,
          playQueue,
          signal: controller.signal,
        })
        if (result.status === 'cancelled') return
        if (result.status !== 'success') {
          setPlayError(result.userMessage)
        }
      } finally {
        setPlayingId(null)
      }
    },
    [offline, playQueue],
  )

  const canOfferPlay = useCallback(
    (fixture: DesktopSportsFixture) => streamsEnabled && fixture.isPlayable,
    [streamsEnabled],
  )

  if (selectedId) {
    return (
      <div className="sports-destination">
        <SportsFixtureDetails
          fixtureId={selectedId}
          initialFixture={selectedSeed}
          offline={offline}
          playing={playingId === selectedId}
          playError={playError}
          onBack={() => {
            setSelectedId(null)
            setSelectedSeed(null)
            setPlayError(null)
          }}
          onPlay={handlePlay}
          streamsEnabled={streamsEnabled}
        />
      </div>
    )
  }

  return (
    <div className="sports-destination">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-hero-eyebrow">Sports</p>
          <h1>Fixtures</h1>
          <p>
            {streamsEnabled
              ? 'Live, upcoming, and completed events from the Sports catalog.'
              : 'Scores and schedules for live, upcoming, and completed events. Streaming is not currently enabled.'}
          </p>
        </div>
      </header>

      {!streamsEnabled ? (
        <div className="sports-banner sports-banner--info" role="status">
          {SPORTS_STREAMS_OFF_COPY}
        </div>
      ) : null}

      {offline ? (
        <div className="sports-banner sports-banner--offline" role="status">
          A network connection is required for Sports. Local Library and Downloads are unaffected.
        </div>
      ) : null}

      <div className="sports-tabs" role="tablist" aria-label="Sports filters">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`sports-tab${filter === entry.id ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <form
        className="sports-filter-panel"
        aria-label="Fixture filters"
        onSubmit={(event) => {
          event.preventDefault()
          setCatalogFilters(draftFilters)
        }}
      >
        {([
          ['sport', 'Sport'],
          ['date', 'Date'],
          ['status', 'Status'],
          ['country', 'Country'],
          ['competition', 'Competition'],
        ] as const).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type={key === 'date' ? 'date' : 'text'}
              value={draftFilters[key] || ''}
              onChange={(event) => setDraftFilters((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button type="submit" className="sports-btn sports-btn--primary">Apply filters</button>
        <button
          type="button"
          className="sports-btn sports-btn--ghost"
          onClick={() => {
            setDraftFilters({})
            setCatalogFilters({})
          }}
        >
          Clear
        </button>
      </form>

      {error && fixtures.length > 0 ? (
        <div className="sports-banner sports-banner--offline" role="alert">
          Refresh failed. Showing the most recent fixtures. {error}
          <button type="button" className="sports-btn sports-btn--ghost" onClick={retry}>Retry</button>
        </div>
      ) : null}

      {!enabled ? (
        <div className="sports-state">
          <h2>Sports unavailable</h2>
          <p>{message || 'Sports is not available right now.'}</p>
        </div>
      ) : error && fixtures.length === 0 ? (
        <div className="sports-state sports-state--error">
          <h2>Sports could not be loaded</h2>
          <p>{error}</p>
          <button type="button" className="sports-btn sports-btn--primary" onClick={retry}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="sports-fixture-list" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="sports-fixture-card sports-fixture-card--skeleton" aria-hidden="true">
              <div className="sports-skeleton-line" />
              <div className="sports-skeleton-line sports-skeleton-line--short" />
            </article>
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <div className="sports-state">
          <h2>No fixtures</h2>
          <p>
            {filter === 'today'
              ? 'No fixtures scheduled for today.'
              : filter === 'live'
              ? 'No live events right now.'
              : filter === 'upcoming'
                ? 'No upcoming fixtures in this list.'
                : 'No results in this list.'}
          </p>
        </div>
      ) : (
        <>
          <div className="sports-fixture-list">
            {fixtures.map((fixture) => (
              <SportsFixtureCard
                key={fixture.id}
                fixture={fixture}
                playing={playingId === fixture.id}
                onViewDetails={() => {
                  setSelectedId(fixture.id)
                  setSelectedSeed(fixture)
                  setPlayError(null)
                }}
                onPlay={
                  canOfferPlay(fixture) ? () => void handlePlay(fixture) : undefined
                }
              />
            ))}
          </div>
          {playError ? <p className="sports-play-error">{playError}</p> : null}
          {hasMore ? (
            <div className="sports-load-more">
              <button
                type="button"
                className="sports-btn sports-btn--ghost"
                onClick={loadMore}
                disabled={loadingMore || offline}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
})
