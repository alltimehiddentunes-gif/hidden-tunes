import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AlbumSort, ArtistSort, SongSort } from './api'

const STORAGE_PREFIX = 'ht-desktop:'

export const AUDIOBOOK_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export type AudiobookPlaybackRate = (typeof AUDIOBOOK_PLAYBACK_RATES)[number]

export const DESKTOP_PREFERENCE_KEYS = {
  activePage: 'active-page',
  audioQualityMode: 'audio-quality-mode',
  audiobookPlaybackRate: 'audiobook-playback-rate',
  atmosphereEnabled: 'atmosphere-enabled',
  atmosphereId: 'atmosphere-id',
  atmosphereIntensity: 'atmosphere-intensity',
  discoverSearch: 'discover-search',
  discoverSort: 'discover-sort',
  artistsSearch: 'artists-search',
  artistsSort: 'artists-sort',
  albumsSearch: 'albums-search',
  albumsSort: 'albums-sort',
} as const

const ALL_PREFERENCE_KEYS = Object.values(DESKTOP_PREFERENCE_KEYS)

const PAGE_IDS = [
  'home',
  'music',
  'radio',
  'podcasts',
  'discover',
  'mood',
  'library',
  'artists',
  'albums',
  'playlists',
  'audiobooks',
  'motivationals',
  'tv',
  'settings',
] as const

export type StoredPageId = (typeof PAGE_IDS)[number]

export const AUDIO_QUALITY_MODES = [
  'auto',
  'data-saver',
  'standard',
  'high-quality',
] as const

export type AudioQualityMode = (typeof AUDIO_QUALITY_MODES)[number]

export const AUDIO_QUALITY_MODE_LABELS: Record<AudioQualityMode, string> = {
  auto: 'Auto',
  'data-saver': 'Data Saver',
  standard: 'Standard',
  'high-quality': 'High Quality',
}

export function getStoredPreference<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const item = localStorage.getItem(STORAGE_PREFIX + key)
    if (item === null) return fallback
    return JSON.parse(item) as T
  } catch {
    return fallback
  }
}

export function setStoredPreference<T>(key: string, value: T): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable or full — ignore safely.
  }
}

export function removeStoredPreference(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // Ignore removal failures.
  }
}

export function resetDesktopPreferences(): void {
  for (const key of ALL_PREFERENCE_KEYS) {
    removeStoredPreference(key)
  }
}

export function parseStoredPageId(value: unknown): StoredPageId | null {
  return typeof value === 'string' && PAGE_IDS.includes(value as StoredPageId)
    ? (value as StoredPageId)
    : null
}

export function parseStoredSearchTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.slice(0, 200)
}

export function parseStoredSongSort(value: unknown): SongSort | null {
  return value === 'latest' || value === 'az' ? value : null
}

export function parseStoredArtistSort(value: unknown): ArtistSort | null {
  return value === 'az' || value === 'tracks' ? value : null
}

export function parseStoredAlbumSort(value: unknown): AlbumSort | null {
  return value === 'latest' || value === 'az' ? value : null
}

export function parseStoredAudioQualityMode(
  value: unknown,
): AudioQualityMode | null {
  return typeof value === 'string' &&
    AUDIO_QUALITY_MODES.includes(value as AudioQualityMode)
    ? (value as AudioQualityMode)
    : null
}

export function parseStoredAudiobookPlaybackRate(
  value: unknown,
): AudiobookPlaybackRate | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return AUDIOBOOK_PLAYBACK_RATES.includes(numeric as AudiobookPlaybackRate)
    ? (numeric as AudiobookPlaybackRate)
    : null
}

function readValidatedPreference<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => T | null,
): T {
  const stored = getStoredPreference<unknown>(key, null)
  if (stored === null) return fallback
  return validate(stored) ?? fallback
}

type PreferencesResetContextValue = {
  resetVersion: number
  resetDesktopPreferencesState: () => void
}

const PreferencesResetContext = createContext<PreferencesResetContextValue | null>(null)

function usePreferencesResetContext() {
  const value = useContext(PreferencesResetContext)
  if (!value) {
    throw new Error('usePersistedPreference must be used within PreferencesResetProvider')
  }
  return value
}

export function PreferencesResetProvider({ children }: { children: ReactNode }) {
  const [resetVersion, setResetVersion] = useState(0)

  const resetDesktopPreferencesState = useCallback(() => {
    resetDesktopPreferences()
    setResetVersion((version) => version + 1)
  }, [])

  const value = useMemo(
    () => ({ resetVersion, resetDesktopPreferencesState }),
    [resetVersion, resetDesktopPreferencesState],
  )

  return createElement(PreferencesResetContext.Provider, { value }, children)
}

export function usePreferencesReset() {
  return usePreferencesResetContext()
}

export function usePersistedPreference<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => T | null,
): [T, (next: T) => void] {
  const { resetVersion } = usePreferencesResetContext()

  const [value, setValue] = useState(() => readValidatedPreference(key, fallback, validate))

  useEffect(() => {
    setValue(readValidatedPreference(key, fallback, validate))
  }, [key, fallback, validate, resetVersion])

  const setPreference = useCallback(
    (next: T) => {
      setValue(next)
      setStoredPreference(key, next)
    },
    [key],
  )

  return [value, setPreference]
}
