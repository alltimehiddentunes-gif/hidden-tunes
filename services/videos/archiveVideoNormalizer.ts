import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import type { ArchiveVideoApiDocument } from "./archiveVideoApi";
import { isVideoItemPlayableInCurrentRoute, normalizeVideoItem } from "./videoNormalizer";

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeCreator(value: unknown) {
  if (Array.isArray(value)) {
    return cleanText(value[0], 200);
  }

  return cleanText(value, 200);
}

function normalizeTags(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(";") : [];

  return raw
    .map((entry) => cleanText(entry, 80))
    .filter(Boolean)
    .slice(0, 12);
}

export function archiveVideoDocumentToTvVideo(
  item: ArchiveVideoApiDocument
): HiddenTunesTvVideo | null {
  const identifier = cleanText(item.identifier, 300);
  if (!identifier) return null;

  const title = cleanText(item.title, 300) || "Live Performance";
  const creator = normalizeCreator(item.creator) || "Live Performance";
  const tags = normalizeTags(item.subject);
  const encodedIdentifier = encodeURIComponent(identifier);

  return {
    id: `archive-${identifier}`,
    title,
    source_type: "archive",
    source_id: identifier,
    thumbnail_url: `https://archive.org/services/img/${encodedIdentifier}`,
    channel_name: creator,
    categories: ["Concerts", "Live Performances", ...tags].slice(0, 16),
    category: "Concerts",
    genre: null,
    mood: null,
    format: "Live Performances",
    tags: ["Concerts", "Live Performances", ...tags].slice(0, 16),
  };
}

export function archiveVideoDocumentsToTvVideos(
  docs: ArchiveVideoApiDocument[]
): HiddenTunesTvVideo[] {
  return docs
    .map((item) => archiveVideoDocumentToTvVideo(item))
    .filter((item): item is HiddenTunesTvVideo => {
      if (!item) return false;
      return isVideoItemPlayableInCurrentRoute(normalizeVideoItem(item));
    });
}
