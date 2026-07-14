import { useEffect, useSyncExternalStore } from 'react'
import { premiumAudioVisualizerEngine } from './engine'
import type { PremiumVisualizerSnapshot } from './types'

const THROTTLE_MS = 120

let lastEmit = 0
let pending = 0
const listeners = new Set<() => void>()
let engineSubscriberCount = 0
let detachEngine: (() => void) | null = null

function emitThrottled(): void {
  const now = performance.now()
  if (now - lastEmit >= THROTTLE_MS) {
    lastEmit = now
    listeners.forEach((listener) => listener())
    return
  }

  if (pending) return
  pending = window.setTimeout(() => {
    pending = 0
    lastEmit = performance.now()
    listeners.forEach((listener) => listener())
  }, THROTTLE_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (engineSubscriberCount === 0) {
    detachEngine = premiumAudioVisualizerEngine.subscribe(emitThrottled)
  }
  engineSubscriberCount += 1

  return () => {
    listeners.delete(listener)
    engineSubscriberCount -= 1
    if (engineSubscriberCount === 0 && detachEngine) {
      detachEngine()
      detachEngine = null
    }
  }
}

function getSnapshot(): PremiumVisualizerSnapshot {
  return premiumAudioVisualizerEngine.getSnapshot()
}

export function usePremiumAudioVisualizer(): PremiumVisualizerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePremiumAudioVisualizerBoot(): void {
  useEffect(() => {
    premiumAudioVisualizerEngine.start()
    return () => {
      premiumAudioVisualizerEngine.destroy()
    }
  }, [])
}
