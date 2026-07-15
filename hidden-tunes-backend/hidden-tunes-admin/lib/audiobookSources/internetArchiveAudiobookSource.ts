import { cleanText } from "@/lib/tvCatalog";
import { classifyAudiobookCompleteness } from "@/lib/audiobookDedup";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA_URL = "https://archive.org/metadata";

const AUDIO_FILE_PATTERN = /\.(mp3|m4a|ogg|opus|flac)(\?|$)/i;

const SKIP_FILE_PATTERN =
  /(?:^|\/)(?:cover|thumb|jacket|booklet|txt|xml|json|torrent|sqlite|jp2|pdf|epub|mobi|html|htm|css|js|png|jpg|jpeg|gif|svg|zip)$/i;

export type InternetArchiveAudiobookQueryFamily =
  | "librivoxaudio"
  | "opensource_audio"
  | "audio_bookspoetry";

export const INTERNET_ARCHIVE_AUDIOBOOK_QUERY_FAMILIES: Record<
  InternetArchiveAudiobookQueryFamily,
  string
> = {
  librivoxaudio: "collection:librivoxaudio",
  opensource_audio: "collection:opensource_audio",
  audio_bookspoetry: "collection:audio_bookspoetry",
};

export type NormalizedArchiveAudiobookChapter = {
  sequenceNumber: number;
  chapterNumber: number;
  title: string;
  audioUrl: string;
  sourceFileId: string;
  mimeType: string;
  format: string;
  durationSeconds: number | null;
};

export type NormalizedArchiveAudiobookCandidate = {
  sourceKey: string;
  sourceType: "internet_archive";
  sourceId: string;
  sourceUrl: string;
  title: string;
  authorName: string | null;
  narratorName: string | null;
  description: string | null;
  language: string | null;
  coverUrl: string | null;
  licenseType: string;
  licenseUrl: string | null;
  rightsEvidence: string;
  publisher: string;
  categorySlug: string;
  categories: string[];
  chapters: NormalizedArchiveAudiobookChapter[];
  durationSeconds: number;
  completeness: string;
  isComplete: boolean;
};

function buildArchiveSearchUrl(
  queryFamily: InternetArchiveAudiobookQueryFamily,
  page: number,
  rows: number
) {
  const url = new URL(ARCHIVE_SEARCH_URL);
  url.searchParams.set(
    "q",
    [
      INTERNET_ARCHIVE_AUDIOBOOK_QUERY_FAMILIES[queryFamily],
      "mediatype:audio",
      '(licenseurl:"http://creativecommons.org/publicdomain/mark/1.0/" OR licenseurl:"https://creativecommons.org/publicdomain/mark/1.0/" OR rights:"Public Domain" OR licenseurl:*creativecommons*)',
    ].join(" AND ")
  );
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

function mapArchiveCategory(queryFamily: InternetArchiveAudiobookQueryFamily) {
  switch (queryFamily) {
    case "audio_bookspoetry":
      return { slug: "poetry", categories: ["poetry", "classics"] };
    case "opensource_audio":
      return { slug: "non-fiction", categories: ["non-fiction"] };
    default:
      return { slug: "classics", categories: ["classics", "fiction"] };
  }
}

function normalizeArchiveFiles(
  identifier: string,
  files: Array<Record<string, unknown>>
): NormalizedArchiveAudiobookChapter[] {
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
      const title = cleanText(file.title, 240) || name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
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
    .filter(Boolean) as Array<
    NormalizedArchiveAudiobookChapter & { sortName: string }
  >;

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
  queryFamily: InternetArchiveAudiobookQueryFamily;
  page: number;
  limit: number;
  signal?: AbortSignal;
}) {
  const response = await fetch(buildArchiveSearchUrl(input.queryFamily, input.page, input.limit), {
    signal: input.signal,
    headers: { "User-Agent": "HiddenTunes-Audiobook-Expansion/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Internet Archive search failed (${response.status}).`);
  }
  const payload = (await response.json()) as {
    response?: { docs?: Array<Record<string, unknown>> };
  };
  const docs = payload.response?.docs || [];
  return {
    identifiers: docs
      .map((doc) => cleanText(doc.identifier, 200))
      .filter(Boolean) as string[],
    hasMore: docs.length >= input.limit,
    nextPage: input.page + 1,
  };
}

export async function fetchInternetArchiveAudiobookCandidate(input: {
  identifier: string;
  queryFamily: InternetArchiveAudiobookQueryFamily;
  signal?: AbortSignal;
}): Promise<NormalizedArchiveAudiobookCandidate | null> {
  const identifier = input.identifier.trim();
  if (!identifier) return null;

  const response = await fetch(
    `${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`,
    {
      signal: input.signal,
      headers: { "User-Agent": "HiddenTunes-Audiobook-Expansion/1.0" },
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
  const files = Array.isArray(raw.files) ? (raw.files as Array<Record<string, unknown>>) : [];
  const chapters = normalizeArchiveFiles(identifier, files);
  if (chapters.length === 0) return null;

  const durationSeconds = chapters.reduce(
    (sum, chapter) => sum + (chapter.durationSeconds || 0),
    0
  );
  const taxonomy = mapArchiveCategory(input.queryFamily);
  const completeness = classifyAudiobookCompleteness(chapters.length, durationSeconds);

  return {
    sourceKey: `internet_archive:${input.queryFamily}`,
    sourceType: "internet_archive",
    sourceId: identifier,
    sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    title,
    authorName,
    narratorName: authorName,
    description,
    language,
    coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    licenseType: licenseUrl?.includes("publicdomain") ? "public_domain" : "open_license",
    licenseUrl,
    rightsEvidence: `${rights}${licenseUrl ? ` | ${licenseUrl}` : ""}`,
    publisher: "Internet Archive",
    categorySlug: taxonomy.slug,
    categories: taxonomy.categories,
    chapters,
    durationSeconds,
    completeness,
    isComplete: completeness === "complete" || completeness === "short_work",
  };
}
