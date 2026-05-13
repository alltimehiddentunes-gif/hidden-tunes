export type ArchiveTrack = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  streamUrl: string;
  sourceName: "Internet Archive";
  isOnline: true;
};

const SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_ENABLED = false;

function encodeArchiveFileUrl(identifier: string, fileName: string) {
  const safeFileName = fileName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://archive.org/download/${identifier}/${safeFileName}`;
}

async function getPlayableMp3(identifier: string) {
  try {
    const response = await fetch(`https://archive.org/metadata/${identifier}`);
    const text = await response.text();

    if (!text.trim().startsWith("{")) {
      return null;
    }

    const json = JSON.parse(text);
    const files = json?.files || [];

    const mp3File = files.find((file: any) => {
      const name = String(file?.name || "").toLowerCase();
      const format = String(file?.format || "").toLowerCase();

      return (
        name.endsWith(".mp3") ||
        format.includes("vbr mp3") ||
        format.includes("mp3")
      );
    });

    if (!mp3File?.name) return null;

    return encodeArchiveFileUrl(identifier, mp3File.name);
  } catch {
    return null;
  }
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
    params.append("rows", "5");
    params.append("page", "1");
    params.append("output", "json");

    const response = await fetch(`${SEARCH_URL}?${params.toString()}`);
    const text = await response.text();

    if (!text.trim().startsWith("{")) {
      return [];
    }

    const json = JSON.parse(text);
    const docs = json?.response?.docs || [];

    const tracks = await Promise.all(
      docs.map(async (item: any) => {
        const identifier = String(item.identifier || "");

        if (!identifier) return null;

        const streamUrl = await getPlayableMp3(identifier);

        if (!streamUrl) return null;

        return {
          id: `archive-${identifier}`,
          title: String(item.title || identifier || "Untitled"),
          artist: String(item.creator || "Internet Archive"),
          cover: `https://archive.org/services/img/${identifier}`,
          streamUrl,
          sourceName: "Internet Archive",
          isOnline: true,
        };
      })
    );

    return tracks.filter(Boolean) as ArchiveTrack[];
  } catch {
    return [];
  }
}