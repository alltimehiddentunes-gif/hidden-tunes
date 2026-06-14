import type {
  PremiumVisualizerPlaybackState,
  PremiumVisualizerSnapshot,
  PremiumWaveformRegistration,
} from './types'
import { buildSeededWaveformHeights } from './waveformSeed'

const DEFAULT_BAR_COUNT = 36
const CINEMATIC_BAR_COUNT = 72
const SILENT_FRAME_LIMIT = 90
const ENERGY_SMOOTHING = 0.82
const BAR_SMOOTHING = 0.74

const EMPTY_BARS = Object.freeze(Array.from({ length: DEFAULT_BAR_COUNT }, () => 0))

function findPlaybackAudio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  const audio = document.querySelector('audio[data-ht-playback="true"]')
  return audio instanceof HTMLAudioElement ? audio : null
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export class PremiumAudioVisualizerEngine {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private connectedAudio: HTMLAudioElement | null = null
  private connectFailed = false
  private silentFrames = 0
  private peakSignal = 0

  private rafId: number | null = null
  private subscribers = new Set<() => void>()
  private registrations = new Set<PremiumWaveformRegistration>()
  private playback: PremiumVisualizerPlaybackState = {
    isPlaying: false,
    trackId: null,
    positionSeconds: 0,
    durationSeconds: 0,
    volume: 1,
  }

  private frequencyBuffer: Uint8Array<ArrayBuffer> | null = null
  private timeDomainBuffer: Uint8Array<ArrayBuffer> | null = null
  private smoothedBars = new Float32Array(DEFAULT_BAR_COUNT)
  private cinematicSmoothedBars = new Float32Array(CINEMATIC_BAR_COUNT)
  private fallbackPhase = 0

  private snapshot: PremiumVisualizerSnapshot = {
    waveformBars: EMPTY_BARS,
    energyLevel: 0,
    bassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    isAudioReactive: false,
    isFallback: true,
    isPlaying: false,
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  getSnapshot(): PremiumVisualizerSnapshot {
    return this.snapshot
  }

  setPlaybackState(next: PremiumVisualizerPlaybackState): void {
    this.playback = next
    this.snapshot = {
      ...this.snapshot,
      isPlaying: next.isPlaying,
    }
    this.syncMotionLoop()
  }

  registerWaveform(registration: PremiumWaveformRegistration): () => void {
    this.registrations.add(registration)
    registration.bars.forEach((bar, index) => {
      const base = registration.baseHeights[index] ?? 40
      bar.style.setProperty('--ht-bar-base', `${base}%`)
    })
    this.syncMotionLoop()
    return () => {
      this.registrations.delete(registration)
      this.syncMotionLoop()
    }
  }

  start(): void {
    this.syncMotionLoop()
  }

  stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.teardownAudioGraph()
  }

  private syncMotionLoop(): void {
    const shouldRun =
      this.playback.isPlaying
      || this.registrations.size > 0
      || this.subscribers.size > 0

    if (!shouldRun) {
      if (this.rafId != null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
      this.applyIdleVisuals()
      return
    }

    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(this.tick)
    }
  }

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick)
    this.ensureAudioGraph()
    this.sampleFrame()
    this.applyWaveformDom()
    this.applyGlobalCssVars()
    this.notifySubscribers()
  }

  private notifySubscribers(): void {
    if (this.subscribers.size === 0) return
    this.subscribers.forEach((listener) => listener())
  }

  private ensureAudioGraph(): void {
    if (this.connectFailed || this.sourceNode) return

    const audio = findPlaybackAudio()
    if (!audio) return

    try {
      const AudioContextCtor =
        window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) {
        this.connectFailed = true
        return
      }

      if (!audio.crossOrigin && !audio.src && !audio.currentSrc) {
        audio.crossOrigin = 'anonymous'
      }

      const context = new AudioContextCtor()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.82
      analyser.minDecibels = -82
      analyser.maxDecibels = -18

      const source = context.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(context.destination)

      this.audioContext = context
      this.analyser = analyser
      this.sourceNode = source
      this.connectedAudio = audio
      this.frequencyBuffer = new Uint8Array(analyser.frequencyBinCount)
      this.timeDomainBuffer = new Uint8Array(analyser.fftSize)

      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined)
      }
    } catch (error) {
      this.connectFailed = true
      if (import.meta.env.DEV) {
        console.warn(
          '[ht-visualizer] Web Audio analyser unavailable — using progress fallback.',
          error,
        )
      }
    }
  }

  private teardownAudioGraph(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch {
        // ignore
      }
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect()
      } catch {
        // ignore
      }
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined)
    }
    this.audioContext = null
    this.analyser = null
    this.sourceNode = null
    this.connectedAudio = null
    this.frequencyBuffer = null
    this.timeDomainBuffer = null
  }

  private sampleFrame(): void {
    const reducedMotion = prefersReducedMotion()
    const isPlaying = this.playback.isPlaying
    const canUseAnalyser =
      !reducedMotion
      && isPlaying
      && this.analyser
      && this.frequencyBuffer
      && this.timeDomainBuffer
      && !this.connectFailed

    if (canUseAnalyser && this.audioContext?.state === 'suspended') {
      void this.audioContext.resume().catch(() => undefined)
    }

    if (canUseAnalyser) {
      this.sampleAnalyserFrame()
      return
    }

    this.sampleFallbackFrame(reducedMotion)
  }

  private sampleAnalyserFrame(): void {
    const analyser = this.analyser
    const frequencyBuffer = this.frequencyBuffer
    const timeDomainBuffer = this.timeDomainBuffer
    if (!analyser || !frequencyBuffer || !timeDomainBuffer) return

    analyser.getByteFrequencyData(frequencyBuffer)
    analyser.getByteTimeDomainData(timeDomainBuffer)

    let timeEnergy = 0
    for (let index = 0; index < timeDomainBuffer.length; index += 1) {
      const centered = (timeDomainBuffer[index] - 128) / 128
      timeEnergy += centered * centered
    }
    timeEnergy = Math.sqrt(timeEnergy / timeDomainBuffer.length)

    const bassEnd = 8
    const midEnd = 40
    const trebleEnd = Math.min(frequencyBuffer.length, 96)

    let bass = 0
    let mid = 0
    let treble = 0
    for (let index = 0; index < bassEnd; index += 1) bass += frequencyBuffer[index]
    for (let index = bassEnd; index < midEnd; index += 1) mid += frequencyBuffer[index]
    for (let index = midEnd; index < trebleEnd; index += 1) treble += frequencyBuffer[index]

    bass /= bassEnd * 255
    mid /= (midEnd - bassEnd) * 255
    treble /= (trebleEnd - midEnd) * 255

    const energy = Math.min(1, timeEnergy * 2.4 + bass * 0.35 + mid * 0.2)
    this.peakSignal = Math.max(this.peakSignal * 0.995, energy)

    if (energy < 0.02) {
      this.silentFrames += 1
    } else {
      this.silentFrames = 0
    }

    const analyserSilent =
      this.silentFrames >= SILENT_FRAME_LIMIT && this.peakSignal < 0.05

    if (analyserSilent) {
      if (import.meta.env.DEV && !this.snapshot.isFallback) {
        console.warn(
          '[ht-visualizer] Analyser signal silent — likely CORS on remote audio. Using fallback.',
          { src: this.connectedAudio?.currentSrc || this.connectedAudio?.src },
        )
      }
      this.sampleFallbackFrame(false, true)
      return
    }

    this.updateBarArrays(frequencyBuffer, energy)
    this.snapshot = {
      waveformBars: Array.from(this.smoothedBars),
      energyLevel: this.lerp(this.snapshot.energyLevel, energy, 1 - ENERGY_SMOOTHING),
      bassEnergy: this.lerp(this.snapshot.bassEnergy, bass, 1 - ENERGY_SMOOTHING),
      midEnergy: this.lerp(this.snapshot.midEnergy, mid, 1 - ENERGY_SMOOTHING),
      trebleEnergy: this.lerp(this.snapshot.trebleEnergy, treble, 1 - ENERGY_SMOOTHING),
      isAudioReactive: true,
      isFallback: false,
      isPlaying: this.playback.isPlaying,
    }
  }

  private sampleFallbackFrame(reducedMotion: boolean, forceFallback = false): void {
    const seed = this.playback.trackId ?? 'idle-visualizer'
    const baseHeights = buildSeededWaveformHeights(seed, DEFAULT_BAR_COUNT)
    const progressRatio =
      this.playback.durationSeconds > 0
        ? this.playback.positionSeconds / this.playback.durationSeconds
        : 0
    const motionScale = reducedMotion ? 0 : this.playback.isPlaying ? 1 : 0.15

    this.fallbackPhase += this.playback.isPlaying ? 0.045 : 0

    for (let index = 0; index < DEFAULT_BAR_COUNT; index += 1) {
      const base = baseHeights[index] / 100
      const pulse = Math.sin(this.fallbackPhase + index * 0.38) * 0.5 + 0.5
      const progressBoost = 0.82 + progressRatio * 0.18
      const target = base * (0.72 + pulse * 0.28 * motionScale) * progressBoost
      this.smoothedBars[index] = this.lerp(
        this.smoothedBars[index],
        target,
        1 - BAR_SMOOTHING,
      )
    }

    for (let index = 0; index < CINEMATIC_BAR_COUNT; index += 1) {
      const source = this.smoothedBars[index % DEFAULT_BAR_COUNT]
      const pulse = Math.sin(this.fallbackPhase + index * 0.22) * 0.5 + 0.5
      const target = source * (0.84 + pulse * 0.16 * motionScale)
      this.cinematicSmoothedBars[index] = this.lerp(
        this.cinematicSmoothedBars[index],
        target,
        1 - BAR_SMOOTHING,
      )
    }

    const energy = this.playback.isPlaying
      ? Math.min(1, 0.18 + progressRatio * 0.42 + (reducedMotion ? 0 : 0.12))
      : 0.06

    this.snapshot = {
      waveformBars: Array.from(this.smoothedBars),
      energyLevel: this.lerp(this.snapshot.energyLevel, energy, 1 - ENERGY_SMOOTHING),
      bassEnergy: this.lerp(this.snapshot.bassEnergy, energy * 0.72, 1 - ENERGY_SMOOTHING),
      midEnergy: this.lerp(this.snapshot.midEnergy, energy * 0.56, 1 - ENERGY_SMOOTHING),
      trebleEnergy: this.lerp(this.snapshot.trebleEnergy, energy * 0.34, 1 - ENERGY_SMOOTHING),
      isAudioReactive: false,
      isFallback: true,
      isPlaying: this.playback.isPlaying,
    }

    if (forceFallback) {
      this.snapshot.isFallback = true
      this.snapshot.isAudioReactive = false
    }
  }

  private updateBarArrays(frequencyBuffer: Uint8Array<ArrayBuffer>, energy: number): void {
    const bins = frequencyBuffer.length
    for (let index = 0; index < DEFAULT_BAR_COUNT; index += 1) {
      const start = Math.floor((index / DEFAULT_BAR_COUNT) * bins)
      const end = Math.max(start + 1, Math.floor(((index + 1) / DEFAULT_BAR_COUNT) * bins))
      let sum = 0
      for (let bin = start; bin < end; bin += 1) sum += frequencyBuffer[bin]
      const average = sum / ((end - start) * 255)
      const target = Math.min(1, average * (1.05 + energy * 0.45))
      this.smoothedBars[index] = this.lerp(this.smoothedBars[index], target, 1 - BAR_SMOOTHING)
    }

    for (let index = 0; index < CINEMATIC_BAR_COUNT; index += 1) {
      const source = this.smoothedBars[Math.floor((index / CINEMATIC_BAR_COUNT) * DEFAULT_BAR_COUNT)]
      const neighbor = this.smoothedBars[Math.min(DEFAULT_BAR_COUNT - 1, Math.floor((index / CINEMATIC_BAR_COUNT) * DEFAULT_BAR_COUNT) + 1)]
      const target = (source * 0.72 + neighbor * 0.28) * (0.9 + energy * 0.22)
      this.cinematicSmoothedBars[index] = this.lerp(
        this.cinematicSmoothedBars[index],
        Math.min(1, target),
        1 - BAR_SMOOTHING,
      )
    }
  }

  private applyWaveformDom(): void {
    const isPlaying = this.playback.isPlaying
    const energy = isPlaying ? this.snapshot.energyLevel : this.snapshot.energyLevel * 0.35

    this.registrations.forEach((registration) => {
      const values =
        registration.barCount > DEFAULT_BAR_COUNT
          ? this.cinematicSmoothedBars
          : this.smoothedBars

      registration.bars.forEach((bar, index) => {
        const base = (registration.baseHeights[index] ?? 40) / 100
        const reactive = values[index] ?? 0
        const scale = Math.max(0.12, base * (0.42 + reactive * (0.95 + energy * 0.35)))
        bar.style.setProperty('--ht-bar-scale', scale.toFixed(3))
        const barProgress = ((index + 0.5) / registration.barCount) * 100
        bar.classList.toggle('is-played', barProgress <= registration.progressPercent)
      })
    })
  }

  private applyGlobalCssVars(): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const energy = this.snapshot.energyLevel
    root.style.setProperty('--ht-audio-energy', energy.toFixed(3))
    root.style.setProperty('--ht-audio-bass', this.snapshot.bassEnergy.toFixed(3))
    root.style.setProperty('--ht-audio-mid', this.snapshot.midEnergy.toFixed(3))
    root.style.setProperty('--ht-audio-treble', this.snapshot.trebleEnergy.toFixed(3))
    root.style.setProperty('--ht-audio-reactive', this.snapshot.isAudioReactive ? '1' : '0')
    root.style.setProperty('--ht-audio-fallback', this.snapshot.isFallback ? '1' : '0')
    root.style.setProperty('--ht-audio-playing', this.playback.isPlaying ? '1' : '0')
    root.dataset.htAudioReactive = this.snapshot.isAudioReactive ? 'true' : 'false'
    root.dataset.htAudioFallback = this.snapshot.isFallback ? 'true' : 'false'
  }

  private applyIdleVisuals(): void {
    this.snapshot = {
      ...this.snapshot,
      energyLevel: this.lerp(this.snapshot.energyLevel, 0, 0.2),
      bassEnergy: this.lerp(this.snapshot.bassEnergy, 0, 0.2),
      midEnergy: this.lerp(this.snapshot.midEnergy, 0, 0.2),
      trebleEnergy: this.lerp(this.snapshot.trebleEnergy, 0, 0.2),
      isPlaying: false,
    }
    this.applyWaveformDom()
    this.applyGlobalCssVars()
    this.notifySubscribers()
  }

  private lerp(current: number, target: number, alpha: number): number {
    return current + (target - current) * alpha
  }
}

export const premiumAudioVisualizerEngine = new PremiumAudioVisualizerEngine()
