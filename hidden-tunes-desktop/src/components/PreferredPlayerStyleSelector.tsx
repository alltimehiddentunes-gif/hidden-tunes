import { memo } from 'react'
import {
  NOW_PLAYING_STYLE_OPTIONS,
  usePreferredNowPlayingStyle,
  type NowPlayingStyle,
} from '../lib/nowPlayingStyle'

type PreferredPlayerStyleSelectorProps = {
  hasActivePlayback: boolean
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
}

export const PreferredPlayerStyleSelector = memo(function PreferredPlayerStyleSelector({
  hasActivePlayback,
  onOpenPlayerByStyle,
}: PreferredPlayerStyleSelectorProps) {
  const [preferredPlayerStyle, setPreferredPlayerStyle] = usePreferredNowPlayingStyle()

  return (
    <section className="settings-panel settings-panel--player">
      <h2>Preferred player</h2>
      <p className="settings-panel-desc">
        Choose the full-screen Now Playing experience that opens after you tap a song.
        Your choice is saved on this device and does not interrupt playback.
      </p>
      <div
        className="preferred-player-grid"
        role="radiogroup"
        aria-label="Preferred full-screen player"
      >
        {NOW_PLAYING_STYLE_OPTIONS.map((option) => {
          const isActive = preferredPlayerStyle === option.id
          return (
            <article
              key={option.id}
              className={`preferred-player-card${isActive ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="preferred-player-select"
                role="radio"
                aria-checked={isActive}
                onClick={() => setPreferredPlayerStyle(option.id)}
              >
                <span className="preferred-player-select-head">
                  <strong>{option.label}</strong>
                  {isActive ? (
                    <span className="settings-badge preferred-player-badge">Selected</span>
                  ) : null}
                </span>
                <span className="preferred-player-select-desc">{option.description}</span>
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm preferred-player-open"
                disabled={!hasActivePlayback}
                title={
                  hasActivePlayback
                    ? `Open ${option.label} with the current track`
                    : 'Play a song to preview a player'
                }
                onClick={() => onOpenPlayerByStyle(option.id)}
              >
                Open
              </button>
            </article>
          )
        })}
      </div>
      {hasActivePlayback ? (
        <p className="settings-reset-note" role="status">
          Open previews the player with your current track without changing playback.
        </p>
      ) : (
        <p className="settings-reset-note" role="status">
          Play a song first to preview any player. Your preferred choice still saves immediately.
        </p>
      )}
    </section>
  )
})
