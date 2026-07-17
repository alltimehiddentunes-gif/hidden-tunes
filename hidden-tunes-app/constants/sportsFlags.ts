/**
 * Feature-flagged Sports client foundation.
 * Disabled by default — do not wire into production navigation yet.
 */

export const SPORTS_CLIENT_FLAGS = {
  sports_enabled: false,
  sports_home_ia_enabled: false,
  sports_mobile_pilot_enabled: false,
  sports_personalization_enabled: false,
  sports_native_playback_enabled: false,
  sports_embedded_playback_enabled: false,
  sports_external_watch_enabled: true,
  sports_live_scores_enabled: false,
  sports_notifications_enabled: false,
} as const;

export type SportsClientFlagKey = keyof typeof SPORTS_CLIENT_FLAGS;

export function isSportsClientEnabled(
  key: SportsClientFlagKey = "sports_enabled"
): boolean {
  const envKey = `EXPO_PUBLIC_${key.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return SPORTS_CLIENT_FLAGS[key];
}
