import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export class PlaybackStore {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.records = new Map();
  }

  putFromSearchHit(hit) {
    this.gc();
    const publicPlaybackId = randomUUID();
    const record = {
      publicPlaybackId,
      bridgeMediaId: hit.bridgeMediaId ? String(hit.bridgeMediaId) : null,
      provider: String(hit.provider || ""),
      sourceId: String(hit.sourceId || ""),
      canonicalSourceKey: String(hit.canonicalSourceKey || ""),
      title: String(hit.title || "Untitled"),
      artist: hit.artist ? String(hit.artist) : "Unknown Artist",
      album: hit.album ? String(hit.album) : "Singles",
      durationMs: Number.isFinite(Number(hit.durationMs)) ? Number(hit.durationMs) : 0,
      policyState: hit.policyState || null,
      rightsState: hit.rightsState || null,
      playbackCapability: hit.playbackCapability === true,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.records.set(publicPlaybackId, record);
    return record;
  }

  get(publicPlaybackId) {
    this.gc();
    const record = this.records.get(String(publicPlaybackId || ""));
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(record.publicPlaybackId);
      return null;
    }
    return record;
  }

  rememberBridgeMediaId(publicPlaybackId, bridgeMediaId) {
    const record = this.get(publicPlaybackId);
    if (!record || !bridgeMediaId) return record;
    record.bridgeMediaId = String(bridgeMediaId);
    this.records.set(record.publicPlaybackId, record);
    return record;
  }

  gc() {
    const now = Date.now();
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt <= now) this.records.delete(id);
    }
  }
}

export const playbackStore = new PlaybackStore();
