import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // opaque queue identities outlive upstream resolve TTL

function foldSourceKey(hitOrRecord) {
  const raw = String(
    hitOrRecord?.canonicalSourceKey ||
      `${hitOrRecord?.provider || ""}:${hitOrRecord?.sourceId || ""}`,
  ).trim();
  if (!raw) return "";
  const idx = raw.indexOf(":");
  if (idx <= 0) return raw.toLowerCase();
  const provider = raw.slice(0, idx).toLowerCase();
  const id = raw.slice(idx + 1);
  // YouTube ids are case-sensitive — keep id case; fold provider only.
  if (provider === "youtube") return `${provider}:${id}`;
  return `${provider}:${id}`.toLowerCase();
}

export class PlaybackStore {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.records = new Map();
    /** @type {Map<string, string>} canonical/source key → publicPlaybackId */
    this.bySourceKey = new Map();
  }

  putFromSearchHit(hit) {
    this.gc();
    const sourceKey = foldSourceKey(hit);
    if (sourceKey) {
      const existingId = this.bySourceKey.get(sourceKey);
      const existing = existingId ? this.records.get(existingId) : null;
      if (existing && existing.expiresAt > Date.now()) {
        // Stable opaque id: reuse mapping so SEARCH_TOP prep / bridgeMediaId survive re-search.
        const enrichment = hit.enrichment || {};
        existing.title = String(enrichment.displayTitle || hit.title || existing.title || "Untitled");
        existing.sourceTitle = String(enrichment.sourceTitle || hit.title || existing.sourceTitle || "");
        existing.artist = String(enrichment.primaryArtist || hit.artist || existing.artist || "Unknown Artist");
        if (hit.bridgeMediaId) existing.bridgeMediaId = String(hit.bridgeMediaId);
        // Prefer exact-case sourceId from latest hit (YouTube case-sensitive).
        if (hit.sourceId) existing.sourceId = String(hit.sourceId);
        if (hit.canonicalSourceKey) existing.canonicalSourceKey = String(hit.canonicalSourceKey);
        existing.expiresAt = Date.now() + this.ttlMs;
        this.records.set(existing.publicPlaybackId, existing);
        return existing;
      }
    }

    const publicPlaybackId = randomUUID();
    const enrichment = hit.enrichment || {};
    const record = {
      publicPlaybackId,
      bridgeMediaId: hit.bridgeMediaId ? String(hit.bridgeMediaId) : null,
      provider: String(hit.provider || ""),
      sourceId: String(hit.sourceId || ""),
      canonicalSourceKey: String(hit.canonicalSourceKey || ""),
      title: String(enrichment.displayTitle || hit.title || "Untitled"),
      sourceTitle: String(enrichment.sourceTitle || hit.title || ""),
      artist: String(enrichment.primaryArtist || hit.artist || "Unknown Artist"),
      artists: Array.isArray(enrichment.artists) ? enrichment.artists : null,
      artistId: hit.artistId || enrichment.artistId || null,
      album: enrichment.album ? String(enrichment.album) : hit.album ? String(hit.album) : null,
      albumId: hit.albumId || enrichment.albumId || null,
      durationMs: Number.isFinite(Number(enrichment.durationMs ?? hit.durationMs))
        ? Number(enrichment.durationMs ?? hit.durationMs)
        : 0,
      albumArtworkUrl: enrichment.albumArtworkUrl || null,
      mediaThumbnailUrl: enrichment.mediaThumbnailUrl || null,
      artworkProvenance: enrichment.artworkProvenance || null,
      releaseYear: enrichment.releaseYear || null,
      releaseDate: enrichment.releaseDate || null,
      genre: enrichment.genre || null,
      explicit: typeof enrichment.explicit === "boolean" ? enrichment.explicit : null,
      isrc: enrichment.isrc || null,
      versionHints: Array.isArray(enrichment.versionHints) ? enrichment.versionHints : [],
      enrichmentConfidence: enrichment.confidence || null,
      policyState: hit.policyState || null,
      rightsState: hit.rightsState || null,
      playbackCapability: hit.playbackCapability === true,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.records.set(publicPlaybackId, record);
    if (sourceKey) this.bySourceKey.set(sourceKey, publicPlaybackId);
    return record;
  }

  get(publicPlaybackId) {
    this.gc();
    const record = this.records.get(String(publicPlaybackId || ""));
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(record.publicPlaybackId);
      const sk = foldSourceKey(record);
      if (sk && this.bySourceKey.get(sk) === record.publicPlaybackId) this.bySourceKey.delete(sk);
      return null;
    }
    return record;
  }

  rememberBridgeMediaId(publicPlaybackId, bridgeMediaId) {
    const record = this.get(publicPlaybackId);
    if (!record || !bridgeMediaId) return record;
    record.bridgeMediaId = String(bridgeMediaId);
    this.records.set(record.publicPlaybackId, record);
    const sk = foldSourceKey(record);
    if (sk) this.bySourceKey.set(sk, record.publicPlaybackId);
    return record;
  }

  gc() {
    const now = Date.now();
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(id);
        const sk = foldSourceKey(record);
        if (sk && this.bySourceKey.get(sk) === id) this.bySourceKey.delete(sk);
      }
    }
  }
}

export const playbackStore = new PlaybackStore();
