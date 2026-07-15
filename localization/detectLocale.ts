import { normalizeLocale } from "./normalizeLocale";
import type { SupportedLocale } from "./types";

/**
 * Reads the device locale once via Intl (no extra dependency).
 * Call only during localization initialization — not on every render.
 */
export function detectDeviceLocale(): SupportedLocale {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    return normalizeLocale(resolved);
  } catch {
    return "en";
  }
}
