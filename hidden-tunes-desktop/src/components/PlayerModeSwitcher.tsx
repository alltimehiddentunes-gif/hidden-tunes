import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const menuId = useId()

  const activeOption = useMemo(
    () => NOW_PLAYING_STYLE_OPTIONS.find((option) => option.id === activeMode) ?? null,
    [activeMode],
  )

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeMenu()
      triggerRef.current?.focus()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [closeMenu, open])

  useEffect(() => {
    if (!open) return undefined
    const positionMenu = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      const estimatedHeight = Math.min(460, window.innerHeight - 24)
      let left = Math.max(12, Math.min(window.innerWidth - width - 12, align === 'right' ? rect.right - width : rect.left))
      const below = window.innerHeight - rect.bottom
      const top = below >= estimatedHeight || below >= rect.top
        ? Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 8)
        : Math.max(12, rect.top - estimatedHeight - 8)
      const panel = document.getElementById('premium-shell-shared-panel')?.getBoundingClientRect()
      if (panel && panel.width > 0) {
        const overlapsPanel = left + width > panel.left && left < panel.right
        if (overlapsPanel && panel.left - width - 12 >= 12) {
          left = panel.left - width - 12
        }
      }
      setMenuStyle({ left, top, width, maxHeight: estimatedHeight })
    }
    positionMenu()
    window.addEventListener('resize', positionMenu)
    return () => window.removeEventListener('resize', positionMenu)
  }, [align, open])

  const handleToggle = () => {
    if (!hasPlayback) return
    setOpen((previous) => !previous)
  }

  const handleSelect = (style: NowPlayingStyle) => {
    if (!hasPlayback) return
    if (style !== activeMode) {
      onSwitchMode(style)
    }
    setPreferredStyle(style)
    closeMenu()
    triggerRef.current?.focus()
  }

  const handleSetDefault = () => {
    setPreferredStyle(activeMode)
    closeMenu()
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length
          : (current - 1 + items.length) % items.length
    items[next]?.focus()
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
        ref={triggerRef}
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

      {open && hasPlayback ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="player-mode-switcher-menu"
          style={menuStyle}
          role="menu"
          aria-label="Switch player mode"
          onKeyDown={handleMenuKeyDown}
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
        </div>,
        document.body,
      ) : null}
    </div>
  )
})
