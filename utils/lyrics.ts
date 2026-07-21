export type LyricLine = {
  id: string;
  timeMs: number;
  text: string;
};

export type LyricsPayload = {
  synced: string;
  plain: string;
};

export type LyricsDisplayMode = "synced" | "plain" | "none";

export const LYRICS_SYNC_OFFSET_MS = -350;
export const LYRICS_ITEM_HEIGHT = 64;
export const LYRICS_MAX_CHARS = 34;
export const PLAIN_LINE_MS = 4000;
export const PLAIN_CHUNK_MS = 250;

const lyricsPayloadCache = new Map<string, LyricsPayload>();
const parsedLrcCache = new Map<string, LyricLine[]>();
const plainLinesCache = new Map<string, LyricLine[]>();
const MAX_PARSE_CACHE = 64;
const MAX_LYRICS_PAYLOAD_CACHE = 64;

function trimParseCache(cache: Map<string, LyricLine[]>) {
  if (cache.size <= MAX_PARSE_CACHE) return;

  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}

function trimLyricsPayloadCache() {
  while (lyricsPayloadCache.size > MAX_LYRICS_PAYLOAD_CACHE) {
    const oldest = lyricsPayloadCache.keys().next().value;
    if (!oldest) break;
    lyricsPayloadCache.delete(oldest);
  }
}

export function getLyricsMemoryCache(songId: string) {
  return lyricsPayloadCache.get(songId);
}

export function setLyricsMemoryCache(songId: string, payload: LyricsPayload) {
  if (!songId) return;
  lyricsPayloadCache.set(songId, payload);
  trimLyricsPayloadCache();
}

export function hasLrcTimestamps(text: string) {
  return /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(String(text || ""));
}

export function splitLyricText(text: string) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > LYRICS_MAX_CHARS && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

function parseLrcInternal(lrc: string): LyricLine[] {
  if (!lrc) return [];

  const lines: LyricLine[] = [];

  lrc.split(/\r?\n/).forEach((row, rowIndex) => {
    const timeMatches = [
      ...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
    ];

    const text = row.replace(/\[(.*?)\]/g, "").trim();

    if (!timeMatches.length || !text) return;

    timeMatches.forEach((match, matchIndex) => {
      const minutes = Number(match[1] || 0);
      const seconds = Number(match[2] || 0);
      const raw = match[3] || "0";

      const fraction =
        raw.length === 1
          ? Number(raw) * 100
          : raw.length === 2
            ? Number(raw) * 10
            : Number(raw.slice(0, 3));

      const baseTime = minutes * 60 * 1000 + seconds * 1000 + fraction;
      const chunks = splitLyricText(text);

      chunks.forEach((chunk, chunkIndex) => {
        lines.push({
          id: `${rowIndex}-${matchIndex}-${chunkIndex}-${baseTime}`,
          timeMs: baseTime + chunkIndex * 120,
          text: chunk,
        });
      });
    });
  });

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export function parseLrc(lrc: string): LyricLine[] {
  const key = String(lrc || "");
  if (!key.trim()) return [];

  const cached = parsedLrcCache.get(key);
  if (cached) return cached;

  const parsed = parseLrcInternal(key);
  trimParseCache(parsedLrcCache);
  parsedLrcCache.set(key, parsed);
  return parsed;
}

function plainToLinesInternal(plainLyrics: string): LyricLine[] {
  if (!plainLyrics) return [];

  const visualLines: LyricLine[] = [];

  plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const chunks = splitLyricText(line);

      chunks.forEach((chunk, chunkIndex) => {
        visualLines.push({
          id: `plain-${index}-${chunkIndex}`,
          text: chunk,
          timeMs: index * PLAIN_LINE_MS + chunkIndex * PLAIN_CHUNK_MS,
        });
      });
    });

  return visualLines;
}

export function plainToLines(plainLyrics: string): LyricLine[] {
  const key = String(plainLyrics || "");
  if (!key.trim()) return [];

  const cached = plainLinesCache.get(key);
  if (cached) return cached;

  const parsed = plainToLinesInternal(key);
  trimParseCache(plainLinesCache);
  plainLinesCache.set(key, parsed);
  return parsed;
}

export function getBestLyricsPayload(data: unknown): LyricsPayload {
  const record = (data || {}) as Record<string, unknown>;

  let synced = String(
    record.synced_lrc ||
      record.syncedLrc ||
      record.syncedLyrics ||
      record.lrc ||
      record.lyrics_lrc ||
      ""
  ).trim();

  let plain = String(
    record.plain_lyrics || record.plainLyrics || record.lyrics || ""
  ).trim();

  if (!synced && plain && hasLrcTimestamps(plain)) {
    synced = plain;
    plain = "";
  }

  if (synced && plain && synced === plain) {
    plain = "";
  }

  return { synced, plain };
}

export function resolveLyricsDisplay(
  synced: string,
  plain: string
): {
  mode: LyricsDisplayMode;
  lines: LyricLine[];
  hasSyncedLyrics: boolean;
} {
  const syncedLines = parseLrc(synced);
  if (syncedLines.length > 0) {
    return {
      mode: "synced",
      lines: syncedLines,
      hasSyncedLyrics: true,
    };
  }

  const plainLines = plainToLines(plain);
  if (plainLines.length > 0) {
    return {
      mode: "plain",
      lines: plainLines,
      hasSyncedLyrics: false,
    };
  }

  return {
    mode: "none",
    lines: [],
    hasSyncedLyrics: false,
  };
}

export function getLyricsSyncOffset(mode: LyricsDisplayMode) {
  return mode === "synced" ? LYRICS_SYNC_OFFSET_MS : 0;
}

export function findActiveLyricIndex(lines: LyricLine[], activePosition: number) {
  if (!lines.length) return -1;

  let low = 0;
  let high = lines.length - 1;
  let answer = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (activePosition >= lines[mid].timeMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

export function getActiveLyricLine(
  lines: LyricLine[],
  positionMs: number,
  mode: LyricsDisplayMode
): LyricLine | null {
  if (mode === "none" || !lines.length) return null;

  const index = findActiveLyricIndex(
    lines,
    positionMs + getLyricsSyncOffset(mode)
  );

  return index >= 0 ? lines[index] : null;
}

export function toSyncedLyricLines(lines: LyricLine[]) {
  return lines.map((line) => ({
    time: line.timeMs,
    text: line.text,
  }));
}

export function formatLyricsTime(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

export function stripLrcTimestamps(text: string) {
  return String(text || "")
    .replace(/\[[\d:.]+\]/g, "")
    .replace(/<\d+,\d+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
