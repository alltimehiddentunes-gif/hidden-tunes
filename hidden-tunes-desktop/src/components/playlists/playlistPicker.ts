import { createContext, useContext } from 'react'
import type { ApiSong } from '../../lib/api'
import type { DesktopPlaylistSongItem } from '../../lib/playlists'

export type PlaylistPickerSource = 'search' | 'favorites' | 'queue' | 'now-playing' | 'album' | 'artist' | 'genre' | 'mood' | 'emotional-world' | 'history' | 'home'
export type PlaylistPickerRequest = { items: DesktopPlaylistSongItem[]; source: PlaylistPickerSource }
export type PlaylistPickerApi = { openPlaylistPicker: (request: PlaylistPickerRequest) => void; closePlaylistPicker: () => void }
export const PlaylistPickerContext = createContext<PlaylistPickerApi | null>(null)

export function apiSongToPlaylistItem(song: ApiSong): DesktopPlaylistSongItem {
  return { type: 'song', id: song.id, title: song.title, artist: song.artist, album: song.album, artwork: song.artwork, duration: song.durationSeconds, subtitle: song.artist, addedAt: new Date().toISOString() }
}

export function usePlaylistPicker() {
  const value = useContext(PlaylistPickerContext)
  if (!value) throw new Error('usePlaylistPicker must be used within PlaylistPickerProvider')
  return value
}
