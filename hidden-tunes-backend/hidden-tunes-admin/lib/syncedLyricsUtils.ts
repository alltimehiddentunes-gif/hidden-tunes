import type { SyncedLyricLine, SyncedLyricLineType } from "./syncedLyricsTypes";

const LRC_TIMESTAMP_REGEX = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const VALID_LINE_TYPES = new Set<SyncedLyricLineType>([
  "lyric",
  "instrumental",
  "interlude",
  "silence",
]);

function clampTime(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function parseFractionToMs(fractionRaw: string) {
  if (!fractionRaw) return 0;
  if (fractionRaw.length === 1) return Number(fractionRaw) * 100;
  if (fractionRaw.length === 2) return Number(fractionRaw) * 10;
  return Number(fractionRaw.slice(0, 3));
}

export function secondsToLrcTimestamp(seconds: number) {
  const safeSeconds = clampTime(seconds);
  const totalMs = Math.round(safeSeconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secondsPart = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);

  return `[${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}

export function lrcTimestampToSeconds(minutes: number, seconds: number, fractionRaw: string) {
  const ms =
    minutes * 60 * 1000 + seconds * 1000 + parseFractionToMs(fractionRaw || "0");
  return clampTime(ms / 1000);
}

export function splitPlainLyricLines(plainLyrics: string) {
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function inferLineType(text: string): SyncedLyricLineType {
  const normalized = text.trim().toLowerCase();

  if (!normalized || normalized === "…" || normalized === "...") {
    return "silence";
  }

  if (
    normalized.includes("instrumental") ||
    normalized.includes("guitar solo") ||
    normalized.includes("piano break") ||
    /^♪/.test(text.trim())
  ) {
    if (normalized.includes("bridge") || normalized.includes("outro")) {
      return "interlude";
    }
    return "instrumental";
  }

  return "lyric";
}

export function sanitizeSyncedLyricLine(raw: unknown): SyncedLyricLine | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const text = String(candidate.text || "").trim();
  const time = clampTime(Number(candidate.time));

  if (!text) return null;

  const rawType = String(candidate.type || "").trim() as SyncedLyricLineType;
  const type = VALID_LINE_TYPES.has(rawType) ? rawType : inferLineType(text);

  return { time, text, type };
}

export function sanitizeSyncedLyricsJson(raw: unknown): SyncedLyricLine[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => sanitizeSyncedLyricLine(entry))
    .filter((entry): entry is SyncedLyricLine => entry !== null);
}

export function sortSyncedLyricsByTime(lines: SyncedLyricLine[]) {
  return [...lines].sort((a, b) => {
    if (a.time === b.time) return a.text.localeCompare(b.text);
    return a.time - b.time;
  });
}

export function parseLrcToSyncedLines(lrc: string): SyncedLyricLine[] {
  if (!lrc.trim()) return [];

  const entries: SyncedLyricLine[] = [];

  lrc.split(/\r?\n/).forEach((row) => {
    const matches = [...row.matchAll(LRC_TIMESTAMP_REGEX)];
    const text = row.replace(/\[[^\]]+\]/g, "").trim();

    if (!matches.length || !text) return;

    matches.forEach((match) => {
      entries.push({
        time: lrcTimestampToSeconds(
          Number(match[1] || 0),
          Number(match[2] || 0),
          match[3] || "0"
        ),
        text,
        type: inferLineType(text),
      });
    });
  });

  return sortSyncedLyricsByTime(entries);
}

export function generateLrcFromSyncedLines(lines: SyncedLyricLine[]) {
  return sortSyncedLyricsByTime(lines)
    .map((line) => `${secondsToLrcTimestamp(line.time)}${line.text}`)
    .join("\n");
}

export function syncedLinesToPlainText(lines: SyncedLyricLine[]) {
  return sortSyncedLyricsByTime(lines)
    .map((line) => line.text)
    .join("\n");
}

export function plainLinesToUnsyncedEntries(lines: string[]): SyncedLyricLine[] {
  return lines.map((text) => ({
    time: 0,
    text,
    type: inferLineType(text),
  }));
}

export function mergePlainAndSyncedLines(
  plainLyrics: string,
  syncedLines: SyncedLyricLine[]
): SyncedLyricLine[] {
  const plainLines = splitPlainLyricLines(plainLyrics);

  if (!plainLines.length) {
    return sortSyncedLyricsByTime(syncedLines);
  }

  const timedByText = new Map<string, SyncedLyricLine>();

  syncedLines.forEach((line) => {
    if (!timedByText.has(line.text)) {
      timedByText.set(line.text, line);
    }
  });

  return plainLines.map((text, index) => {
    const matched = timedByText.get(text) || syncedLines[index];
    if (matched) {
      return {
        time: matched.time,
        text,
        type: matched.type || inferLineType(text),
      };
    }

    return {
      time: 0,
      text,
      type: inferLineType(text),
    };
  });
}

export function applyEvenTimestampMode(
  lines: SyncedLyricLine[],
  durationSeconds: number
) {
  const usable = lines.filter((line) => line.text.trim());
  if (!usable.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return lines;
  }

  const spacing = durationSeconds / usable.length;

  return usable.map((line, index) => ({
    ...line,
    time: clampTime(spacing * index),
  }));
}

export function applySmartSpacingHelper(
  lines: SyncedLyricLine[],
  durationSeconds: number
) {
  const usable = lines.filter((line) => line.text.trim());
  if (!usable.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return lines;
  }

  const weights = usable.map((line) => {
    if (line.type === "silence") return 2.4;
    if (line.type === "instrumental" || line.type === "interlude") return 1.8;
    if (!line.text.trim()) return 1.6;
    return Math.max(1, line.text.trim().length / 18);
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || usable.length;
  let cursor = 0;

  return usable.map((line, index) => {
    const next = {
      ...line,
      time: clampTime((cursor / totalWeight) * durationSeconds),
    };
    cursor += weights[index] || 1;
    return next;
  });
}

export function shiftAllSyncedLineTimes(
  lines: SyncedLyricLine[],
  deltaSeconds: number
) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return lines;

  return sortSyncedLyricsByTime(lines).map((line) => ({
    ...line,
    time: clampTime(line.time + deltaSeconds),
  }));
}

export function shiftSyncedLinesFromIndex(
  lines: SyncedLyricLine[],
  fromIndex: number,
  deltaSeconds: number
) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return lines;

  return sortSyncedLyricsByTime(lines).map((line, index) =>
    index >= fromIndex
      ? { ...line, time: clampTime(line.time + deltaSeconds) }
      : line
  );
}

export function insertInstrumentalGapBeforeIndex(
  lines: SyncedLyricLine[],
  beforeIndex: number,
  gapSeconds: number,
  gapText = "♪ Instrumental ♪",
  gapType: SyncedLyricLineType = "instrumental"
) {
  const ordered = sortSyncedLyricsByTime(lines);
  const safeIndex = Math.max(0, Math.min(beforeIndex, ordered.length));
  const gapDuration = Math.max(0, gapSeconds);

  const anchorTime =
    safeIndex > 0 ? ordered[safeIndex - 1]?.time ?? 0 : 0;

  const gapLine: SyncedLyricLine = {
    time: clampTime(anchorTime),
    text: gapText,
    type: gapType,
  };

  const withGap = [...ordered];
  withGap.splice(safeIndex, 0, gapLine);

  return withGap.map((line, index) =>
    index > safeIndex
      ? { ...line, time: clampTime(line.time + gapDuration) }
      : line
  );
}

export function spreadLinesAcrossDuration(
  lines: SyncedLyricLine[],
  durationSeconds: number,
  introDelaySeconds = 0,
  outroPaddingSeconds = 0
) {
  const usable = lines.filter((line) => line.text.trim());
  if (!usable.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return lines;
  }

  const intro = Math.max(0, introDelaySeconds);
  const endTime = Math.max(intro + 0.5, durationSeconds - Math.max(0, outroPaddingSeconds));
  const usableDuration = Math.max(0.5, endTime - intro);
  const spacing = usableDuration / usable.length;

  return usable.map((line, index) => ({
    ...line,
    time: clampTime(intro + spacing * index),
  }));
}

export function parseEditableTimestampInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? clampTime(seconds) : null;
  }

  const bracketMatch = trimmed.match(/^\[?(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]?$/);
  if (bracketMatch) {
    return lrcTimestampToSeconds(
      Number(bracketMatch[1] || 0),
      Number(bracketMatch[2] || 0),
      bracketMatch[3] || "0"
    );
  }

  const clockMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (clockMatch) {
    return lrcTimestampToSeconds(
      Number(clockMatch[1] || 0),
      Number(clockMatch[2] || 0),
      clockMatch[3] || "0"
    );
  }

  return null;
}

export function findActiveLineIndex(lines: SyncedLyricLine[], currentSeconds: number) {
  const timed = lines
    .map((line, index) => ({ index, time: line.time }))
    .filter((line) => Number.isFinite(line.time));

  if (!timed.length) return -1;

  let answer = timed[0].index;

  timed.forEach((line) => {
    if (currentSeconds >= line.time) {
      answer = line.index;
    }
  });

  return answer;
}

export function buildSyncedPayload(
  lines: SyncedLyricLine[],
  plainLyrics: string
): { lyricsJson: SyncedLyricLine[]; lyricsLrc: string; plainLyrics: string } {
  const lyricsJson = sortSyncedLyricsByTime(sanitizeSyncedLyricsJson(lines));
  const resolvedPlain =
    plainLyrics.trim() || syncedLinesToPlainText(lyricsJson);

  return {
    lyricsJson,
    lyricsLrc: generateLrcFromSyncedLines(lyricsJson),
    plainLyrics: resolvedPlain,
  };
}

export function jsonToLrc(lyricsJson: unknown) {
  return generateLrcFromSyncedLines(sanitizeSyncedLyricsJson(lyricsJson));
}

export function lrcToJson(lrc: string) {
  return parseLrcToSyncedLines(lrc);
}
