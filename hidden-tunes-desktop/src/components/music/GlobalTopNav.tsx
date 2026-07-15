import { memo } from 'react'
import { PRIMARY_SECTION_NAV, type GlobalNavKey } from '../../lib/music/navTypes'

type GlobalTopNavProps = {
  activeNavKey: GlobalNavKey | string
  onNavigateNav: (navKey: GlobalNavKey) => void
  onOpenProfile?: () => void
}

function BrandWaveformMark() {
  return (
    <svg className="brand-waveform global-top-nav-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect x="3" y="14" width="3" height="10" rx="1.5" fill="url(#globalNavWaveGold)" />
      <rect x="9" y="8" width="3" height="22" rx="1.5" fill="url(#globalNavWaveGold)" />
      <rect x="15" y="12" width="3" height="14" rx="1.5" fill="url(#globalNavWaveGold)" />
      <rect x="21" y="5" width="3" height="28" rx="1.5" fill="url(#globalNavWaveGold)" />
      <rect x="27" y="10" width="3" height="18" rx="1.5" fill="url(#globalNavWaveGold)" />
      <defs>
        <linearGradient id="globalNavWaveGold" x1="18" y1="4" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBA3D" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export const GlobalTopNav = memo(function GlobalTopNav({
  activeNavKey,
  onNavigateNav,
  onOpenProfile,
}: GlobalTopNavProps) {
  return (
    <header className="global-top-nav" aria-label="Application sections">
      <div className="global-top-nav-brand">
        <BrandWaveformMark />
        <span className="global-top-nav-wordmark">Hidden Tunes</span>
      </div>
      <nav className="global-top-nav-links" aria-label="Major sections">
        {PRIMARY_SECTION_NAV.map((item) => {
          const isActive = item.navKey === activeNavKey
          return (
            <button
              key={item.navKey}
              type="button"
              className={`global-top-nav-link${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigateNav(item.navKey)}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="global-top-nav-actions" aria-label="Account actions">
        <button
          type="button"
          className="global-top-nav-icon is-disabled"
          aria-label="Notifications coming soon"
          title="Notifications coming soon"
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
