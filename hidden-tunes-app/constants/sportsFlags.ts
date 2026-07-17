/**
 * Feature-flagged Sports client foundation.
 * Disabled by default — do not wire into production navigation yet.
 */

export const SPORTS_CLIENT_FLAGS = {
  sports_enabled: false,
  sports_home_ia_enabled: false,
  sports_mobile_pilot_enabled: false,
  sports_full_ui_enabled: false,
  sports_personalization_enabled: false,
  sports_scorebat_enabled: false,
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

/**
 * Full Sports UI is available only when the pilot stack is explicitly enabled.
 * Never auto-enables in production builds.
 */
export function isSportsFullUiEnabled(): boolean {
  return (
    isSportsClientEnabled("sports_enabled") &&
    isSportsClientEnabled("sports_mobile_pilot_enabled") &&
    isSportsClientEnabled("sports_full_ui_enabled")
  );
}

/**
 * Development fixture mode — impossible outside __DEV__.
 * Also requires EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES=true.
 */
export function isSportsDevFixturesEnabled(): boolean {
  if (typeof __DEV__ === "undefined" || !__DEV__) return false;
  const envVal = process.env.EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES;
  return envVal === "1" || envVal === "true";
}
