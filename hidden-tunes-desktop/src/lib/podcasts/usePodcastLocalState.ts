import { useSyncExternalStore } from 'react'
import {
  getPodcastLocalSnapshot,
  subscribePodcastLocalState,
} from './podcastProgressStorage'

export function usePodcastLocalState() {
  return useSyncExternalStore(
    subscribePodcastLocalState,
    getPodcastLocalSnapshot,
    getPodcastLocalSnapshot,
  )
}
