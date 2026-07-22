import { useSyncExternalStore } from 'react'
import type { ApiSong } from '../api'
import {
  getMusicLikesSnapshot,
  subscribeMusicLikes,
  toggleSongLiked,
  isSongLiked,
} from './musicLikesStorage'

export function useMusicLikes() {
  const snapshot = useSyncExternalStore(
    subscribeMusicLikes,
    getMusicLikesSnapshot,
    getMusicLikesSnapshot,
  )

  return {
    likedSongIds: snapshot.likedSongIds,
    likedAtById: snapshot.likedAtById,
    isLiked: (songId: string | null | undefined) => isSongLiked(songId),
    toggleLiked: (
      songId: string,
      song?: Pick<ApiSong, 'id' | 'title' | 'artist' | 'album' | 'artwork' | 'durationSeconds' | 'genre'> | null,
    ) => toggleSongLiked(songId, song),
  }
}
