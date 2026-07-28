import { cleanText } from "@/lib/tvCatalog";
import {
  resolveInternetArchiveQuery,
  type InternetArchiveAudiobookQueryFamily,
} from "@/lib/audiobookSources/internetArchiveQueries";
import {
  finalizeCandidateCompleteness,
  type NormalizedAudiobookCandidate,
  type NormalizedAudiobookChapter,
} from "@/lib/audiobookSources/types";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA_URL = "https://archive.org/metadata";
const USER_AGENT = "HiddenTunes-Audiobook-Expansion/1.0";

const AUDIO_FILE_PATTERN = /\.(mp3|m4a|ogg|opus|flac)(\?|$)/i;
const SKIP_FILE_PATTERN =
  /(?:^|\/)(?:cover|thumb|jacket|booklet|txt|xml|json|torrent|sqlite|jp2|pdf|epub|mobi|html|htm|css|js|png|jpg|jpeg|gif|svg|zip)$/i;

/** @deprecated Prefer NormalizedAudiobookChapter */
export type NormalizedArchiveAudiobookChapter = NormalizedAudiobookChapter;
/** @deprecated Prefer NormalizedAudiobookCandidate */
export type NormalizedArchiveAudiobookCandidate = NormalizedAudiobookCandidate & {
  sourceType: "internet_archive";
};

function buildArchiveSearchUrl(query: string, page: number, rows: number) {
  const url = new URL(ARCHIVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "description");
  url.searchParams.append("fl[]", "licenseurl");
  url.searchParams.append("fl[]", "rights");
  url.searchParams.append("fl[]", "language");
  url.searchParams.set("sort[]", "downloads desc");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("page", String(page));
  url.searchParams.set("output", "json");
  return url.toString();
}

function firstString(value: unknown) {
  if (Array.isArray(value)) return cleanText(value[0], 240);
  return cleanText(value, 240);
}

function normalizeArchiveFiles(
  identifier: string,
  files: Array<Record<string, unknown>>
): NormalizedAudiobookChapter[] {
  const audioFiles = files
    .map((file, index) => {
      const name = cleanText(file.name, 1000);
      if (!name || SKIP_FILE_PATTERN.test(name)) return null;
      if (!AUDIO_FILE_PATTERN.test(name)) return null;
      const lowered = name.toLowerCase();
      const encodedName = name
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      const audioUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
      const title =
        cleanText(file.title, 240) ||
        name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      return {
        sequenceNumber: index + 1,
        chapterNumber: index + 1,
        title,
        audioUrl,
        sourceFileId: name,
        mimeType: lowered.endsWith(".ogg")
          ? "audio/ogg"
          : lowered.endsWith(".m4a")
            ? "audio/mp4"
            : "audio/mpeg",
        format: lowered.split(".").pop() || "mp3",
        durationSeconds: Number.isFinite(Number(file.length))
          ? Math.round(Number(file.length))
          : null,
        sortName: name.toLowerCase(),
      };
    })
    .filter(Boolean) as Array<NormalizedAudiobookChapter & { sortName: string }>;

  audioFiles.sort((left, right) => left.sortName.localeCompare(right.sortName));
  return audioFiles.map((file, index) => ({
    sequenceNumber: index + 1,
    chapterNumber: index + 1,
    title: file.title,
    audioUrl: file.audioUrl,
    sourceFileId: file.sourceFileId,
    mimeType: file.mimeType,
    format: file.format,
    durationSeconds: file.durationSeconds,
  }));
}

export async function discoverInternetArchiveAudiobooks(input: {
  queryFamily: InternetArchiveAudiobookQueryFamily | string;
  page: number;
  limit: number;
  signal?: AbortSignal;
}) {
  const definition = resolveInternetArchiveQuery(String(input.queryFamily));
  if (!definition) {
    throw new Error(`Unknown Internet Archive audiobook query family: ${input.queryFamily}`);
  }

  const response = await fetch(
    buildArchiveSearchUrl(definition.query, input.page, input.limit),
    {
      signal: input.signal,
      headers: { "User-Agent": USER_AGENT },
    }
  );
  if (!response.ok) {
    throw new Error(`Internet Archive search failed (${response.status}).`);
  }
  const payload = (await response.json()) as {
    response?: { docs?: Array<Record<string, unknown>>; numFound?: number };
  };
  const docs = payload.response?.docs || [];
  return {
    identifiers: docs
      .map((doc) => cleanText(doc.identifier, 200))
      .filter(Boolean) as string[],
    hasMore: docs.length >= input.limit,
    nextPage: input.page + 1,
    numFound: Number(payload.response?.numFound || 0),
  };
}

export async function fetchInternetArchiveAudiobookCandidate(input: {
  identifier: string;
  queryFamily: InternetArchiveAudiobookQueryFamily | string;
  signal?: AbortSignal;
}): Promise<NormalizedAudiobookCandidate | null> {
  const definition = resolveInternetArchiveQuery(String(input.queryFamily));
  if (!definition) return null;

  const identifier = input.identifier.trim();
  if (!identifier) return null;

  const response = await fetch(
    `${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`,
    {
      signal: input.signal,
      headers: { "User-Agent": USER_AGENT },
    }
  );
  if (!response.ok) return null;

  const raw = (await response.json()) as Record<string, unknown>;
  const metadata = (raw.metadata || raw) as Record<string, unknown>;
  const title = cleanText(metadata.title, 300) || identifier;
  const authorName = firstString(metadata.creator);
  const description = cleanText(metadata.description, 1600);
  const language = firstString(metadata.language) || "English";
  const licenseUrl = cleanText(metadata.licenseurl, 500);
  const rights = cleanText(metadata.rights, 240) || "Public Domain";
  const files = Array.isArray(raw.files)
    ? (raw.files as Array<Record<string, unknown>>)
    : [];
  const chapters = normalizeArchiveFiles(identifier, files);
  if (chapters.length === 0) return null;

  const yearRaw = firstString(metadata.year) || firstString(metadata.date);
  const publicationYear = yearRaw ? Number.parseInt(yearRaw.slice(0, 4), 10) : null;

  return finalizeCandidateCompleteness({
    sourceKey: definition.sourceKey,
    sourceType: "internet_archive",
    sourceId: identifier,
    sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    title,
    subtitle: null,
    authorName,
    narratorName: authorName,
    description,
    language,
    country: null,
    coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    licenseType: licenseUrl?.includes("publicdomain") ? "public_domain" : "open_license",
    licenseUrl,
    rightsEvidence: `${rights}${licenseUrl ? ` | ${licenseUrl}` : ""}`,
    publisher: definition.publisher,
    categorySlug: definition.categorySlug,
    categories: definition.categories,
    genres: definition.categories,
    isbn: firstString(metadata.isbn),
    publicationYear: Number.isFinite(publicationYear as number)
      ? (publicationYear as number)
      : null,
    chapters,
    isMature: definition.isMature,
    explicit: definition.isMature,
  });
}

export { INTERNET_ARCHIVE_AUDIOBOOK_QUERIES } from "@/lib/audiobookSources/internetArchiveQueries";
export type { InternetArchiveAudiobookQueryFamily } from "@/lib/audiobookSources/internetArchiveQueries";
