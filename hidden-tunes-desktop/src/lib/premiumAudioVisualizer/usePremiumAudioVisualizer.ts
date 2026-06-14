import { useEffect, useState, useSyncExternalStore } from 'react'
import { premiumAudioVisualizerEngine } from './engine'
import type { PremiumVisualizerSnapshot } from './types'

const THROTTLE_MS = 120

let lastEmit = 0
let pending = 0
const listeners = new Set<() => void>()

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
  const detachEngine = premiumAudioVisualizerEngine.subscribe(emitThrottled)
  return () => {
    listeners.delete(listener)
    detachEngine()
  }
}

function getSnapshot(): PremiumVisualizerSnapshot {
  return premiumAudioVisualizerEngine.getSnapshot()
}

export function usePremiumAudioVisualizer(): PremiumVisualizerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePremiumAudioVisualizerBoot(): void {
  const [, setTick] = useState(0)

  useEffect(() => {
    premiumAudioVisualizerEngine.start()
    const detach = premiumAudioVisualizerEngine.subscribe(() => {
      setTick((value) => value + 1)
    })
    return () => {
      detach()
      premiumAudioVisualizerEngine.stop()
    }
  }, [])
}
