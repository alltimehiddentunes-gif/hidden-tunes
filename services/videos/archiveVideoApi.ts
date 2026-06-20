import AsyncStorage from "@react-native-async-storage/async-storage";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_DEFAULT_LIMIT = 12;
const ARCHIVE_MAX_LIMIT = 24;
const ARCHIVE_VIDEO_CACHE_KEY = "hidden_tunes_archive_video_cache_v1";
const ARCHIVE_VIDEO_QUERY_CACHE_KEY = "hidden_tunes_archive_video_query_cache_v1";
const ARCHIVE_VIDEO_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const ARCHIVE_VIDEO_QUERY_CACHE_TTL_MS = 1000 * 60 * 30;

export type ArchiveVideoSearchOptions = {
  query?: string;
  rows?: number;
  signal?: AbortSignal;
  useCache?: boolean;
};

export type ArchiveVideoApiDocument = Record<string, unknown>;

type ArchiveVideoCachePayload = {
  version: 1;
  savedAt: string;
  docs: ArchiveVideoApiDocument[];
};

type ArchiveVideoQueryCachePayload = {
  version: 1;
  savedAt: string;
  query: string;
  docs: ArchiveVideoApiDocument[];
};

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getArchiveRows(rows: ArchiveVideoSearchOptions["rows"]) {
  return Math.min(ARCHIVE_MAX_LIMIT, Math.max(1, Number(rows || ARCHIVE_DEFAULT_LIMIT)));
}

export function buildArchiveVideoSearchUrl(options: ArchiveVideoSearchOptions = {}) {
  const params = new URLSearchParams();
  const query = cleanText(options.query, 120);
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
  params.append("rows", String(getArchiveRows(options.rows)));
  params.append("page", "1");
  params.append("output", "json");

  return `${ARCHIVE_SEARCH_URL}?${params.toString()}`;
}

function normalizeArchiveQuery(value: unknown) {
  return cleanText(value, 120).toLowerCase();
}

function canUseArchiveVideoCache(options: ArchiveVideoSearchOptions) {
  return options.useCache !== false && !options.query && !options.signal;
}

function canUseArchiveQueryCache(options: ArchiveVideoSearchOptions) {
  return options.useCache !== false && Boolean(normalizeArchiveQuery(options.query)) && !options.signal;
}

async function loadArchiveVideoCache() {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_VIDEO_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as ArchiveVideoCachePayload;
    const savedAt = Date.parse(cached.savedAt);
    if (
      cached.version !== 1 ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > ARCHIVE_VIDEO_CACHE_TTL_MS ||
      !Array.isArray(cached.docs)
    ) {
      return null;
    }

    return cached.docs;
  } catch {
    return null;
  }
}

async function saveArchiveVideoCache(docs: ArchiveVideoApiDocument[]) {
  try {
    const payload: ArchiveVideoCachePayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      docs,
    };

    await AsyncStorage.setItem(ARCHIVE_VIDEO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache failures should never block video discovery.
  }
}

async function loadArchiveQueryCache(query: string) {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_VIDEO_QUERY_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as ArchiveVideoQueryCachePayload;
    const savedAt = Date.parse(cached.savedAt);
    if (
      cached.version !== 1 ||
      normalizeArchiveQuery(cached.query) !== normalizeArchiveQuery(query) ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > ARCHIVE_VIDEO_QUERY_CACHE_TTL_MS ||
      !Array.isArray(cached.docs)
    ) {
      return null;
    }

    return cached.docs;
  } catch {
    return null;
  }
}

async function saveArchiveQueryCache(query: string, docs: ArchiveVideoApiDocument[]) {
  try {
    const payload: ArchiveVideoQueryCachePayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      query: normalizeArchiveQuery(query),
      docs,
    };

    await AsyncStorage.setItem(ARCHIVE_VIDEO_QUERY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache failures should never block video discovery.
  }
}

export async function fetchArchiveVideoDocuments(
  options: ArchiveVideoSearchOptions = {}
): Promise<ArchiveVideoApiDocument[]> {
  const shouldUseHomeCache = canUseArchiveVideoCache(options);
  const query = normalizeArchiveQuery(options.query);
  const shouldUseQueryCache = canUseArchiveQueryCache(options);

  if (shouldUseHomeCache) {
    const cachedDocs = await loadArchiveVideoCache();
    if (cachedDocs) return cachedDocs;
  }

  if (shouldUseQueryCache && query) {
    const cachedDocs = await loadArchiveQueryCache(query);
    if (cachedDocs) return cachedDocs;
  }

  try {
    const response = await fetch(buildArchiveVideoSearchUrl(options), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: options.signal,
    });

    const text = await response.text();
    if (!response.ok || !text.trim().startsWith("{")) return [];

    const payload = JSON.parse(text) as { response?: { docs?: ArchiveVideoApiDocument[] } };
    const docs: ArchiveVideoApiDocument[] = Array.isArray(payload.response?.docs)
      ? payload.response.docs
      : [];

    if (shouldUseHomeCache && docs.length) {
      await saveArchiveVideoCache(docs);
    }

    if (shouldUseQueryCache && query && docs.length) {
      await saveArchiveQueryCache(query, docs);
    }

    return docs;
  } catch {
    return [];
  }
}
