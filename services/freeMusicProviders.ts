import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";
import { logSearchDiagnostic } from "../utils/searchDiagnostics";

export type FreeMusicProviderSource =
  | "hidden_tunes"
  | "audius"
  | "archive"
  | "jamendo"
  | "fma"
  | "musopen"
  | "youtube_reference";

export type FreeMusicSearchResult = {
  id: string;
  source: FreeMusicProviderSource;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  artworkUrl?: string;
  streamUrl?: string;
  audioUrl?: string;
  externalUrl?: string;
  license?: string;
  canPlayNatively: boolean;
  canDownload: boolean;
  canSaveReference: boolean;
  providerRawId: string;
  raw?: unknown;
};

export type FreeMusicProviderStatus = {
  provider: FreeMusicProviderSource;
  status: "success" | "error" | "timeout" | "empty" | "skipped";
  count: number;
  message?: string;
  elapsedMs?: number;
};

export type FreeMusicSearchOptions = {
  limit?: number;
  timeoutMs?: number;
  onProviderResult?: (
    provider: FreeMusicProviderSource,
    results: FreeMusicSearchResult[],
    status: FreeMusicProviderStatus
  ) => void;
};

export type FreeMusicSearchResponse = {
  results: FreeMusicSearchResult[];
  statuses: FreeMusicProviderStatus[];
};

type ProviderDefinition = {
  source: FreeMusicProviderSource;
  label: string;
  enabled: () => boolean;
  search: (query: string, options: { limit: number; signal: AbortSignal }) => Promise<FreeMusicSearchResult[]>;
};

const DEFAULT_TIMEOUT_MS = 4200;
const DEFAULT_LIMIT = 8;
const ARCHIVE_METADATA_LIMIT = 5;
const AUDIUS_APP_NAME = "HiddenTunes";
const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";

function getEnv(name: string) {
  const value = (globalThis as any)?.process?.env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanUrl(value: unknown) {
  const text = cleanText(value);
  if (!/^https?:\/\//i.test(text)) return "";
  return text;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function dedupeResults(results: FreeMusicSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = [
      result.source,
      result.providerRawId || result.id,
      result.streamUrl || result.audioUrl || result.externalUrl,
      result.title,
      result.artist,
    ]
      .filter(Boolean)
      .join(":")
      .toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<{ status: "success"; value: T } | { status: "timeout"; error: Error } | { status: "error"; error: Error }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  return new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        status: "timeout",
        error: new Error("Provider timed out"),
      });
    }, timeoutMs);

    promiseFactory(controller.signal)
      .then((value) => resolve({ status: "success", value }))
      .catch((error) => {
        if (controller.signal.aborted) {
          resolve({ status: "timeout", error: new Error("Provider timed out") });
          return;
        }
        resolve({
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function audiusStreamUrl(trackId: string) {
  return `https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(AUDIUS_APP_NAME)}`;
}

async function searchAudius(query: string, { limit, signal }: { limit: number; signal: AbortSignal }) {
  const params = new URLSearchParams({
    query,
    app_name: AUDIUS_APP_NAME,
    limit: String(Math.min(limit, 12)),
  });
  const json = await fetchJson(`https://api.audius.co/v1/tracks/search?${params.toString()}`, signal);
  const items = Array.isArray(json?.data) ? json.data : [];

  return items.map((item: any): FreeMusicSearchResult | null => {
    const id = cleanText(item?.id);
    if (!id) return null;
    const artwork =
      cleanUrl(item?.artwork?.["1000x1000"]) ||
      cleanUrl(item?.artwork?.["480x480"]) ||
      cleanUrl(item?.artwork?.["150x150"]);
    const artist = cleanText(item?.user?.name, "Audius Artist");

    return {
      id: `audius-${id}`,
      source: "audius",
      title: cleanText(item?.title, "Untitled"),
      artist,
      album: cleanText(item?.release_date || item?.genre) || undefined,
      duration: positiveNumber(item?.duration),
      artworkUrl: artwork || undefined,
      streamUrl: audiusStreamUrl(id),
      audioUrl: audiusStreamUrl(id),
      externalUrl: cleanUrl(item?.permalink) || `https://audius.co${cleanText(item?.permalink)}`,
      license: "Audius artist-uploaded stream",
      canPlayNatively: true,
      canDownload: false,
      canSaveReference: true,
      providerRawId: id,
      raw: item,
    };
  }).filter(Boolean) as FreeMusicSearchResult[];
}

function archiveFileUrl(identifier: string, fileName: string) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${fileName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function isOpenLicense(value: unknown) {
  const text = cleanText(value).toLowerCase();
  return (
    text.includes("creativecommons") ||
    text.includes("publicdomain") ||
    text.includes("public domain") ||
    text.includes("/licenses/") ||
    text.includes("cc0")
  );
}

function chooseArchiveAudioFile(files: any[]) {
  return files.find((file) => {
    const name = cleanText(file?.name).toLowerCase();
    const format = cleanText(file?.format).toLowerCase();
    return (
      name.endsWith(".mp3") ||
      name.endsWith(".ogg") ||
      format.includes("vbr mp3") ||
      format.includes("mp3") ||
      format.includes("ogg")
    );
  });
}

async function archiveMetadata(identifier: string, signal: AbortSignal) {
  return fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, signal);
}

async function searchArchiveLike(
  query: string,
  {
    limit,
    signal,
    source,
    collection,
    titlePrefix,
  }: {
    limit: number;
    signal: AbortSignal;
    source: "archive" | "fma" | "musopen";
    collection?: string;
    titlePrefix?: string;
  }
) {
  const qParts = ["mediatype:audio", query];
  if (collection) qParts.push(`collection:${collection}`);

  const params = new URLSearchParams();
  params.append("q", qParts.join(" AND "));
  for (const field of ["identifier", "title", "creator", "licenseurl", "description", "collection"]) {
    params.append("fl[]", field);
  }
  params.set("rows", String(Math.min(limit, 10)));
  params.set("page", "1");
  params.set("output", "json");

  const json = await fetchJson(`${ARCHIVE_SEARCH_URL}?${params.toString()}`, signal);
  const docs = Array.isArray(json?.response?.docs) ? json.response.docs : [];

  const resolved = await Promise.all(
    docs.slice(0, Math.min(limit, ARCHIVE_METADATA_LIMIT)).map(async (item: any): Promise<FreeMusicSearchResult | null> => {
      const identifier = cleanText(item?.identifier);
      if (!identifier) return null;

      try {
        const metadata = await archiveMetadata(identifier, signal);
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        const audioFile = chooseArchiveAudioFile(files);
        const license =
          cleanText(metadata?.metadata?.licenseurl) ||
          cleanText(item?.licenseurl) ||
          cleanText(metadata?.metadata?.rights);
        const streamUrl = audioFile?.name ? archiveFileUrl(identifier, audioFile.name) : "";
        const openLicensed = isOpenLicense(license) || source === "musopen";
        const sourceName =
          source === "fma" ? "Free Music Archive" : source === "musopen" ? "Musopen" : "Internet Archive";

        if (!streamUrl && source !== "archive") {
          return null;
        }

        return {
          id: `${source}-${identifier}`,
          source,
          title: cleanText(item?.title || metadata?.metadata?.title || titlePrefix, "Untitled"),
          artist: cleanText(item?.creator || metadata?.metadata?.creator, sourceName),
          album: cleanText(metadata?.metadata?.album) || undefined,
          artworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
          streamUrl: streamUrl || undefined,
          audioUrl: streamUrl || undefined,
          externalUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
          license: license || (source === "musopen" ? "Public domain / Musopen via Internet Archive" : "Archive item"),
          canPlayNatively: Boolean(streamUrl),
          canDownload: Boolean(streamUrl && openLicensed),
          canSaveReference: true,
          providerRawId: identifier,
          raw: { search: item, metadata },
        };
      } catch {
        return null;
      }
    })
  );

  return resolved.filter(Boolean) as FreeMusicSearchResult[];
}

function jamendoClientId() {
  return getEnv("EXPO_PUBLIC_JAMENDO_CLIENT_ID") || getEnv("JAMENDO_CLIENT_ID");
}

async function searchJamendo(query: string, { limit, signal }: { limit: number; signal: AbortSignal }) {
  const clientId = jamendoClientId();
  if (!clientId) return [];

  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: String(Math.min(limit, 20)),
    search: query,
    include: "musicinfo",
    audioformat: "mp32",
  });

  const json = await fetchJson(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, signal);
  const items = Array.isArray(json?.results) ? json.results : [];

  return items.map((item: any): FreeMusicSearchResult | null => {
    const id = cleanText(item?.id);
    const streamUrl = cleanUrl(item?.audio);
    if (!id || !streamUrl) return null;
    const downloadUrl = cleanUrl(item?.audiodownload);

    return {
      id: `jamendo-${id}`,
      source: "jamendo",
      title: cleanText(item?.name, "Untitled"),
      artist: cleanText(item?.artist_name, "Jamendo Artist"),
      album: cleanText(item?.album_name) || undefined,
      duration: positiveNumber(item?.duration),
      artworkUrl: cleanUrl(item?.album_image) || cleanUrl(item?.image) || undefined,
      streamUrl,
      audioUrl: streamUrl,
      externalUrl: cleanUrl(item?.shareurl) || undefined,
      license: cleanText(item?.license_ccurl || item?.license) || "Jamendo API stream",
      canPlayNatively: true,
      canDownload: Boolean(downloadUrl),
      canSaveReference: true,
      providerRawId: id,
      raw: item,
    };
  }).filter(Boolean) as FreeMusicSearchResult[];
}

const PROVIDERS: ProviderDefinition[] = [
  {
    source: "audius",
    label: "Audius",
    enabled: () => true,
    search: searchAudius,
  },
  {
    source: "archive",
    label: "Internet Archive",
    enabled: () => true,
    search: (query, options) => searchArchiveLike(query, { ...options, source: "archive" }),
  },
  {
    source: "jamendo",
    label: "Jamendo",
    enabled: () => Boolean(jamendoClientId()),
    search: searchJamendo,
  },
  {
    source: "fma",
    label: "FMA",
    enabled: () => true,
    search: (query, options) =>
      searchArchiveLike(query, {
        ...options,
        source: "fma",
        collection: "freemusicarchive",
        titlePrefix: "Free Music Archive",
      }),
  },
  {
    source: "musopen",
    label: "Musopen",
    enabled: () => true,
    search: (query, options) =>
      searchArchiveLike(query, {
        ...options,
        source: "musopen",
        collection: "musopen",
        titlePrefix: "Musopen",
      }),
  },
];

function toStatus(
  provider: FreeMusicProviderSource,
  status: FreeMusicProviderStatus["status"],
  count: number,
  startedAt: number,
  message?: string
): FreeMusicProviderStatus {
  return {
    provider,
    status,
    count,
    message,
    elapsedMs: Date.now() - startedAt,
  };
}

export function providerLabel(source: FreeMusicProviderSource | string) {
  switch (source) {
    case "hidden_tunes":
      return "Hidden Tunes";
    case "audius":
      return "Audius";
    case "archive":
      return "Archive";
    case "jamendo":
      return "Jamendo";
    case "fma":
      return "FMA";
    case "musopen":
      return "Musopen";
    case "youtube_reference":
      return "YouTube Reference";
    default:
      return "Internet audio";
  }
}

export async function searchFreeMusicProviders(
  query: string,
  options: FreeMusicSearchOptions = {}
): Promise<FreeMusicSearchResponse> {
  const cleanQuery = query.trim();
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, 20));
  const timeoutMs = Math.max(1200, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const statuses: FreeMusicProviderStatus[] = [];
  const allResults: FreeMusicSearchResult[] = [];

  if (cleanQuery.length < 2) {
    return { results: [], statuses: [] };
  }

  await Promise.all(
    PROVIDERS.map(async (provider) => {
      const startedAt = Date.now();

      if (!provider.enabled()) {
        const status = toStatus(provider.source, "skipped", 0, startedAt, "Provider config missing");
        statuses.push(status);
        return;
      }

      logSearchDiagnostic("provider_start", { provider: provider.source, query: cleanQuery });

      const outcome = await withTimeout(
        (signal) => provider.search(cleanQuery, { limit, signal }),
        timeoutMs
      );

      if (outcome.status === "success") {
        const results = dedupeResults(outcome.value).slice(0, limit);
        allResults.push(...results);
        const status = toStatus(
          provider.source,
          results.length ? "success" : "empty",
          results.length,
          startedAt
        );
        statuses.push(status);
        options.onProviderResult?.(provider.source, results, status);
        logSearchDiagnostic(results.length ? "provider_success" : "provider_empty", {
          provider: provider.source,
          query: cleanQuery,
          count: results.length,
        });
        return;
      }

      const status = toStatus(
        provider.source,
        outcome.status,
        0,
        startedAt,
        outcome.error.message
      );
      statuses.push(status);
      options.onProviderResult?.(provider.source, [], status);
      logSearchDiagnostic(outcome.status === "timeout" ? "provider_timeout" : "provider_error", {
        provider: provider.source,
        query: cleanQuery,
        error: outcome.error.message,
      });
    })
  );

  const results = dedupeResults(allResults).slice(0, limit * 2);
  logSearchDiagnostic("merge_complete", {
    query: cleanQuery,
    providerCount: statuses.length,
    count: results.length,
  });

  if (!results.length) {
    logSearchDiagnostic("fallback_shown", { query: cleanQuery });
  }

  return { results, statuses };
}

export function freeMusicResultToSong(result: FreeMusicSearchResult, index = 0): HiddenTunesNormalizedSong {
  const artwork = result.artworkUrl || "";
  const streamUrl = result.canPlayNatively ? result.streamUrl || result.audioUrl || "" : "";

  return {
    id: result.id || `${result.source}-${result.providerRawId || index}`,
    title: result.title || "Untitled",
    artist: result.artist || providerLabel(result.source),
    album: result.album,
    duration: result.duration,
    cover: artwork,
    artwork,
    thumbnail: artwork,
    streamUrl,
    url: streamUrl,
    sourceName: providerLabel(result.source),
    source: result.source,
    type: result.source,
    isOnline: true,
    raw: result,
    license: result.license,
    externalUrl: result.externalUrl,
    canPlayNatively: result.canPlayNatively,
    canDownload: result.canDownload,
    canSaveReference: result.canSaveReference,
    providerRawId: result.providerRawId,
  } as unknown as HiddenTunesNormalizedSong;
}
