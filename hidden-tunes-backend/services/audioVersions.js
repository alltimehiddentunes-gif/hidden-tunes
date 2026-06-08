const AUDIO_VERSION_TIERS = [
  ["ultraLight", "ultra_light"],
  ["standard", "standard"],
  ["highQuality", "high_quality"],
  ["lossless", "lossless"],
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function pickNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

/**
 * Normalize one tier source object. URLs may be absolute HTTP(S) or R2 keys.
 */
export function normalizeAudioVersionSource(source, makePublicUrl) {
  const record = asObject(source);
  if (!record) return null;

  const rawUrl = record.url ?? record.r2_key ?? record.r2Key ?? null;
  const url = makePublicUrl ? makePublicUrl(rawUrl, null) : rawUrl;

  if (!url || typeof url !== "string" || !url.trim()) {
    return null;
  }

  const normalized = {
    url: url.trim(),
  };

  if (typeof record.codec === "string" && record.codec.trim()) {
    normalized.codec = record.codec.trim();
  }

  const bitrateKbps = pickNumber(record.bitrateKbps ?? record.bitrate_kbps);
  if (bitrateKbps != null) normalized.bitrateKbps = bitrateKbps;

  const fileSizeBytes = pickNumber(record.fileSizeBytes ?? record.file_size_bytes);
  if (fileSizeBytes != null) normalized.fileSizeBytes = fileSizeBytes;

  const durationSeconds = pickNumber(
    record.durationSeconds ?? record.duration_seconds
  );
  if (durationSeconds != null) normalized.durationSeconds = durationSeconds;

  const offlineEligible = pickBoolean(
    record.offlineEligible ?? record.offline_eligible
  );
  if (offlineEligible != null) normalized.offlineEligible = offlineEligible;

  return normalized;
}

/**
 * Normalize songs.audio_versions JSONB for public API responses.
 * Returns null when empty or invalid.
 */
export function normalizeAudioVersions(raw, makePublicUrl) {
  const record = asObject(raw);
  if (!record) return null;

  const normalized = {};

  AUDIO_VERSION_TIERS.forEach(([camelTier, snakeTier]) => {
    const source = normalizeAudioVersionSource(
      record[camelTier] ?? record[snakeTier],
      makePublicUrl
    );
    if (source) normalized[camelTier] = source;
  });

  return Object.keys(normalized).length > 0 ? normalized : null;
}
