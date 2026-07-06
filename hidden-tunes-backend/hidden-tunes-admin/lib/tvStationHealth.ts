import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PUBLIC_VIDEO_SELECT,
  TV_VIDEO_SOURCE_TYPE,
  TvPublicVideo,
  TvVideoRow,
  cleanText,
  fetchYouTubeOEmbedMetadata,
  toTvPublicStation,
} from "@/lib/tvCatalog";

export const TV_RELIABILITY_THRESHOLD = 60;
export const TV_AUTO_DISABLE_THRESHOLD = 30;
export const TV_HEALTH_BATCH_SIZE = 75;
export const TV_GROWTH_TARGET_STATIONS = 40_000;

export type TvHealthProbeResult = {
  playable: boolean;
  playback_status: string;
  reason: string;
};

export type TvHealthUpdate = {
  playback_status: string;
  reliability_score: number;
  consecutive_failures: number;
  is_active: boolean;
  quarantined_at: string | null;
  disabled_at: string | null;
  last_health_checked_at: string;
  last_health_error: string | null;
};

export type TvHealthRow = Pick<
  TvVideoRow,
  | "id"
  | "source_type"
  | "source_id"
  | "source_url"
  | "embed_url"
  | "title"
  | "playback_status"
  | "status"
  | "is_active"
> & {
  reliability_score?: number | null;
  consecutive_failures?: number | null;
};

export type TvGrowthCandidate = {
  source_type: string;
  source_id: string;
  source_url: string;
  embed_url?: string | null;
  title: string;
  description?: string | null;
  channel_name?: string | null;
  thumbnail_url?: string | null;
  category?: string | null;
  categories?: string[];
  genre?: string | null;
  mood?: string | null;
  format?: string | null;
  language?: string | null;
  country?: string | null;
  region?: string | null;
  tags?: string[];
  is_featured?: boolean;
  source_key?: string | null;
};

export type TvStreamProbeDetails = {
  contentType: string | null;
  isHlsManifest: boolean;
  isVideoLike: boolean;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeUrlKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeTitleKey(title: string | null | undefined, country?: string | null) {
  return `${String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}::${String(country || "").trim().toLowerCase()}`;
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  return false;
}

export function validatePublicTvUrl(value: unknown) {
  const raw = cleanText(value, 2000);
  if (!raw) return { ok: false as const, reason: "Missing URL." };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false as const, reason: "Invalid URL." };
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return { ok: false as const, reason: "Unsupported URL protocol." };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { ok: false as const, reason: "Private, localhost, or unsafe IP URL rejected." };
  }

  return { ok: true as const, url: parsed.toString() };
}

export function isPublicTvRow(row: {
  status?: string | null;
  is_active?: boolean | null;
  playback_status?: string | null;
  reliability_score?: number | null;
}) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.playback_status === "playable" &&
    Number(row.reliability_score ?? 100) >= TV_RELIABILITY_THRESHOLD
  );
}

export function applyTvHealthProbe(
  row: TvHealthRow,
  probe: TvHealthProbeResult,
  nowIso = new Date().toISOString()
): TvHealthUpdate {
  const currentScore = clampScore(Number(row.reliability_score ?? 100));
  const currentFailures = Math.max(0, Number(row.consecutive_failures ?? 0));

  if (probe.playable) {
    return {
      playback_status: "playable",
      reliability_score: clampScore(currentScore + 6),
      consecutive_failures: 0,
      is_active: row.status === "approved",
      quarantined_at: null,
      disabled_at: null,
      last_health_checked_at: nowIso,
      last_health_error: null,
    };
  }

  const failures = currentFailures + 1;
  const nextScore = clampScore(currentScore - (failures >= 3 ? 20 : 12));
  const autoDisabled = nextScore < TV_AUTO_DISABLE_THRESHOLD;

  return {
    playback_status: autoDisabled ? "blocked" : probe.playback_status || "failed",
    reliability_score: nextScore,
    consecutive_failures: failures,
    is_active: false,
    quarantined_at: nowIso,
    disabled_at: autoDisabled ? nowIso : null,
    last_health_checked_at: nowIso,
    last_health_error: probe.reason,
  };
}

export function detectTvStreamPayload(
  contentType: string | null,
  bodySample: string
): TvStreamProbeDetails {
  const normalizedType = String(contentType || "").toLowerCase();
  const sample = bodySample.slice(0, 4096);
  const isHlsManifest =
    sample.includes("#EXTM3U") ||
    sample.includes("#EXT-X-STREAM-INF") ||
    sample.includes("#EXTINF:");
  const isVideoLike =
    isHlsManifest ||
    normalizedType.includes("mpegurl") ||
    normalizedType.includes("mp2t") ||
    normalizedType.includes("video/") ||
    /\.m3u8(?:\?|$)/i.test(sample);

  return {
    contentType,
    isHlsManifest,
    isVideoLike,
  };
}

export async function probeTvStation(row: TvHealthRow): Promise<TvHealthProbeResult> {
  if (String(row.source_type || "").startsWith("youtube")) {
    const metadata = await fetchYouTubeOEmbedMetadata(String(row.source_id || ""));
    return metadata
      ? {
          playable: true,
          playback_status: "playable",
          reason: "YouTube oEmbed check passed.",
        }
      : {
          playable: false,
          playback_status: "failed",
          reason: "YouTube oEmbed check failed.",
        };
  }

  const urlCheck = validatePublicTvUrl(row.source_url || row.embed_url);
  if (!urlCheck.ok) {
    return { playable: false, playback_status: "blocked", reason: urlCheck.reason };
  }

  try {
    const response = await fetch(urlCheck.url, {
      method: "GET",
      headers: { Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return {
        playable: false,
        playback_status: "failed",
        reason: `Stream probe returned HTTP ${response.status}.`,
      };
    }

    const contentType = response.headers.get("content-type");
    const bodySample = await response.text();
    const details = detectTvStreamPayload(contentType, bodySample);
    const urlLooksLikeHls = /\.m3u8(?:\?|$)/i.test(urlCheck.url);

    if (!details.isVideoLike && !urlLooksLikeHls) {
      return {
        playable: false,
        playback_status: "failed",
        reason: "Stream probe did not detect HLS or video payload.",
      };
    }

    const suffix = details.isHlsManifest ? "HLS manifest detected." : "Stream probe passed.";
    return { playable: true, playback_status: "playable", reason: suffix };
  } catch (error) {
    return {
      playable: false,
      playback_status: "failed",
      reason: error instanceof Error ? error.message : "Stream probe failed.",
    };
  }
}

export async function runTvStationHealthChecks(limit = TV_HEALTH_BATCH_SIZE) {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(
      "id, source_type, source_id, source_url, embed_url, title, playback_status, status, is_active, reliability_score, consecutive_failures"
    )
    .in("status", ["approved", "pending"])
    .order("last_health_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let checked = 0;
  let playable = 0;
  let failed = 0;
  let quarantined = 0;
  let disabled = 0;

  for (const row of (data || []) as TvHealthRow[]) {
    const probe = await probeTvStation(row);
    const update = applyTvHealthProbe(row, probe);
    const { error: updateError } = await supabaseAdmin
      .from("tv_videos")
      .update(update)
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    checked += 1;
    if (probe.playable) playable += 1;
    else failed += 1;
    if (update.quarantined_at) quarantined += 1;
    if (update.disabled_at) disabled += 1;
  }

  return { checked, playable, failed, quarantined, disabled };
}

async function loadDedupeKeys() {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select("source_type, source_id, source_url, title, region, source_key");
  if (error) throw new Error(error.message);

  const sourceKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const titleCountryKeys = new Set<string>();

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    sourceKeys.add(`${row.source_type || ""}:${row.source_id || ""}`);
    urlKeys.add(normalizeUrlKey(String(row.source_url || "")));
    titleCountryKeys.add(normalizeTitleKey(String(row.title || ""), String(row.region || "")));
    if (row.source_key) sourceKeys.add(String(row.source_key));
  }

  return { sourceKeys, urlKeys, titleCountryKeys };
}

export function dedupeTvGrowthCandidates(
  candidates: TvGrowthCandidate[],
  existing: {
    sourceKeys: Set<string>;
    urlKeys: Set<string>;
    titleCountryKeys: Set<string>;
  }
) {
  const accepted: TvGrowthCandidate[] = [];

  for (const candidate of candidates) {
    const sourceKey =
      candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
    const urlKey = normalizeUrlKey(candidate.source_url);
    const titleCountryKey = normalizeTitleKey(candidate.title, candidate.country || candidate.region);

    if (
      existing.sourceKeys.has(sourceKey) ||
      existing.urlKeys.has(urlKey) ||
      existing.titleCountryKeys.has(titleCountryKey)
    ) {
      continue;
    }

    existing.sourceKeys.add(sourceKey);
    existing.urlKeys.add(urlKey);
    existing.titleCountryKeys.add(titleCountryKey);
    accepted.push(candidate);
  }

  return accepted;
}

export async function importVerifiedTvGrowthCandidates(candidates: TvGrowthCandidate[]) {
  const existing = await loadDedupeKeys();
  const uniqueCandidates = dedupeTvGrowthCandidates(candidates, existing);

  let imported = 0;
  let rejected = candidates.length - uniqueCandidates.length;

  for (const candidate of uniqueCandidates) {
    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) {
      rejected += 1;
      continue;
    }

    const probe = await probeTvStation({
      id: "candidate",
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });

    if (!probe.playable) {
      rejected += 1;
      continue;
    }

    const tags = [
      ...new Set(
        [
          ...(candidate.tags || []),
          ...(candidate.categories || []),
          candidate.category,
          candidate.genre,
          candidate.mood,
          candidate.format,
        ].filter(Boolean) as string[]
      ),
    ];

    const { error } = await supabaseAdmin.from("tv_videos").insert({
      source_type: candidate.source_type || TV_VIDEO_SOURCE_TYPE,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
      title: candidate.title,
      description: candidate.description || null,
      channel_name: candidate.channel_name || null,
      thumbnail_url: candidate.thumbnail_url || null,
      category: candidate.category || candidate.categories?.[0] || null,
      genre: candidate.genre || null,
      mood: candidate.mood || null,
      format: candidate.format || null,
      tags: tags.length > 0 ? tags : null,
      language: candidate.language || null,
      region: candidate.country || candidate.region || null,
      source_key:
        candidate.source_key || `${candidate.source_type}:${candidate.source_id}`,
      status: "approved",
      playback_status: "playable",
      is_active: true,
      is_featured: candidate.is_featured === true,
      reliability_score: 100,
      consecutive_failures: 0,
      last_health_checked_at: new Date().toISOString(),
    });

    if (error) rejected += 1;
    else imported += 1;
  }

  return { found: candidates.length, unique: uniqueCandidates.length, imported, rejected };
}

export async function getTvHealthSummary() {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(
      "status, playback_status, is_active, reliability_score, quarantined_at, category, tags"
    );
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<Record<string, unknown>>;
  const scores = rows.map((row) => Number(row.reliability_score ?? 100));
  const total = rows.length;
  const playable = rows.filter((row) => row.playback_status === "playable").length;
  const failed = rows.filter((row) =>
    ["failed", "blocked", "private", "deleted", "region_blocked", "embed_blocked"].includes(
      String(row.playback_status || "")
    )
  ).length;
  const quarantined = rows.filter((row) => Boolean(row.quarantined_at)).length;
  const belowThreshold = rows.filter(
    (row) => Number(row.reliability_score ?? 100) < TV_RELIABILITY_THRESHOLD
  ).length;
  const publicVerified = rows.filter((row) =>
    isPublicTvRow({
      status: String(row.status || ""),
      is_active: row.is_active === true,
      playback_status: String(row.playback_status || ""),
      reliability_score: Number(row.reliability_score ?? 100),
    })
  ).length;
  const hiddenOrQuarantined = total - publicVerified;

  const categoryCounts = new Map<string, number>();
  for (const row of rows) {
    if (
      !isPublicTvRow({
        status: String(row.status || ""),
        is_active: row.is_active === true,
        playback_status: String(row.playback_status || ""),
        reliability_score: Number(row.reliability_score ?? 100),
      })
    ) {
      continue;
    }

    const labels = new Set<string>();
    const category = String(row.category || "").trim();
    if (category) labels.add(category);
    if (Array.isArray(row.tags)) {
      for (const tag of row.tags) {
        const value = String(tag || "").trim();
        if (value) labels.add(value);
      }
    }
    for (const label of labels) {
      categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
    }
  }

  const sum = scores.reduce((acc, score) => acc + score, 0);
  const sorted = [...scores].sort((a, b) => a - b);

  return {
    total,
    playable,
    failed,
    quarantined,
    active: rows.filter((row) => row.is_active === true).length,
    publicVerified,
    hiddenOrQuarantined,
    gapToTarget: Math.max(0, TV_GROWTH_TARGET_STATIONS - publicVerified),
    belowReliabilityThreshold: belowThreshold,
    reliabilityThreshold: TV_RELIABILITY_THRESHOLD,
    targetStations: TV_GROWTH_TARGET_STATIONS,
    populatedCategories: Object.fromEntries(
      [...categoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    ),
    reliability: {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: total > 0 ? Math.round(sum / total) : 0,
    },
  };
}

export function toTvPublicMetadata(row: Record<string, unknown>): TvPublicVideo {
  return toTvPublicStation(row);
}
