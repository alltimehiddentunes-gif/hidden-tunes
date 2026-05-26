import type { ReactNode } from 'react'
import './App.css'

type NavItem = {
  id: string
  label: string
  active?: boolean
  icon: ReactNode
}

type DiscoveryCard = {
  title: string
  subtitle: string
  mood: 'violet' | 'cyan' | 'rose' | 'mint'
}

type DiscoverySection = {
  title: string
  hint: string
  cards: DiscoveryCard[]
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    active: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    id: 'mood',
    label: 'Mood Rooms',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3a6 6 0 016 6c0 4-3 6-6 12-3-6-6-8-6-12a6 6 0 016-6z" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V5h4l2 14 4-14h4v14" />
      </svg>
    ),
  },
  {
    id: 'artists',
    label: 'Artists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    id: 'albums',
    label: 'Albums',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'playlists',
    label: 'Playlists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    id: 'tv',
    label: 'Hidden Tunes TV',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M10 9l6 4-6 4V9z" />
      </svg>
    ),
  },
]

const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    title: 'Trending Now',
    hint: 'Curated for the moment',
    cards: [
      { title: 'Neon Pulse', subtitle: 'Electric emotions', mood: 'violet' },
      { title: 'Midnight Drive', subtitle: 'Late-night energy', mood: 'cyan' },
      { title: 'Velvet Sky', subtitle: 'Dreamy atmospheres', mood: 'rose' },
      { title: 'Crystal Echo', subtitle: 'Shimmering highs', mood: 'mint' },
      { title: 'Deep Current', subtitle: 'Submerged bass', mood: 'cyan' },
    ],
  },
  {
    title: 'Emotional Picks',
    hint: 'Feel something real',
    cards: [
      { title: 'Soft Collapse', subtitle: 'Intimate & raw', mood: 'rose' },
      { title: 'Golden Hour', subtitle: 'Warm nostalgia', mood: 'violet' },
      { title: 'Silent Storm', subtitle: 'Power in restraint', mood: 'mint' },
      { title: 'Fading Light', subtitle: 'Bittersweet closure', mood: 'violet' },
    ],
  },
  {
    title: 'Night Vibes',
    hint: 'After dark selections',
    cards: [
      { title: 'Lunar Drift', subtitle: 'Weightless nights', mood: 'cyan' },
      { title: 'Smoke & Mirrors', subtitle: 'Mysterious grooves', mood: 'violet' },
      { title: 'City Glow', subtitle: 'Urban nocturne', mood: 'rose' },
      { title: '3AM Frequency', subtitle: 'Insomniac anthems', mood: 'mint' },
    ],
  },
  {
    title: 'Focus Mode',
    hint: 'Clarity without distraction',
    cards: [
      { title: 'Deep Work', subtitle: 'Minimal & steady', mood: 'mint' },
      { title: 'Flow State', subtitle: 'Rhythmic precision', mood: 'cyan' },
      { title: 'Quiet Mind', subtitle: 'Ambient clarity', mood: 'violet' },
      { title: 'Monk Mode', subtitle: 'Zero friction', mood: 'mint' },
    ],
  },
]

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}

function Sidebar() {
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${item.active ? ' active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}

function Hero() {
  return (
    <section className="hero" aria-label="Featured">
      <div className="hero-bg" />
      <div className="hero-glow" />
      <div className="hero-glow-2" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow">Emotional streaming · Desktop</p>
          <h1>Hidden Tunes</h1>
          <p className="hero-tagline">
            A cinematic sanctuary for music that moves you — discover moods, rooms,
            and stories crafted for how you feel right now.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-primary">
              Explore
            </button>
            <button type="button" className="btn-secondary">
              Continue Listening
            </button>
          </div>
        </div>
        <div className="hero-artwork" aria-hidden="true">
          <MusicNoteIcon className="artwork-placeholder" />
        </div>
      </div>
    </section>
  )
}

function DiscoveryGrid({ section }: { section: DiscoverySection }) {
  return (
    <section className="discovery-section" aria-labelledby={`section-${section.title}`}>
      <div className="section-header">
        <h2 id={`section-${section.title}`}>{section.title}</h2>
        <span>{section.hint}</span>
      </div>
      <div className="card-row">
        {section.cards.map((card) => (
          <article
            key={card.title}
            className="discovery-card"
            data-mood={card.mood}
          >
            <div className="card-art">
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PlayerBar() {
  return (
    <footer className="player-bar" aria-label="Player">
      <div className="player-track">
        <div className="player-artwork" aria-hidden="true" />
        <div className="player-meta">
          <h4>Ethereal Horizon</h4>
          <p>Luna Veil</p>
        </div>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button type="button" className="control-btn" aria-label="Previous track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button type="button" className="control-btn play" aria-label="Play">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          </button>
          <button type="button" className="control-btn" aria-label="Next track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
            </svg>
          </button>
        </div>
        <div className="progress-wrap">
          <span className="progress-time">1:24</span>
          <div className="progress-track" role="progressbar" aria-valuenow={38} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" />
          </div>
          <span className="progress-time">3:42</span>
        </div>
      </div>

      <div className="player-volume">
        <button type="button" className="control-btn" aria-label="Volume">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
          </svg>
        </button>
        <div className="volume-slider" aria-hidden="true">
          <div className="volume-fill" />
        </div>
      </div>
    </footer>
  )
}

function App() {
  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <main className="main-scroll">
            <Hero />
            {DISCOVERY_SECTIONS.map((section) => (
              <DiscoveryGrid key={section.title} section={section} />
            ))}
          </main>
        </div>
      </div>
      <PlayerBar />
    </>
  )
}

export default App
