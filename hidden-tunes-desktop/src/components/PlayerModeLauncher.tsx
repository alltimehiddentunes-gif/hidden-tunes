import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  NOW_PLAYING_STYLE_OPTIONS,
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
  const [open, setOpen] = useState(false)
  const [preferredStyle, setPreferredStyle] = usePreferredNowPlayingStyle()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMenu, open])

  const handleToggle = () => {
    if (!hasPlayback) return
    setOpen((previous) => !previous)
  }

  const handleSelect = (style: NowPlayingStyle) => {
    if (!hasPlayback) return
    setPreferredStyle(style)
    onOpenPlayerByStyle(style)
    closeMenu()
  }

  const triggerLabel = hasPlayback
    ? 'Open full-screen player'
    : 'Play a song to open a player'

  return (
    <div
      className={`player-mode-launcher player-mode-launcher--${variant}`}
      ref={rootRef}
      data-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        className="player-mode-launcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={!hasPlayback}
        title={triggerLabel}
        onClick={handleToggle}
      >
        <PlayerModeLauncherIcon />
        {variant === 'sidebar' ? (
          <span className="player-mode-launcher-trigger-label">Players</span>
        ) : null}
      </button>

      {open && hasPlayback ? (
        <div
          id={menuId}
          className="player-mode-launcher-menu"
          role="menu"
          aria-label="Full-screen players"
        >
          <p className="player-mode-launcher-menu-eyebrow">Now Playing</p>
          <ul className="player-mode-launcher-list">
            {NOW_PLAYING_STYLE_OPTIONS.map((option) => {
              const isPreferred = preferredStyle === option.id
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={
                      'player-mode-launcher-item'
                      + (isPreferred ? ' is-preferred' : '')
                    }
                    onClick={() => handleSelect(option.id)}
                  >
                    <span className="player-mode-launcher-item-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                    {isPreferred ? (
                      <span className="player-mode-launcher-item-badge">Default</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
})
