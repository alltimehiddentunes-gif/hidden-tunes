import { memo } from 'react'
import type { ApiAlbum, ApiArtist, ApiSong } from '../../lib/api'
import type { CatalogIndexes } from '../../lib/catalogIndexes'
import type { QueueContext, QueueSeedMetadata } from '../../lib/desktopPlayback/types'
import type { MusicSectionId } from '../../lib/music/types'
import { MusicDiscoverPage } from './MusicDiscoverPage'
import { MusicSectionContent } from './MusicSectionContent'
import { MusicSubNav } from './MusicSubNav'

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

type MusicWorkspaceProps = {
  musicSection: MusicSectionId
  onMusicSectionChange: (section: MusicSectionId) => void
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  error: string | null
  retry: () => void
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onBrowseSearch: (query: string) => void
  onOpenSettings: () => void
}

export const MusicWorkspace = memo(function MusicWorkspace({
  musicSection,
  onMusicSectionChange,
  songs,
  albums,
  artists,
  indexes,
  showCatalogSkeleton,
  showCatalogError,
  error,
  retry,
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onBrowseSearch,
  onOpenSettings,
}: MusicWorkspaceProps) {
  return (
    <div className="music-workspace">
      <MusicSubNav
        activeSection={musicSection}
        onSectionChange={onMusicSectionChange}
        onOpenSettings={onOpenSettings}
        showDownloads={false}
      />
      <div className="music-workspace-content">
        {musicSection === 'discover' ? (
          <MusicDiscoverPage
            songs={songs}
            albums={albums}
            artists={artists}
            indexes={indexes}
            showCatalogSkeleton={showCatalogSkeleton}
            showCatalogError={showCatalogError}
            error={error}
            retry={retry}
            onOpenSong={onOpenSong}
            onOpenArtist={onOpenArtist}
            onOpenAlbum={onOpenAlbum}
            onSectionChange={onMusicSectionChange}
            onBrowseSearch={onBrowseSearch}
            onNavigateLiked={() => onMusicSectionChange('liked')}
            onNavigatePlaylists={() => onMusicSectionChange('playlists')}
          />
        ) : (
          <MusicSectionContent
            section={musicSection}
            songs={songs}
            albums={albums}
            artists={artists}
            indexes={indexes}
            onOpenSong={onOpenSong}
            onOpenArtist={onOpenArtist}
            onOpenAlbum={onOpenAlbum}
            onBrowseSearch={onBrowseSearch}
          />
        )}
      </div>
    </div>
  )
})
