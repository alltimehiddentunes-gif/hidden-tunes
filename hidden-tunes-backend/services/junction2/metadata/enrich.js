import { metadataProviderRegistry } from "./registry.js";
import { sourceBasicMetadataProvider } from "./sourceBasic.js";
import { musicBrainzMetadataProvider } from "./musicBrainz.js";
import { cleanPresentationTitle } from "./titleClean.js";
import { parseArtistCredits } from "./artistParse.js";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // metadata is stable; longer than stream URLs
const CACHE_MAX = 1024;

let registered = false;

function ensureProviders() {
  if (registered) return;
  // Verified providers first; source-basic is presentation fallback only.
  metadataProviderRegistry.register(musicBrainzMetadataProvider);
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

function youtubeMediaThumbnail(sourceId) {
  const id = String(sourceId || "").trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return null;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Enrich a search hit with bounded metadata.
 * Playback identity fields are preserved unchanged (wrong-song protection).
 */
export async function enrichSearchHit(hit, options = {}) {
  ensureProviders();
  const titleInfo = cleanPresentationTitle(hit.title, hit.artist || hit.artist_name);
  const artistInfo = parseArtistCredits(hit.artist || hit.artist_name);
  const identity = {
    provider: hit.provider,
    sourceId: hit.sourceId,
    canonicalSourceKey: hit.canonicalSourceKey,
    title: hit.title,
    displayTitle: titleInfo.displayTitle,
    sourceTitle: titleInfo.sourceTitle,
    versionHints: titleInfo.versionHints,
    artist: hit.artist || hit.artist_name,
    primaryArtist: artistInfo.primaryArtist,
    album: hit.album,
    durationMs: hit.durationMs,
    mediaThumbnailUrl:
      hit.mediaThumbnailUrl ||
      (String(hit.provider || "").toLowerCase() === "youtube" ? youtubeMediaThumbnail(hit.sourceId) : null),
    albumArtworkUrl: hit.albumArtworkUrl,
    releaseYear: hit.releaseYear,
    genre: hit.genre,
    explicit: hit.explicit,
    isrc: hit.isrc,
  };

  const cacheKey = [
    String(identity.canonicalSourceKey || `${identity.provider}:${identity.sourceId}`),
    String(identity.displayTitle || "").trim().toLowerCase(),
    String(identity.primaryArtist || "").trim().toLowerCase(),
  ].join("|");
  const cached = cacheGet(cacheKey);
  if (cached) {
    return attachIdentity(hit, cached, "cache");
  }

  const timeoutMs = Math.max(100, Number(options.timeoutMs) || 1200);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const providers = metadataProviderRegistry.list();
    let verified = null;
    let basic = null;
    for (const provider of providers) {
      if (controller.signal.aborted) break;
      try {
        const result = await provider.lookup(identity, controller.signal);
        if (!result) continue;
        if (provider.id === "source-basic") basic = result;
        else if (result.confidence && result.confidence !== "NO_MATCH") {
          if (!verified || confidenceRank(result.confidence) > confidenceRank(verified.confidence)) {
            verified = { ...result, providerId: provider.id };
          }
        }
      } catch {
        /* isolated */
      }
    }

    const merged = mergeEnrichment(identity, basic, verified);
    const safe = sanitizeEnrichment(identity, merged);
    cacheSet(cacheKey, safe);
    return attachIdentity(hit, safe, verified ? "verified" : "basic");
  } catch {
    const fallback = sanitizeEnrichment(identity, {
      confidence: "PROBABLE",
      displayTitle: identity.displayTitle,
      sourceTitle: identity.sourceTitle,
      primaryArtist: identity.primaryArtist,
      artists: artistInfo.artists,
      featuredArtists: artistInfo.featuredArtists,
      mediaThumbnailUrl: identity.mediaThumbnailUrl,
      durationMs: identity.durationMs,
    });
    return attachIdentity(hit, fallback, "timeout");
  } finally {
    clearTimeout(timer);
  }
}

function confidenceRank(value) {
  switch (value) {
    case "EXACT":
      return 4;
    case "HIGH":
      return 3;
    case "PROBABLE":
      return 2;
    case "AMBIGUOUS":
      return 1;
    default:
      return 0;
  }
}

function mergeEnrichment(identity, basic, verified) {
  const base = basic || {
    confidence: "PROBABLE",
    displayTitle: identity.displayTitle,
    sourceTitle: identity.sourceTitle,
    versionHints: identity.versionHints,
    primaryArtist: identity.primaryArtist,
    mediaThumbnailUrl: identity.mediaThumbnailUrl,
    durationMs: identity.durationMs,
    album: null,
  };

  if (!verified) return { ...base, confidence: base.confidence || "PROBABLE" };

  const allowCanonical = verified.confidence === "EXACT" || verified.confidence === "HIGH";
  return {
    ...base,
    ...verified,
    // Presentation title/artist from cleaned source unless verified supplies same recording title.
    displayTitle: base.displayTitle || verified.displayTitle,
    sourceTitle: base.sourceTitle || verified.sourceTitle,
    primaryArtist: base.primaryArtist || verified.primaryArtist,
    featuredArtists: base.featuredArtists || verified.featuredArtists || [],
    artists: base.artists || verified.artists || [],
    versionHints: base.versionHints || verified.versionHints || [],
    mediaThumbnailUrl: base.mediaThumbnailUrl || verified.mediaThumbnailUrl || null,
    album: allowCanonical ? verified.album || null : null,
    albumArtworkUrl: allowCanonical ? verified.albumArtworkUrl || null : null,
    artworkProvenance: allowCanonical ? verified.artworkProvenance || null : null,
    releaseYear: allowCanonical ? verified.releaseYear || null : null,
    releaseDate: allowCanonical ? verified.releaseDate || null : null,
    genre: allowCanonical ? verified.genre || null : null,
    isrc: allowCanonical ? verified.isrc || null : null,
    explicit: typeof verified.explicit === "boolean" ? verified.explicit : null,
    confidence: verified.confidence,
    // Keep source duration for presentation/playback identity; MB length is a match signal only.
    durationMs: identity.durationMs || base.durationMs || verified.durationMs,
  };
}

function sanitizeEnrichment(identity, enriched) {
  const confidence = enriched?.confidence || "NO_MATCH";
  const allowCanonicalAlbum = confidence === "EXACT" || confidence === "HIGH";

  const rawDuration = enriched?.durationMs ?? identity.durationMs;
  const durationMs =
    rawDuration != null && rawDuration !== "" && Number.isFinite(Number(rawDuration))
      ? Number(rawDuration)
      : 0;

  return {
    confidence,
    displayTitle: enriched?.displayTitle || identity.displayTitle || identity.title || "Untitled",
    sourceTitle: enriched?.sourceTitle || identity.sourceTitle || identity.title || "",
    versionHints: Array.isArray(enriched?.versionHints) ? enriched.versionHints : [],
    primaryArtist: enriched?.primaryArtist || identity.primaryArtist || identity.artist || "Unknown Artist",
    featuredArtists: Array.isArray(enriched?.featuredArtists) ? enriched.featuredArtists : [],
    artists: Array.isArray(enriched?.artists) ? enriched.artists : [],
    album: allowCanonicalAlbum && enriched?.album ? enriched.album : null,
    albumArtworkUrl: allowCanonicalAlbum ? enriched?.albumArtworkUrl || null : null,
    artworkProvenance: allowCanonicalAlbum ? enriched?.artworkProvenance || null : null,
    mediaThumbnailUrl: enriched?.mediaThumbnailUrl || identity.mediaThumbnailUrl || null,
    durationMs,
    releaseYear: allowCanonicalAlbum ? enriched?.releaseYear || null : null,
    releaseDate: allowCanonicalAlbum ? enriched?.releaseDate || null : null,
    genre: allowCanonicalAlbum ? enriched?.genre || null : null,
    explicit: typeof enriched?.explicit === "boolean" ? enriched.explicit : null,
    isrc: allowCanonicalAlbum ? enriched?.isrc || null : null,
    matchScore: enriched?.matchScore || 0,
    matchReasons: enriched?.matchReasons || [],
    provider: identity.provider,
    sourceId: identity.sourceId,
    canonicalSourceKey: identity.canonicalSourceKey,
  };
}

function attachIdentity(hit, enrichment, source) {
  return {
    ...hit,
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

export function resetMetadataProvidersForTests() {
  registered = false;
  metadataProviderRegistry.clear();
}
