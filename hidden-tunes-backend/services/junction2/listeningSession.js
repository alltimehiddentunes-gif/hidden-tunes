/**
 * Listening-session hint from search (client queue is local; search order is our
 * best backend signal for Next/Auto-Next without a client change).
 * INTERNAL ONLY — never exposed publicly.
 */

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 32;

/** @type {Map<string, { id: string, createdAt: number, expiresAt: number, tracks: object[] }>} */
const sessions = new Map();
let activeSessionId = "";

function isExternalRecord(record) {
  return Boolean(record?.provider && record?.sourceId && record?.publicPlaybackId);
}

function isR2Like(songOrRecord) {
  const type = String(songOrRecord?.type || songOrRecord?.source_type || "").toLowerCase();
  if (type === "r2") return true;
  const url = String(songOrRecord?.url || songOrRecord?.streamUrl || "");
  return url.includes("r2.dev") || (url.includes("http") && !url.includes("/api/media/"));
}

export function registerSearchSession(records, meta = {}) {
  const tracks = (Array.isArray(records) ? records : [])
    .filter(isExternalRecord)
    .map((r) => ({
      publicPlaybackId: String(r.publicPlaybackId),
      provider: String(r.provider || ""),
      sourceId: String(r.sourceId || ""),
      canonicalSourceKey: String(r.canonicalSourceKey || `${r.provider}:${r.sourceId}`).toLowerCase(),
      durationMs: Number(r.durationMs) || 0,
      bridgeMediaId: r.bridgeMediaId ? String(r.bridgeMediaId) : null,
      readyLocal: false,
    }));
  if (!tracks.length) return null;

  gc();
  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    queryFold: String(meta.queryFold || "").slice(0, 120),
    tracks,
  };
  sessions.set(id, session);
  activeSessionId = id;
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
  return session;
}

export function getActiveSession() {
  gc();
  if (!activeSessionId) return null;
  return sessions.get(activeSessionId) || null;
}

export function findTrackInSessions(publicPlaybackId) {
  gc();
  const id = String(publicPlaybackId || "");
  if (!id) return null;
  // Prefer active session.
  const active = getActiveSession();
  if (active) {
    const idx = active.tracks.findIndex((t) => t.publicPlaybackId === id);
    if (idx >= 0) return { session: active, index: idx, track: active.tracks[idx] };
  }
  for (const session of sessions.values()) {
    const idx = session.tracks.findIndex((t) => t.publicPlaybackId === id);
    if (idx >= 0) {
      activeSessionId = session.id;
      return { session, index: idx, track: session.tracks[idx] };
    }
  }
  return null;
}

/**
 * Rolling window after current: next (P1) and next+1 (P3).
 * Skips ready-local / duplicate source keys.
 */
export function rollingWindowAfter(publicPlaybackId, count = 2) {
  const hit = findTrackInSessions(publicPlaybackId);
  if (!hit) return [];
  const out = [];
  const seen = new Set([hit.track.canonicalSourceKey]);
  for (let i = hit.index + 1; i < hit.session.tracks.length && out.length < count; i += 1) {
    const t = hit.session.tracks[i];
    if (!t || seen.has(t.canonicalSourceKey)) continue;
    if (t.readyLocal) continue;
    seen.add(t.canonicalSourceKey);
    out.push({ ...t, windowOffset: out.length + 1 });
  }
  return out;
}

export function markSessionTrackReady(publicPlaybackId, bridgeMediaId) {
  const hit = findTrackInSessions(publicPlaybackId);
  if (!hit) return;
  hit.track.bridgeMediaId = bridgeMediaId ? String(bridgeMediaId) : hit.track.bridgeMediaId;
}

export function sessionStats() {
  gc();
  const active = getActiveSession();
  return {
    sessions: sessions.size,
    activeTracks: active?.tracks?.length || 0,
    activeId: active?.id || null,
  };
}

export function clearSessionsForTests() {
  sessions.clear();
  activeSessionId = "";
}

function gc() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (s.expiresAt <= now) {
      sessions.delete(id);
      if (activeSessionId === id) activeSessionId = "";
    }
  }
}

export { isR2Like };
