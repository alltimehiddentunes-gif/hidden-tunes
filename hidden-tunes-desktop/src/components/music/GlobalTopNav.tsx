import { memo } from 'react'

type GlobalTopNavKey =
  | 'home'
  | 'music'
  | 'radio'
  | 'podcasts'
  | 'audiobooks'
  | 'tv'
  | 'motivationals'
  | 'lectures'

type GlobalTopNavProps = {
  activeNavKey: string
  onNavigateNav?: (navKey: GlobalTopNavKey) => void
  onOpenProfile?: () => void
  pageTitle?: string
}

/**
 * Compact page chrome for the centre column.
 * Route navigation lives only in the left sidebar — no duplicate section strip.
 */
export const GlobalTopNav = memo(function GlobalTopNav({
  activeNavKey,
  onNavigateNav,
  onOpenProfile,
}: GlobalTopNavProps) {
  const links = [
    ['home', 'Home'],
    ['music', 'Music'],
    ['radio', 'Radio'],
    ['podcasts', 'Podcasts'],
    ['audiobooks', 'Audiobooks'],
    ['tv', 'TV'],
    ['motivationals', 'Motivationals'],
    ['lectures', 'Lectures'],
  ] as const

  return (
    <header className="global-top-nav global-top-nav--reference" aria-label="Page header">
      <nav className="global-top-nav-links" aria-label="Primary sections">
        {links.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`global-top-nav-link${activeNavKey === key ? ' is-active' : ''}`}
            onClick={() => onNavigateNav?.(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="global-top-nav-actions" aria-label="Account actions">
        <button
          type="button"
          className="global-top-nav-icon is-disabled"
          aria-label="Notifications not available in this desktop preview"
          title="Notifications are not available in this desktop preview"
          disabled
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-5-5.9V4a1 1 0 00-2 0v1.1A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
            <path d="M10 20a2 2 0 004 0" />
          </svg>
        </button>
        <button
          type="button"
          className="global-top-nav-profile"
          aria-label="Open settings"
          title="Settings"
          onClick={() => onOpenProfile?.()}
        >
          <span aria-hidden="true">H</span>
        </button>
      </div>
    </header>
  )
})
