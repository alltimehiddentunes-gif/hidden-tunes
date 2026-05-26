import { useState, type ReactNode } from 'react'
import './App.css'

type PageId =
  | 'home'
  | 'discover'
  | 'mood'
  | 'library'
  | 'artists'
  | 'albums'
  | 'playlists'
  | 'tv'
  | 'settings'

type NavItem = {
  id: PageId
  label: string
  icon: ReactNode
}

type Mood = 'violet' | 'cyan' | 'rose' | 'mint'

type DiscoveryCard = {
  title: string
  subtitle: string
  mood: Mood
}

type DiscoverySection = {
  title: string
  hint: string
  cards: DiscoveryCard[]
}

const MAIN_NAV: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
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

const SETTINGS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

const HOME_SECTIONS: DiscoverySection[] = [
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

const DISCOVER_CHIPS = [
  'All moods',
  'Euphoric',
  'Melancholy',
  'Cinematic',
  'Hypnotic',
  'Uplift',
  'Afterglow',
]

const MOOD_ROOMS = [
  { title: 'Velvet Midnight', subtitle: 'Slow burn · intimate', listeners: '2.4k', mood: 'violet' as Mood },
  { title: 'Oceanic Calm', subtitle: 'Breath & space', listeners: '1.8k', mood: 'cyan' as Mood },
  { title: 'Rose Neon', subtitle: 'Passion pulse', listeners: '3.1k', mood: 'rose' as Mood },
  { title: 'Forest Echo', subtitle: 'Organic drift', listeners: '920', mood: 'mint' as Mood },
  { title: 'Chrome Dreams', subtitle: 'Futurist glide', listeners: '1.2k', mood: 'cyan' as Mood },
  { title: 'Ember Heart', subtitle: 'Warm ache', listeners: '2.0k', mood: 'rose' as Mood },
]

const LIBRARY_ITEMS = [
  { title: 'Ethereal Horizon', meta: 'Luna Veil · Liked 2 days ago', mood: 'violet' as Mood },
  { title: 'Glass Cathedral', meta: 'Noir Ensemble · Added yesterday', mood: 'cyan' as Mood },
  { title: 'Slow Bloom', meta: 'Aria North · Downloaded', mood: 'rose' as Mood },
  { title: 'Phantom Waltz', meta: 'The Dusk Line · Recent play', mood: 'mint' as Mood },
  { title: 'Satellite Prayer', meta: 'Orbit Kids · Liked last week', mood: 'violet' as Mood },
]

const ARTISTS = [
  'Luna Veil',
  'Noir Ensemble',
  'Aria North',
  'The Dusk Line',
  'Orbit Kids',
  'Mistral Keys',
  'Vanta Bloom',
  'Echo Saint',
]

const PLAYLISTS = [
  { title: 'Emotional Apex', tracks: '42 tracks', mood: 'violet' as Mood },
  { title: 'Neon Aftercare', tracks: '28 tracks', mood: 'cyan' as Mood },
  { title: 'Soft Collapse', tracks: '19 tracks', mood: 'rose' as Mood },
  { title: 'Deep Focus Drift', tracks: '56 tracks', mood: 'mint' as Mood },
  { title: 'Cinematic Dust', tracks: '31 tracks', mood: 'violet' as Mood },
]

const TV_SHOWS = [
  { title: 'Live from the Mood Room', subtitle: 'Session 07 · Violet hour', mood: 'violet' as Mood },
  { title: 'Artist Residency', subtitle: 'Luna Veil · Behind the feeling', mood: 'rose' as Mood },
  { title: 'Visual Album Night', subtitle: 'Noir Ensemble · Full film', mood: 'cyan' as Mood },
  { title: 'Hidden Sessions', subtitle: 'Exclusive desktop premiere', mood: 'mint' as Mood },
]

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="content-inner">{children}</div>
}

function PreviewBanner({ text }: { text: string }) {
  return (
    <div className="preview-banner" role="status">
      <span className="preview-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

function PlaceholderNote({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="placeholder-note">
      <div className="placeholder-shimmer" aria-hidden="true" />
      <div className="placeholder-copy">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
    </header>
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
          <article key={card.title} className="discovery-card" data-mood={card.mood}>
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

function Sidebar({
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
}

function Hero() {
  return (
    <section className="hero" aria-label="Featured">
      <div className="hero-bg" />
      <div className="hero-glow" />
      <div className="hero-vignette" aria-hidden="true" />
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
          <div className="hero-artwork-ring" />
          <MusicNoteIcon className="artwork-placeholder" />
        </div>
      </div>
    </section>
  )
}

function HomePage() {
  return (
    <PageFrame>
      <Hero />
      {HOME_SECTIONS.map((section) => (
        <DiscoveryGrid key={section.title} section={section} />
      ))}
    </PageFrame>
  )
}

function DiscoverPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Explore"
        title="Discover"
        description="Map your emotional landscape — browse genres, moods, and curated waves built for cinematic listening."
      />
      <div className="discover-toolbar">
        <div className="search-bar search-bar--premium" role="search">
          <span className="search-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input type="search" placeholder="Search moods, artists, stories…" readOnly aria-label="Search" />
          <kbd className="search-kbd" aria-hidden="true">⌘K</kbd>
        </div>
        <p className="toolbar-hint">Visual search · connects when catalog is wired</p>
      </div>
      <div className="chip-row" role="list" aria-label="Mood filters">
        {DISCOVER_CHIPS.map((chip, i) => (
          <button key={chip} type="button" className={`chip${i === 0 ? ' active' : ''}`} role="listitem">
            {chip}
          </button>
        ))}
      </div>
      <DiscoveryGrid
        section={{
          title: 'Fresh Signals',
          hint: 'Updated hourly',
          cards: [
            { title: 'Pulse Theory', subtitle: 'Forward motion', mood: 'cyan' },
            { title: 'Halo Fracture', subtitle: 'Broken beauty', mood: 'rose' },
            { title: 'Astral Quiet', subtitle: 'Weightless focus', mood: 'mint' },
            { title: 'Violet Circuit', subtitle: 'Neon soul', mood: 'violet' },
          ],
        }}
      />
      <DiscoveryGrid
        section={{
          title: 'Deep Discovery',
          hint: 'For adventurous ears',
          cards: [
            { title: 'Subsonic Bloom', subtitle: 'Low-end poetry', mood: 'violet' },
            { title: 'Tidal Memory', subtitle: 'Nostalgic drift', mood: 'cyan' },
            { title: 'Glass Tears', subtitle: 'Fragile highs', mood: 'rose' },
          ],
        }}
      />
    </PageFrame>
  )
}

function MoodRoomsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Atmosphere"
        title="Mood Rooms"
        description="Step into shared emotional spaces — ambient rooms tuned for how you feel, with others listening in sync."
      />
      <PreviewBanner text="Rooms are UI previews — live sync arrives in a future release" />
      <div className="mood-room-grid">
        {MOOD_ROOMS.map((room, index) => (
          <article key={room.title} className="mood-room-card" data-mood={room.mood}>
            <div className="mood-room-top">
              <span className="mood-room-index">0{index + 1}</span>
              <span className="live-pill">
                <span className="live-dot" aria-hidden="true" />
                Live
              </span>
            </div>
            <div className="mood-room-body">
              <div className="mood-room-icon-wrap">
                <MusicNoteIcon className="card-art-icon" />
              </div>
              <h3>{room.title}</h3>
              <p>{room.subtitle}</p>
              <span className="mood-listeners">{room.listeners} listening</span>
              <button type="button" className="btn-secondary btn-sm">
                Enter room
              </button>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function LibraryPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Your collection"
        title="Library"
        description="Everything you have saved, downloaded, and replayed — organized for emotional recall."
      />
      <div className="tab-row" role="tablist" aria-label="Library filters">
        <button type="button" className="tab active" role="tab" aria-selected="true">
          All
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Liked
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Downloaded
        </button>
        <button type="button" className="tab" role="tab" aria-selected="false">
          Recent
        </button>
      </div>
      <ul className="media-list">
        {LIBRARY_ITEMS.map((item, index) => (
          <li key={item.title}>
            <button type="button" className="media-row">
              <span className="media-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="media-art" data-mood={item.mood} aria-hidden="true">
                <MusicNoteIcon className="card-art-icon" />
              </span>
              <span className="media-copy">
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </span>
              <span className="media-duration">3:42</span>
            </button>
          </li>
        ))}
      </ul>
      <PlaceholderNote
        title="More from your library"
        detail="Additional saves and offline items will appear here once your account is connected."
      />
    </PageFrame>
  )
}

function ArtistsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Creators"
        title="Artists"
        description="Follow the voices shaping your emotional soundtrack — premium profiles coming soon."
      />
      <div className="artist-grid">
        {ARTISTS.map((name) => (
          <button key={name} type="button" className="artist-card">
            <span className="artist-avatar" aria-hidden="true">
              {name.charAt(0)}
            </span>
            <span className="artist-name">{name}</span>
            <span className="artist-meta">Artist</span>
          </button>
        ))}
      </div>
      <PlaceholderNote
        title="Expanded artist pages"
        detail="Bios, tours, and emotional tags will layer in without leaving the desktop shell."
      />
    </PageFrame>
  )
}

function AlbumsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Full journeys"
        title="Albums"
        description="Immersive records designed for uninterrupted emotional arcs."
      />
      <DiscoveryGrid
        section={{
          title: 'New Arrivals',
          hint: 'This week',
          cards: [
            { title: 'Chromatic Sleep', subtitle: 'Luna Veil', mood: 'violet' },
            { title: 'Parallel Hearts', subtitle: 'Noir Ensemble', mood: 'cyan' },
            { title: 'Paper Sun', subtitle: 'Aria North', mood: 'rose' },
            { title: 'Mineral Light', subtitle: 'The Dusk Line', mood: 'mint' },
            { title: 'Orbit Songs', subtitle: 'Orbit Kids', mood: 'violet' },
          ],
        }}
      />
    </PageFrame>
  )
}

function PlaylistsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Curated paths"
        title="Playlists"
        description="Hand-built emotional sequences — yours and ours, woven for every chapter of your day."
      />
      <div className="playlist-grid">
        {PLAYLISTS.map((playlist) => (
          <article key={playlist.title} className="playlist-card" data-mood={playlist.mood}>
            <div className="playlist-art">
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{playlist.title}</h3>
              <p>{playlist.tracks}</p>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function TvPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Visual stories"
        title="Hidden Tunes TV"
        description="Cinematic sessions, residencies, and visual albums — the moving image of emotion."
      />
      <section className="tv-featured" aria-label="Featured broadcast">
        <div className="tv-featured-bg" />
        <div className="tv-featured-inner">
          <p className="hero-eyebrow">Now premiering</p>
          <h2>Mood Room Live — Violet Hour</h2>
          <p className="page-description">An immersive 48-minute session · UI preview only</p>
          <button type="button" className="btn-primary">
            Watch preview
          </button>
        </div>
      </section>
      <div className="card-row">
        {TV_SHOWS.map((show) => (
          <article key={show.title} className="discovery-card tv-card" data-mood={show.mood}>
            <div className="card-art tv-card-art">
              <svg className="play-badge" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            </div>
            <div className="card-info">
              <h3>{show.title}</h3>
              <p>{show.subtitle}</p>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function SettingsPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Tune your desktop sanctuary — appearance, playback, and account options (UI placeholders)."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className="settings-nav-item active">
            General
          </button>
          <button type="button" className="settings-nav-item">
            Appearance
          </button>
          <button type="button" className="settings-nav-item">
            Playback
          </button>
          <button type="button" className="settings-nav-item">
            Account
          </button>
        </nav>
        <div className="settings-panels">
          <section className="settings-panel">
            <h2>Appearance</h2>
            <p className="settings-panel-desc">Control how Hidden Tunes feels on desktop.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Cinematic dark theme</span>
                <small>Optimized for low-light listening</small>
              </div>
              <span className="settings-badge">Active</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Accent glow intensity</span>
                <small>Subtle highlights on cards & nav</small>
              </div>
              <div className="settings-slider" aria-hidden="true">
                <div className="settings-slider-fill" style={{ width: '70%' }} />
              </div>
            </div>
          </section>
          <section className="settings-panel">
            <h2>Playback</h2>
            <p className="settings-panel-desc">Playback controls are visual-only in this build.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Crossfade between tracks</span>
                <small>Seamless emotional transitions</small>
              </div>
              <span className="settings-muted">Off · preview</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Normalize loudness</span>
                <small>Balanced volume across catalog</small>
              </div>
              <span className="settings-muted">Coming soon</span>
            </div>
          </section>
          <section className="settings-panel settings-panel--wide">
            <h2>Account</h2>
            <p className="settings-panel-desc">Sign in when API wiring is enabled.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Sign in to Hidden Tunes</span>
                <small>Sync library across devices</small>
              </div>
              <button type="button" className="btn-secondary btn-sm">
                Connect
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Desktop app version</span>
                <small>Hidden Tunes Desktop shell</small>
              </div>
              <span className="settings-muted">0.0.1</span>
            </div>
          </section>
        </div>
      </div>
    </PageFrame>
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

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'home':
      return <HomePage />
    case 'discover':
      return <DiscoverPage />
    case 'mood':
      return <MoodRoomsPage />
    case 'library':
      return <LibraryPage />
    case 'artists':
      return <ArtistsPage />
    case 'albums':
      return <AlbumsPage />
    case 'playlists':
      return <PlaylistsPage />
    case 'tv':
      return <TvPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <HomePage />
  }
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('home')

  return (
    <>
      <div className="app-shell">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <div className="main-area">
          <main className="main-scroll">
            <div key={activePage} className="page-view">
              <PageContent page={activePage} />
            </div>
          </main>
        </div>
      </div>
      <PlayerBar />
    </>
  )
}

export default App
