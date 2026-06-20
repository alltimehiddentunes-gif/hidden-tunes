import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export type ArchiveTrack = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  streamUrl: string;
  sourceName: string;
  isOnline: true;
};

const SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_ENABLED = true;
const ARCHIVE_SEARCH_TIMEOUT_MS = 8000;
const ARCHIVE_METADATA_TIMEOUT_MS = 5000;
const ARCHIVE_RESULT_ROWS = 8;
const ARCHIVE_METADATA_CONCURRENCY = 3;

function encodeArchiveFileUrl(identifier: string, fileName: string) {
  const safeFileName = fileName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://archive.org/download/${identifier}/${safeFileName}`;
}

async function getPlayableAudioUrl(identifier: string) {
  try {
    const response = await fetchWithTimeout(
      `https://archive.org/metadata/${identifier}`,
      undefined,
      ARCHIVE_METADATA_TIMEOUT_MS
    );
    const text = await response.text();

    if (!text.trim().startsWith("{")) {
      return null;
    }

    const json = JSON.parse(text);
    const files = json?.files || [];

    const audioFile = files.find((file: any) => {
      const name = String(file?.name || "").toLowerCase();
      const format = String(file?.format || "").toLowerCase();

      return (
        name.endsWith(".mp3") ||
        name.endsWith(".ogg") ||
        format.includes("vbr mp3") ||
        format.includes("mp3") ||
        format.includes("ogg") ||
        format.includes("vorbis")
      );
    });

    if (!audioFile?.name) return null;

    return encodeArchiveFileUrl(identifier, audioFile.name);
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R | null>
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const value = await mapper(items[index]);
      if (value) results.push(value);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export async function searchArchiveAudio(
  query: string
): Promise<ArchiveTrack[]> {
  if (!ARCHIVE_ENABLED) {
    return [];
  }

  if (!query.trim()) return [];

  try {
    const params = new URLSearchParams();

    params.append("q", `mediatype:audio AND ${query}`);
    params.append("fl[]", "identifier");
    params.append("fl[]", "title");
    params.append("fl[]", "creator");
    params.append("rows", String(ARCHIVE_RESULT_ROWS));
    params.append("page", "1");
    params.append("output", "json");

    const response = await fetchWithTimeout(
      `${SEARCH_URL}?${params.toString()}`,
      undefined,
      ARCHIVE_SEARCH_TIMEOUT_MS
    );
    const text = await response.text();

    if (!text.trim().startsWith("{")) {
      return [];
    }

    const json = JSON.parse(text);
    const docs = json?.response?.docs || [];

    const tracks = await mapWithConcurrency(
      docs,
      ARCHIVE_METADATA_CONCURRENCY,
      async (item: any) => {
        const identifier = String(item.identifier || "");

        if (!identifier) return null;

        const streamUrl = await getPlayableAudioUrl(identifier);

        if (!streamUrl) return null;

        return {
          id: `archive-${identifier}`,
          title: String(item.title || identifier || "Untitled"),
          artist: String(item.creator || "Hidden Tunes"),
          cover: `https://archive.org/services/img/${identifier}`,
          streamUrl,
          sourceName: "Hidden Tunes",
          isOnline: true,
        } as ArchiveTrack;
      }
    );

    return tracks;
  } catch {
    return [];
  }
}
