/** Recording/release identity matching for metadata enrichment. */

const VERSION =
  /\b(live|remix|acoustic|instrumental|radio\s*edit|remaster(?:ed)?|sped\s*up|slowed|cover|karaoke|nightcore)\b/i;

export function foldMeta(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractVersionMarkers(text) {
  const found = [];
  const src = String(text || "");
  for (const match of src.matchAll(
    /\b(live|remix|acoustic|instrumental|radio edit|remaster(?:ed)?|sped up|slowed|cover|karaoke|nightcore)\b/gi,
  )) {
    const token = match[0].toLowerCase().replace(/\s+/g, " ");
    if (!found.includes(token)) found.push(token);
  }
  return found;
}

export function versionSetsCompatible(aMarkers, bMarkers) {
  const a = new Set((aMarkers || []).map((m) => m.toLowerCase()));
  const b = new Set((bMarkers || []).map((m) => m.toLowerCase()));
  // Cover vs original is never compatible.
  if (a.has("cover") !== b.has("cover")) return false;
  for (const key of ["live", "remix", "acoustic", "instrumental", "sped up", "slowed", "karaoke", "nightcore"]) {
    if (a.has(key) !== b.has(key)) return false;
  }
  return true;
}

export function durationCompatible(aMs, bMs, { softMs = 8_000, hardMs = 25_000 } = {}) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs) || aMs <= 0 || bMs <= 0) return "unknown";
  const delta = Math.abs(aMs - bMs);
  if (delta <= softMs) return "tight";
  if (delta <= hardMs) return "loose";
  return "incompatible";
}

/**
 * Score a metadata candidate against source identity.
 * Returns { confidence, score, reasons }.
 */
export function scoreMetadataCandidate(identity, candidate) {
  const reasons = [];
  let score = 0;

  const qTitle = foldMeta(identity.displayTitle || identity.title);
  const cTitle = foldMeta(candidate.title);
  const qArtist = foldMeta(identity.primaryArtist || identity.artist);
  const cArtist = foldMeta(candidate.artist || candidate.primaryArtist);

  if (!qTitle || !cTitle) {
    return { confidence: "NO_MATCH", score: 0, reasons: ["missing_title"] };
  }

  const qVersions = extractVersionMarkers(
    `${identity.sourceTitle || ""} ${identity.displayTitle || identity.title || ""} ${(identity.versionHints || []).join(" ")}`,
  );
  const cVersions = extractVersionMarkers(`${candidate.title || ""} ${candidate.releaseTitle || ""}`);
  if (!versionSetsCompatible(qVersions, cVersions)) {
    return { confidence: "NO_MATCH", score: 0, reasons: ["version_mismatch", ...qVersions, ...cVersions] };
  }

  if (qTitle === cTitle) {
    score += 50;
    reasons.push("title_exact");
  } else if (cTitle.includes(qTitle) || qTitle.includes(cTitle)) {
    score += 28;
    reasons.push("title_partial");
  } else {
    return { confidence: "NO_MATCH", score: 0, reasons: ["title_mismatch"] };
  }

  if (qArtist && cArtist) {
    if (qArtist === cArtist) {
      score += 40;
      reasons.push("artist_exact");
    } else if (cArtist.includes(qArtist) || qArtist.includes(cArtist)) {
      score += 22;
      reasons.push("artist_partial");
    } else {
      return { confidence: "NO_MATCH", score: 0, reasons: ["artist_mismatch"] };
    }
  } else {
    score -= 10;
    reasons.push("artist_missing");
  }

  const dur = durationCompatible(Number(identity.durationMs), Number(candidate.durationMs));
  if (dur === "tight") {
    score += 18;
    reasons.push("duration_tight");
  } else if (dur === "loose") {
    score += 6;
    reasons.push("duration_loose");
  } else if (dur === "incompatible") {
    if (candidate.isrc && identity.isrc && candidate.isrc === identity.isrc) {
      score += 30;
      reasons.push("isrc_overrides_duration");
    } else {
      return { confidence: "NO_MATCH", score: 0, reasons: ["duration_incompatible"] };
    }
  }

  if (candidate.isrc && identity.isrc && foldMeta(candidate.isrc) === foldMeta(identity.isrc)) {
    score += 35;
    reasons.push("isrc_exact");
  }

  let confidence = "NO_MATCH";
  if (score >= 100) confidence = "EXACT";
  else if (score >= 85) confidence = "HIGH";
  else if (score >= 70) confidence = "PROBABLE";
  else if (score >= 55) confidence = "AMBIGUOUS";

  // Same-title ambiguity without artist → never EXACT/HIGH
  if (!qArtist && (confidence === "EXACT" || confidence === "HIGH")) {
    confidence = "AMBIGUOUS";
    reasons.push("artist_required_for_high");
  }

  return { confidence, score, reasons };
}

export function hasVersionMarker(text) {
  return VERSION.test(String(text || ""));
}
