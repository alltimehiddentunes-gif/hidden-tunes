import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { formatSportsStartTime } from '../../lib/sports/formatTime'
import { fetchSportsFixtureDetail } from '../../lib/sports/sportsCatalogApi'
import {
  SPORTS_STREAMS_OFF_COPY,
  SPORTS_STREAMS_OFF_SHORT,
} from '../../lib/sports/sportsFlags'
import type { DesktopSportsFixture } from '../../lib/sports/types'
import { SportsStatusBadge } from './SportsStatusBadge'

export const SportsFixtureDetails = memo(function SportsFixtureDetails({
  fixtureId,
  initialFixture,
  offline,
  playing,
  playError,
  onBack,
  onPlay,
  streamsEnabled = false,
}: {
  fixtureId: string
  initialFixture?: DesktopSportsFixture | null
  offline?: boolean
  playing?: boolean
  playError?: string | null
  onBack: () => void
  onPlay?: (fixture: DesktopSportsFixture) => void
  /** When false, never expose Play/Watch (fixtures-only pilot). */
  streamsEnabled?: boolean
}) {
  const [fixture, setFixture] = useState<DesktopSportsFixture | null>(initialFixture ?? null)
  const [loading, setLoading] = useState(!initialFixture)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  const load = useCallback(async () => {
    if (offline) {
      setError('A network connection is required.')
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const generation = ++generationRef.current
    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const result = await fetchSportsFixtureDetail(fixtureId, controller.signal)
      if (generation !== generationRef.current) return
      if (!result.enabled) {
        setFixture(null)
        setError(result.message || 'Sports is not available right now.')
        return
      }
      if (!result.fixture) {
        setFixture(null)
        setNotFound(true)
        setError(result.message || 'This event was not found.')
        return
      }
      setFixture(result.fixture)
      setError(null)
    } catch (reason) {
      if (controller.signal.aborted || generation !== generationRef.current) return
      setError(reason instanceof Error ? reason.message : 'Sports could not be loaded.')
    } finally {
      if (generation === generationRef.current) setLoading(false)
    }
  }, [fixtureId, offline])

  useEffect(() => {
    void load()
    return () => {
      abortRef.current?.abort()
    }
  }, [load])

  const title =
    fixture?.title
    || (fixture?.homeTeam && fixture?.awayTeam
      ? `${fixture.homeTeam} vs ${fixture.awayTeam}`
      : 'Match details')

  return (
    <section className="sports-details">
      <div className="sports-details-toolbar">
        <button type="button" className="sports-btn sports-btn--ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="sports-btn sports-btn--ghost"
          onClick={() => void load()}
          disabled={loading || offline}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="sports-state">Loading event…</p>
      ) : notFound ? (
        <div className="sports-state sports-state--error">
          <h2>Event not found</h2>
          <p>{error || 'This event was not found.'}</p>
        </div>
      ) : error && !fixture ? (
        <div className="sports-state sports-state--error">
          <h2>Unable to load</h2>
          <p>{error}</p>
          <button type="button" className="sports-btn sports-btn--primary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : fixture ? (
        <div className="sports-details-body">
          <div className="sports-details-header">
            <SportsStatusBadge status={fixture.status} />
            <h2>{title}</h2>
            {(fixture.league || fixture.sport) && (
              <p className="sports-fixture-meta">
                {[fixture.league, fixture.sport].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <dl className="sports-details-grid">
            <div>
              <dt>Score</dt>
              <dd>{fixture.score || '—'}</dd>
            </div>
            <div>
              <dt>Kickoff</dt>
              <dd>{formatSportsStartTime(fixture.startTime) || '—'}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{fixture.venue || '—'}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{fixture.country || '—'}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{fixture.provider || '—'}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>
                {!streamsEnabled
                  ? 'Scores and fixtures only · streaming not enabled'
                  : fixture.isPlayable
                    ? 'Stream may be available'
                    : fixture.availabilityState || 'Streaming not available for this event'}
              </dd>
            </div>
            {fixture.participants.length > 0 ? (
              <div>
                <dt>Participants</dt>
                <dd>{fixture.participants.map((participant) => participant.name).join(' · ')}</dd>
              </div>
            ) : null}
          </dl>

          {playError ? <p className="sports-play-error">{playError}</p> : null}

          {streamsEnabled && fixture.isPlayable && onPlay ? (
            <button
              type="button"
              className="sports-btn sports-btn--primary"
              onClick={() => onPlay(fixture)}
              disabled={playing || offline}
            >
              {playing ? 'Starting…' : 'Play'}
            </button>
          ) : (
            <p className="sports-state-note">
              {!streamsEnabled ? SPORTS_STREAMS_OFF_COPY : SPORTS_STREAMS_OFF_SHORT}
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
})
