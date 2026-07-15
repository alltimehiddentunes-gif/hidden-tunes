import { useSyncExternalStore } from 'react'
import {
  getMotivationalLocalSnapshot,
  subscribeMotivationalLocalState,
} from './motivationalProgressStorage'

export function useMotivationalLocalState() {
  return useSyncExternalStore(
    subscribeMotivationalLocalState,
    getMotivationalLocalSnapshot,
    getMotivationalLocalSnapshot,
  )
}
