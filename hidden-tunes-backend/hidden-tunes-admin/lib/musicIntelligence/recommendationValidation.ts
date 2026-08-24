import { MAX_CONTEXT_IDS, MAX_RECOMMENDATIONS, type RecommendationRequest } from "./recommendationTypes";
import type { JourneyMode } from "./types";
const JOURNEYS = new Set<JourneyMode>(["CONTINUE", "DEEPEN", "RECOVER", "UPLIFT"]);
const id = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 128;
function ids(value: unknown, name: string): string[] { if (value == null) return []; if (!Array.isArray(value) || value.length > MAX_CONTEXT_IDS || value.some((entry) => !id(entry))) throw new Error(`${name}_invalid`); return [...new Set(value as string[])]; }
function counts(value: unknown, name: string): Record<string, number> { if (value == null) return {}; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name}_invalid`); const entries = Object.entries(value); if (entries.length > MAX_CONTEXT_IDS || entries.some(([key, count]) => !id(key) || typeof count !== "number" || !Number.isFinite(count) || count < 0 || count > 10_000)) throw new Error(`${name}_invalid`); return Object.fromEntries(entries); }
export function parseRecommendationRequest(value: unknown, rawBytes?: number): RecommendationRequest & { journeyIntent: JourneyMode; limit: number } {
  if (rawBytes != null && rawBytes > 16_384) throw new Error("request_too_large"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("request_invalid");
  const body = value as Record<string, unknown>; if (!id(body.seedSongId)) throw new Error("seedSongId_invalid"); if (body.generationToken != null && !id(body.generationToken)) throw new Error("generationToken_invalid");
  const journey = body.journeyIntent == null ? "CONTINUE" : body.journeyIntent; if (typeof journey !== "string" || !JOURNEYS.has(journey as JourneyMode)) throw new Error("journeyIntent_invalid");
  const limit = body.limit == null ? 10 : body.limit; if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > MAX_RECOMMENDATIONS) throw new Error("limit_invalid");
  const rawListener = body.listener == null ? {} : body.listener; if (!rawListener || typeof rawListener !== "object" || Array.isArray(rawListener)) throw new Error("listener_invalid"); const l = rawListener as Record<string, unknown>;
  return { seedSongId: body.seedSongId as string, journeyIntent: journey as JourneyMode, limit: Number(limit), generationToken: body.generationToken as string | undefined,
    recentSongIds: ids(body.recentSongIds, "recentSongIds"), recentlySkippedSongIds: ids(body.recentlySkippedSongIds, "recentlySkippedSongIds"), manuallyQueuedSongIds: ids(body.manuallyQueuedSongIds, "manuallyQueuedSongIds"),
    listener: { completions: counts(l.completions, "completions"), replays: counts(l.replays, "replays"), favorites: ids(l.favorites, "favorites"), librarySaves: ids(l.librarySaves, "librarySaves"), playlistAdds: ids(l.playlistAdds, "playlistAdds"), followedArtists: ids(l.followedArtists, "followedArtists"), lateSkips: ids(l.lateSkips, "lateSkips") } };
}
