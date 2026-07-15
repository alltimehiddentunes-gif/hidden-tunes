export type MusicSectionId =
  | 'discover'
  | 'new-releases'
  | 'top-charts'
  | 'genres-moods'
  | 'artists'
  | 'albums'
  | 'songs'
  | 'liked'
  | 'playlists'
  | 'recent'
  | 'downloads'

export type MusicSubNavItem = {
  id: MusicSectionId
  label: string
  group: 'music' | 'library'
  enabled: boolean
}
