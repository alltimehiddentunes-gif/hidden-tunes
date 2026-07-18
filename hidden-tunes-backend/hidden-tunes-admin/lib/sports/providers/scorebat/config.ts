/**
 * ScoreBat provider configuration — all controls default OFF.
 */

export const SCOREBAT_PROVIDER_SLUG = "scorebat" as const;
export const SCOREBAT_PROVIDER_NAME = "ScoreBat";
export const SCOREBAT_PROVIDER_TYPE = "video_api" as const;
export const SCOREBAT_PRIMARY_SPORT = "football" as const;

export const SCOREBAT_API_BASE = "https://www.scorebat.com/video-api/v3";

export const SCOREBAT_ALLOWED_EMBED_HOSTS = [
  "www.scorebat.com",
  "scorebat.com",
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
] as const;

export type ScoreBatRuntimeConfig = {
  enabled: boolean;
  discoveryEnabled: boolean;
  playbackEnabled: boolean;
  killSwitch: boolean;
  maxItems: number;
  maxNewFixtures: number;
  maxBroadcasts: number;
  lookaheadHours: number;
  lookbackHours: number;
  pollIntervalSeconds: number;
  kickoffToleranceMinutes: number;
  timeoutMs: number;
  useFixtures: boolean;
};

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

function envInt(key: string, fallback: number, max: number): number {
  const n = Number(process.env[key]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/** Compile-time / env defaults — unfinished ScoreBat stays off. */
export function getScoreBatRuntimeConfig(
  over: Partial<ScoreBatRuntimeConfig> = {}
): ScoreBatRuntimeConfig {
  return {
    enabled: over.enabled ?? envBool("SPORTS_SCOREBAT_ENABLED", false),
    discoveryEnabled:
      over.discoveryEnabled ??
      envBool("SPORTS_SCOREBAT_DISCOVERY_ENABLED", false),
    playbackEnabled:
      over.playbackEnabled ??
      envBool("SPORTS_SCOREBAT_PLAYBACK_ENABLED", false),
    killSwitch: over.killSwitch ?? !envBool("SPORTS_SCOREBAT_ENABLED", false),
    maxItems: over.maxItems ?? envInt("SPORTS_SCOREBAT_MAX_ITEMS", 100, 100),
    maxNewFixtures: over.maxNewFixtures ?? 50,
    maxBroadcasts: over.maxBroadcasts ?? 100,
    lookaheadHours: over.lookaheadHours ?? 24,
    lookbackHours: over.lookbackHours ?? 24,
    pollIntervalSeconds:
      over.pollIntervalSeconds ??
      envInt("SPORTS_SCOREBAT_POLL_INTERVAL_SECONDS", 120, 3600),
    kickoffToleranceMinutes: over.kickoffToleranceMinutes ?? 30,
    timeoutMs: over.timeoutMs ?? 15_000,
    useFixtures:
      over.useFixtures ?? envBool("SPORTS_SCOREBAT_USE_FIXTURES", false),
  };
}

export function hasScoreBatToken(): boolean {
  return Boolean(String(process.env.SCOREBAT_API_TOKEN || "").trim());
}

/** Never log or return the raw token. */
export function scoreBatTokenPresentLabel(): "present" | "absent" {
  return hasScoreBatToken() ? "present" : "absent";
}
