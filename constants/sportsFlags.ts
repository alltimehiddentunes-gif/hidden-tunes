/**

 * Feature-flagged Sports client foundation.

 * Disabled by default — do not wire into production navigation yet.

 */



export const SPORTS_CLIENT_FLAGS = {

  sports_enabled: false,

  /** Fixture browse / schedules / results — independent of streams. */
  sports_fixtures_enabled: true,

  sports_home_ia_enabled: false,

  sports_mobile_pilot_enabled: false,

  sports_full_ui_enabled: false,

  sports_personalization_enabled: false,

  sports_scorebat_enabled: false,

  sports_native_playback_enabled: false,

  sports_embedded_playback_enabled: false,

  sports_external_watch_enabled: true,

  sports_live_scores_enabled: false,

  /** Verified legal streams only — must stay false for fixtures-only pilot. */
  sports_streams_enabled: false,

  /**
   * Canonical Live Sports TV catalog surface (category=Sports).
   * Independent of sports_streams_enabled — does not re-enable fixture broadcasts.
   */
  sports_tv_enabled: true,

  sports_notifications_enabled: false,

} as const;



export type SportsClientFlagKey = keyof typeof SPORTS_CLIENT_FLAGS;



/** Static env reads — Expo forbids dynamic process.env access. */

const SPORTS_ENV_OVERRIDES: Record<SportsClientFlagKey, string | undefined> = {

  sports_enabled: process.env.EXPO_PUBLIC_SPORTS_ENABLED,

  sports_fixtures_enabled: process.env.EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED,

  sports_home_ia_enabled: process.env.EXPO_PUBLIC_SPORTS_HOME_IA_ENABLED,

  sports_mobile_pilot_enabled: process.env.EXPO_PUBLIC_SPORTS_MOBILE_PILOT_ENABLED,

  sports_full_ui_enabled: process.env.EXPO_PUBLIC_SPORTS_FULL_UI_ENABLED,

  sports_personalization_enabled:

    process.env.EXPO_PUBLIC_SPORTS_PERSONALIZATION_ENABLED,

  sports_scorebat_enabled: process.env.EXPO_PUBLIC_SPORTS_SCOREBAT_ENABLED,

  sports_native_playback_enabled:

    process.env.EXPO_PUBLIC_SPORTS_NATIVE_PLAYBACK_ENABLED,

  sports_embedded_playback_enabled:

    process.env.EXPO_PUBLIC_SPORTS_EMBEDDED_PLAYBACK_ENABLED,

  sports_external_watch_enabled:

    process.env.EXPO_PUBLIC_SPORTS_EXTERNAL_WATCH_ENABLED,

  sports_live_scores_enabled: process.env.EXPO_PUBLIC_SPORTS_LIVE_SCORES_ENABLED,

  sports_streams_enabled: process.env.EXPO_PUBLIC_SPORTS_STREAMS_ENABLED,

  sports_tv_enabled: process.env.EXPO_PUBLIC_SPORTS_TV_ENABLED,

  sports_notifications_enabled:

    process.env.EXPO_PUBLIC_SPORTS_NOTIFICATIONS_ENABLED,

};



function parseEnvFlag(raw: string | undefined): boolean | null {

  if (raw === "1" || raw === "true") return true;

  if (raw === "0" || raw === "false") return false;

  return null;

}



export function isSportsClientEnabled(

  key: SportsClientFlagKey = "sports_enabled"

): boolean {

  const parsed = parseEnvFlag(SPORTS_ENV_OVERRIDES[key]);

  if (parsed !== null) return parsed;

  return SPORTS_CLIENT_FLAGS[key];

}



/** Named flag readers for hub visibility / diagnostics. Defaults remain false. */

export const sportsEnabled = isSportsClientEnabled("sports_enabled");

export const sportsFixturesEnabled = isSportsClientEnabled(
  "sports_fixtures_enabled"
);

export const sportsStreamsEnabled = isSportsClientEnabled(
  "sports_streams_enabled"
);

export const sportsTvEnabled = isSportsClientEnabled("sports_tv_enabled");

export const sportsLiveScoresEnabled = isSportsClientEnabled(
  "sports_live_scores_enabled"
);

export const sportsMobilePilotEnabled = isSportsClientEnabled(

  "sports_mobile_pilot_enabled"

);

export const sportsFullUiEnabled = isSportsClientEnabled("sports_full_ui_enabled");



export function isSportsFullUiEnabled(): boolean {

  return sportsEnabled && sportsMobilePilotEnabled && sportsFullUiEnabled;

}

/** Fixtures pilot surface — master flag plus fixtures capability. Streams stay separate. */
export function isSportsFixturesPilotEnabled(): boolean {
  return sportsEnabled && sportsFixturesEnabled;
}



/**

 * Development fixture mode — impossible outside __DEV__.

 * Controls fixture data only, not whether Sports Preview is shown.

 */

export function isSportsDevFixturesEnabled(): boolean {

  if (typeof __DEV__ === "undefined" || !__DEV__) return false;

  const envVal = process.env.EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES;

  return envVal === "1" || envVal === "true";

}



export const sportsUseDevFixtures = isSportsDevFixturesEnabled();


/**
 * Explicit test-only HTML player. Never enabled by __DEV__ alone.
 * Default false — private production pilot must not show development player.
 */
export function isSportsTestPlayerEnabled(): boolean {
  if (typeof __DEV__ === "undefined" || !__DEV__) return false;
  const envVal = process.env.EXPO_PUBLIC_SPORTS_ENABLE_TEST_PLAYER;
  return envVal === "1" || envVal === "true";
}
