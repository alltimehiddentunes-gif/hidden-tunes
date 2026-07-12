import { deriveMotivationProgramIdentity } from "@/lib/motivationProgramIdentity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type DuplicateClassification = "exact" | "strong" | "possible" | "none";

export type MotivationDuplicateInput = {
  item_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_key?: string | null;
  source_url?: string | null;
  media_url?: string | null;
  media_checksum?: string | null;
  title?: string | null;
  speaker_name?: string | null;
  channel_name?: string | null;
  duration_seconds?: number | null;
  registry_source_key?: string | null;
};

export type MotivationDuplicateMatch = {
  classification: DuplicateClassification;
  blocks_promotion: boolean;
  reason: string;
  signals: string[];
  matched_item_id: string | null;
};

const DURATION_TOLERANCE_SECONDS = 5;
const DURATION_TOLERANCE_RATIO = 0.02;
const TITLE_SIMILARITY_THRESHOLD = 0.86;

export function normalizeCanonicalSourceUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

export function normalizeMediaUrl(value: string | null | undefined) {
  return normalizeCanonicalSourceUrl(value);
}

export function normalizeMotivationTitle(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMotivationSpeaker(
  speaker?: string | null,
  channel?: string | null
) {
  return normalizeMotivationTitle(speaker || channel || "");
}

export function normalizeExternalSourceId(sourceType: string, sourceId: string) {
  return `${String(sourceType || "").trim().toLowerCase()}:${String(sourceId || "").trim().toLowerCase()}`;
}

function durationWithinTolerance(
  left: number | null | undefined,
  right: number | null | undefined
) {
  if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return false;
  const a = Math.max(0, Number(left));
  const b = Math.max(0, Number(right));
  if (a === 0 || b === 0) return false;
  const delta = Math.abs(a - b);
  return delta <= DURATION_TOLERANCE_SECONDS || delta / Math.max(a, b) <= DURATION_TOLERANCE_RATIO;
}

function titleSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (longer.includes(shorter) && shorter.length >= 8) {
    return shorter.length / longer.length;
  }
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function classifyFromSignals(signals: string[]): MotivationDuplicateMatch {
  if (signals.some((signal) => signal.startsWith("exact:"))) {
    return {
      classification: "exact",
      blocks_promotion: true,
      reason: "Exact duplicate identity detected.",
      signals,
      matched_item_id: signals.find((signal) => signal.startsWith("matched:"))?.slice(8) || null,
    };
  }
  if (signals.some((signal) => signal.startsWith("strong:"))) {
    return {
      classification: "strong",
      blocks_promotion: true,
      reason: "Strong duplicate match detected.",
      signals,
      matched_item_id: signals.find((signal) => signal.startsWith("matched:"))?.slice(8) || null,
    };
  }
  if (signals.some((signal) => signal.startsWith("possible:"))) {
    return {
      classification: "possible",
      blocks_promotion: false,
      reason: "Possible duplicate requires manual review.",
      signals,
      matched_item_id: signals.find((signal) => signal.startsWith("matched:"))?.slice(8) || null,
    };
  }
  return {
    classification: "none",
    blocks_promotion: false,
    reason: "No duplicate match detected.",
    signals,
    matched_item_id: null,
  };
}

async function findBySourcePair(sourceType: string, sourceId: string, excludeItemId?: string) {
  let query = supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .limit(2);
  if (excludeItemId) query = query.neq("id", excludeItemId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function findBySourceKey(sourceKey: string, excludeItemId?: string) {
  let query = supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("source_key", sourceKey)
    .limit(2);
  if (excludeItemId) query = query.neq("id", excludeItemId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function findByCanonicalSourceUrl(canonicalUrl: string, excludeItemId?: string) {
  if (!canonicalUrl) return [];
  let query = supabaseAdmin
    .from("motivation_items")
    .select("id, source_url")
    .ilike("source_url", `${canonicalUrl}%`)
    .limit(5);
  if (excludeItemId) query = query.neq("id", excludeItemId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).filter(
    (row) => normalizeCanonicalSourceUrl(String(row.source_url || "")) === canonicalUrl
  );
}

async function findByMediaUrl(mediaUrl: string, excludeItemId?: string) {
  if (!mediaUrl) return [];
  const rows: Array<{ item_id: string }> = [];
  for (const column of ["audio_url", "video_url"] as const) {
    const { data, error } = await supabaseAdmin
      .from("motivation_files")
      .select("item_id")
      .eq(column, mediaUrl)
      .limit(3);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (excludeItemId && String(row.item_id) === excludeItemId) continue;
      rows.push({ item_id: String(row.item_id) });
    }
  }
  return rows;
}

async function findTitleSpeakerCandidates(
  title: string,
  speaker: string,
  excludeItemId?: string
) {
  if (!title) return [];
  const escaped = title.replace(/[%_]/g, "\\$&");
  let query = supabaseAdmin
    .from("motivation_items")
    .select("id, title, speaker_name, channel_name, duration_seconds, source_key, source_type")
    .ilike("title", `%${escaped}%`)
    .limit(8);
  if (excludeItemId) query = query.neq("id", excludeItemId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => {
    const rowSpeaker = normalizeMotivationSpeaker(row.speaker_name, row.channel_name);
    return !speaker || !rowSpeaker || rowSpeaker === speaker || rowSpeaker.includes(speaker) || speaker.includes(rowSpeaker);
  });
}

export async function detectMotivationDuplicates(
  input: MotivationDuplicateInput
): Promise<MotivationDuplicateMatch> {
  const signals: string[] = [];
  const excludeItemId = input.item_id ? String(input.item_id) : undefined;
  const sourceType = String(input.source_type || "").trim();
  const sourceId = String(input.source_id || "").trim();
  const sourceKey = String(input.source_key || "").trim();
  const canonicalSourceUrl = normalizeCanonicalSourceUrl(input.source_url);
  const canonicalMediaUrl = normalizeMediaUrl(input.media_url);
  const normalizedTitle = normalizeMotivationTitle(input.title);
  const normalizedSpeaker = normalizeMotivationSpeaker(input.speaker_name, input.channel_name);

  if (sourceType && sourceId) {
    const pairMatches = await findBySourcePair(sourceType, sourceId, excludeItemId);
    if (pairMatches.length > 0) {
      signals.push(`exact:source_pair:${sourceType}:${sourceId}`);
      signals.push(`matched:${pairMatches[0].id}`);
    }
  }

  if (sourceKey) {
    const keyMatches = await findBySourceKey(sourceKey, excludeItemId);
    if (keyMatches.length > 0) {
      signals.push(`exact:source_key:${sourceKey}`);
      if (!signals.some((signal) => signal.startsWith("matched:"))) {
        signals.push(`matched:${keyMatches[0].id}`);
      }
    }
  }

  if (canonicalSourceUrl) {
    const urlMatches = await findByCanonicalSourceUrl(canonicalSourceUrl, excludeItemId);
    if (urlMatches.length > 0) {
      signals.push(`exact:canonical_source_url`);
      if (!signals.some((signal) => signal.startsWith("matched:"))) {
        signals.push(`matched:${urlMatches[0].id}`);
      }
    }
  }

  if (input.media_checksum) {
    signals.push(`exact:media_checksum:${input.media_checksum}`);
  }

  if (canonicalMediaUrl) {
    const mediaMatches = await findByMediaUrl(canonicalMediaUrl, excludeItemId);
    if (mediaMatches.length > 0) {
      signals.push(`exact:media_url`);
      if (!signals.some((signal) => signal.startsWith("matched:"))) {
        signals.push(`matched:${mediaMatches[0].item_id}`);
      }
    }
  }

  if (normalizedTitle) {
    const candidates = await findTitleSpeakerCandidates(
      normalizedTitle,
      normalizedSpeaker,
      excludeItemId
    );
    for (const candidate of candidates) {
      const candidateTitle = normalizeMotivationTitle(candidate.title);
      const candidateSpeaker = normalizeMotivationSpeaker(
        candidate.speaker_name,
        candidate.channel_name
      );
      const similarity = titleSimilarity(normalizedTitle, candidateTitle);
      const sameSpeaker =
        !normalizedSpeaker ||
        !candidateSpeaker ||
        normalizedSpeaker === candidateSpeaker;
      const sameDuration = durationWithinTolerance(
        input.duration_seconds,
        candidate.duration_seconds
      );
      const sameRegistryFamily =
        Boolean(input.registry_source_key && candidate.source_key) &&
        String(candidate.source_key).split(":")[0] ===
          String(input.registry_source_key).split(":")[0];

      if (similarity >= 0.98 && sameSpeaker && sameDuration) {
        signals.push(`strong:title_speaker_duration`);
        signals.push(`matched:${candidate.id}`);
        break;
      }
      if (similarity >= TITLE_SIMILARITY_THRESHOLD && sameSpeaker && sameRegistryFamily) {
        signals.push(`strong:title_speaker_registry_family`);
        signals.push(`matched:${candidate.id}`);
        break;
      }
      if (similarity >= TITLE_SIMILARITY_THRESHOLD && sameSpeaker) {
        signals.push(`possible:title_speaker_similarity`);
        if (!signals.some((signal) => signal.startsWith("matched:"))) {
          signals.push(`matched:${candidate.id}`);
        }
      } else if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
        signals.push(`possible:title_similarity`);
      }
    }
  }

  const programIdentity = deriveMotivationProgramIdentity({
    itemId: sourceId || input.item_id || null,
    sourceType,
    title: input.title,
    creator: input.speaker_name || input.channel_name,
    source: input.registry_source_key || sourceType,
  });
  if (programIdentity.startsWith("standalone:") && normalizedTitle) {
    signals.push(`possible:program_identity:${programIdentity}`);
  }

  return classifyFromSignals(signals);
}

export function duplicateClassificationBlocksPromotion(
  classification: DuplicateClassification
) {
  return classification === "exact" || classification === "strong";
}
