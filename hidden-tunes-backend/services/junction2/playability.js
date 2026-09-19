/**
 * Negative playability knowledge for J2 surfacing.
 * Populated by bounded probes and failed playback attempts.
 * Does not expose internal provider details publicly.
 */

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const entries = new Map();

function keyOf(hitOrKey) {
  if (!hitOrKey) return "";
  if (typeof hitOrKey === "string") return hitOrKey.trim().toLowerCase();
  return String(hitOrKey.canonicalSourceKey || `${hitOrKey.provider || ""}:${hitOrKey.sourceId || ""}`)
    .trim()
    .toLowerCase();
}

export function markUnplayable(hitOrKey, reason = "UNPLAYABLE", ttlMs = DEFAULT_TTL_MS) {
  const key = keyOf(hitOrKey);
  if (!key) return;
  entries.set(key, { reason: String(reason || "UNPLAYABLE"), expiresAt: Date.now() + ttlMs });
}

export function isKnownUnplayable(hitOrKey) {
  const key = keyOf(hitOrKey);
  if (!key) return false;
  const hit = entries.get(key);
  if (!hit) return false;
  if (hit.expiresAt <= Date.now()) {
    entries.delete(key);
    return false;
  }
  return true;
}

export function unplayableReason(hitOrKey) {
  const key = keyOf(hitOrKey);
  const hit = entries.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  return hit.reason;
}

/** Providers trusted enough to surface without a sync resolve probe. */
export function needsPlayabilityProbe(hit) {
  const provider = String(hit?.provider || "").toLowerCase();
  if (!provider) return true;
  if (provider === "youtube" || provider === "archive.org") return false;
  return true;
}

/**
 * Bounded probe: ingest once. On hard failure, mark unplayable and skip.
 * Returns bridgeMediaId string when playable, or null when excluded.
 */
export async function probePlayability(hit, client, options = {}) {
  if (!hit?.provider || !hit?.sourceId) return null;
  if (isKnownUnplayable(hit)) return null;
  if (!needsPlayabilityProbe(hit)) {
    return hit.bridgeMediaId ? String(hit.bridgeMediaId) : true;
  }
  const timeoutMs = Math.max(500, Number(options.timeoutMs) || 2_500);
  try {
    const bridgeMediaId = await client.ingest(
      { provider: hit.provider, sourceId: hit.sourceId },
      { signal: options.signal, timeoutMs },
    );
    return bridgeMediaId || true;
  } catch (err) {
    const code = String(err?.code || err?.message || "PROBE_FAILED");
    // Treat auth/circuit/transient differently? Fail-closed for surfacing when probe fails.
    if (code === "CIRCUIT_OPEN" || code === "NOT_READY") {
      // Do not permanently mark; skip this hit for this response only.
      return null;
    }
    markUnplayable(hit, code.includes("403") || /drm/i.test(code) ? "DRM_BLOCKED" : "PROBE_FAILED");
    return null;
  }
}

export function clearPlayabilityCacheForTests() {
  entries.clear();
}

export function playabilityCacheStats() {
  return { size: entries.size, ttlMs: DEFAULT_TTL_MS };
}
