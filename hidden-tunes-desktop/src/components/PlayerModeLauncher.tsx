import {
  memo,
} from 'react'
import {
  usePreferredNowPlayingStyle,
  type NowPlayingStyle,
} from '../lib/nowPlayingStyle'

export type PlayerModeLauncherVariant = 'footer' | 'sidebar'

type PlayerModeLauncherProps = {
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  hasPlayback: boolean
  variant?: PlayerModeLauncherVariant
}

function PlayerModeLauncherIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
    </svg>
  )
}

export const PlayerModeLauncher = memo(function PlayerModeLauncher({
  onOpenPlayerByStyle,
  hasPlayback,
  variant = 'footer',
}: PlayerModeLauncherProps) {
  const [preferredStyle] = usePreferredNowPlayingStyle()

  const triggerLabel = hasPlayback
    ? 'Open full-screen player'
    : 'Play a song to open a player'

  return (
    <div
      className={`player-mode-launcher player-mode-launcher--${variant}`}
      data-open="false"
    >
      <button
        type="button"
        className="player-mode-launcher-trigger"
        aria-label={triggerLabel}
        disabled={!hasPlayback}
        title={triggerLabel}
        onClick={() => {
          if (hasPlayback) onOpenPlayerByStyle(preferredStyle)
        }}
      >
        <PlayerModeLauncherIcon />
        {variant === 'sidebar' ? (
          <span className="player-mode-launcher-trigger-label">Players</span>
        ) : null}
      </button>

    </div>
  )
})
