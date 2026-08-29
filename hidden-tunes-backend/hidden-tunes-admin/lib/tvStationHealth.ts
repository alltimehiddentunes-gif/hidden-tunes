import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  classifyStreamUrl,
  derivePlatformPlayability,
  probeDeepTvStream,
} from "@/lib/tvStreamProtocol";
import {
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
  ios_playable?: boolean;
  android_playable?: boolean;
  stream_protocol?: string | null;
  stream_is_https?: boolean;
  validated_stream_url?: string | null;
  last_validation_result?: string | null;
  classification?: "playable" | "drm" | "temporary" | "dead" | "unsupported" | "invalid";
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
  validated_stream_url?: string | null;
  quarantined_at?: string | null;
  disabled_at?: string | null;
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
  last_validation_result: string | null;
  ios_playable: boolean;
  android_playable: boolean;
  stream_protocol: string | null;
  stream_is_https: boolean;
  validated_stream_url: string | null;
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
  is_mature?: boolean;
  mature_rating?: string | null;
  mature_source_approved?: boolean;
};

export type TvGrowthImportOptions = {
  isMature?: boolean;
  matureSourceApproved?: boolean;
  matureRating?: string | null;
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
    const currentlyActive = row.is_active === true;
    return {
      playback_status: "playable",
      reliability_score: clampScore(currentScore + 6),
      consecutive_failures: 0,
      is_active: currentlyActive,
      quarantined_at: currentlyActive ? null : row.quarantined_at || null,
      disabled_at: currentlyActive ? null : row.disabled_at || null,
      last_health_checked_at: nowIso,
      last_health_error: null,
      last_validation_result: probe.last_validation_result || "playable",
      ios_playable: probe.ios_playable === true,
      android_playable: probe.android_playable === true,
      stream_protocol: probe.stream_protocol || null,
      stream_is_https: probe.stream_is_https === true,
      validated_stream_url: probe.validated_stream_url || null,
    };
  }

  const failures = currentFailures + 1;
  const nextScore = clampScore(currentScore - (failures >= 3 ? 20 : 12));

  return {
    playback_status: probe.playback_status || "failed",
    reliability_score: nextScore,
    consecutive_failures: failures,
    is_active: row.is_active === true,
    quarantined_at: row.quarantined_at || (row.is_active ? nowIso : null),
    disabled_at: row.disabled_at || null,
    last_health_checked_at: nowIso,
    last_health_error: probe.reason,
    last_validation_result: probe.last_validation_result || probe.reason,
    ios_playable: false,
    android_playable: false,
    stream_protocol: probe.stream_protocol || null,
    stream_is_https: probe.stream_is_https === true,
    validated_stream_url: null,
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
    const playable = Boolean(metadata);
    const platform = derivePlatformPlayability({
      sourceType: String(row.source_type || "youtube_video"),
      classification: {
        ok: true,
        protocol: "youtube",
        streamIsHttps: true,
        normalizedUrl: String(row.source_url || ""),
        reason: "youtube",
      },
      probePlayable: playable,
    });

    return {
      playable,
      playback_status: playable ? "playable" : "failed",
      reason: playable ? "YouTube oEmbed check passed." : "YouTube oEmbed check failed.",
      ios_playable: platform.iosPlayable,
      android_playable: platform.androidPlayable,
      stream_protocol: "youtube",
      stream_is_https: true,
      validated_stream_url: cleanText(row.source_url, 2000),
      last_validation_result: platform.lastValidationResult,
    };
  }

  const seen = new Set<string>();
  const candidates = [row.validated_stream_url, row.source_url, row.embed_url]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let strongestFailure: Awaited<ReturnType<typeof probeDeepTvStream>> | null = null;
  const priority = { playable: 6, drm: 5, temporary: 4, dead: 3, unsupported: 2, invalid: 1 };
  for (const rawUrl of candidates) {
    const classification = classifyStreamUrl(rawUrl);
    if (!classification.ok) continue;
    const probe = await probeDeepTvStream(classification.normalizedUrl);
    const platform = derivePlatformPlayability({
      sourceType: String(row.source_type || ""),
      classification: probe,
      probePlayable: probe.playable,
    });
    if (probe.playable && probe.stableUrl && (platform.iosPlayable || platform.androidPlayable)) {
      return {
        playable: true,
        playback_status: "playable",
        reason: probe.reason,
        classification: "playable",
        ios_playable: platform.iosPlayable,
        android_playable: platform.androidPlayable,
        stream_protocol: probe.protocol,
        stream_is_https: probe.streamIsHttps,
        validated_stream_url: probe.stableUrl,
        last_validation_result: platform.lastValidationResult,
      };
    }
    if (!strongestFailure || priority[probe.outcome] > priority[strongestFailure.outcome]) {
      strongestFailure = probe;
    }
  }

  const failure = strongestFailure;
  const classification = failure?.outcome || "invalid";
  return {
    playable: false,
    playback_status: classification === "drm" || classification === "unsupported" ? "blocked" : "failed",
    reason: failure?.reason || (candidates.length === 0 ? "missing_url" : "validation_failed"),
    classification,
    ios_playable: false,
    android_playable: false,
    stream_protocol: failure?.protocol || null,
    stream_is_https: failure?.streamIsHttps === true,
    validated_stream_url: null,
    last_validation_result: failure?.reason || "validation_failed",
  };
}

export async function runTvStationHealthChecks(limit = TV_HEALTH_BATCH_SIZE) {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(
      "id, source_type, source_id, source_url, validated_stream_url, embed_url, title, playback_status, status, is_active, reliability_score, consecutive_failures, quarantined_at, disabled_at"
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

export async function importVerifiedTvGrowthCandidates(
  candidates: TvGrowthCandidate[],
  options: TvGrowthImportOptions = {}
) {
  const existing = await loadDedupeKeys();
  const uniqueCandidates = dedupeTvGrowthCandidates(candidates, existing);

  let imported = 0;
  let rejected = candidates.length - uniqueCandidates.length;
  const isMature = options.isMature === true;
  const matureSourceApproved = options.matureSourceApproved === true;

  if (isMature && !matureSourceApproved) {
    return {
      found: candidates.length,
      unique: uniqueCandidates.length,
      imported: 0,
      rejected: candidates.length,
    };
  }

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
      ios_playable: probe.ios_playable === true,
      android_playable: probe.android_playable === true,
      stream_is_https: probe.stream_is_https === true,
      stream_protocol: probe.stream_protocol || null,
      validated_stream_url: probe.validated_stream_url || urlCheck.url,
      last_validation_result: probe.last_validation_result || null,
      is_mature: isMature || candidate.is_mature === true,
      mature_rating: options.matureRating || candidate.mature_rating || null,
      mature_source_approved: matureSourceApproved || candidate.mature_source_approved === true,
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
