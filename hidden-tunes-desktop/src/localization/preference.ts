import { normalizeLocale } from './normalizeLocale'
import type { SupportedLocale } from './types'

export const SELECTED_LOCALE_STORAGE_KEY = 'hiddenTunes.selectedLocale'

export function readStoredLocale(): SupportedLocale | null {
  try {
    const raw = localStorage.getItem(SELECTED_LOCALE_STORAGE_KEY)
    return raw ? normalizeLocale(raw) : null
  } catch {
    return null
  }
}

export function persistLocale(locale: SupportedLocale): void {
  localStorage.setItem(SELECTED_LOCALE_STORAGE_KEY, locale)
}

export function detectSystemLocale(): SupportedLocale {
  try {
    return normalizeLocale(navigator.languages?.[0] ?? navigator.language ?? Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return 'en'
  }
}

export function resolveInitialLocale(): SupportedLocale {
  return readStoredLocale() ?? detectSystemLocale()
}
