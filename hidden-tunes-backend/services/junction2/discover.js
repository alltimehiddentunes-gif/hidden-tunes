import { loadJunction2Config, isJunction2SearchActive, isOwnerCanaryQuery } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";
import { recordMetric } from "./metrics.js";
import { enrichSearchHit } from "./metadata/enrich.js";
import { isKnownUnplayable, needsPlayabilityProbe, probePlayability } from "./playability.js";
import { schedulePlaybackPrewarm } from "./prewarm.js";

/** Lower is better. Prefer providers that reliably resolve for tap-to-play. */
function playbackReliabilityRank(hit) {
  const provider = String(hit?.provider || "").toLowerCase();
  if (provider === "youtube") return 0;
  if (provider === "archive.org") return 1;
  if (provider === "bandcamp") return 2;
  if (provider === "soundcloud") return 4;
  return 3;
}

/** Keep relative order within a provider tier. */
export function orderByPlaybackReliability(hits) {
  return [...(Array.isArray(hits) ? hits : [])]
    .map((hit, index) => ({ hit, index }))
    .sort((a, b) => {
      const rank = playbackReliabilityRank(a.hit) - playbackReliabilityRank(b.hit);
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map((row) => row.hit);
}

export async function discoverAndMerge(localSongs, context = {}, deps = {}) {
  const local = Array.isArray(localSongs) ? localSongs : [];
  const config = deps.config || loadJunction2Config();
  if (!isJunction2SearchActive(config, context.query, context.rolloutKey)) return local;
  if (!context.query) return local;

  const publicBaseUrl = String(context.publicBaseUrl || "").trim();
  if (!publicBaseUrl) return local;

  const client = deps.client || getMediaBridgeClient(config);
  const store = deps.store || playbackStore;
  const canary = isOwnerCanaryQuery(context.query, config);
  const bridgeQuery =
    canary && config.ownerCanaryMode === "queries" && config.ownerCanaryUpstreamQuery
      ? config.ownerCanaryUpstreamQuery
      : context.query;
  const started = Date.now();
  const timeoutMs = canary ? config.ownerCanarySearchTimeoutMs : config.searchTimeoutMs;
  const enrichFn = deps.enrichSearchHit || enrichSearchHit;
  const probeFn = deps.probePlayability || probePlayability;

  recordMetric("externalSearchAttempt", { canary, workerRole: config.workerRole });

  try {
    const results = await client.search(bridgeQuery, {
      limit: config.searchLimit,
      signal: context.signal,
      timeoutMs,
    });
    // Prefer YouTube/archive ahead of SoundCloud; known-unplayable filtered below.
    const orderedResults = orderByPlaybackReliability(results);
    const mapped = [];
    const prewarmTargets = [];
    let enrichIndex = 0;
    // Metadata enrichment is bounded: deeper MusicBrainz lookup only for the first few hits.
    const enrichBudgetMs = Math.min(5_000, Math.max(1_200, Math.floor(timeoutMs * 0.6)));
    // Bounded playability prewarm for non-trusted providers (correctness > speed).
    const probeBudgetMs = Math.min(6_000, Math.max(1_500, Math.floor(timeoutMs * 0.5)));
    let probeSpentMs = 0;

    for (const hit of orderedResults) {
      if (!isPubliclySurfaceable(hit, config)) continue;
      if (isKnownUnplayable(hit)) continue;
      // Existing Hidden Tunes catalog match wins — do not create inferior duplicate.
      if (local.some((song) => isConservativeDuplicate(hit, song))) continue;

      let bridgeMediaId = hit.bridgeMediaId ? String(hit.bridgeMediaId) : null;
      if (needsPlayabilityProbe(hit)) {
        if (probeSpentMs >= probeBudgetMs) {
          // Out of probe budget: do not surface unknown-risk sources as tappable.
          continue;
        }
        const probeStarted = Date.now();
        const probed = await probeFn(hit, client, {
          signal: context.signal,
          timeoutMs: Math.min(2_500, probeBudgetMs - probeSpentMs),
        });
        probeSpentMs += Date.now() - probeStarted;
        if (!probed) continue;
        if (typeof probed === "string") bridgeMediaId = probed;
      }

      const deep = enrichIndex < 1;
      enrichIndex += 1;
      const enriched = await enrichFn(hit, {
        signal: context.signal,
        timeoutMs: deep ? enrichBudgetMs : Math.min(400, enrichBudgetMs),
      });

      // Wrong-song protection: enrichment cannot change playback source identity.
      if (
        enriched.provider !== hit.provider ||
        enriched.sourceId !== hit.sourceId ||
        enriched.canonicalSourceKey !== hit.canonicalSourceKey
      ) {
        continue;
      }

      if (local.some((song) => isConservativeDuplicate(enriched, song))) continue;

      const record = store.putFromSearchHit({
        ...enriched,
        bridgeMediaId: bridgeMediaId || enriched.bridgeMediaId || null,
      });
      const song = toPublicSong(record, publicBaseUrl);
      if (containsPublicLeak(song, publicBaseUrl)) continue;
      mapped.push(song);
      prewarmTargets.push(record);
    }

    const durationMs = Date.now() - started;
    recordMetric("externalSearchSuccess", {
      canary,
      workerRole: config.workerRole,
      surfaced: mapped.length,
      bridgeHits: Array.isArray(results) ? results.length : 0,
      durationMs,
    });

    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: mapped.length,
          bridgeHits: Array.isArray(results) ? results.length : 0,
          durationMs,
          status: "success",
        }),
      );
    }

    if (containsPublicLeak(mapped, publicBaseUrl)) return local;
    const limit = context.limit ?? local.length + mapped.length;
    let merged;
    if (canary) {
      const rest = local.filter(
        (song) => !mapped.some((hit) => isConservativeDuplicate({ title: hit.title, artist: hit.artist }, song)),
      );
      merged = [...mapped, ...rest].slice(0, limit);
    } else {
      merged = mergePreferLocal(local, mapped, limit);
    }

    // Search returns immediately; expensive resolve continues in background.
    if (deps.schedulePlaybackPrewarm !== false) {
      const schedule = deps.schedulePlaybackPrewarm || schedulePlaybackPrewarm;
      schedule(prewarmTargets, client, store, config);
    }
    return merged;
  } catch (err) {
    const durationMs = Date.now() - started;
    const aborted = Boolean(err?.name === "AbortError" || context.signal?.aborted || err?.code === "ABORT_ERR");
    recordMetric(aborted ? "externalSearchTimeout" : "externalSearchFailure", {
      canary,
      workerRole: config.workerRole,
      durationMs,
    });
    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: 0,
          durationMs,
          status: aborted ? "timeout" : "failure",
          error: "isolated",
        }),
      );
    }
    return local;
  }
}
