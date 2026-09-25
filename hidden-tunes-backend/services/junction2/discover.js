import { loadJunction2Config, isJunction2SearchActive, isOwnerCanaryQuery } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";
import { recordMetric } from "./metrics.js";
import { enrichSearchHit } from "./metadata/enrich.js";
import { isKnownUnplayable, needsPlayabilityProbe } from "./playability.js";
import { onSearchResults } from "./preparation.js";
import { resolveHitIdentities, rememberTrackRelationships } from "./identity.js";

/** Lower is better. Prefer providers that reliably resolve for tap-to-play. */
function playbackReliabilityRank(hit) {
  const provider = String(hit?.provider || "").toLowerCase();
  // YouTube worker now delivers progressive m4a/mp4; Archive often returns non-audio items first.
  if (provider === "youtube") return 0;
  if (provider === "archive.org" || provider === "archive") return 1;
  if (provider === "bandcamp") return 2;
  if (provider === "soundcloud") return 4;
  return 3;
}

/** Providers Bridge/Gateway can actually resolve for playback. */
export function isResolvableExternalProvider(hit) {
  const provider = String(hit?.provider || "").toLowerCase();
  if (!provider) return false;
  if (provider === "mediacache" || provider === "artist" || provider === "album" || provider === "seed") {
    return false;
  }
  if (!["youtube", "archive.org", "soundcloud", "bandcamp"].includes(provider)) return false;
  const sourceId = String(hit?.sourceId || "").trim();
  if (!sourceId || /\s/.test(sourceId)) return false;
  // YouTube channel IDs (UC…) are not playable track identities.
  if (provider === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(sourceId)) return false;
  return true;
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
  // Never let optional verify/enrich hold the user-visible search — public and owner canary
  // share the same tiny post budget. Prep + playback prove PLAYER_COMPATIBLE asynchronously.
  const postBudgetMs = searchPostProcessBudgetMs(timeoutMs);

  recordMetric("externalSearchAttempt", { canary, workerRole: config.workerRole });

  try {
    const results = await client.search(bridgeQuery, {
      limit: config.searchLimit,
      signal: context.signal,
      timeoutMs,
    });
    const rawCount = Array.isArray(results) ? results.length : 0;
    const byProvider = {};
    for (const hit of Array.isArray(results) ? results : []) {
      const p = String(hit?.provider || "unknown").toLowerCase();
      byProvider[p] = (byProvider[p] || 0) + 1;
    }
    // Keep Gateway relevance order for display. Never rewrite top-N by provider speed.
    const relevanceOrder = Array.isArray(results) ? results : [];
    const mapped = [];
    const prewarmTargets = [];
    const deepEnrichQueue = [];
    const mapStarted = Date.now();
    let skippedPolicy = 0;
    let skippedUnplayable = 0;
    let skippedDedupe = 0;
    let skippedProbe = 0;
    let skippedEnrichIdentity = 0;
    let skippedBudget = 0;
    let skippedVerify = 0;
    // Sync verify-before-surface was stacking 4–12s cold resolves into search p95.
    // Surface trusted resolvable providers immediately; preparation warms SOURCE_READY.
    /** @type {Map<string, string>} */
    const verifiedBridgeIds = new Map();

    for (const hit of relevanceOrder) {
      if (Date.now() - mapStarted >= postBudgetMs) {
        skippedBudget += 1;
        break;
      }
      if (!isPubliclySurfaceable(hit, config)) {
        skippedPolicy += 1;
        continue;
      }
      if (!isResolvableExternalProvider(hit)) {
        skippedPolicy += 1;
        continue;
      }
      if (!config.youtubeSurfaceEnabled && String(hit?.provider || "").toLowerCase() === "youtube") {
        skippedPolicy += 1;
        continue;
      }
      if (isKnownUnplayable(hit)) {
        skippedUnplayable += 1;
        continue;
      }
      // Existing Hidden Tunes catalog match wins — do not create inferior duplicate.
      if (local.some((song) => isConservativeDuplicate(hit, song))) {
        skippedDedupe += 1;
        continue;
      }

      // Do NOT synchronously probe playability here — that serialized search to multi-second stalls.
      // Trusted providers (YouTube/archive) surface immediately.
      // Probe-required providers (e.g. SoundCloud): in owner-canary, still surface so a YouTube
      // miss cannot zero the whole query; prep/play validates. Public rollout stays conservative.
      if (needsPlayabilityProbe(hit) && !hit.bridgeMediaId) {
        if (!canary) {
          skippedProbe += 1;
          continue;
        }
      }

      const key = String(hit.canonicalSourceKey || `${hit.provider}:${hit.sourceId}`)
        .trim()
        .toLowerCase();
      let bridgeMediaId = hit.bridgeMediaId ? String(hit.bridgeMediaId) : null;

      // Prefer a previously verified bridge id when present; do not block search for verify.
      if (key && verifiedBridgeIds.has(key)) {
        bridgeMediaId = verifiedBridgeIds.get(key) || bridgeMediaId;
      }

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
        skippedEnrichIdentity += 1;
        continue;
      }

      if (local.some((song) => isConservativeDuplicate(enriched, song))) {
        skippedDedupe += 1;
        continue;
      }

      // Attach Track↔Artist↔Album identities (catalog wins when confidently matched).
      let identities = { artistId: null, albumId: null, artistName: null, albumTitle: null };
      try {
        identities = await resolveHitIdentities(enriched, { lookupCatalog: true });
      } catch {
        /* identity is optional enhancement — never zero the candidate */
      }

      const record = store.putFromSearchHit({
        ...enriched,
        bridgeMediaId: bridgeMediaId || enriched.bridgeMediaId || null,
        artistId: identities.artistId,
        albumId: identities.albumId,
        artist: identities.artistName || enriched.artist,
        album: identities.albumTitle || enriched.album,
      });
      rememberTrackRelationships(record);
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
      bridgeHits: rawCount,
      durationMs,
      postProcessMs: Date.now() - mapStarted,
      skippedPolicy,
      skippedUnplayable,
      skippedDedupe,
      skippedProbe,
      skippedEnrichIdentity,
      skippedBudget,
      skippedVerify,
      youtubeRaw: byProvider.youtube || 0,
      soundcloudRaw: byProvider.soundcloud || 0,
      archiveRaw: byProvider["archive.org"] || 0,
    });

    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: mapped.length,
          bridgeHits: rawCount,
          durationMs,
          postProcessMs: Date.now() - mapStarted,
          stages: {
            raw: rawCount,
            byProvider,
            skippedPolicy,
            skippedUnplayable,
            skippedDedupe,
            skippedProbe,
            skippedBudget,
            skippedVerify,
            public: mapped.length,
          },
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

    // Register FINAL visible external order (not raw bridge order) for next/auto-next prep.
    const byPlaybackId = new Map(prewarmTargets.map((r) => [String(r.publicPlaybackId), r]));
    const finalPrepOrder = [];
    for (const song of merged) {
      const id = String(song?.id || "");
      const rec = id ? byPlaybackId.get(id) : null;
      if (rec) finalPrepOrder.push(rec);
    }
    const prepRecords = finalPrepOrder.length ? finalPrepOrder : prewarmTargets;

    // Search returns immediately; preparation continues in background (session + top-N).
    if (deps.schedulePlaybackPrewarm !== false) {
      if (typeof deps.schedulePlaybackPrewarm === "function") {
        deps.schedulePlaybackPrewarm(prepRecords, client, store, config);
      } else {
        onSearchResults(prepRecords, client, store, config, {
          queryFold: String(context.query || "").trim().toLowerCase(),
        });
      }
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
