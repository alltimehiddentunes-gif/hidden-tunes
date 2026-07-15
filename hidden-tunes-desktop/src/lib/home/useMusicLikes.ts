import { useSyncExternalStore } from 'react'
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
    toggleLiked: (songId: string) => toggleSongLiked(songId),
  }
}
