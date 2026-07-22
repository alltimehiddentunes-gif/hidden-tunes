/** Discriminator for desktop Library favorites. Stored `type` is authoritative. */
export const DESKTOP_LIBRARY_ITEM_TYPES = [
  'song',
  'radio',
  'podcast_show',
  'podcast_episode',
  'audiobook',
  'tv',
  'motivational',
  'lecture',
  'sports',
  'legacy_unknown',
] as const

export type DesktopLibraryItemType = (typeof DESKTOP_LIBRARY_ITEM_TYPES)[number]

export type DesktopLibraryItemBase = {
  id: string
  type: DesktopLibraryItemType
  title: string
  addedAt: string
  subtitle?: string | null
  artwork?: string | null
  source?: string | null
  category?: string | null
  duration?: number | null
  metadata?: Record<string, unknown> | null
}

export type DesktopSongLibraryItem = DesktopLibraryItemBase & {
  type: 'song'
  artist?: string | null
  album?: string | null
}

export type DesktopRadioLibraryItem = DesktopLibraryItemBase & {
  type: 'radio'
  country?: string | null
  playId?: string | null
  isMature?: boolean
  contentRating?: string | null
  /** Never store a temporary relay URL as identity; optional cache only. */
  streamUrl?: never
}

export type DesktopPodcastShowLibraryItem = DesktopLibraryItemBase & {
  type: 'podcast_show'
  showTitle?: string | null
  hostName?: string | null
}

export type DesktopPodcastEpisodeLibraryItem = DesktopLibraryItemBase & {
  type: 'podcast_episode'
  showId?: string | null
  showTitle?: string | null
  playId?: string | null
}

export type DesktopAudiobookLibraryItem = DesktopLibraryItemBase & {
  type: 'audiobook'
  author?: string | null
  narrator?: string | null
}

export type DesktopTvLibraryItem = DesktopLibraryItemBase & {
  type: 'tv'
  channelName?: string | null
}

export type DesktopMotivationalLibraryItem = DesktopLibraryItemBase & {
  type: 'motivational'
  speaker?: string | null
}

export type DesktopLectureLibraryItem = DesktopLibraryItemBase & {
  type: 'lecture'
  speaker?: string | null
}

export type DesktopSportsLibraryItem = DesktopLibraryItemBase & {
  type: 'sports'
}

/** Ambiguous migrated records — never invent a media family. */
export type DesktopLegacyUnknownLibraryItem = DesktopLibraryItemBase & {
  type: 'legacy_unknown'
  legacyKey?: string | null
}

export type DesktopLibraryItem =
  | DesktopSongLibraryItem
  | DesktopRadioLibraryItem
  | DesktopPodcastShowLibraryItem
  | DesktopPodcastEpisodeLibraryItem
  | DesktopAudiobookLibraryItem
  | DesktopTvLibraryItem
  | DesktopMotivationalLibraryItem
  | DesktopLectureLibraryItem
  | DesktopSportsLibraryItem
  | DesktopLegacyUnknownLibraryItem

export type DesktopLibraryFilterId =
  | 'all'
  | 'song'
  | 'radio'
  | 'podcast_show'
  | 'podcast_episode'
  | 'audiobook'
  | 'tv'
  | 'motivational'
  | 'lecture'
  | 'sports'
  | 'legacy_unknown'

export type LibraryMigrationCounts = {
  read: number
  migrated: number
  deduplicated: number
  rejected: number
  ambiguous: number
}

export type LibraryStoreV2 = {
  version: 2
  migratedAt: string | null
  items: DesktopLibraryItem[]
  migration?: LibraryMigrationCounts | null
}

export type DesktopLibrarySnapshot = {
  items: DesktopLibraryItem[]
  byIdentity: Map<string, DesktopLibraryItem>
  countByType: Record<DesktopLibraryItemType, number>
  migrationStatus: {
    completed: boolean
    migratedAt: string | null
    counts: LibraryMigrationCounts | null
  }
}

export const LIBRARY_STORAGE_KEY = 'ht-desktop:library:v2'
export const LIBRARY_MIGRATION_FLAG_KEY = 'ht-desktop:library:v2:migrated'

/** Legacy keys migrated into v2 (never deleted until conversion succeeds). */
export const LEGACY_LIBRARY_SOURCE_KEYS = {
  musicLikes: 'ht-desktop:music-likes',
  tvFavorites: 'ht-desktop:tv-favorites',
  lecturesSaved: 'ht-desktop:lectures-saved',
} as const
