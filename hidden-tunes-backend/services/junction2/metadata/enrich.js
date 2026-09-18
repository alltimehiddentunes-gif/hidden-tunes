import { metadataProviderRegistry } from "./registry.js";
import { sourceBasicMetadataProvider } from "./sourceBasic.js";

const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 512;

let registered = false;

function ensureProviders() {
  if (registered) return;
  metadataProviderRegistry.register(sourceBasicMetadataProvider);
  registered = true;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

/**
 * Enrich a search hit with bounded metadata.
 * Playback identity fields are preserved unchanged (wrong-song protection).
 */
export async function enrichSearchHit(hit, options = {}) {
  ensureProviders();
  const identity = {
    provider: hit.provider,
    sourceId: hit.sourceId,
    canonicalSourceKey: hit.canonicalSourceKey,
    title: hit.title,
    artist: hit.artist || hit.artist_name,
    album: hit.album,
    durationMs: hit.durationMs,
    mediaThumbnailUrl: hit.mediaThumbnailUrl,
    albumArtworkUrl: hit.albumArtworkUrl,
    releaseYear: hit.releaseYear,
    genre: hit.genre,
    explicit: hit.explicit,
    isrc: hit.isrc,
  };

  const cacheKey = [
    String(identity.canonicalSourceKey || `${identity.provider}:${identity.sourceId}`),
    String(identity.title || "").trim().toLowerCase(),
    String(identity.artist || "").trim().toLowerCase(),
  ].join("|");
  const cached = cacheGet(cacheKey);
  if (cached) {
    return attachIdentity(hit, cached, "cache");
  }

  const timeoutMs = Math.max(50, Number(options.timeoutMs) || 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const enriched = await metadataProviderRegistry.enrich(identity, controller.signal);
    const safe = sanitizeEnrichment(identity, enriched);
    cacheSet(cacheKey, safe);
    return attachIdentity(hit, safe, "live");
  } catch {
    const fallback = sanitizeEnrichment(identity, { confidence: "NO_MATCH" });
    return attachIdentity(hit, fallback, "timeout");
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeEnrichment(identity, enriched) {
  const confidence = enriched?.confidence || "NO_MATCH";
  const allowCanonicalAlbum = confidence === "EXACT" || confidence === "HIGH";

  // Wrong-song protection: never accept enrichment that changes source identity.
  const rawDuration = enriched?.durationMs ?? identity.durationMs;
  const durationMs =
    rawDuration != null && rawDuration !== "" && Number.isFinite(Number(rawDuration))
      ? Number(rawDuration)
      : 0;

  return {
    confidence,
    displayTitle: enriched?.displayTitle || identity.title || "Untitled",
    sourceTitle: enriched?.sourceTitle || identity.title || "",
    versionHints: Array.isArray(enriched?.versionHints) ? enriched.versionHints : [],
    primaryArtist: enriched?.primaryArtist || identity.artist || "Unknown Artist",
    featuredArtists: Array.isArray(enriched?.featuredArtists) ? enriched.featuredArtists : [],
    artists: Array.isArray(enriched?.artists) ? enriched.artists : [],
    album: allowCanonicalAlbum && enriched?.album ? enriched.album : enriched?.album || null,
    albumArtworkUrl: allowCanonicalAlbum ? enriched?.albumArtworkUrl || null : null,
    mediaThumbnailUrl: enriched?.mediaThumbnailUrl || null,
    durationMs,
    releaseYear: allowCanonicalAlbum ? enriched?.releaseYear || null : null,
    genre: allowCanonicalAlbum ? enriched?.genre || null : null,
    explicit: typeof enriched?.explicit === "boolean" ? enriched.explicit : null,
    isrc: allowCanonicalAlbum ? enriched?.isrc || null : null,
    provider: identity.provider,
    sourceId: identity.sourceId,
    canonicalSourceKey: identity.canonicalSourceKey,
  };
}

function attachIdentity(hit, enrichment, source) {
  return {
    ...hit,
    // Stable playback identity unchanged:
    provider: hit.provider,
    sourceId: hit.sourceId,
    canonicalSourceKey: hit.canonicalSourceKey,
    title: enrichment.displayTitle,
    artist: enrichment.primaryArtist,
    album: enrichment.album,
    durationMs: enrichment.durationMs,
    enrichment: {
      ...enrichment,
      enrichmentSource: source,
    },
  };
}

export function metadataCacheStats() {
  return { size: cache.size, ttlMs: CACHE_TTL_MS, max: CACHE_MAX };
}

export function clearMetadataCacheForTests() {
  cache.clear();
}
