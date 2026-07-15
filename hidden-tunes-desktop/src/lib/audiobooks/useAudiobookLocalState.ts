import { useSyncExternalStore } from 'react'
import { getAudiobookLocalSnapshot, subscribeAudiobookLocalState } from './audiobookProgressStorage'

export function useAudiobookLocalState() {
  return useSyncExternalStore(subscribeAudiobookLocalState, getAudiobookLocalSnapshot, getAudiobookLocalSnapshot)
}
