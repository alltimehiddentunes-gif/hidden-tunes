import { memo, useMemo } from 'react'
import type { ApiSong } from '../lib/api'
import {
  selectNearbySyncedLines,
  syncedLineDisplayClass,
  usePlayerLyrics,
  type PlayerLyricsViewState,
} from '../lib/playerLyrics'

export type PlayerLyricsPanelVariant = 'embed' | 'stack' | 'inline'

type PlayerLyricsPanelProps = {
  track: ApiSong | null
  positionSeconds?: number
  variant?: PlayerLyricsPanelVariant
  className?: string
  isLoading?: boolean
}

function PlayerLyricsEmptyView({
  viewState,
  className = '',
}: {
  viewState: PlayerLyricsViewState
  className?: string
}) {
  return (
    <div className={`player-lyrics-empty ${className}`.trim()} role="status">
      <p className="player-lyrics-empty-title">{viewState.emptyTitle}</p>
      <p className="player-lyrics-empty-detail">{viewState.emptyDetail}</p>
      {viewState.credit ? (
        <p className="player-lyrics-empty-credit">{viewState.credit}</p>
      ) : null}
      {viewState.sourceLabel ? (
        <p className="player-lyrics-source-label">{viewState.sourceLabel}</p>
      ) : null}
    </div>
  )
}

function PlayerLyricsLoadingView({
  viewState,
  className = '',
}: {
  viewState: PlayerLyricsViewState
  className?: string
}) {
  return (
    <div className={`player-lyrics-empty player-lyrics-empty--loading ${className}`.trim()} role="status">
      <p className="player-lyrics-empty-title">{viewState.emptyTitle}</p>
      <p className="player-lyrics-empty-detail">{viewState.emptyDetail}</p>
    </div>
  )
}

function PlayerLyricsPlainView({
  lines,
  variant,
  credit,
  sourceLabel,
  className = '',
}: {
  lines: string[]
  variant: PlayerLyricsPanelVariant
  credit: string | null
  sourceLabel: string | null
  className?: string
}) {
  const bodyClass =
    variant === 'stack'
      ? 'player-lyrics-plain player-lyrics-plain--stack'
      : variant === 'inline'
        ? 'player-lyrics-plain player-lyrics-plain--inline'
        : 'player-lyrics-plain player-lyrics-plain--embed'

  return (
    <div className={`${bodyClass} ${className}`.trim()} aria-label="Lyrics">
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="player-lyrics-plain-line">
          {line}
        </p>
      ))}
      {credit ? <p className="player-lyrics-empty-credit">{credit}</p> : null}
      {sourceLabel ? <p className="player-lyrics-source-label">{sourceLabel}</p> : null}
    </div>
  )
}

function PlayerLyricsSyncedView({
  lines,
  activeIndex,
  startIndex,
  credit,
  sourceLabel,
  className = '',
}: {
  lines: Array<{ text: string; timestampMs: number }>
  activeIndex: number
  startIndex: number
  credit: string | null
  sourceLabel: string | null
  className?: string
}) {
  return (
    <div className={`player-lyrics-synced ${className}`.trim()} aria-label="Synced lyrics">
      {lines.map((line, index) => (
        <p
          key={`${line.timestampMs}-${startIndex + index}`}
          className={syncedLineDisplayClass(startIndex + index, activeIndex)}
        >
          {line.text}
        </p>
      ))}
      {credit ? <p className="player-lyrics-empty-credit">{credit}</p> : null}
      {sourceLabel ? <p className="player-lyrics-source-label">{sourceLabel}</p> : null}
    </div>
  )
}

export const PlayerLyricsPanel = memo(function PlayerLyricsPanel({
  track,
  positionSeconds = 0,
  variant = 'embed',
  className = '',
  isLoading = false,
}: PlayerLyricsPanelProps) {
  const lyrics = usePlayerLyrics(track, positionSeconds, { isLoading })

  const syncedWindow = useMemo(() => {
    if (lyrics.availability !== 'synced') {
      return { lines: lyrics.syncedLines, startIndex: 0 }
    }

    const radius = variant === 'stack' ? 8 : variant === 'embed' ? 5 : 2
    return selectNearbySyncedLines(
      lyrics.syncedLines,
      lyrics.activeSyncedLineIndex,
      radius,
    )
  }, [
    lyrics.activeSyncedLineIndex,
    lyrics.availability,
    lyrics.syncedLines,
    variant,
  ])

  if (lyrics.availability === 'loading') {
    return <PlayerLyricsLoadingView viewState={lyrics} className={className} />
  }

  if (lyrics.availability === 'unavailable') {
    return <PlayerLyricsEmptyView viewState={lyrics} className={className} />
  }

  if (lyrics.availability === 'synced') {
    return (
      <PlayerLyricsSyncedView
        lines={syncedWindow.lines}
        startIndex={syncedWindow.startIndex}
        activeIndex={lyrics.activeSyncedLineIndex}
        credit={lyrics.credit}
        sourceLabel={lyrics.sourceLabel}
        className={className}
      />
    )
  }

  return (
    <PlayerLyricsPlainView
      lines={lyrics.plainLines}
      variant={variant}
      credit={lyrics.credit}
      sourceLabel={lyrics.sourceLabel}
      className={className}
    />
  )
})
