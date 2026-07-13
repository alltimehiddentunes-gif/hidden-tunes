import { classifyRejectedMediaUrl } from "@/lib/motivationPlayableMedia";
import { isWeakMotivationTitle } from "@/lib/motivationMetadataNormalize";

const OBVIOUS_BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bplaylist\b/i, reason: "Playlist content is not supported for direct import." },
  { pattern: /\btrailer\b/i, reason: "Trailer content is not supported for motivational import." },
  { pattern: /\bmetadata\b/i, reason: "Metadata-only asset rejected." },
  { pattern: /\btorrent\b/i, reason: "Torrent content rejected." },
  { pattern: /\bsubtitle(?:s)?\b/i, reason: "Subtitle asset rejected." },
  { pattern: /\bcommercial\b/i, reason: "Commercial advertisement rejected." },
];

export function isObviouslyUnsupportedForPlayableIngestion(input: {
  title?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
  fileNames?: string[];
}) {
  const title = String(input.title || "").trim();
  if (!title) {
    return { blocked: true, reason: "Missing title." };
  }
  if (isWeakMotivationTitle(title)) {
    return { blocked: true, reason: "Weak or machine-generated title." };
  }

  const sourceId = String(input.sourceId || "").trim();
  if (!sourceId) {
    return { blocked: true, reason: "Missing source identifier." };
  }

  const sourceUrl = String(input.sourceUrl || "").trim();
  const urlReject = classifyRejectedMediaUrl(sourceUrl);
  if (urlReject.rejected) {
    return { blocked: true, reason: urlReject.reason };
  }

  const haystack = `${title} ${(input.fileNames || []).join(" ")}`;
  for (const rule of OBVIOUS_BLOCK_PATTERNS) {
    if (rule.pattern.test(haystack)) {
      return { blocked: true, reason: rule.reason };
    }
  }

  return { blocked: false, reason: "" };
}
