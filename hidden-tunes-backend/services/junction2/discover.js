import { loadJunction2Config, isJunction2SearchActive, isOwnerCanaryQuery } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";
import { recordMetric } from "./metrics.js";
import { enrichSearchHit } from "./metadata/enrich.js";
import { isKnownUnplayable, needsPlayabilityProbe } from "./playability.js";
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

/**
 * User-facing search must not wait on MusicBrainz / artwork / sync playability probes.
 * Deep enrichment may continue after the response (cache only).
 */
function searchPostProcessBudgetMs(timeoutMs, env = process.env) {
  const raw = Number.parseInt(String(env.J2_SEARCH_POST_BUDGET_MS || ""), 10);
  if (Number.isFinite(raw) && raw > 0) return Math.min(2_000, raw);
  // Keep presentation work tiny relative to bridge search budget.
  return Math.min(400, Math.max(120, Math.floor(Number(timeoutMs) * 0.15) || 200));
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
  const postBudgetMs = searchPostProcessBudgetMs(timeoutMs);

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
    const deepEnrichQueue = [];
    const mapStarted = Date.now();

    for (const hit of orderedResults) {
      if (Date.now() - mapStarted >= postBudgetMs) break;
      if (!isPubliclySurfaceable(hit, config)) continue;
      if (isKnownUnplayable(hit)) continue;
      // Existing Hidden Tunes catalog match wins — do not create inferior duplicate.
      if (local.some((song) => isConservativeDuplicate(hit, song))) continue;

      // Do NOT synchronously probe playability here — that serialized search to multi-second stalls.
      // Trusted providers surface immediately; unknown-risk (e.g. SoundCloud) stay excluded unless
      // already negatively cached as unplayable (handled above) or previously proven playable.
      if (needsPlayabilityProbe(hit) && !hit.bridgeMediaId) {
        continue;
      }

      let bridgeMediaId = hit.bridgeMediaId ? String(hit.bridgeMediaId) : null;

      // Shallow enrich only (source-basic / cache). Deep MusicBrainz is async after return.
      const remaining = Math.max(50, postBudgetMs - (Date.now() - mapStarted));
      const enriched = await enrichFn(hit, {
        signal: context.signal,
        timeoutMs: Math.min(250, remaining),
        mode: "shallow",
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
      deepEnrichQueue.push(hit);
    }

    const durationMs = Date.now() - started;
    recordMetric("externalSearchSuccess", {
      canary,
      workerRole: config.workerRole,
      surfaced: mapped.length,
      bridgeHits: Array.isArray(results) ? results.length : 0,
      durationMs,
      postProcessMs: Date.now() - mapStarted,
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
          postProcessMs: Date.now() - mapStarted,
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

    // Deep enrichment populates cache only — never blocks the user-facing search path.
    if (deps.asyncDeepEnrich !== false && deepEnrichQueue.length) {
      const deepHits = deepEnrichQueue.slice(0, 3);
      setImmediate(() => {
        for (const hit of deepHits) {
          Promise.resolve(
            enrichFn(hit, { timeoutMs: 2_500, mode: "deep" }),
          ).catch(() => {
            /* isolated */
          });
        }
      });
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
