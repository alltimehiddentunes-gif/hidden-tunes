import { memo } from 'react'
import type { SportsFixtureStatus } from '../../lib/sports/types'

const STATUS_LABELS: Record<SportsFixtureStatus, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  completed: 'Final',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
}

export const SportsStatusBadge = memo(function SportsStatusBadge({
  status,
}: {
  status: SportsFixtureStatus
}) {
  return (
    <span className={`sports-status-badge sports-status-badge--${status}`}>
      {STATUS_LABELS[status]}
    </span>
  )
})
