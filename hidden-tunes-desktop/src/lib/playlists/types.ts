/** Versioned desktop user playlists — separate from Library / Downloads / History. */

export const PLAYLISTS_STORAGE_KEY = 'ht-desktop:playlists:v1'
export const PLAYLISTS_SCHEMA_VERSION = 1

export const PLAYLIST_ITEM_TYPES = [
  'song',
  'podcast_episode',
  'motivational',
  'lecture',
  'audiobook_chapter',
] as const

export type PlaylistItemType = (typeof PLAYLIST_ITEM_TYPES)[number]

export type DesktopPlaylistItemBase = {
  id: string
  type: PlaylistItemType
  title: string
  addedAt: string
  subtitle?: string | null
  artwork?: string | null
  duration?: number | null
  /** Parent show / book / program / series id when relevant. */
  parentId?: string | null
  metadata?: Record<string, unknown> | null
}

export type DesktopPlaylistSongItem = DesktopPlaylistItemBase & {
  type: 'song'
  artist?: string | null
  album?: string | null
}

export type DesktopPlaylistPodcastEpisodeItem = DesktopPlaylistItemBase & {
  type: 'podcast_episode'
  showId?: string | null
  showTitle?: string | null
}

export type DesktopPlaylistMotivationalItem = DesktopPlaylistItemBase & {
  type: 'motivational'
  programId?: string | null
}

export type DesktopPlaylistLectureItem = DesktopPlaylistItemBase & {
  type: 'lecture'
  seriesId?: string | null
}

export type DesktopPlaylistAudiobookChapterItem = DesktopPlaylistItemBase & {
  type: 'audiobook_chapter'
  bookId?: string | null
  chapterId?: string | null
  bookTitle?: string | null
}

export type DesktopPlaylistItem =
  | DesktopPlaylistSongItem
  | DesktopPlaylistPodcastEpisodeItem
  | DesktopPlaylistMotivationalItem
  | DesktopPlaylistLectureItem
  | DesktopPlaylistAudiobookChapterItem

export type DesktopPlaylist = {
  id: string
  title: string
  description?: string | null
  createdAt: string
  updatedAt: string
  items: DesktopPlaylistItem[]
}

export type PlaylistsStoreV1 = {
  version: typeof PLAYLISTS_SCHEMA_VERSION
  updatedAt: string
  playlists: DesktopPlaylist[]
}

export function playlistItemIdentity(type: PlaylistItemType, id: string) {
  return `${type}:${id.trim()}`
}

export function playlistItemKey(item: Pick<DesktopPlaylistItem, 'type' | 'id'>) {
  return playlistItemIdentity(item.type, item.id)
}

export function isPlaylistItemType(value: unknown): value is PlaylistItemType {
  return typeof value === 'string' && (PLAYLIST_ITEM_TYPES as readonly string[]).includes(value)
}
