import { memo, type ReactNode } from 'react'
import type { MusicSectionId } from '../../lib/music/types'

type MusicSubNavProps = {
  activeSection: MusicSectionId
  onSectionChange: (section: MusicSectionId) => void
  onOpenSettings: () => void
  showDownloads: boolean
}

/** Primary Music destinations — keep the tab strip short and scannable. */
const MUSIC_PRIMARY_TABS: Array<{ id: MusicSectionId; label: string }> = [
  { id: 'discover', label: 'Discover' },
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'genres-moods', label: 'Genres' },
  { id: 'playlists', label: 'Playlists' },
]

const PRIMARY_IDS = new Set(MUSIC_PRIMARY_TABS.map((tab) => tab.id))

function MusicSubNavIcon({ children }: { children: ReactNode }) {
  return <span className="music-sub-nav-icon" aria-hidden="true">{children}</span>
}

function sectionIcon(id: MusicSectionId) {
  switch (id) {
    case 'discover':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'songs':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'albums':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'artists':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'genres-moods':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 14c2-4 4-6 8-6s6 2 8 6" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </MusicSubNavIcon>
      )
    case 'playlists':
      return (
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
        </MusicSubNavIcon>
      )
    default:
      return null
  }
}

/** Map drill-down sections (New Releases, Charts, Liked, Recent) onto Discover tab highlight. */
function resolveHighlightedTab(section: MusicSectionId): MusicSectionId {
  if (PRIMARY_IDS.has(section)) return section
  return 'discover'
}

export const MusicSubNav = memo(function MusicSubNav({
  activeSection,
  onSectionChange,
  onOpenSettings,
  showDownloads: _showDownloads,
}: MusicSubNavProps) {
  void _showDownloads
  const highlighted = resolveHighlightedTab(activeSection)

  return (
    <div className="music-tab-bar music-sub-nav" aria-label="Music categories">
      <nav className="music-tab-bar-scroll music-sub-nav-groups" role="tablist">
        {MUSIC_PRIMARY_TABS.map((item) => {
          const selected = highlighted === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`music-tab music-sub-nav-item${selected ? ' is-active' : ''}`}
              aria-selected={selected}
              onClick={() => onSectionChange(item.id)}
            >
              {sectionIcon(item.id)}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <button type="button" className="music-tab-settings" onClick={onOpenSettings} aria-label="Settings">
        <MusicSubNavIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </MusicSubNavIcon>
      </button>
    </div>
  )
})
