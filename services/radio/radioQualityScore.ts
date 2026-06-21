import type { HiddenTunesStation, RadioBrowserStationRaw } from "../../types/radio";

/**
 * Client-side quality_score (0–100) until backend index lands.
 * Signals: stream metadata, audio bitrate, branding, popularity, reliability proxies.
 */
export function computeRadioQualityScore(station: RadioBrowserStationRaw): number {
  let score = 42;

  const bitrate = Number(station.bitrate);
  if (Number.isFinite(bitrate)) {
    if (bitrate >= 192) score += 18;
    else if (bitrate >= 128) score += 14;
    else if (bitrate >= 64) score += 9;
    else if (bitrate >= 32) score += 4;
    else score -= 6;
  } else {
    score -= 4;
  }

  const favicon = String(station.favicon || "").trim();
  if (favicon.startsWith("https://")) score += 12;
  else if (favicon) score += 4;
  else score -= 8;

  const name = String(station.name || "").trim();
  if (name.length >= 4) score += 6;

  const tags = String(station.tags || "").trim();
  if (tags.length > 0) score += 5;

  if (String(station.countrycode || station.country || "").trim()) score += 4;
  if (String(station.language || "").trim()) score += 3;

  const stream = String(station.url_resolved || station.url || "").trim();
  if (stream.startsWith("https://")) score += 8;

  const codec = String(station.codec || "").trim().toLowerCase();
  if (codec.includes("aac") || codec.includes("mp3") || codec.includes("ogg")) score += 4;

  const votes = Math.max(0, Number(station.votes) || 0);
  const clicks = Math.max(0, Number(station.clickcount) || 0);
  score += Math.min(14, Math.log10(votes + 1) * 4.5);
  score += Math.min(10, Math.log10(clicks + 1) * 3.5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function sortStationsByQuality(stations: HiddenTunesStation[]) {
  return [...stations].sort(
    (a, b) => (b.quality_score || 0) - (a.quality_score || 0)
  );
}

export function sortStationsByVotes(stations: HiddenTunesStation[]) {
  return [...stations].sort((a, b) => (b.votes || 0) - (a.votes || 0));
}

export function sortStationsByClicks(stations: HiddenTunesStation[]) {
  return [...stations].sort((a, b) => (b.clickcount || 0) - (a.clickcount || 0));
}

export function enrichStationWithQuality(
  station: HiddenTunesStation,
  raw: RadioBrowserStationRaw
): HiddenTunesStation {
  return {
    ...station,
    votes: Math.max(0, Number(raw.votes) || 0),
    clickcount: Math.max(0, Number(raw.clickcount) || 0),
    quality_score: computeRadioQualityScore(raw),
  };
}
