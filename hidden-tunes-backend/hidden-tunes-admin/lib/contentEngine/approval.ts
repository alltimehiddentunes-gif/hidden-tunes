import type {
  ContentMetadataFields,
  ContentPlayableItem,
} from "@/lib/contentEngine/types";
import { isHttpsMediaUrl } from "@/lib/contentEngine/urlSafety";
import { normalizeContentTitle } from "@/lib/contentEngine/dedupe";

const SUSPICIOUS_TITLE_PATTERN =
  /^(untitled|test|sample|placeholder|fake|lorem ipsum|demo podcast|demo show)/i;

export type ContentApprovalEvaluation = {
  eligible: boolean;
  suspicious: boolean;
  reasons: string[];
  playableItemCount: number;
};

function cleanField(value: unknown, maxLength: number) {
  const text = String(value || "").trim().slice(0, maxLength);
  return text || null;
}

export function isSuspiciousContentTitle(value: unknown) {
  const title = normalizeContentTitle(value);
  if (!title || title.length < 3) return true;
  return SUSPICIOUS_TITLE_PATTERN.test(title);
}

export function hasMinimumContentMetadata(metadata: ContentMetadataFields) {
  const title = normalizeContentTitle(metadata.title);
  if (!title) return false;

  const description = cleanField(metadata.description, 1200);
  if (description && description.length >= 12) return true;
  if (cleanField(metadata.author, 120)) return true;
  if (cleanField(metadata.publisher, 160)) return true;
  if (cleanField(metadata.artworkUrl, 2000)) return true;
  if (cleanField(metadata.language, 40)) return true;
  if (cleanField(metadata.primaryCategory, 120)) return true;

  if (Array.isArray(metadata.categories)) {
    return metadata.categories.some((entry) => Boolean(cleanField(entry, 120)));
  }

  return false;
}

export function countPlayableHttpsItems(items: ContentPlayableItem[]) {
  return items.filter((item) => {
    const title = normalizeContentTitle(item.title);
    return Boolean(title) && isHttpsMediaUrl(item.mediaUrl);
  }).length;
}

export function meetsMinimumPlayableItemRequirement(
  items: ContentPlayableItem[],
  minimum = 1
) {
  return countPlayableHttpsItems(items) >= minimum;
}

export function evaluateContentAutoApproval(input: {
  metadata: ContentMetadataFields;
  sourceUrl?: unknown;
  playableItems?: ContentPlayableItem[];
  minimumPlayableItems?: number;
  suspicious?: boolean;
}) {
  const reasons: string[] = [];
  const playableItems = input.playableItems || [];
  const minimumPlayableItems = input.minimumPlayableItems ?? 1;
  const playableItemCount = countPlayableHttpsItems(playableItems);

  const title = normalizeContentTitle(input.metadata.title);
  if (!title) reasons.push("missing_title");
  if (isSuspiciousContentTitle(title)) reasons.push("suspicious_title");
  if (!hasMinimumContentMetadata(input.metadata)) {
    reasons.push("incomplete_metadata");
  }
  if (input.sourceUrl !== undefined && !cleanField(input.sourceUrl, 2000)) {
    reasons.push("missing_source_url");
  }
  if (!meetsMinimumPlayableItemRequirement(playableItems, minimumPlayableItems)) {
    reasons.push("missing_playable_items");
  }

  const suspicious =
    Boolean(input.suspicious) ||
    isSuspiciousContentTitle(title) ||
    reasons.includes("incomplete_metadata");

  const eligible = reasons.length === 0 && !suspicious;

  return {
    eligible,
    suspicious,
    reasons,
    playableItemCount,
  } satisfies ContentApprovalEvaluation;
}

export function resolveAutoApprovedLifecycle() {
  return {
    lifecycleStatus: "approved" as const,
    isActive: true,
    healthStatus: "active" as const,
    playbackStatus: "playable" as const,
  };
}

export function resolvePendingLifecycle(hasHttpsMedia: boolean) {
  return {
    lifecycleStatus: "pending" as const,
    isActive: false,
    healthStatus: "unchecked" as const,
    playbackStatus: hasHttpsMedia ? ("unchecked" as const) : ("failed" as const),
  };
}
