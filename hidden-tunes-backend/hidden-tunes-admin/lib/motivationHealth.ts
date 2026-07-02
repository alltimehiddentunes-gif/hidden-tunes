import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MOTIVATION_TARGET_ITEMS,
  toMotivationPublicItem,
  type MotivationItemRow,
} from "@/lib/motivationCatalog";
import {
  buildYouTubeEmbedUrl,
  fetchYouTubeOEmbedMetadata,
} from "@/lib/tvCatalog";
import {
  detectTvStreamPayload,
  validatePublicTvUrl,
} from "@/lib/tvStationHealth";

export const MOTIVATION_RELIABILITY_THRESHOLD = 60;
export const MOTIVATION_AUTO_DISABLE_THRESHOLD = 30;
export const MOTIVATION_VERIFY_BATCH_SIZE = 100;
export const MOTIVATION_IMPORT_CONCURRENCY = 6;

export type MotivationGrowthCandidate = {
  source_type: string;
  source_id: string;
  source_url: string;
  embed_url?: string | null;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  channel_name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  language?: string | null;
  region?: string | null;
  duration_seconds?: number | null;
  is_featured?: boolean;
  source_key?: string | null;
  sort_order?: number | null;
};

export type MotivationProbeResult = {
  playable: boolean;
  playback_status: string;
  reason: string;
};

export type MotivationHealthUpdate = {
  status: string;
  playback_status: string;
  reliability_score: number;
  consecutive_failures: number;
  is_active: boolean;
  quarantined_at: string | null;
  disabled_at: string | null;
  last_health_checked_at: string;
  last_health_error: string | null;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeUrlKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeTitleKey(title: string | null | undefined, region?: string | null) {
  return `${String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}::${String(region || "").trim().toLowerCase()}`;
}

export function isPublicMotivationRow(row: {
  status?: string | null;
  is_active?: boolean | null;
  playback_status?: string | null;
  reliability_score?: number | null;
}) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.playback_status === "playable" &&
    Number(row.reliability_score ?? 100) >= MOTIVATION_RELIABILITY_THRESHOLD
  );
}

export function applyMotivationHealthProbe(
  row: Pick<MotivationItemRow, "reliability_score" | "consecutive_failures" | "status">,
  probe: MotivationProbeResult,
  nowIso = new Date().toISOString()
): MotivationHealthUpdate {
  const currentScore = clampScore(Number(row.reliability_score ?? 100));
  const currentFailures = Math.max(0, Number(row.consecutive_failures ?? 0));

  if (probe.playable) {
    return {
      status: "approved",
      playback_status: "playable",
      reliability_score: clampScore(currentScore + 6),
      consecutive_failures: 0,
      is_active: true,
      quarantined_at: null,
      disabled_at: null,
      last_health_checked_at: nowIso,
      last_health_error: null,
    };
  }

  const failures = currentFailures + 1;
  const nextScore = clampScore(currentScore - (failures >= 3 ? 20 : 12));
  const autoDisabled = nextScore < MOTIVATION_AUTO_DISABLE_THRESHOLD;

  return {
    status: autoDisabled ? "blocked" : row.status === "approved" ? "approved" : "pending",
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

async function probeHttpMedia(url: string, sourceType: string): Promise<MotivationProbeResult> {
  const urlCheck = validatePublicTvUrl(url);
  if (!urlCheck.ok) {
    return { playable: false, playback_status: "blocked", reason: urlCheck.reason };
  }

  try {
    const response = await fetch(urlCheck.url, {
      method: "GET",
      headers: {
        Accept:
          sourceType === "hls_stream"
            ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
            : "video/*,application/octet-stream,*/*",
        Range: "bytes=0-8191",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok && response.status !== 206) {
      return {
        playable: false,
        playback_status: "failed",
        reason: `Media probe returned HTTP ${response.status}.`,
      };
    }

    const contentType = response.headers.get("content-type");
    const bodySample = await response.text();
    const details = detectTvStreamPayload(contentType, bodySample);
    const urlLooksLikeMedia =
      /\.m3u8(?:\?|$)/i.test(urlCheck.url) ||
      /\.(mp4|webm|m4v|mov)(?:\?|$)/i.test(urlCheck.url);

    const isVideoLike =
      details.isVideoLike ||
      urlLooksLikeMedia ||
      String(contentType || "").toLowerCase().includes("video/");

    if (!isVideoLike) {
      return {
        playable: false,
        playback_status: "failed",
        reason: "Media probe did not detect playable video/audio stream.",
      };
    }

    return {
      playable: true,
      playback_status: "playable",
      reason: details.isHlsManifest ? "HLS manifest detected." : "Media probe passed.",
    };
  } catch (error) {
    return {
      playable: false,
      playback_status: "failed",
      reason: error instanceof Error ? error.message : "Media probe failed.",
    };
  }
}

export async function probeMotivationItem(row: {
  source_type: string;
  source_id: string;
  source_url: string;
  embed_url?: string | null;
}): Promise<MotivationProbeResult> {
  const sourceType = String(row.source_type || "").trim().toLowerCase();

  if (sourceType === "youtube_video") {
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

  return probeHttpMedia(row.source_url || row.embed_url || "", sourceType);
}

async function loadDedupeKeys() {
  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("source_type, source_id, source_url, title, region, source_key");
  if (error) throw new Error(error.message);

  const sourceKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const titleRegionKeys = new Set<string>();

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    sourceKeys.add(`${row.source_type || ""}:${row.source_id || ""}`);
    urlKeys.add(normalizeUrlKey(String(row.source_url || "")));
    titleRegionKeys.add(
      normalizeTitleKey(String(row.title || ""), String(row.region || ""))
    );
    if (row.source_key) sourceKeys.add(String(row.source_key));
  }

  return { sourceKeys, urlKeys, titleRegionKeys };
}

export function dedupeMotivationCandidates(
  candidates: MotivationGrowthCandidate[],
  existing: {
    sourceKeys: Set<string>;
    urlKeys: Set<string>;
    titleRegionKeys: Set<string>;
  }
) {
  const accepted: MotivationGrowthCandidate[] = [];

  for (const candidate of candidates) {
    const sourceKey =
      candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
    const urlKey = normalizeUrlKey(candidate.source_url);
    const titleRegionKey = normalizeTitleKey(candidate.title, candidate.region);

    if (
      existing.sourceKeys.has(sourceKey) ||
      existing.urlKeys.has(urlKey) ||
      existing.titleRegionKeys.has(titleRegionKey)
    ) {
      continue;
    }

    existing.sourceKeys.add(sourceKey);
    existing.urlKeys.add(urlKey);
    existing.titleRegionKeys.add(titleRegionKey);
    accepted.push(candidate);
  }

  return accepted;
}

export async function importMotivationCandidates(
  candidates: MotivationGrowthCandidate[],
  options?: { verifyConcurrency?: number }
) {
  const existing = await loadDedupeKeys();
  const uniqueCandidates = dedupeMotivationCandidates(candidates, existing);
  const concurrency = Math.max(1, options?.verifyConcurrency ?? MOTIVATION_IMPORT_CONCURRENCY);

  let imported = 0;
  let verified = 0;
  let rejected = 0;
  let pending = 0;

  for (let index = 0; index < uniqueCandidates.length; index += concurrency) {
    const slice = uniqueCandidates.slice(index, index + concurrency);
    const results = await Promise.all(
      slice.map(async (candidate) => {
        const urlCheck = validatePublicTvUrl(candidate.source_url);
        if (!urlCheck.ok) {
          return { candidate, probe: null as MotivationProbeResult | null, urlError: urlCheck.reason };
        }

        const probe = await probeMotivationItem({
          source_type: candidate.source_type,
          source_id: candidate.source_id,
          source_url: urlCheck.url,
          embed_url: candidate.embed_url || null,
        });

        return { candidate, probe, urlError: null as string | null };
      })
    );

    for (const result of results) {
      if (result.urlError || !result.probe) {
        rejected += 1;
        continue;
      }

      const candidate = result.candidate;
      const probe = result.probe;
      const approved = probe.playable;
      const nowIso = new Date().toISOString();

      const { error } = await supabaseAdmin.from("motivation_items").insert({
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_url: candidate.source_url,
        embed_url:
          candidate.embed_url ||
          (candidate.source_type === "youtube_video"
            ? buildYouTubeEmbedUrl(candidate.source_id)
            : null),
        title: candidate.title,
        description: candidate.description || null,
        thumbnail_url: candidate.thumbnail_url || null,
        channel_name: candidate.channel_name || null,
        category: candidate.category || "Motivation",
        subcategory: candidate.subcategory || null,
        tags: candidate.tags?.length ? candidate.tags : ["Motivation"],
        language: candidate.language || null,
        region: candidate.region || null,
        duration_seconds: candidate.duration_seconds ?? null,
        source_key:
          candidate.source_key || `${candidate.source_type}:${candidate.source_id}`,
        status: approved ? "approved" : "pending",
        playback_status: approved ? "playable" : probe.playback_status,
        is_active: approved,
        is_featured: candidate.is_featured === true,
        reliability_score: approved ? 100 : 40,
        consecutive_failures: approved ? 0 : 1,
        quarantined_at: approved ? null : nowIso,
        last_health_checked_at: nowIso,
        last_health_error: approved ? null : probe.reason,
        sort_order: candidate.sort_order ?? 0,
      });

      if (error) {
        rejected += 1;
        continue;
      }

      imported += 1;
      if (approved) verified += 1;
      else pending += 1;
    }
  }

  return {
    found: candidates.length,
    unique: uniqueCandidates.length,
    imported,
    verified,
    pending,
    rejected,
    duplicates: candidates.length - uniqueCandidates.length,
  };
}

export async function runMotivationVerification(limit = MOTIVATION_VERIFY_BATCH_SIZE) {
  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, source_type, source_id, source_url, embed_url, status, playback_status, is_active, reliability_score, consecutive_failures"
    )
    .in("status", ["pending", "approved"])
    .order("last_health_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let checked = 0;
  let playable = 0;
  let failed = 0;
  let newlyApproved = 0;
  let hidden = 0;

  for (const row of (data || []) as MotivationItemRow[]) {
    const probe = await probeMotivationItem(row);
    const update = applyMotivationHealthProbe(row, probe);
    const { error: updateError } = await supabaseAdmin
      .from("motivation_items")
      .update(update)
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    checked += 1;
    if (probe.playable) {
      playable += 1;
      if (row.status !== "approved" || row.is_active !== true) newlyApproved += 1;
    } else {
      failed += 1;
      if (!update.is_active) hidden += 1;
    }
  }

  return { checked, playable, failed, newlyApproved, hidden };
}

export async function getMotivationStatusSummary() {
  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("status, playback_status, is_active, reliability_score, quarantined_at, category");
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<Record<string, unknown>>;
  const publicVerified = rows.filter((row) =>
    isPublicMotivationRow({
      status: String(row.status || ""),
      is_active: row.is_active === true,
      playback_status: String(row.playback_status || ""),
      reliability_score: Number(row.reliability_score ?? 100),
    })
  ).length;

  const pending = rows.filter((row) => row.status === "pending").length;
  const quarantined = rows.filter((row) => Boolean(row.quarantined_at)).length;
  const failed = rows.filter((row) =>
    ["failed", "blocked", "private", "deleted", "region_blocked", "embed_blocked"].includes(
      String(row.playback_status || "")
    )
  ).length;

  const categoryCounts = new Map<string, number>();
  for (const row of rows) {
    if (
      !isPublicMotivationRow({
        status: String(row.status || ""),
        is_active: row.is_active === true,
        playback_status: String(row.playback_status || ""),
        reliability_score: Number(row.reliability_score ?? 100),
      })
    ) {
      continue;
    }
    const category = String(row.category || "Motivation").trim();
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  return {
    total: rows.length,
    publicVerified,
    hiddenOrFailed: rows.length - publicVerified,
    pending,
    quarantined,
    failed,
    targetItems: MOTIVATION_TARGET_ITEMS,
    gapToTarget: Math.max(0, MOTIVATION_TARGET_ITEMS - publicVerified),
    populatedCategories: Object.fromEntries(
      [...categoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    ),
  };
}

export function toMotivationPublicMetadata(row: Record<string, unknown>) {
  return toMotivationPublicItem(row);
}
