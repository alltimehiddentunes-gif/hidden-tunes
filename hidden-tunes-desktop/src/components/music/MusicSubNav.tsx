import { memo, type ReactNode } from 'react'
import type { MusicSectionId } from '../../lib/music/types'

type MusicSubNavProps = {
  activeSection: MusicSectionId
  onSectionChange: (section: MusicSectionId) => void
  onOpenSettings: () => void
  showDownloads: boolean
}

const MUSIC_DISCOVERY_ITEMS: Array<{ id: MusicSectionId; label: string }> = [
  { id: 'discover', label: 'Discover' },
  { id: 'new-releases', label: 'New Releases' },
  { id: 'top-charts', label: 'Top Charts' },
  { id: 'genres-moods', label: 'Genres & Moods' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
  { id: 'liked', label: 'Liked Songs' },
]

const MUSIC_LIBRARY_ITEMS: Array<{ id: MusicSectionId; label: string }> = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'recent', label: 'Recently Played' },
  { id: 'downloads', label: 'Downloads' },
]

function MusicSubNavIcon({ children }: { children: ReactNode }) {
  return <span className="music-sub-nav-icon" aria-hidden="true">{children}</span>
}

function sectionIcon(id: MusicSectionId) {
  switch (id) {
    case 'discover':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'new-releases':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'top-charts':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 18V8M10 18V4M16 18v-6M22 18V10" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'genres-moods':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 14c2-4 4-6 8-6s6 2 8 6" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'artists':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'albums':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'songs':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'liked':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20.5l-1.1-1C6.5 15.4 4 13.1 4 10.2 4 7.8 5.8 6 8.2 6c1.4 0 2.7.7 3.8 1.8L12 8.8l.2-.2C13.3 6.7 14.6 6 16 6c2.4 0 4.2 1.8 4.2 4.2 0 2.9-2.5 5.2-6.9 9.3L12 20.5z" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'playlists':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'recent':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v5l3 2" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'downloads':
      return (
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 4v10M8 10l4 4 4-4" />
            <path d="M5 18h14" />
          </svg>
        </MusicSubNavIcon>
      )
    default:
      return null
  }
}

export const MusicSubNav = memo(function MusicSubNav({
  activeSection,
  onSectionChange,
  onOpenSettings,
  showDownloads,
}: MusicSubNavProps) {
  const libraryItems = MUSIC_LIBRARY_ITEMS.filter((item) => item.id !== 'downloads' || showDownloads)

  return (
    <aside className="music-sub-nav" aria-label="Music navigation">
      <nav className="music-sub-nav-groups">
        <div className="music-sub-nav-group">
          <span className="music-sub-nav-label">Music</span>
          {MUSIC_DISCOVERY_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`music-sub-nav-item${activeSection === item.id ? ' is-active' : ''}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => onSectionChange(item.id)}
            >
              {sectionIcon(item.id)}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="music-sub-nav-group">
          <span className="music-sub-nav-label">Your Library</span>
          {libraryItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`music-sub-nav-item${activeSection === item.id ? ' is-active' : ''}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => onSectionChange(item.id)}
            >
              {sectionIcon(item.id)}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <button type="button" className="music-sub-nav-settings" onClick={onOpenSettings}>
        <MusicSubNavIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </MusicSubNavIcon>
        <span>Settings</span>
      </button>
    </aside>
  )
})
