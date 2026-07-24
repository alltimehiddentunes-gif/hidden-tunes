import { memo } from 'react'
import { formatSportsStartTime } from '../../lib/sports/formatTime'
import type { DesktopSportsFixture } from '../../lib/sports/types'
import { SportsStatusBadge } from './SportsStatusBadge'

export const SportsFixtureCard = memo(function SportsFixtureCard({
  fixture,
  playing,
  onViewDetails,
  onPlay,
}: {
  fixture: DesktopSportsFixture
  playing?: boolean
  onViewDetails: () => void
  onPlay?: () => void
}) {
  const title =
    fixture.title
    || (fixture.homeTeam && fixture.awayTeam
      ? `${fixture.homeTeam} vs ${fixture.awayTeam}`
      : fixture.league || 'Match')
  const meta = [fixture.league, fixture.sport].filter(Boolean).join(' · ')
  const kickoff = formatSportsStartTime(fixture.startTime)
  const score = fixture.score || '—'

  return (
    <article className="sports-fixture-card">
      <div className="sports-fixture-card-main">
        <div className="sports-fixture-card-top">
          <SportsStatusBadge status={fixture.status} />
          {fixture.provider ? (
            <span className="sports-fixture-provider">{fixture.provider}</span>
          ) : null}
        </div>
        <h3 className="sports-fixture-title">{title}</h3>
        {meta ? <p className="sports-fixture-meta">{meta}</p> : null}
        <div className="sports-fixture-score-row">
          <span className="sports-fixture-score" aria-label="Score">
            {score}
          </span>
          {kickoff ? <span className="sports-fixture-time">{kickoff}</span> : null}
        </div>
        {(fixture.venue || fixture.country) && (
          <p className="sports-fixture-venue">
            {[fixture.venue, fixture.country].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="sports-fixture-actions">
        <button type="button" className="sports-btn sports-btn--ghost" onClick={onViewDetails}>
          View details
        </button>
        {fixture.isPlayable && onPlay ? (
          <button
            type="button"
            className="sports-btn sports-btn--primary"
            onClick={onPlay}
            disabled={playing}
          >
            {playing ? 'Starting…' : 'Play'}
          </button>
        ) : null}
      </div>
    </article>
  )
})
