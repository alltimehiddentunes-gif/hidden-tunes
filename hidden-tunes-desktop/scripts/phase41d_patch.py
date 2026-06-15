#!/usr/bin/env python3
"""Phase 41D — Sidebar + Brand reconstruction."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch_app_tsx() -> None:
    app_path = ROOT / "src" / "App.tsx"
    app = app_path.read_text(encoding="utf-8")

    brand_component = """function BrandWaveformMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'brand-waveform'}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="14" width="3" height="10" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="9" y="8" width="3" height="22" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="15" y="12" width="3" height="14" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="21" y="5" width="3" height="28" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="27" y="10" width="3" height="18" rx="1.5" fill="url(#brandWaveGold)" />
      <path
        d="M2 18c4-6 8-9 16-9s12 3 16 9"
        stroke="url(#brandWaveStroke)"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.55"
      />
      <defs>
        <linearGradient id="brandWaveGold" x1="18" y1="4" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBA3D" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
        <linearGradient id="brandWaveStroke" x1="2" y1="9" x2="34" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5C542" />
          <stop offset="1" stopColor="#BF7F72" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function isSidebarNavActive(item: SidebarNavItem, activePage: PageId) {
  if (item.page !== activePage) return false
  if (item.page === 'library') return item.key === 'library'
  return true
}

"""

    anchor = "function moodRoomScene(room: Pick<MoodRoom, 'title' | 'mood' | 'sceneId'>): VisualSceneId {"
    if "function BrandWaveformMark" not in app:
        if anchor not in app:
            raise SystemExit("moodRoomScene anchor not found")
        app = app.replace(anchor, brand_component + anchor)

    old_nav_type = """type NavItem = {
  id: PageId
  label: string
  icon: ReactNode
}"""

    new_nav_type = """type SidebarNavItem = {
  key: string
  page: PageId
  label: string
  icon: ReactNode
}"""

    if old_nav_type not in app:
        raise SystemExit("NavItem type not found")
    app = app.replace(old_nav_type, new_nav_type)

    old_main_nav_start = "const MAIN_NAV: NavItem[] = ["
    old_settings = """const SETTINGS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)"""

    new_nav_block = """const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    key: 'home',
    page: 'home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    key: 'worlds',
    page: 'mood',
    label: 'Emotional Worlds',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 12c1.2-2.2 2.4-3.3 3.5-3.3s2.3 1.1 3.5 3.3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      </svg>
    ),
  },
  {
    key: 'search',
    page: 'discover',
    label: 'Search',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    key: 'library',
    page: 'library',
    label: 'Library',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M4 19V5h4l2 14 4-14h4v14" />
      </svg>
    ),
  },
  {
    key: 'playlists',
    page: 'playlists',
    label: 'Playlists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    key: 'artists',
    page: 'artists',
    label: 'Artists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    key: 'albums',
    page: 'albums',
    label: 'Albums',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'liked',
    page: 'library',
    label: 'Liked',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
      </svg>
    ),
  },
  {
    key: 'recent',
    page: 'library',
    label: 'Recent',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: 'downloads',
    page: 'library',
    label: 'Downloads',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 4v10" />
        <path d="M8.5 10.5L12 14l3.5-3.5" />
        <path d="M5 18h14" />
      </svg>
    ),
  },
  {
    key: 'settings',
    page: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
]"""

    start = app.find("const MAIN_NAV: NavItem[] = [")
    if start == -1:
        raise SystemExit("MAIN_NAV block not found")
    end = app.find("\n\nconst HOME_SECTIONS", start)
    if end == -1:
        raise SystemExit("HOME_SECTIONS anchor not found")
    app = app[:start] + new_nav_block + app[end:]

    old_sidebar = """const Sidebar = memo(function Sidebar({
  activePage,
  onNavigate,
}: {
  activePage: PageId
  onNavigate: (page: PageId) => void
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <div className="brand-text">
          <span className="brand-title">Hidden Tunes</span>
          <span className="brand-sub">Desktop</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {MAIN_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item${activePage === 'settings' ? ' active' : ''}`}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          {SETTINGS_ICON}
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
})"""

    new_sidebar = """const Sidebar = memo(function Sidebar({
  activePage,
  onNavigate,
}: {
  activePage: PageId
  onNavigate: (page: PageId) => void
}) {
  return (
    <aside className="sidebar sidebar--psd">
      <div className="sidebar-brand">
        <BrandWaveformMark />
        <div className="brand-text">
          <span className="brand-wordmark">Hidden Tunes</span>
          <span className="brand-tagline">Feel Every Sound</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {SIDEBAR_NAV.map((item) => {
          const isActive = isSidebarNavActive(item, activePage)
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.page)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" className="sidebar-premium-cta" aria-label="Go Premium">
          <span className="sidebar-premium-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M5 17l2-7h10l2 7" />
              <path d="M7 17h10" />
              <path d="M9 10l1.5-4h3L15 10" />
            </svg>
          </span>
          <span className="sidebar-premium-copy">
            <span className="sidebar-premium-label">Go Premium</span>
            <span className="sidebar-premium-hint">Unlock every world</span>
          </span>
        </button>

        <div className="sidebar-user" aria-label="Profile">
          <div className="sidebar-user-avatar" aria-hidden="true">
            <span>H</span>
          </div>
          <div className="sidebar-user-copy">
            <span className="sidebar-user-name">Hidden Listener</span>
            <span className="sidebar-user-badge">
              <span className="sidebar-user-badge-check" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
              </span>
              Premium User
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
})"""

    if old_sidebar not in app:
        raise SystemExit("Sidebar block not found")
    app = app.replace(old_sidebar, new_sidebar)

    app_path.write_text(app, encoding="utf-8")
    print("App.tsx patched")


def patch_index_css() -> None:
    index_path = ROOT / "src" / "index.css"
    index = index_path.read_text(encoding="utf-8")

    replacements = [
        (
            "  --gradient-sidebar: linear-gradient(\n    180deg,\n    #14141f 0%,\n    var(--psd-bg-deep) 100%\n  );",
            "  --sidebar-surface: var(--psd-bg-base);\n  --sidebar-border-gold: rgba(245, 197, 66, 0.14);\n  --sidebar-gold-glow: rgba(255, 186, 61, 0.08);\n\n  --gradient-sidebar: linear-gradient(\n    180deg,\n    #11111a 0%,\n    var(--sidebar-surface) 100%\n  );",
        ),
    ]

    for old, new in replacements:
        if old in index:
            index = index.replace(old, new)

    if "--sidebar-surface" not in index:
        raise SystemExit("index.css gradient-sidebar block not found")

    index_path.write_text(index, encoding="utf-8")
    print("index.css patched")


def patch_app_css() -> None:
    css_path = ROOT / "src" / "App.css"
    css = css_path.read_text(encoding="utf-8")

    # Update base sidebar block
    css = css.replace(
        """/* —— Sidebar —— */
.sidebar {
  flex-shrink: 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  padding: 22px 16px;
  background: var(--gradient-sidebar);
  border-right: 1px solid var(--border-subtle);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px 22px;
  margin-bottom: 6px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-violet), var(--accent-gold-deep));
  box-shadow: 0 4px 16px rgba(168, 85, 247, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.brand-sub {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}""",
        """/* —— Sidebar —— */
.sidebar {
  flex-shrink: 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  padding: 20px 14px 18px;
  background: var(--sidebar-surface);
  border-right: 1px solid var(--sidebar-border-gold);
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.03),
    inset 1px 0 0 rgba(255, 186, 61, 0.04),
    8px 0 28px rgba(0, 0, 0, 0.22);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 20px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.brand-waveform {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  filter: drop-shadow(0 4px 12px rgba(255, 186, 61, 0.28));
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.brand-wordmark {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(245, 243, 250, 0.94);
  line-height: 1.2;
}

.brand-tagline {
  font-family: var(--font-script);
  font-size: 12px;
  font-style: italic;
  letter-spacing: 0.03em;
  color: rgba(245, 197, 66, 0.82);
  line-height: 1.2;
}""",
    )

    css = css.replace(
        """.nav-item.active {
  color: var(--text-primary);
  background: rgba(168, 85, 247, 0.1);
  border-color: var(--border-subtle);
  box-shadow: var(--shadow-glow);
}

.nav-item.active::before {
  transform: translateY(-50%) scaleY(1);
}

.nav-item.active svg {
  opacity: 1;
  color: var(--accent-violet);
}

.sidebar-footer {
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 10px;
}""",
        """.nav-item.active {
  color: var(--accent-gold-bright);
  background: linear-gradient(
    95deg,
    rgba(245, 197, 66, 0.16) 0%,
    rgba(232, 185, 35, 0.08) 58%,
    rgba(13, 13, 20, 0.2) 100%
  );
  border-color: rgba(245, 197, 66, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    var(--shadow-gold);
}

.nav-item.active::before {
  transform: translateY(-50%) scaleY(1);
}

.nav-item.active svg {
  opacity: 1;
  color: var(--accent-gold-bright);
}

.nav-item:hover {
  color: rgba(245, 243, 250, 0.92);
  background: rgba(245, 197, 66, 0.06);
  border-color: rgba(245, 197, 66, 0.12);
}

.nav-item:hover svg {
  color: rgba(245, 197, 66, 0.78);
}

.sidebar-bottom {
  margin-top: auto;
  padding-top: 14px;
  display: grid;
  gap: 12px;
}""",
        1,
    )

    phase41d = """
/* —— Phase 41D: PSD sidebar + brand —— */
.sidebar--psd {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 12%),
    var(--sidebar-surface);
}

.sidebar-premium-cta {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border-radius: calc(var(--radius-md) + 2px);
  border: 1px solid rgba(245, 197, 66, 0.34);
  background:
    linear-gradient(180deg, rgba(255, 186, 61, 0.1), rgba(13, 13, 20, 0.72));
  color: rgba(245, 243, 250, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 8px 20px rgba(0, 0, 0, 0.2);
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    transform var(--transition-fast);
}

.sidebar-premium-cta:hover {
  border-color: rgba(255, 186, 61, 0.48);
  background:
    linear-gradient(180deg, rgba(255, 186, 61, 0.16), rgba(13, 13, 20, 0.78));
  transform: translateY(-1px);
}

.sidebar-premium-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: rgba(255, 186, 61, 0.14);
  color: var(--accent-gold-bright);
  flex-shrink: 0;
}

.sidebar-premium-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.sidebar-premium-label {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--accent-gold-bright);
}

.sidebar-premium-hint {
  font-size: 11px;
  color: rgba(245, 243, 250, 0.48);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: calc(var(--radius-md) + 2px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.sidebar-user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(245, 197, 66, 0.28);
  background: linear-gradient(145deg, rgba(109, 74, 255, 0.32), rgba(166, 58, 136, 0.24));
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
}

.sidebar-user-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sidebar-user-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(245, 243, 250, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 2px 7px 2px 5px;
  border-radius: 999px;
  background: rgba(245, 197, 66, 0.12);
  border: 1px solid rgba(245, 197, 66, 0.22);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent-gold);
}

.sidebar-user-badge-check {
  display: inline-flex;
  color: var(--accent-gold-bright);
}

.sidebar--psd .nav-item.active {
  color: var(--accent-gold-bright);
}

.sidebar--psd .nav-item.active span {
  color: inherit;
}

/* Override legacy premium sidebar violet treatments */
.sidebar--psd,
.sidebar.sidebar--psd {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018) 0%, transparent 14%),
    var(--sidebar-surface) !important;
  border-right-color: var(--sidebar-border-gold) !important;
  box-shadow:
    inset -1px 0 0 rgba(255, 186, 61, 0.05),
    inset 1px 0 0 rgba(255, 255, 255, 0.025),
    8px 0 28px rgba(0, 0, 0, 0.22) !important;
}

@media (max-width: 900px) {
  .sidebar-premium-copy,
  .sidebar-user-copy,
  .brand-tagline,
  .brand-wordmark {
    display: none;
  }

  .sidebar-premium-cta {
    justify-content: center;
    padding: 10px;
  }

  .sidebar-user {
    justify-content: center;
    padding: 8px;
  }
}

"""

    marker = "/* —— Phase 41E: PSD Home Hero + Popular Worlds —— */"
    if marker not in css:
        marker = "/* —— Phase 41C: PSD shell + home chrome —— */"
    if marker in css:
        css = css.replace(marker, phase41d + marker)
    else:
        css = phase41d + css

    # Remove conflicting Phase 15 violet sidebar overrides (neutralize)
    css = css.replace(
        """/* —— Premium sidebar treatment (Phase 15) —— */
.sidebar {
  padding: 24px 14px 20px;
  background:
    radial-gradient(ellipse 90% 44% at 20% 0%, rgba(168, 85, 247, 0.1), transparent 68%),
    linear-gradient(180deg, rgba(24, 22, 34, 0.97) 0%, rgba(10, 10, 16, 0.99) 100%),
    var(--gradient-sidebar);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    inset -1px 0 0 rgba(168, 85, 247, 0.055),
    10px 0 30px rgba(0, 0, 0, 0.14);
}

.sidebar-brand {
  padding: 8px 10px 24px;
  margin-bottom: 8px;
}

.brand-mark {
  box-shadow:
    0 4px 14px rgba(168, 85, 247, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.brand-title {
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.brand-sub {
  letter-spacing: 0.16em;
  color: rgba(245, 243, 250, 0.4);
}

.sidebar-nav {
  gap: 4px;
  padding-right: 4px;
}

.nav-item {
  padding: 12px 14px;
  letter-spacing: 0.012em;
  border-radius: calc(var(--radius-md) + 2px);
}

.nav-item:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.045);
  border-color: rgba(255, 255, 255, 0.07);
  transform: translateX(2px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.14);
}

.nav-item.active {
  background: linear-gradient(
    95deg,
    rgba(245, 197, 66, 0.14) 0%,
    rgba(109, 74, 255, 0.08) 55%,
    rgba(166, 58, 136, 0.05) 100%
  );
  border-color: rgba(245, 197, 66, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    var(--shadow-gold);
}

.nav-item.active::before {
  width: 3px;
  height: 52%;
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.35);
}

.nav-item.active svg {
  color: var(--accent-gold);
}

.sidebar-footer {
  padding-top: 16px;
  margin-top: 12px;
  border-top-color: rgba(255, 255, 255, 0.06);
}
""",
        "/* —— Premium sidebar treatment (Phase 15) — superseded by Phase 41D —— */",
    )

    # Neutralize 41C sidebar violet override
    css = css.replace(
        """.sidebar {
  background:
    radial-gradient(ellipse 90% 44% at 20% 0%, rgba(109, 74, 255, 0.1), transparent 68%),
    radial-gradient(ellipse 60% 36% at 80% 100%, rgba(255, 186, 61, 0.05), transparent 62%),
    var(--gradient-sidebar);
  box-shadow:
    inset -1px 0 0 rgba(245, 197, 66, 0.04),
    10px 0 30px rgba(0, 0, 0, 0.14);
}
""",
        "",
    )

    css_path.write_text(css, encoding="utf-8")
    print("App.css patched")


def main() -> None:
    patch_app_tsx()
    patch_app_css()
    patch_index_css()


if __name__ == "__main__":
    main()
