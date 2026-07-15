import type { ApiSong } from '../api'

export type MediaSessionActionHandlers = {
  play: () => void | Promise<void>
  pause: () => void
  previoustrack: () => void
  nexttrack: () => void
  seekbackward?: (details: MediaSessionActionDetails) => void
  seekforward?: (details: MediaSessionActionDetails) => void
  seekto?: (details: MediaSessionActionDetails) => void
}

function hasMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

export function updateMediaSessionMetadata(track: ApiSong | null): void {
  if (!hasMediaSession()) return

  if (!track) {
    navigator.mediaSession.metadata = null
    return
  }

  const artworkUrl = typeof track.artwork === 'string' ? track.artwork.trim() : ''
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || 'Hidden Tunes',
    artist: track.artist || 'Unknown artist',
    album: track.album || 'Hidden Tunes',
    artwork: artworkUrl
      ? [
          { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      : [],
  })
}

export function updateMediaSessionPlaybackState(isPlaying: boolean): void {
  if (!hasMediaSession()) return
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
}

export function updateMediaSessionPositionState(options: {
  duration: number
  position: number
  playbackRate?: number
}): void {
  if (!hasMediaSession() || typeof navigator.mediaSession.setPositionState !== 'function') {
    return
  }

  const duration = Number.isFinite(options.duration) && options.duration > 0 ? options.duration : 0
  if (duration <= 0) return

  const position = Math.max(0, Math.min(options.position, duration))
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position,
      playbackRate: options.playbackRate && options.playbackRate > 0 ? options.playbackRate : 1,
    })
  } catch {
    // Some Chromium builds reject out-of-range updates transiently.
  }
}

export function bindMediaSessionActions(handlers: MediaSessionActionHandlers): () => void {
  if (!hasMediaSession()) return () => {}

  const actions: Array<keyof MediaSessionActionHandlers> = [
    'play',
    'pause',
    'previoustrack',
    'nexttrack',
    'seekbackward',
    'seekforward',
    'seekto',
  ]

  for (const action of actions) {
    const handler = handlers[action]
    if (!handler) continue
    try {
      navigator.mediaSession.setActionHandler(action, handler as MediaSessionActionHandler)
    } catch {
      // Action may be unsupported on this platform.
    }
  }

  return () => {
    for (const action of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, null)
      } catch {
        // ignore
      }
    }
  }
}
