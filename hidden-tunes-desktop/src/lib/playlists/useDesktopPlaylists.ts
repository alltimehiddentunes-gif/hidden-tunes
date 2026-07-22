import { useMemo, useSyncExternalStore } from 'react'
import {
  addItemToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylistsStore,
  listPlaylists,
  removeItemFromPlaylist,
  renamePlaylist,
  reorderPlaylistItems,
  subscribeDesktopPlaylists,
} from './playlistService'
import type { DesktopPlaylistItem, PlaylistItemType } from './types'

export function useDesktopPlaylists() {
  const store = useSyncExternalStore(
    subscribeDesktopPlaylists,
    getPlaylistsStore,
    getPlaylistsStore,
  )

  return useMemo(
    () => ({
      playlists: store.playlists,
      count: store.playlists.length,
      list: () => listPlaylists(),
      get: (playlistId: string) => getPlaylist(playlistId),
      create: (title: string, description?: string | null) => createPlaylist(title, description),
      rename: (playlistId: string, title: string) => renamePlaylist(playlistId, title),
      remove: (playlistId: string) => deletePlaylist(playlistId),
      addItem: (playlistId: string, item: DesktopPlaylistItem) => addItemToPlaylist(playlistId, item),
      removeItem: (playlistId: string, type: PlaylistItemType, id: string) =>
        removeItemFromPlaylist(playlistId, type, id),
      reorder: (playlistId: string, fromIndex: number, toIndex: number) =>
        reorderPlaylistItems(playlistId, fromIndex, toIndex),
    }),
    [store],
  )
}
