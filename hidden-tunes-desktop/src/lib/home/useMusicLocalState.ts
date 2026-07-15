import { useSyncExternalStore } from 'react'
import { getMusicLocalSnapshot, subscribeMusicLocalState } from './musicProgressStorage'

export function useMusicLocalState() {
  return useSyncExternalStore(subscribeMusicLocalState, getMusicLocalSnapshot, getMusicLocalSnapshot)
}
