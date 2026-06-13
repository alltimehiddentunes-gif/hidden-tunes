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

export class HtmlAudioPlaybackService {
  private readonly audio: HTMLAudioElement
  private lastUrl: string | null = null

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.volume = 1
    this.audio.muted = false
    this.audio.setAttribute('data-ht-playback', 'true')

    // Electron/Chromium: attached media elements route audio more reliably.
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

  async play(url: string): Promise<void> {
    const normalized = url.trim()
    if (!normalized) {
      throw new Error('Missing audio URL')
    }

    this.audio.muted = false
    this.audio.volume = 1

    if (this.lastUrl !== normalized) {
      this.audio.pause()
      this.audio.src = normalized
      this.lastUrl = normalized
      this.audio.load()
      await this.waitForCanPlay()
      logPlaybackDiagnostics('before play (new src)', this.audio, normalized)
      await this.audio.play()
      logPlaybackDiagnostics('after play (new src)', this.audio, normalized)
      return
    }

    logPlaybackDiagnostics('before resume/play', this.audio, normalized)
    await this.audio.play()
    logPlaybackDiagnostics('after resume/play', this.audio, normalized)
  }

  pause(): void {
    this.audio.pause()
  }

  async resume(): Promise<void> {
    this.audio.muted = false
    if (this.audio.volume <= 0) {
      this.audio.volume = 1
    }
    await this.audio.play()
  }

  stop(): void {
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
