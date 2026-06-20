import type { HiddenTunesTvVideo } from "../tvCatalogApi";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_DEFAULT_LIMIT = 12;

type ArchiveVideoSearchOptions = {
  query?: string;
  rows?: number;
  signal?: AbortSignal;
};

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

function buildArchiveSearchUrl(options: ArchiveVideoSearchOptions = {}) {
  const params = new URLSearchParams();
  const query = cleanText(options.query, 120);
  const rows = Math.min(24, Math.max(1, Number(options.rows || ARCHIVE_DEFAULT_LIMIT)));
  const textQuery = query ? ` AND (${query})` : "";

  params.append(
    "q",
    `mediatype:movies AND (concert OR "live performance" OR "live music")${textQuery}`
  );
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "creator");
  params.append("fl[]", "date");
  params.append("fl[]", "description");
  params.append("fl[]", "subject");
  params.append("sort[]", "downloads desc");
  params.append("rows", String(rows));
  params.append("page", "1");
  params.append("output", "json");

  return `${ARCHIVE_SEARCH_URL}?${params.toString()}`;
}

function archiveVideoToTvVideo(item: Record<string, unknown>): HiddenTunesTvVideo | null {
  const identifier = cleanText(item.identifier, 300);
  if (!identifier) return null;

  const title = cleanText(item.title, 300) || "Live Performance";
  const creator = normalizeCreator(item.creator) || "Live Performance";
  const tags = normalizeTags(item.subject);

  return {
    id: `archive-${identifier}`,
    title,
    source_type: "archive",
    source_id: identifier,
    source_url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    embed_url: `https://archive.org/embed/${encodeURIComponent(identifier)}`,
    thumbnail_url: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    channel_name: creator,
    category: "Concerts",
    genre: null,
    mood: null,
    format: "Live Performances",
    tags: ["Concerts", "Live Performances", ...tags].slice(0, 16),
  };
}

export async function fetchArchiveConcertVideos(
  options: ArchiveVideoSearchOptions = {}
): Promise<HiddenTunesTvVideo[]> {
  try {
    const response = await fetch(buildArchiveSearchUrl(options), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: options.signal,
    });

    const text = await response.text();
    if (!response.ok || !text.trim().startsWith("{")) return [];

    const payload = JSON.parse(text) as { response?: { docs?: Record<string, unknown>[] } };
    const docs: Record<string, unknown>[] = Array.isArray(payload.response?.docs)
      ? payload.response.docs
      : [];

    return docs
      .map((item: Record<string, unknown>) => archiveVideoToTvVideo(item))
      .filter((item): item is HiddenTunesTvVideo => item !== null);
  } catch {
    return [];
  }
}
