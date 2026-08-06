import { isMatureContentItem } from "../types/matureContent";
import { shouldIncludeMatureInApi } from "../utils/matureContentSettings";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";

export type AndroidAutoVisibilityDomain =
  | "music"
  | "radio"
  | "podcast"
  | "audiobook";

type VisibilityRecord = Record<string, unknown>;

function flag(record: VisibilityRecord, ...keys: string[]) {
  return keys.some((key) => {
    const value = record[key];
    return value === true || value === 1 || value === "true";
  });
}

function falseFlag(record: VisibilityRecord, ...keys: string[]) {
  return keys.some((key) => {
    const value = record[key];
    return value === false || value === 0 || value === "false";
  });
}

export function isAndroidAutoMatureContent(item: unknown) {
  const record = (item && typeof item === "object" ? item : {}) as VisibilityRecord;
  const rating = String(record.content_rating || record.contentRating || "").toLowerCase();
  const matureLevel = String(record.matureLevel || record.mature_level || "").toLowerCase();
  return isMatureContentItem({
    is_mature: flag(record, "is_mature", "isMature", "isExplicit", "explicit"),
    content_rating: (rating === "explicit" || rating === "adult" ? rating : "clean"),
  }) || ["explicit", "adult", "mature"].includes(matureLevel);
}

export function isAndroidAutoContentVisible(
  item: unknown,
  domain: AndroidAutoVisibilityDomain = "music",
  options?: { requireUri?: boolean; allowMature?: boolean }
) {
  if (!item || typeof item !== "object") return false;
  const record = item as VisibilityRecord;
  const status = String(record.status || record.playbackStatus || "")
    .trim()
    .toLowerCase();
  const contentType = String(record.contentType || record.content_type || domain)
    .trim()
    .toLowerCase();
  if (["tv", "video", "sports"].includes(contentType)) return false;
  if (falseFlag(record, "isPublic", "is_public", "public", "published", "isPublished")) {
    return false;
  }
  if (falseFlag(record, "enabled", "isEnabled", "is_enabled", "playable", "isOnline")) {
    return false;
  }
  if (
    flag(record, "disabled", "quarantined", "is_quarantined", "isQuarantined") ||
    ["disabled", "inactive", "blocked", "quarantined", "removed", "failed", "dead"].includes(status)
  ) {
    return false;
  }
  if (options?.requireUri !== false) {
    const uri = String(
      record.url || record.streamUrl || record.stream_url || record.audioUrl || record.audio_url || ""
    ).trim();
    if (!/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(uri)) return false;
  }
  const matureAllowed = options?.allowMature ??
    (domain === "podcast" ? shouldIncludeMaturePodcasts() : shouldIncludeMatureInApi());
  return matureAllowed || !isAndroidAutoMatureContent(record);
}

export function filterAndroidAutoVisible<T>(
  items: T[],
  domain: AndroidAutoVisibilityDomain,
  options?: { requireUri?: boolean; allowMature?: boolean }
) {
  return items.filter((item) => isAndroidAutoContentVisible(item, domain, options));
}
