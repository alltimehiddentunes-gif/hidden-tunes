/**
 * MusicBrainz + Cover Art Archive metadata provider.
 * Documented APIs only:
 * - https://musicbrainz.org/doc/MusicBrainz_API
 * - https://musicbrainz.org/doc/Cover_Art_Archive/API
 *
 * Enabled when J2_MUSICBRAINZ_ENABLED=true.
 * Requires an identifying User-Agent per MusicBrainz policy.
 *
 * Lookup strategy:
 * 1) Prefer official non-compilation recording search (primarytype album/single)
 * 2) Score recording identity (title/artist/duration/version)
 * 3) Pick a verified release from embedded search releases (no fabricated album)
 * 4) Point Cover Art Archive front-500 at the chosen release id (proxy validates)
 */

import { cleanPresentationTitle } from "./titleClean.js";
import { parseArtistCredits } from "./artistParse.js";
import { scoreMetadataCandidate } from "./match.js";

const DEFAULT_MB_BASE = "https://musicbrainz.org/ws/2";
const DEFAULT_CAA_BASE = "https://coverartarchive.org";
const DEFAULT_UA = "HiddenTunesMetadata/1.0 (https://hiddentunes.com; metadata@hiddentunes.com)";

let lastRequestAt = 0;
const MIN_GAP_MS = 1100; // MusicBrainz asks ~1 req/sec
const MIN_RELEASE_SCORE = 5;

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function config() {
  return {
    enabled: envFlag("J2_MUSICBRAINZ_ENABLED", false),
    mbBase: String(process.env.J2_MUSICBRAINZ_BASE_URL || DEFAULT_MB_BASE).replace(/\/+$/, ""),
    caaBase: String(process.env.J2_COVERART_BASE_URL || DEFAULT_CAA_BASE).replace(/\/+$/, ""),
    userAgent: String(process.env.J2_MUSICBRAINZ_USER_AGENT || DEFAULT_UA).trim() || DEFAULT_UA,
  };
}

async function rateLimitedFetch(url, signal, headers = {}) {
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    method: "GET",
    signal,
    headers: {
      accept: "application/json",
      "user-agent": config().userAgent,
      ...headers,
    },
    redirect: "follow",
  });
  return res;
}

function pickArtistName(recording) {
  const credits = recording?.["artist-credit"];
  if (!Array.isArray(credits) || !credits.length) return "";
  return credits
    .map((c) => String(c?.name || c?.artist?.name || "").trim())
    .filter(Boolean)
    .join(" ");
}

function escapeLucene(value) {
  return String(value || "").replace(/"/g, "").trim();
}

function buildQueries(title, artist) {
  const t = escapeLucene(title);
  const a = escapeLucene(artist);
  if (!t || !a) return [];
  // Prefer official album/single recordings; unfiltered search is dominated by compilations.
  return [
    `recording:"${t}" AND artist:"${a}" AND primarytype:album AND status:official AND NOT secondarytype:compilation`,
    `recording:"${t}" AND artist:"${a}" AND primarytype:single AND status:official AND NOT secondarytype:compilation`,
    `recording:"${t}" AND artist:"${a}" AND status:official AND NOT secondarytype:compilation`,
  ];
}

export function scoreRelease(r, { recordingTitle = "" } = {}) {
  let s = 0;
  const status = String(r.status || "").toLowerCase();
  const rg = r["release-group"] || {};
  const type = String(rg["primary-type"] || r["primary-type"] || "").toLowerCase();
  const secondary = Array.isArray(rg["secondary-types"])
    ? rg["secondary-types"].map((x) => String(x).toLowerCase())
    : [];
  const title = String(r.title || rg.title || "").toLowerCase();
  const credit = Array.isArray(r["artist-credit"])
    ? r["artist-credit"].map((c) => String(c.name || c.artist?.name || "").toLowerCase()).join(" ")
    : "";
  const recTitle = String(recordingTitle || "").toLowerCase();

  if (status === "official") s += 6;
  if (status === "promotion" || status === "bootleg") s -= 6;

  // Prefer informative album names over singles named after the track.
  if (type === "album") s += 10;
  else if (type === "single") s += 7;
  else if (type === "ep") s += 4;
  else if (type === "broadcast") s -= 4;

  if (secondary.includes("compilation")) s -= 14;
  if (secondary.includes("live")) s -= 12;
  if (secondary.includes("remix")) s -= 8;
  if (secondary.includes("soundtrack")) s -= 4;
  if (secondary.includes("dj-mix") || secondary.includes("dj mix")) s -= 10;

  if (/various artists/.test(credit)) s -= 16;
  if (/\b(greatest hits|best of|collection|anthology|night fever|hits of|ultimate|megamix|now that|chartshow)\b/.test(title)) {
    s -= 12;
  }
  if (recTitle && title === recTitle && type === "single") s -= 2;
  if (recTitle && title === recTitle && type === "album") s += 1;

  const year = yearFromDate(r.date || rg["first-release-date"]);
  if (year && year <= 1990) s += 6;
  else if (year && year <= 1995) s += 4;
  else if (year && year <= 2000) s += 1;
  else if (year && year >= 2015) s -= 2;

  const country = String(r.country || "").toUpperCase();
  if (country === "GB" || country === "US" || country === "XW" || country === "XE") s += 1;
  return s;
}

export function pickRelease(recording) {
  const releases = Array.isArray(recording?.releases) ? recording.releases : [];
  if (!releases.length) return null;
  const recordingTitle = String(recording?.title || "");
  const scored = releases
    .map((r) => ({
      r,
      score: scoreRelease(r, { recordingTitle }),
      year: yearFromDate(r.date || r["release-group"]?.["first-release-date"]) || 9999,
    }))
    .filter((x) => x.score >= MIN_RELEASE_SCORE);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || a.year - b.year);
  const bestScore = scored[0].score;
  const near = scored.filter((x) => x.score >= bestScore - 3);
  near.sort((a, b) => a.year - b.year || b.score - a.score);
  return near[0].r;
}

function yearFromDate(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function coverArtUrl(releaseId) {
  if (!releaseId) return null;
  const { caaBase } = config();
  // Trusted CAA reference only — artwork proxy validates host/content on fetch.
  return `${caaBase}/release/${encodeURIComponent(releaseId)}/front-500`;
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

function candidateFromRecording(rec, identity, queryTitle, queryArtist) {
  const release = pickRelease(rec);
  const artist = pickArtistName(rec);
  const candidate = {
    title: rec.title,
    artist,
    primaryArtist: artist,
    durationMs: Number.isFinite(Number(rec.length)) ? Number(rec.length) : null,
    releaseTitle: release?.title || null,
    isrc: Array.isArray(rec.isrcs) && rec.isrcs[0] ? rec.isrcs[0] : null,
    releaseId: release?.id || null,
    releaseDate: release?.date || release?.["release-group"]?.["first-release-date"] || null,
    releaseGroupType:
      release?.["release-group"]?.["primary-type"] || release?.["primary-type"] || null,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
  };
  const scored = scoreMetadataCandidate(
    {
      displayTitle: queryTitle,
      sourceTitle: identity.sourceTitle || identity.title,
      primaryArtist: queryArtist,
      artist: queryArtist,
      durationMs: identity.durationMs,
      versionHints: identity.versionHints,
      isrc: identity.isrc,
    },
    candidate,
  );
  const releaseScore = release ? scoreRelease(release, { recordingTitle: rec.title }) : -999;
  return { candidate, scored, release, releaseScore, rec };
}

async function searchRecordings(mbBase, lucene, signal, limit = 8) {
  const url = `${mbBase}/recording?query=${encodeURIComponent(lucene)}&fmt=json&limit=${limit}`;
  const res = await rateLimitedFetch(url, signal);
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return Array.isArray(body?.recordings) ? body.recordings : [];
}

export function createMusicBrainzProvider(overrides = {}) {
  const health = {
    configured: true,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastLatencyMs: null,
    lastError: null,
  };

  return {
    id: "musicbrainz",
    capabilities: ["RECORDING_LOOKUP", "RELEASE_LOOKUP", "ARTWORK", "ISRC", "RELEASE_DATE", "GENRE"],
    health: () => ({ ...health, configured: config().enabled }),

    async lookup(identity, signal) {
      const cfg = { ...config(), ...overrides };
      if (!cfg.enabled) return { confidence: "NO_MATCH" };

      const titleInfo = cleanPresentationTitle(identity.title, identity.artist);
      const artistInfo = parseArtistCredits(identity.artist);
      const queryTitle = titleInfo.displayTitle;
      const queryArtist = artistInfo.primaryArtist;
      if (!queryTitle || !queryArtist || queryArtist === "Unknown Artist") {
        return { confidence: "NO_MATCH" };
      }

      const started = Date.now();
      try {
        const queries = buildQueries(queryTitle, queryArtist);
        const seen = new Set();
        const ranked = [];

        for (const lucene of queries) {
          if (signal?.aborted) break;
          // Stop early once we have a strong album/single match with release.
          if (
            ranked.some(
              (r) => r.releaseScore >= MIN_RELEASE_SCORE && confidenceRank(r.scored.confidence) >= 3,
            )
          ) {
            break;
          }
          let recordings = [];
          try {
            recordings = await searchRecordings(cfg.mbBase, lucene, signal, 8);
          } catch (err) {
            health.lastFailureAt = Date.now();
            health.lastError = err instanceof Error ? err.message.slice(0, 80) : "error";
            continue;
          }
          for (const rec of recordings) {
            if (!rec?.id || seen.has(rec.id)) continue;
            seen.add(rec.id);
            const entry = candidateFromRecording(rec, identity, queryTitle, queryArtist);
            if (entry.scored.confidence === "NO_MATCH") continue;
            ranked.push(entry);
          }
          if (
            ranked.some(
              (r) => r.releaseScore >= MIN_RELEASE_SCORE && confidenceRank(r.scored.confidence) >= 3,
            )
          ) {
            break;
          }
        }

        ranked.sort((a, b) => {
          const aGood = a.releaseScore >= MIN_RELEASE_SCORE ? 1 : 0;
          const bGood = b.releaseScore >= MIN_RELEASE_SCORE ? 1 : 0;
          if (bGood !== aGood) return bGood - aGood;
          const conf = confidenceRank(b.scored.confidence) - confidenceRank(a.scored.confidence);
          if (conf) return conf;
          if (b.scored.score !== a.scored.score) return b.scored.score - a.scored.score;
          return b.releaseScore - a.releaseScore;
        });

        const best = ranked[0];
        health.lastLatencyMs = Date.now() - started;

        if (!best || best.scored.confidence === "NO_MATCH" || best.scored.confidence === "AMBIGUOUS") {
          health.lastSuccessAt = Date.now();
          return {
            confidence: best?.scored.confidence || "NO_MATCH",
            displayTitle: queryTitle,
            sourceTitle: titleInfo.sourceTitle,
            versionHints: titleInfo.versionHints,
            primaryArtist: queryArtist,
            featuredArtists: artistInfo.featuredArtists,
            artists: artistInfo.artists,
            album: null,
            albumArtworkUrl: null,
            mediaThumbnailUrl: identity.mediaThumbnailUrl || null,
            durationMs: identity.durationMs || null,
            matchScore: best?.scored.score || 0,
            matchReasons: best?.scored.reasons || [],
          };
        }

        const { candidate, scored } = best;
        const allowRelease = best.release && best.releaseScore >= MIN_RELEASE_SCORE;
        const albumArtworkUrl =
          allowRelease && (scored.confidence === "EXACT" || scored.confidence === "HIGH")
            ? coverArtUrl(candidate.releaseId)
            : null;

        const genreTag = Array.isArray(candidate.tags)
          ? candidate.tags.sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.name
          : null;

        health.lastSuccessAt = Date.now();
        health.lastError = null;

        return {
          confidence: scored.confidence,
          displayTitle: queryTitle,
          sourceTitle: titleInfo.sourceTitle,
          versionHints: titleInfo.versionHints,
          primaryArtist: queryArtist,
          featuredArtists: artistInfo.featuredArtists,
          artists: artistInfo.artists,
          album: allowRelease ? candidate.releaseTitle || null : null,
          releaseType: allowRelease ? candidate.releaseGroupType || null : null,
          albumArtworkUrl,
          artworkProvenance: albumArtworkUrl ? "RELEASE_ARTWORK" : null,
          mediaThumbnailUrl: identity.mediaThumbnailUrl || null,
          durationMs: candidate.durationMs || identity.durationMs || null,
          releaseDate: allowRelease ? candidate.releaseDate || null : null,
          releaseYear: allowRelease ? yearFromDate(candidate.releaseDate) : null,
          genre: genreTag || null,
          explicit: null,
          isrc: candidate.isrc || null,
          musicbrainzRecordingId: best.rec?.id || null,
          musicbrainzReleaseId: allowRelease ? candidate.releaseId || null : null,
          matchScore: scored.score,
          matchReasons: scored.reasons,
        };
      } catch (err) {
        health.lastFailureAt = Date.now();
        health.lastLatencyMs = Date.now() - started;
        health.lastError = err instanceof Error ? err.message.slice(0, 80) : "error";
        return { confidence: "NO_MATCH" };
      }
    },
  };
}

export const musicBrainzMetadataProvider = createMusicBrainzProvider();
