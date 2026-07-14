import {
  buildUpgradeDiagnosticsContext,
  logAudioUpgrade,
  type AudioUpgradeDiagnosticsContext,
} from './audioUpgradeDiagnostics'

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

const UPGRADE_SOURCE_TIMEOUT_MS = 10000

type SourceSnapshot = {
  url: string
  time: number
  wasPlaying: boolean
  volume: number
  muted: boolean
  pauseSerial: number
}

export class HtmlAudioPlaybackService {
  private readonly audio: HTMLAudioElement
  private lastUrl: string | null = null
  private upgradeToken = 0
  private pauseSerial = 0

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

  private waitForCanPlay(timeoutMs?: number): Promise<void> {
    const audio = this.audio

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const onCanPlay = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(describeMediaError(audio)))
      }
      const onTimeout = () => {
        cleanup()
        reject(new Error('Timed out waiting for audio source to become playable'))
      }
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        audio.removeEventListener('canplay', onCanPlay)
        audio.removeEventListener('error', onError)
      }

      audio.addEventListener('canplay', onCanPlay)
      audio.addEventListener('error', onError)
      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(onTimeout, timeoutMs)
      }
    })
  }

  private async loadSource(url: string, timeoutMs?: number): Promise<void> {
    this.audio.src = url
    this.lastUrl = url
    this.audio.load()
    await this.waitForCanPlay(timeoutMs)
  }

  private seekNear(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    try {
      this.audio.currentTime = seconds
    } catch {
      // Metadata may not be ready yet — ignore safely.
    }
  }

  private async restoreSource(
    snapshot: SourceSnapshot,
    token: number,
    diagnostics?: AudioUpgradeDiagnosticsContext,
  ): Promise<boolean> {
    if (token !== this.upgradeToken) {
      logAudioUpgrade(
        'upgrade-cancelled-token',
        buildUpgradeDiagnosticsContext({
          ...diagnostics,
          upgradeToken: token,
          reason: 'rollback-superseded',
        }),
      )
      return false
    }

    try {
      this.audio.volume = clampVolume(snapshot.volume)
      this.audio.muted = snapshot.muted
      await this.loadSource(snapshot.url, UPGRADE_SOURCE_TIMEOUT_MS)
      if (token !== this.upgradeToken) {
        logAudioUpgrade(
          'upgrade-cancelled-token',
          buildUpgradeDiagnosticsContext({
            ...diagnostics,
            upgradeToken: token,
            reason: 'rollback-superseded-after-load',
          }),
        )
        return false
      }

      this.seekNear(snapshot.time)

      if (snapshot.wasPlaying && snapshot.pauseSerial === this.pauseSerial) {
        await this.audio.play()
      }

      logAudioUpgrade(
        'upgrade-rolled-back',
        buildUpgradeDiagnosticsContext({
          ...diagnostics,
          sourceUrl: snapshot.url,
          positionSeconds: snapshot.time,
          upgradeToken: token,
        }),
      )
      return true
    } catch (error) {
      logAudioUpgrade(
        'upgrade-failed',
        buildUpgradeDiagnosticsContext({
          ...diagnostics,
          sourceUrl: snapshot.url,
          positionSeconds: snapshot.time,
          upgradeToken: token,
          reason: `rollback-failed:${error instanceof Error ? error.message : String(error)}`,
        }),
      )
      return false
    }
  }

  async play(url: string, options?: PlayOptions): Promise<void> {
    // Single active source for now — multi-version switching arrives in a later phase.
    const normalized = url.trim()
    if (!normalized) {
      throw new Error('Missing audio URL')
    }

    this.audio.muted = false

    if (this.lastUrl !== normalized) {
      this.upgradeToken += 1
      this.audio.pause()
      this.audio.src = normalized
      this.lastUrl = normalized
      this.audio.load()

      const canPlayTimeoutMs = options?.instant ? 8000 : undefined
      await this.waitForCanPlay(canPlayTimeoutMs)

      logPlaybackDiagnostics('before play (new src)', this.audio, normalized)
      await this.audio.play()
      logPlaybackDiagnostics('after play (new src)', this.audio, normalized)
      return
    }

    logPlaybackDiagnostics('before resume/play', this.audio, normalized)
    await this.audio.play()
    logPlaybackDiagnostics('after resume/play', this.audio, normalized)
  }

  async upgradeSource(
    url: string,
    diagnostics?: AudioUpgradeDiagnosticsContext,
  ): Promise<boolean> {
    const normalized = url.trim()
    if (!normalized || normalized === this.lastUrl) return false

    const previousUrl = this.lastUrl ?? (this.audio.currentSrc || this.audio.src)
    if (!previousUrl || previousUrl === normalized) return false

    const token = ++this.upgradeToken
    const positionSeconds = Number.isFinite(this.audio.currentTime)
      ? this.audio.currentTime
      : 0
    const context = buildUpgradeDiagnosticsContext({
      ...diagnostics,
      sourceUrl: previousUrl,
      targetUrl: normalized,
      positionSeconds,
      upgradeToken: token,
    })

    logAudioUpgrade('upgrade-started', context)

    const snapshot: SourceSnapshot = {
      url: previousUrl,
      time: positionSeconds,
      wasPlaying: !this.audio.paused,
      volume: this.audio.volume,
      muted: this.audio.muted,
      pauseSerial: this.pauseSerial,
    }

    try {
      await this.loadSource(normalized, UPGRADE_SOURCE_TIMEOUT_MS)
      if (token !== this.upgradeToken) {
        logAudioUpgrade(
          'upgrade-cancelled-token',
          buildUpgradeDiagnosticsContext({
            ...context,
            reason: 'superseded-after-load',
          }),
        )
        return false
      }

      this.seekNear(snapshot.time)

      if (snapshot.wasPlaying && snapshot.pauseSerial === this.pauseSerial) {
        await this.audio.play()
      }

      logAudioUpgrade('upgrade-succeeded', context)
      return true
    } catch (error) {
      if (token !== this.upgradeToken) {
        logAudioUpgrade(
          'upgrade-cancelled-token',
          buildUpgradeDiagnosticsContext({
            ...context,
            reason: 'superseded-after-error',
          }),
        )
        return false
      }

      const message = error instanceof Error ? error.message : String(error)
      const timedOut = message.toLowerCase().includes('timed out')
      logAudioUpgrade(
        timedOut ? 'upgrade-timed-out' : 'upgrade-failed',
        buildUpgradeDiagnosticsContext({
          ...context,
          reason: message,
        }),
      )

      const restored = await this.restoreSource(snapshot, token, context)
      if (!restored) {
        logAudioUpgrade(
          'upgrade-failed',
          buildUpgradeDiagnosticsContext({
            ...context,
            reason: timedOut ? 'timed-out-without-rollback' : 'upgrade-error-without-rollback',
            restored: false,
          }),
        )
      }
      return false
    }
  }

  pause(): void {
    this.pauseSerial += 1
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
    this.pauseSerial += 1
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
