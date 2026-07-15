const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

function describeMediaError(video: HTMLVideoElement): string {
  const mediaError = video.error
  if (!mediaError) return 'Unknown media error'
  const label = MEDIA_ERROR_LABELS[mediaError.code] ?? `code ${mediaError.code}`
  return mediaError.message ? `${label}: ${mediaError.message}` : label
}

function logPlaybackDiagnostics(label: string, video: HTMLVideoElement, url?: string) {
  if (!import.meta.env.DEV) return
  console.info(`[ht-tv-playback] ${label}`, {
    url: url ?? (video.currentSrc || video.src),
    muted: video.muted,
    volume: video.volume,
    paused: video.paused,
    readyState: video.readyState,
    networkState: video.networkState,
    inDom: video.isConnected,
    error: video.error
      ? { code: video.error.code, message: video.error.message }
      : null,
  })
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

export class HtmlVideoPlaybackService {
  private readonly video: HTMLVideoElement
  private lastUrl: string | null = null
  private pauseSerial = 0

  constructor() {
    this.video = document.createElement('video')
    this.video.preload = 'metadata'
    this.video.volume = 1
    this.video.muted = false
    this.video.playsInline = true
    this.video.setAttribute('data-ht-tv-playback', 'true')

    if (typeof document !== 'undefined' && !this.video.isConnected) {
      this.video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;'
      document.body.appendChild(this.video)
    }
  }

  getVideoElement(): HTMLVideoElement {
    return this.video
  }

  private waitForCanPlay(timeoutMs = 12000): Promise<void> {
    const video = this.video
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
      }
      const onCanPlay = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(describeMediaError(video)))
      }

      video.addEventListener('canplay', onCanPlay)
      video.addEventListener('error', onError)
      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for TV stream to become playable'))
      }, timeoutMs)
    })
  }

  async play(url: string): Promise<void> {
    const normalized = url.trim()
    if (!normalized) {
      throw new Error('Missing stream URL')
    }

    this.video.muted = false

    if (this.lastUrl !== normalized) {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.src = normalized
      this.lastUrl = normalized
      this.video.load()
      await this.waitForCanPlay()
      logPlaybackDiagnostics('before play (new src)', this.video, normalized)
      await this.video.play()
      logPlaybackDiagnostics('after play (new src)', this.video, normalized)
      return
    }

    logPlaybackDiagnostics('before resume/play', this.video, normalized)
    await this.video.play()
    logPlaybackDiagnostics('after resume/play', this.video, normalized)
  }

  pause(): void {
    this.pauseSerial += 1
    this.video.pause()
  }

  async resume(): Promise<void> {
    this.video.muted = false
    await this.video.play()
  }

  setVolume(volume: number): void {
    this.video.volume = clampVolume(volume)
    if (this.video.volume > 0) {
      this.video.muted = false
    }
  }

  getVolume(): number {
    return clampVolume(this.video.volume)
  }

  stop(): void {
    this.pauseSerial += 1
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.lastUrl = null
  }

  releaseSource(): void {
    this.stop()
  }

  destroy(): void {
    this.stop()
    if (this.video.parentNode) {
      this.video.parentNode.removeChild(this.video)
    }
  }
}
