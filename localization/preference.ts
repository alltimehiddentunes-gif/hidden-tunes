import AsyncStorage from "@react-native-async-storage/async-storage";

import { detectDeviceLocale } from "./detectLocale";
import { normalizeLocale } from "./normalizeLocale";
import { isSupportedLocale } from "./supportedLocales";
import type { SupportedLocale } from "./types";

export const SELECTED_LOCALE_STORAGE_KEY = "hiddenTunes.selectedLocale";

let userHasSelectedLocale = false;

export function hasUserSelectedLocale(): boolean {
  return userHasSelectedLocale;
}

export function markUserSelectedLocale(): void {
  userHasSelectedLocale = true;
}

export async function readStoredLocale(): Promise<SupportedLocale | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_LOCALE_STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeLocale(raw);
    if (!isSupportedLocale(normalized)) return null;
    userHasSelectedLocale = true;
    return normalized;
  } catch {
    return null;
  }
}

export async function persistLocale(locale: SupportedLocale): Promise<void> {
  await AsyncStorage.setItem(SELECTED_LOCALE_STORAGE_KEY, locale);
  userHasSelectedLocale = true;
}

/**
 * Priority: saved user selection → supported device language → English.
 * Invalid / unsupported saved codes never propagate.
 */
export async function resolveInitialLocale(): Promise<SupportedLocale> {
  const saved = await readStoredLocale();
  if (saved && isSupportedLocale(saved)) return saved;
  const detected = detectDeviceLocale();
  if (isSupportedLocale(detected)) return detected;
  return "en";
}
