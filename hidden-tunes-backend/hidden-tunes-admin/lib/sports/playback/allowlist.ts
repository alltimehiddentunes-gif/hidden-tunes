/**
 * Strict Sports playback host allowlist.
 * Database content cannot introduce arbitrary domains.
 */

export type SportsPlaybackKind = "iframe" | "webview" | "hls" | "dash" | "external";

export type SportsProviderAllowlistEntry = {
  hosts: readonly string[];
  playbackKinds: readonly SportsPlaybackKind[];
  /** When false, provider may only supply metadata / external links. */
  inAppPlaybackAllowed: boolean;
  /** ScoreBat free-feed is highlights; live requires confirmed entitlement. */
  contentClass: "live" | "highlights" | "replay" | "external" | "unknown";
};

export const SPORTS_PLAYBACK_ALLOWLIST = {
  scorebat: {
    hosts: [
      "scorebat.com",
      "www.scorebat.com",
      "youtube.com",
      "www.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ],
    playbackKinds: ["iframe", "webview"] as const,
    inAppPlaybackAllowed: true,
    /** Free Video API is highlights/replays unless live-streams entitlement is proven. */
    contentClass: "highlights" as const,
  },
  youtubeOfficial: {
    hosts: [
      "youtube.com",
      "www.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ],
    playbackKinds: ["iframe"] as const,
    inAppPlaybackAllowed: true,
    contentClass: "unknown" as const,
  },
} as const satisfies Record<string, SportsProviderAllowlistEntry>;

export type SportsAllowlistProviderId = keyof typeof SPORTS_PLAYBACK_ALLOWLIST;

export function getProviderAllowlist(
  providerId: string
): SportsProviderAllowlistEntry | null {
  const key = String(providerId || "").trim();
  if (key in SPORTS_PLAYBACK_ALLOWLIST) {
    return SPORTS_PLAYBACK_ALLOWLIST[key as SportsAllowlistProviderId];
  }
  return null;
}

export function isHostAllowedForProvider(
  providerId: string,
  host: string
): boolean {
  const entry = getProviderAllowlist(providerId);
  if (!entry) return false;
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!h) return false;
  for (const allowed of entry.hosts) {
    const a = allowed.toLowerCase();
    if (h === a || h.endsWith(`.${a}`)) return true;
  }
  return false;
}

export function isPlaybackKindAllowed(
  providerId: string,
  kind: SportsPlaybackKind
): boolean {
  const entry = getProviderAllowlist(providerId);
  if (!entry) return false;
  return (entry.playbackKinds as readonly string[]).includes(kind);
}

/** Map client playback kinds to allowlist kinds. */
export function normalizePlaybackKind(
  raw: string | null | undefined
): SportsPlaybackKind | null {
  const k = String(raw || "")
    .trim()
    .toLowerCase();
  if (k === "embed" || k === "iframe") return "iframe";
  if (k === "webview") return "webview";
  if (k === "hls") return "hls";
  if (k === "dash") return "dash";
  if (k === "external") return "external";
  return null;
}
