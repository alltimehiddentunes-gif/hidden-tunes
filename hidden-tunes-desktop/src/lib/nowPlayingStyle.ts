import { useCallback, useState } from 'react'

export const NOW_PLAYING_STYLE_STORAGE_KEY = 'hidden-tunes-now-playing-style'

export const NOW_PLAYING_STYLES = [
  'player-1',
  'player-2',
  'player-3',
  'player-4',
  'player-5',
] as const

export type NowPlayingStyle = (typeof NOW_PLAYING_STYLES)[number]

export const DEFAULT_NOW_PLAYING_STYLE: NowPlayingStyle = 'player-1'

export const NOW_PLAYING_STYLE_OPTIONS: ReadonlyArray<{
  id: NowPlayingStyle
  label: string
  description: string
}> = [
  {
    id: 'player-1',
    label: 'Classic Vinyl',
    description: 'Cinema master layout with vinyl art, queue tabs, and live waveform.',
  },
  {
    id: 'player-2',
    label: 'Premium PSD Player',
    description: 'Theater sidebar with hero art, lyrics panel, and queue preview.',
  },
  {
    id: 'player-3',
    label: 'Cinematic Waveform',
    description: 'VIP disc stage with visualizer tab and up-next rail.',
  },
  {
    id: 'player-4',
    label: 'Theater Mode',
    description: 'Wide theater hero with lyrics card and mastered artwork frame.',
  },
  {
    id: 'player-5',
    label: 'Ambient World Player',
    description: 'Ambient VIP layout with inline art controls and listening stats.',
  },
]

export function parseNowPlayingStyle(value: unknown): NowPlayingStyle | null {
  return typeof value === 'string' && NOW_PLAYING_STYLES.includes(value as NowPlayingStyle)
    ? (value as NowPlayingStyle)
    : null
}

export function getPreferredNowPlayingStyle(): NowPlayingStyle {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_NOW_PLAYING_STYLE
    const raw = localStorage.getItem(NOW_PLAYING_STYLE_STORAGE_KEY)
    if (raw === null) return DEFAULT_NOW_PLAYING_STYLE
    const parsed = parseNowPlayingStyle(raw)
    if (parsed) return parsed
    try {
      return parseNowPlayingStyle(JSON.parse(raw)) ?? DEFAULT_NOW_PLAYING_STYLE
    } catch {
      return DEFAULT_NOW_PLAYING_STYLE
    }
  } catch {
    return DEFAULT_NOW_PLAYING_STYLE
  }
}

export function setPreferredNowPlayingStyle(style: NowPlayingStyle): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(NOW_PLAYING_STYLE_STORAGE_KEY, style)
  } catch {
    // Storage may be unavailable or full — ignore safely.
  }
}

export function usePreferredNowPlayingStyle(): [NowPlayingStyle, (style: NowPlayingStyle) => void] {
  const [style, setStyleState] = useState<NowPlayingStyle>(() => getPreferredNowPlayingStyle())

  const setStyle = useCallback((next: NowPlayingStyle) => {
    setPreferredNowPlayingStyle(next)
    setStyleState(next)
  }, [])

  return [style, setStyle]
}
