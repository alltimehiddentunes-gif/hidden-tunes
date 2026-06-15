import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  NOW_PLAYING_STYLE_OPTIONS,
  usePreferredNowPlayingStyle,
  type NowPlayingStyle,
} from '../lib/nowPlayingStyle'

type PlayerModeSwitcherProps = {
  activeMode: NowPlayingStyle
  onSwitchMode: (style: NowPlayingStyle) => void
  hasPlayback: boolean
  align?: 'left' | 'right'
}

export const PlayerModeSwitcher = memo(function PlayerModeSwitcher({
  activeMode,
  onSwitchMode,
  hasPlayback,
  align = 'right',
}: PlayerModeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [preferredStyle, setPreferredStyle] = usePreferredNowPlayingStyle()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const activeOption = useMemo(
    () => NOW_PLAYING_STYLE_OPTIONS.find((option) => option.id === activeMode) ?? null,
    [activeMode],
  )

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeMenu()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [closeMenu, open])

  const handleToggle = () => {
    if (!hasPlayback) return
    setOpen((previous) => !previous)
  }

  const handleSelect = (style: NowPlayingStyle) => {
    if (!hasPlayback) return
    if (style !== activeMode) {
      onSwitchMode(style)
    }
    closeMenu()
  }

  const handleSetDefault = () => {
    setPreferredStyle(activeMode)
    closeMenu()
  }

  const triggerLabel = hasPlayback
    ? `Switch player mode — ${activeOption?.label ?? 'Now Playing'}`
    : 'Play a song to switch player mode'

  return (
    <div
      className={`player-mode-switcher player-mode-switcher--align-${align}`}
      ref={rootRef}
      data-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        className="player-mode-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={!hasPlayback}
        title={triggerLabel}
        onClick={handleToggle}
      >
        <span className="player-mode-switcher-trigger-label">
          {activeOption?.label ?? 'Player'}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && hasPlayback ? (
        <div
          id={menuId}
          className="player-mode-switcher-menu"
          role="menu"
          aria-label="Switch player mode"
        >
          <p className="player-mode-switcher-menu-eyebrow">Listening view</p>
          <ul className="player-mode-switcher-list">
            {NOW_PLAYING_STYLE_OPTIONS.map((option) => {
              const isActive = option.id === activeMode
              const isPreferred = option.id === preferredStyle
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? 'true' : undefined}
                    className={
                      'player-mode-switcher-item'
                      + (isActive ? ' is-active' : '')
                      + (isPreferred ? ' is-preferred' : '')
                    }
                    onClick={() => handleSelect(option.id)}
                  >
                    <span className="player-mode-switcher-item-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                    {isActive ? (
                      <span className="player-mode-switcher-item-badge">Now</span>
                    ) : isPreferred ? (
                      <span className="player-mode-switcher-item-badge player-mode-switcher-item-badge--default">
                        Default
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="player-mode-switcher-footer">
            {preferredStyle === activeMode ? (
              <p className="player-mode-switcher-footer-note">
                Default player for new songs
              </p>
            ) : (
              <button
                type="button"
                className="player-mode-switcher-set-default"
                onClick={handleSetDefault}
              >
                Set {activeOption?.label ?? 'this view'} as default
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
})
