import { createHash } from "node:crypto";
import { PROFILE_SCHEMA_VERSION, TAXONOMY_VERSION } from "./profilePersistence";
import { rankCandidates } from "./ranker";
import { RecommendationCache } from "./recommendationCache";
import type { EmotionalProfileRepository, MusicCatalogRepository } from "./recommendationRepositories";
import { RECOMMENDATION_RANKING_VERSION, type RecommendationResponse, type RecommendationSuccess } from "./recommendationTypes";
import { parseRecommendationRequest } from "./recommendationValidation";
import type { ListenerSignals } from "./types";

type CachedSuccess = Omit<RecommendationSuccess, "generationToken" | "diagnostics">;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`; return JSON.stringify(value); };
const elapsed = (start: number) => Number((performance.now() - start).toFixed(3));
const sharedCache = new RecommendationCache<CachedSuccess>();
export type RecommendationServiceOptions = { catalog: MusicCatalogRepository; profiles: EmotionalProfileRepository; cache?: RecommendationCache<CachedSuccess>; allowMature?: boolean; territory?: string | null; diagnostics?: boolean; };

export async function recommendMusic(raw: unknown, authenticatedUserId: string, options: RecommendationServiceOptions): Promise<RecommendationResponse> {
  let request: ReturnType<typeof parseRecommendationRequest>;
  try { request = parseRecommendationRequest(raw); } catch (error) { return { success: false, error: "invalid_request", message: error instanceof Error ? error.message : "invalid_request", retryable: false, generationToken: null }; }
  const token = request.generationToken ?? null; const timings: Record<string, number> = {}; const totalStart = performance.now(); const cache = options.cache ?? sharedCache;
  const cacheKey = hash(stable({ user: hash(authenticatedUserId), seed: request.seedSongId, journey: request.journeyIntent, limit: request.limit, generation: token,
    recent: request.recentSongIds, skipped: request.recentlySkippedSongIds, manual: request.manuallyQueuedSongIds, listener: request.listener,
    mature: options.allowMature === true, territory: options.territory ?? null, ranking: RECOMMENDATION_RANKING_VERSION, profile: PROFILE_SCHEMA_VERSION, taxonomy: TAXONOMY_VERSION }));
  try { const hit = cache.get(cacheKey); if (hit) return { ...hit, generationToken: token, diagnostics: options.diagnostics ? { cache: "hit", candidateCount: hit.recommendations.length, timingsMs: { total: elapsed(totalStart) } } : undefined }; } catch { /* cache failure is non-fatal */ }
  const execute = async (): Promise<CachedSuccess> => {
    const seedStarted = performance.now(); const seed = await options.catalog.getSeed(request.seedSongId); timings.seedLookup = elapsed(seedStarted); if (!seed) throw Object.assign(new Error("seed_not_found"), { code: "seed_not_found" });
    const candidateStarted = performance.now(); const candidates = await options.catalog.getCandidates(seed, 160); timings.eligibilityQuery = elapsed(candidateStarted); if (!candidates.length) throw Object.assign(new Error("no_eligible_candidates"), { code: "no_eligible_candidates" });
    const profileStarted = performance.now(); const profiles = await options.profiles.getProfiles([seed.id, ...candidates.map((song) => song.id)]); timings.profileLookup = elapsed(profileStarted);
    const l = request.listener ?? {}; const listener: ListenerSignals = { completions: l.completions ?? {}, replays: l.replays ?? {}, favorites: l.favorites ?? [], librarySaves: l.librarySaves ?? [], playlistAdds: l.playlistAdds ?? [], followedArtists: l.followedArtists ?? [], immediateSkips: request.recentlySkippedSongIds ?? [], lateSkips: l.lateSkips ?? [], recentlyPlayed: request.recentSongIds ?? [] };
    const rankingStarted = performance.now(); const ranked = rankCandidates({ seed, candidates, journey: request.journeyIntent, listener, existingQueueIds: request.manuallyQueuedSongIds, allowMature: options.allowMature === true, limit: request.limit, candidateLimit: 160, profileCache: profiles }); timings.ranking = elapsed(rankingStarted);
    if (!ranked.length) throw Object.assign(new Error("no_eligible_candidates"), { code: "no_eligible_candidates" });
    return { success: true, seedSongId: seed.id, effectiveIntent: request.journeyIntent, rankingVersion: RECOMMENDATION_RANKING_VERSION,
      recommendations: ranked.map((entry, index) => ({ songId: entry.song.id, position: index + 1, finalScore: entry.components.final, profileConfidence: entry.profile.confidence, journeyCompatibility: entry.components.journey, rankingVersion: RECOMMENDATION_RANKING_VERSION, explanation: options.diagnostics ? entry.components : undefined })) };
  };
  try { let result: { value: CachedSuccess; coalesced: boolean }; let cacheMode: "miss" | "coalesced" | "bypassed"; try { result = await cache.coalesce(cacheKey, execute); cacheMode = result.coalesced ? "coalesced" : "miss"; } catch { result = { value: await execute(), coalesced: false }; cacheMode = "bypassed"; } try { cache.set(cacheKey, result.value); } catch { cacheMode = "bypassed"; } timings.total = elapsed(totalStart); return { ...result.value, generationToken: token, diagnostics: options.diagnostics ? { cache: cacheMode, candidateCount: result.value.recommendations.length, timingsMs: timings } : undefined }; }
  catch (error) { const code = error && typeof error === "object" && "code" in error ? String(error.code) : "service_unavailable"; const known = code === "seed_not_found" || code === "no_eligible_candidates" ? code : "service_unavailable"; return { success: false, error: known, message: known, retryable: known !== "seed_not_found", generationToken: token }; }
}
