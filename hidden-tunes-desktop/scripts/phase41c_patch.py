#!/usr/bin/env python3
"""Phase 41C shell + token reconstruction patches."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch_app_tsx() -> None:
    app_path = ROOT / "src" / "App.tsx"
    app = app_path.read_text(encoding="utf-8")

    old_pageframe = """function PageFrame({ children }: { children: ReactNode }) {
  return <div className="content-inner">{children}</div>
}"""

    new_pageframe = """function PageFrame({
  children,
  cinematic = false,
}: {
  children: ReactNode
  cinematic?: boolean
}) {
  return (
    <div className={`content-inner${cinematic ? ' content-inner--cinematic' : ''}`}>
      {children}
    </div>
  )
}

function HomeTopBar({ onOpenDiscover }: { onOpenDiscover: () => void }) {
  const [query, setQuery] = useState('')

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onOpenDiscover()
    },
    [onOpenDiscover],
  )

  return (
    <header className="home-top-bar" aria-label="Home navigation">
      <form className="home-top-search" role="search" onSubmit={handleSubmit}>
        <span className="search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search songs, albums, artists…"
          aria-label="Search catalog"
        />
      </form>
      <div className="home-top-actions">
        <button type="button" className="home-top-icon-btn" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>
        <button type="button" className="home-top-icon-btn" aria-label="Theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </button>
        <button type="button" className="home-top-avatar" aria-label="Profile">
          <span aria-hidden="true">H</span>
        </button>
      </div>
    </header>
  )
}"""

    if old_pageframe not in app:
        raise SystemExit("PageFrame block not found")
    app = app.replace(old_pageframe, new_pageframe)

    if "type FormEvent," not in app:
        app = app.replace(
            "import {\n  createContext,",
            "import {\n  createContext,\n  type FormEvent,",
            1,
        )

    app = app.replace("hero-atmosphere-glow--cyan", "hero-atmosphere-glow--gold")
    app = app.replace("home-atmosphere-orb--cyan", "home-atmosphere-orb--gold")

    app = app.replace(
        "      <PageFrame>\n        <Hero",
        "      <PageFrame cinematic>\n        <Hero",
    )

    old_shell = """            <main className="main-scroll">
              <CatalogStatusBar />
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage} data-view={activeView}>"""

    new_shell = """            <main
              className={`main-scroll${activePage === 'home' && activeView === 'page' ? ' main-scroll--home' : ''}`}
            >
              {activePage === 'home' && activeView === 'page' ? (
                <HomeTopBar onOpenDiscover={() => navigatePage('discover')} />
              ) : null}
              {activePage !== 'home' ? <CatalogStatusBar /> : null}
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage} data-view={activeView}>"""

    if old_shell not in app:
        raise SystemExit("AppShell block not found")
    app = app.replace(old_shell, new_shell)

    app_path.write_text(app, encoding="utf-8")
    print("App.tsx patched")


def patch_app_css() -> None:
    css_path = ROOT / "src" / "App.css"
    css = css_path.read_text(encoding="utf-8")

    replacements = [
        (
            ".content-inner {\n  width: 100%;\n  max-width: var(--content-max);\n  margin: 0 auto;\n  position: relative;\n}",
            ".content-inner {\n  width: 100%;\n  max-width: var(--content-max);\n  margin: 0 auto;\n  position: relative;\n}\n\n.content-inner--cinematic {\n  max-width: var(--content-max-home);\n  width: 100%;\n}",
        ),
        (
            "  background: linear-gradient(135deg, var(--accent-violet), var(--accent-cyan));",
            "  background: linear-gradient(135deg, var(--accent-violet), var(--accent-gold-deep));",
        ),
        (
            "  background: linear-gradient(180deg, var(--accent-violet), var(--accent-cyan));",
            "  background: linear-gradient(180deg, var(--accent-gold-deep), var(--accent-gold));",
        ),
        (
            "    radial-gradient(ellipse 52% 42% at 100% 32%, rgba(14, 116, 144, 0.052), transparent 62%),",
            "    radial-gradient(ellipse 52% 42% at 100% 32%, rgba(166, 58, 136, 0.06), transparent 62%),",
        ),
        (
            ".queue-rail {\n  flex: 0 0 clamp(260px, 21vw, 314px);\n  width: clamp(260px, 21vw, 314px);",
            ".queue-rail {\n  flex: 0 0 var(--queue-rail-width);\n  width: var(--queue-rail-width);",
        ),
        (
            "  background: rgba(56, 189, 248, 0.06);\n  border: 1px solid rgba(56, 189, 248, 0.15);",
            "  background: rgba(245, 197, 66, 0.06);\n  border: 1px solid rgba(245, 197, 66, 0.15);",
        ),
        (
            "  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);",
            "  box-shadow: 0 0 8px rgba(245, 197, 66, 0.45);",
        ),
        (
            "  color: var(--accent-cyan);\n  background: rgba(56, 189, 248, 0.08);\n  border-color: rgba(56, 189, 248, 0.18);",
            "  color: var(--accent-gold);\n  background: rgba(245, 197, 66, 0.08);\n  border-color: rgba(245, 197, 66, 0.18);",
        ),
        (
            ".nav-item.active {\n  background: linear-gradient(\n    95deg,\n    rgba(168, 85, 247, 0.16) 0%,\n    rgba(168, 85, 247, 0.06) 55%,\n    rgba(56, 189, 248, 0.04) 100%\n  );\n  border-color: rgba(168, 85, 247, 0.22);\n  box-shadow:\n    inset 0 1px 0 rgba(255, 255, 255, 0.06),\n    0 0 0 1px rgba(168, 85, 247, 0.12);\n}",
            ".nav-item.active {\n  background: linear-gradient(\n    95deg,\n    rgba(245, 197, 66, 0.14) 0%,\n    rgba(109, 74, 255, 0.08) 55%,\n    rgba(166, 58, 136, 0.05) 100%\n  );\n  border-color: rgba(245, 197, 66, 0.22);\n  box-shadow:\n    inset 0 1px 0 rgba(255, 255, 255, 0.06),\n    var(--shadow-gold);\n}",
        ),
        (
            ".nav-item.active svg {\n  color: var(--accent-cyan);\n}",
            ".nav-item.active svg {\n  color: var(--accent-gold);\n}",
        ),
        (
            ".home-atmosphere-orb--cyan {",
            ".home-atmosphere-orb--gold {",
        ),
        (
            "  background: radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, transparent 70%);",
            "  background: radial-gradient(circle, rgba(255, 186, 61, 0.24) 0%, transparent 70%);",
        ),
        (
            ".hero-atmosphere-glow--cyan {",
            ".hero-atmosphere-glow--gold {",
        ),
        (
            "  background: radial-gradient(circle, rgba(56, 189, 248, 0.24) 0%, transparent 70%);",
            "  background: radial-gradient(circle, rgba(245, 197, 66, 0.26) 0%, transparent 70%);",
        ),
        (
            "    radial-gradient(ellipse 90% 54% at 88% 4%, rgba(14, 165, 233, 0.08), transparent 62%),",
            "    radial-gradient(ellipse 90% 54% at 88% 4%, rgba(166, 58, 136, 0.1), transparent 62%),",
        ),
        (
            "    radial-gradient(ellipse 70% 42% at 100% 18%, rgba(56, 189, 248, 0.06), transparent 68%);",
            "    radial-gradient(ellipse 70% 42% at 100% 18%, rgba(255, 186, 61, 0.07), transparent 68%);",
        ),
    ]

    for old, new in replacements:
        if old not in css:
            print(f"WARN: CSS block not found: {old[:60]}...")
        else:
            css = css.replace(old, new)

    shell_patch = """/* —— Phase 41C: PSD shell + home chrome —— */
.main-scroll--home {
  padding-top: clamp(16px, 2.2vw, 22px);
  padding-inline: clamp(16px, 2.4vw, 28px);
}

.home-top-bar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(14px, 2vw, 22px);
  margin-bottom: clamp(18px, 2.6vw, 26px);
  padding: 10px 14px;
  border-radius: calc(var(--radius-lg) + 2px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  background:
    linear-gradient(180deg, rgba(23, 23, 36, 0.72), rgba(13, 13, 20, 0.86));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 12px 28px rgba(0, 0, 0, 0.18);
}

.home-top-search {
  flex: 1;
  min-width: 0;
  max-width: min(520px, 58vw);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(5, 5, 9, 0.55);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.home-top-search:focus-within {
  border-color: rgba(245, 197, 66, 0.28);
  box-shadow: 0 0 0 3px rgba(245, 197, 66, 0.08);
}

.home-top-search .search-icon {
  color: rgba(245, 197, 66, 0.72);
  flex-shrink: 0;
}

.home-top-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 14px;
  outline: none;
}

.home-top-search input::placeholder {
  color: var(--text-muted);
}

.home-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.home-top-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(245, 243, 250, 0.72);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.home-top-icon-btn:hover {
  color: var(--text-primary);
  border-color: rgba(245, 197, 66, 0.22);
  background: rgba(245, 197, 66, 0.08);
}

.home-top-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(245, 197, 66, 0.28);
  background: linear-gradient(135deg, rgba(109, 74, 255, 0.35), rgba(166, 58, 136, 0.28));
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 4px 14px rgba(109, 74, 255, 0.22);
}

.main-scroll--home .catalog-stale-banner {
  margin-bottom: 12px;
  padding: 8px 12px;
  font-size: 12px;
  opacity: 0.88;
}

#root:has(.page-view[data-page="home"][data-view="page"]) .player-bar {
  visibility: hidden;
  pointer-events: none;
  height: 0;
  min-height: 0;
  padding: 0;
  border: none;
  overflow: hidden;
}

.app-shell {
  background:
    radial-gradient(ellipse 72% 48% at 54% -10%, rgba(109, 74, 255, 0.09), transparent 64%),
    radial-gradient(ellipse 52% 42% at 100% 32%, rgba(166, 58, 136, 0.06), transparent 62%),
    radial-gradient(ellipse 48% 38% at 8% 88%, rgba(255, 186, 61, 0.04), transparent 58%),
    linear-gradient(180deg, var(--psd-bg-base) 0%, var(--psd-bg-deep) 100%);
}

.main-scroll {
  background:
    radial-gradient(ellipse 88% 52% at 48% -8%, rgba(109, 74, 255, 0.05), transparent 64%),
    radial-gradient(ellipse 56% 42% at 100% 24%, rgba(166, 58, 136, 0.04), transparent 58%),
    radial-gradient(ellipse 42% 36% at 4% 80%, rgba(255, 186, 61, 0.035), transparent 56%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.012), transparent 34%);
}

.nav-item.active::before {
  background: linear-gradient(180deg, var(--accent-gold-bright), var(--accent-gold-deep));
  box-shadow: 0 0 10px rgba(245, 197, 66, 0.35);
}

.nav-item.active svg {
  color: var(--accent-gold-bright);
}

.page-eyebrow {
  color: var(--accent-gold);
}

.sidebar {
  background:
    radial-gradient(ellipse 90% 44% at 20% 0%, rgba(109, 74, 255, 0.1), transparent 68%),
    radial-gradient(ellipse 60% 36% at 80% 100%, rgba(255, 186, 61, 0.05), transparent 62%),
    var(--gradient-sidebar);
  box-shadow:
    inset -1px 0 0 rgba(245, 197, 66, 0.04),
    10px 0 30px rgba(0, 0, 0, 0.14);
}

.main-area {
  background:
    radial-gradient(ellipse 72% 52% at 42% -8%, rgba(109, 74, 255, 0.075), transparent 64%),
    radial-gradient(ellipse 54% 44% at 100% 32%, rgba(166, 58, 136, 0.05), transparent 60%),
    radial-gradient(ellipse 64% 48% at 4% 96%, rgba(255, 186, 61, 0.035), transparent 58%),
    linear-gradient(180deg, rgba(13, 13, 20, 0.98) 0%, var(--psd-bg-deep) 100%);
}

.main-scroll:has(.page-view[data-page="home"]) {
  background:
    radial-gradient(ellipse 92% 58% at 50% -4%, rgba(109, 74, 255, 0.08), transparent 64%),
    radial-gradient(ellipse 68% 48% at 100% 28%, rgba(166, 58, 136, 0.05), transparent 58%),
    radial-gradient(ellipse 55% 42% at 0% 72%, rgba(255, 186, 61, 0.04), transparent 52%);
}

.page-view[data-page="home"] .hero-eyebrow,
.hero--cinematic .hero-eyebrow {
  color: rgba(245, 197, 66, 0.88);
}

.page-view[data-page="home"] .page-eyebrow,
.page-view[data-page="home"] .emotional-lanes-eyebrow,
.page-view[data-page="home"] .scene-listening-eyebrow,
.page-view[data-page="home"] .radio-foundation-eyebrow {
  color: rgba(245, 197, 66, 0.78);
}

.page-view[data-page="home"] .hero::after {
  background: linear-gradient(
    118deg,
    rgba(109, 74, 255, 0.07) 0%,
    transparent 46%,
    rgba(255, 186, 61, 0.05) 100%
  );
}

.page-view[data-page="home"] .hero .visual-scene__shape--b {
  background: var(--vs-shape-b, rgba(166, 58, 136, 0.18));
}

"""

    marker = "/* —— Atmospheric home rebuild (Phase 41A) —— */"
    if marker not in css:
        raise SystemExit("Phase 41A marker not found")
    css = css.replace(marker, shell_patch + marker)

    css_path.write_text(css, encoding="utf-8")
    print("App.css patched")


def main() -> None:
    patch_app_tsx()
    patch_app_css()


if __name__ == "__main__":
    main()
