import Hls from 'hls.js'
import type { TvResolvedPlayback } from './types'

const HLS_MIME = 'application/vnd.apple.mpegurl'

const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

const DEV_MEDIA_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'playing',
  'waiting',
  'stalled',
  'suspend',
  'pause',
  'ended',
  'error',
  'emptied',
  'resize',
] as const

export type TvVideoPlaybackMetrics = {
  readyState: number
  networkState: number
  paused: boolean
  muted: boolean
  videoWidth: number
  videoHeight: number
  currentTime: number
  hasFrames: boolean
  isAcceptablePlayback: boolean
  usesHlsJs: boolean
  nativeHls: boolean
  mediaErrorCode: number | null
}

function describeMediaError(video: HTMLVideoElement): string {
  const mediaError = video.error
  if (!mediaError) return 'This channel\'s stream is currently unavailable.'
  const label = MEDIA_ERROR_LABELS[mediaError.code] ?? `code ${mediaError.code}`
  if (mediaError.code === 2) return 'The channel provider rejected or interrupted the connection.'
  if (mediaError.code === 3) return 'This channel uses a video format this desktop cannot play.'
  if (mediaError.code === 4) return 'This channel\'s stream format is not supported.'
  return mediaError.message ? `${label}: ${mediaError.message}` : 'The stream stopped unexpectedly. Try again.'
}

function safeEndpoint(value: unknown) {
  try {
    const url = new URL(String(value || ''))
    return `${url.origin}${url.pathname}`
  } catch {
    return 'unknown'
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

export type TvSourceAdapter = 'hls' | 'direct' | 'dash' | 'web' | 'unsupported'

export function resolveTvSourceAdapter(source: TvResolvedPlayback): TvSourceAdapter {
  const url = source.streamUrl.trim().toLowerCase()
  const sourceType = source.sourceType?.trim().toLowerCase() || ''
  const protocol = source.streamProtocol?.trim().toLowerCase() || ''
  if (sourceType.includes('youtube')) return 'web'
  if (protocol === 'dash' || /\.mpd(?:\?|$)/i.test(url)) return 'dash'
  if (
    protocol === 'hls'
    || sourceType === 'hls_stream'
    || sourceType === 'm3u_playlist'
    || url.includes('.m3u8')
    || url.includes('mpegurl')
  ) return 'hls'
  if (/^https?:\/\//i.test(url)) return 'direct'
  return 'unsupported'
}

function isHlsStream(url: string): boolean {
  const normalized = url.trim().toLowerCase()
  return normalized.includes('.m3u8') || normalized.includes('mpegurl')
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  const support = video.canPlayType(HLS_MIME)
  return support === 'probably' || support === 'maybe'
}

function logDevEvent(video: HTMLVideoElement, eventName: string) {
  if (!import.meta.env.DEV) return
  console.info('[ht-tv-playback] media-event', {
    event: eventName,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentTime: video.currentTime,
    mediaErrorCode: video.error?.code ?? null,
  })
}

export class HtmlVideoPlaybackService {
  private readonly video: HTMLVideoElement
  private readonly parkingHost: HTMLDivElement
  private hls: Hls | null = null
  private mountedHost: HTMLElement | null = null
  private lastUrl: string | null = null
  private usesHlsJs = false
  private nativeHls = false
  private pauseSerial = 0
  private devListenersAttached = false

  constructor() {
    this.video = document.createElement('video')
    this.video.className = 'ht-tv-video-element'
    this.video.setAttribute('data-ht-tv-playback', 'true')
    this.video.playsInline = true
    this.video.controls = false
    this.video.preload = 'auto'
    this.video.volume = 1
    this.video.muted = false

    this.parkingHost = document.createElement('div')
    this.parkingHost.className = 'ht-tv-video-parking'
    this.parkingHost.setAttribute('aria-hidden', 'true')
    this.parkingHost.appendChild(this.video)

    if (typeof document !== 'undefined') {
      document.body.appendChild(this.parkingHost)
    }

    this.applyVideoPresentation(false)
    this.attachDevListeners()
  }

  getVideoElement(): HTMLVideoElement {
    return this.video
  }

  mount(container: HTMLElement | null) {
    if (!container) {
      this.unmount()
      return
    }
    if (this.mountedHost === container && this.video.parentNode === container) {
      this.applyVideoPresentation(true)
      return
    }
    this.mountedHost = container
    container.appendChild(this.video)
    this.applyVideoPresentation(true)
  }

  unmount() {
    if (this.video.parentNode !== this.parkingHost) {
      this.parkingHost.appendChild(this.video)
    }
    this.mountedHost = null
    this.applyVideoPresentation(false)
  }

  getPlaybackMetrics(): TvVideoPlaybackMetrics {
    const video = this.video
    const hasFrames = video.videoWidth > 0 && video.videoHeight > 0
    const isAcceptablePlayback =
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && hasFrames
      && !video.paused

    return {
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      muted: video.muted,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      hasFrames,
      isAcceptablePlayback,
      usesHlsJs: this.usesHlsJs,
      nativeHls: this.nativeHls,
      mediaErrorCode: video.error?.code ?? null,
    }
  }

  supportsPictureInPicture(): boolean {
    return (
      typeof document !== 'undefined'
      && document.pictureInPictureEnabled
      && typeof this.video.requestPictureInPicture === 'function'
    )
  }

  private applyVideoPresentation(visible: boolean) {
    this.video.style.width = '100%'
    this.video.style.height = '100%'
    this.video.style.objectFit = 'contain'
    this.video.style.background = '#000'
    this.video.style.display = 'block'
    this.video.style.pointerEvents = visible ? 'auto' : 'none'
    this.parkingHost.dataset.visible = visible ? 'true' : 'false'
  }

  private attachDevListeners() {
    if (this.devListenersAttached || !import.meta.env.DEV) return
    this.devListenersAttached = true
    for (const eventName of DEV_MEDIA_EVENTS) {
      this.video.addEventListener(eventName, () => logDevEvent(this.video, eventName))
    }
  }

  private destroyHls() {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    this.usesHlsJs = false
    this.nativeHls = false
  }

  private waitForCanPlay(timeoutMs = 15000): Promise<void> {
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

  private async attachSource(url: string, adapter: TvSourceAdapter | null): Promise<void> {
    this.destroyHls()
    this.video.pause()
    this.video.removeAttribute('src')

    const hlsSource = adapter === 'hls' || (adapter === null && isHlsStream(url))
    const useNative = hlsSource && canPlayNativeHls(this.video)
    if (useNative) {
      this.nativeHls = true
      this.video.src = url
      this.video.load()
      try {
        await this.waitForCanPlay()
        return
      } catch (nativeError) {
        this.nativeHls = false
        this.video.pause()
        this.video.removeAttribute('src')
        this.video.load()
        if (!Hls.isSupported()) throw nativeError
      }
    }

    if (hlsSource && Hls.isSupported()) {
      this.usesHlsJs = true
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 45,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 2,
      })
      this.hls = hls

      await new Promise<void>((resolve, reject) => {
        let settled = false
        let networkRecoveries = 0
        let mediaRecoveries = 0
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve()
        }

        const diagnosticEvents = [
          Hls.Events.MANIFEST_LOADING,
          Hls.Events.MANIFEST_LOADED,
          Hls.Events.LEVEL_LOADED,
          Hls.Events.FRAG_LOADING,
          Hls.Events.FRAG_LOADED,
        ] as const
        for (const eventName of diagnosticEvents) {
          hls.on(eventName, (_event: string, data: unknown) => {
            if (!import.meta.env.DEV) return
            const diagnostic = data as { url?: unknown; frag?: { url?: unknown }; response?: { code?: unknown } }
            console.info('[ht-tv-playback] hls-event', {
              event: eventName,
              endpoint: safeEndpoint(diagnostic.url ?? diagnostic.frag?.url),
              responseCode: diagnostic.response?.code ?? null,
            })
          })
        }

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (import.meta.env.DEV) {
            console.info('[ht-tv-playback] hls-event', {
              event: Hls.Events.MANIFEST_PARSED,
              endpoint: safeEndpoint(url),
            })
          }
          void this.waitForCanPlay().then(() => finish()).catch((err) => finish(
            err instanceof Error ? err : new Error(String(err)),
          ))
        })

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          const diagnostic = {
            type: data.type,
            details: data.details,
            fatal: data.fatal,
            responseCode: data.response?.code ?? null,
            endpoint: safeEndpoint(data.url ?? data.frag?.url ?? url),
            networkRecoveries,
            mediaRecoveries,
          }
          if (import.meta.env.DEV) console.error('[ht-tv-playback] hls-error', diagnostic)

          if (data.type === 'networkError' && networkRecoveries === 0) {
            networkRecoveries += 1
            hls.startLoad()
            return
          }
          if (data.type === 'mediaError' && mediaRecoveries === 0) {
            mediaRecoveries += 1
            hls.recoverMediaError()
            return
          }

          finish(new Error(
            data.type === 'networkError'
              ? 'The channel provider rejected or interrupted the connection.'
              : data.type === 'mediaError'
                ? 'This channel uses a video format this desktop cannot play.'
                : 'This channel\'s stream is currently unavailable.',
          ))
        })

        hls.loadSource(url)
        hls.attachMedia(this.video)
      })
      return
    }

    if (hlsSource) {
      throw new Error('HLS playback is not supported on this device.')
    }

    this.video.src = url
    this.video.load()
    await this.waitForCanPlay()
  }

  async play(input: string | TvResolvedPlayback): Promise<void> {
    const source = typeof input === 'string' ? null : input
    const normalized = (typeof input === 'string' ? input : input.streamUrl).trim()
    if (!normalized) {
      throw new Error('Missing stream URL')
    }

    this.video.muted = false

    const adapter = source ? resolveTvSourceAdapter(source) : null
    if (adapter === 'dash') {
      throw new Error('This backend-approved DASH source is not supported by the current Desktop player.')
    }
    if (adapter === 'web') {
      throw new Error('This backend-approved web source requires an approved Desktop web-player surface.')
    }
    if (adapter === 'unsupported') {
      throw new Error('This channel source format is not supported on Desktop.')
    }

    if (this.lastUrl !== normalized) {
      await this.attachSource(normalized, adapter)
      this.lastUrl = normalized
      await this.video.play()
      return
    }

    await this.video.play()
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
    this.destroyHls()
    this.video.pause()
    this.video.removeAttribute('src')
    void this.video.load()
    this.lastUrl = null
  }

  releaseSource(): void {
    this.stop()
  }

  destroy(): void {
    this.stop()
    this.unmount()
    if (this.parkingHost.parentNode) {
      this.parkingHost.parentNode.removeChild(this.parkingHost)
    }
  }
}
