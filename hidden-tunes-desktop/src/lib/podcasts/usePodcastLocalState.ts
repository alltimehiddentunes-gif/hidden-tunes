import { useSyncExternalStore } from 'react'
import {
  listPodcastContinueListening,
  listPodcastRecentlyPlayed,
  subscribePodcastLocalState,
} from './podcastProgressStorage'

function getPodcastLocalSnapshot() {
  return {
    continueListening: listPodcastContinueListening(),
    recentlyPlayed: listPodcastRecentlyPlayed(),
  }
}

export function usePodcastLocalState() {
  return useSyncExternalStore(
    subscribePodcastLocalState,
    getPodcastLocalSnapshot,
    getPodcastLocalSnapshot,
  )
}
