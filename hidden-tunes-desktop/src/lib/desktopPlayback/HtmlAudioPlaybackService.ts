const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

function describeMediaError(audio: HTMLAudioElement): string {
  const mediaError = audio.error
  if (!mediaError) return 'Unknown media error'
  const label = MEDIA_ERROR_LABELS[mediaError.code] ?? `code ${mediaError.code}`
  return mediaError.message ? `${label}: ${mediaError.message}` : label
}

function logPlaybackDiagnostics(label: string, audio: HTMLAudioElement, url?: string) {
  if (!import.meta.env.DEV) return
  console.info(`[ht-playback] ${label}`, {
    url: url ?? (audio.currentSrc || audio.src),
    muted: audio.muted,
    volume: audio.volume,
    paused: audio.paused,
    readyState: audio.readyState,
    networkState: audio.networkState,
    currentTime: audio.currentTime,
    duration: audio.duration,
    inDom: audio.isConnected,
    error: audio.error
      ? { code: audio.error.code, message: audio.error.message }
      : null,
  })
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

function clampSeekSeconds(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  if (duration > 0) return Math.min(duration, seconds)
  return seconds
}

type PlayOptions = {
  instant?: boolean
}

export class HtmlAudioPlaybackService {
  private readonly audio: HTMLAudioElement
  private lastUrl: string | null = null
  private upgradeToken = 0

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'metadata'
    this.audio.volume = 1
    this.audio.muted = false
    this.audio.setAttribute('data-ht-playback', 'true')

    if (typeof document !== 'undefined' && !this.audio.isConnected) {
      this.audio.style.display = 'none'
      document.body.appendChild(this.audio)
    }
  }

  getAudioElement(): HTMLAudioElement {
    return this.audio
  }

  private waitForCanPlay(): Promise<void> {
    const audio = this.audio

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(describeMediaError(audio)))
      }
      const cleanup = () => {
        audio.removeEventListener('canplay', onCanPlay)
        audio.removeEventListener('error', onError)
      }

      audio.addEventListener('canplay', onCanPlay)
      audio.addEventListener('error', onError)
    })
  }

  async play(url: string, options?: PlayOptions): Promise<void> {
    const normalized = url.trim()
    if (!normalized) {
      throw new Error('Missing audio URL')
    }

    this.audio.muted = false

    if (this.lastUrl !== normalized) {
      this.audio.pause()
      this.audio.src = normalized
      this.lastUrl = normalized
      this.audio.load()

      if (!options?.instant) {
        await this.waitForCanPlay()
      }

      logPlaybackDiagnostics('before play (new src)', this.audio, normalized)
      await this.audio.play()
      logPlaybackDiagnostics('after play (new src)', this.audio, normalized)
      return
    }

    logPlaybackDiagnostics('before resume/play', this.audio, normalized)
    await this.audio.play()
    logPlaybackDiagnostics('after resume/play', this.audio, normalized)
  }

  async upgradeSource(url: string): Promise<boolean> {
    const normalized = url.trim()
    if (!normalized || normalized === this.lastUrl) return false

    const token = ++this.upgradeToken
    const position = this.audio.currentTime
    const wasPlaying = !this.audio.paused

    try {
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error(describeMediaError(this.audio)))
        }
        const cleanup = () => {
          this.audio.removeEventListener('canplay', onCanPlay)
          this.audio.removeEventListener('error', onError)
        }

        this.audio.addEventListener('canplay', onCanPlay)
        this.audio.addEventListener('error', onError)
        this.audio.src = normalized
        this.lastUrl = normalized
        this.audio.load()
      })

      if (token !== this.upgradeToken) return false

      if (position > 0) {
        try {
          this.audio.currentTime = position
        } catch {
          // Metadata may not be ready yet — ignore safely.
        }
      }

      if (wasPlaying) {
        await this.audio.play()
      }

      logPlaybackDiagnostics('quality upgrade applied', this.audio, normalized)
      return true
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[ht-playback] quality upgrade skipped', {
          url: normalized,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return false
    }
  }

  pause(): void {
    this.audio.pause()
  }

  async resume(): Promise<void> {
    this.audio.muted = false
    await this.audio.play()
  }

  seekTo(seconds: number): void {
    const duration =
      Number.isFinite(this.audio.duration) && this.audio.duration > 0
        ? this.audio.duration
        : 0
    const target = clampSeekSeconds(seconds, duration)

    try {
      this.audio.currentTime = target
    } catch {
      // Metadata may not be ready yet — ignore safely.
    }
  }

  setVolume(volume: number): void {
    this.audio.volume = clampVolume(volume)
    if (this.audio.volume > 0) {
      this.audio.muted = false
    }
  }

  getVolume(): number {
    return clampVolume(this.audio.volume)
  }

  stop(): void {
    this.upgradeToken += 1
    this.audio.pause()
    this.audio.currentTime = 0
  }

  destroy(): void {
    this.stop()
    this.audio.removeAttribute('src')
    this.audio.load()
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio)
    }
    this.lastUrl = null
  }
}
