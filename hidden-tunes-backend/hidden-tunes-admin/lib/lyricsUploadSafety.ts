export type NamedUploadFile = { name: string };

export type CompanionMatch<T extends NamedUploadFile> =
  | { status: "none"; file: null; candidates: [] }
  | { status: "unique"; file: T; candidates: [T] }
  | { status: "ambiguous"; file: null; candidates: T[] };

export type LrcValidation = {
  valid: boolean;
  timedLineCount: number;
  plainText: string;
  error?: "no_timed_lines" | "malformed_timestamp" | "timestamps_out_of_order";
};

export type UploadLyricsSource =
  | "supplied-lrc"
  | "embedded-synced"
  | "accompanying"
  | "companion"
  | "embedded-plain"
  | "transcription"
  | "automatic"
  | "manual"
  | null;

export function resolveUploadLyrics(input: {
  suppliedLrcText?: string;
  embeddedSyncedLrcText?: string;
  accompanyingPlainLyricsText?: string;
  companionPlainLyricsText?: string;
  embeddedPlainLyricsText?: string;
  automaticPlainLyricsText?: string;
  automaticSyncedLrcText?: string;
  manualPlainLyricsText?: string;
  manualSyncedLrcText?: string;
}) {
  const syncedCandidates = [
    ["supplied-lrc", input.suppliedLrcText],
    ["embedded-synced", input.embeddedSyncedLrcText],
    ["automatic", input.automaticSyncedLrcText],
    ["manual", input.manualSyncedLrcText],
  ] as const;
  const plainCandidates = [
    ["accompanying", input.accompanyingPlainLyricsText],
    ["companion", input.companionPlainLyricsText],
    ["embedded-plain", input.embeddedPlainLyricsText],
    ["transcription", input.automaticPlainLyricsText],
    ["manual", input.manualPlainLyricsText],
  ] as const;
  const synced = syncedCandidates.find(([, value]) => Boolean(value?.trim()));
  const plain = plainCandidates.find(([, value]) => Boolean(value?.trim()));

  return {
    plainLyricsText: plain?.[1]?.trim() || "",
    syncedLrcText: synced?.[1]?.trim() || "",
    source: (synced?.[0] || plain?.[0] || null) as UploadLyricsSource,
  };
}

export function isUploadAlignmentCandidate(input: {
  plainLyricsText?: string;
  syncedLrcText?: string;
  companionMatchStatus?: CompanionMatch<NamedUploadFile>["status"];
  hasExplicitAccompanyingText?: boolean;
}) {
  return Boolean(
    input.plainLyricsText?.trim() &&
      !input.syncedLrcText?.trim() &&
      (input.hasExplicitAccompanyingText || input.companionMatchStatus !== "ambiguous")
  );
}

const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const BRACKETED_TIME_LIKE = /\[\d[^\]]*:[^\]]*\]/;

export function normalizeCompanionName(value: string) {
  return String(value || "")
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*(?:\(\d+\)|copy(?:\s+\d+)?|duplicate)\s*$/i, "")
    .replace(/^\d+\s*[.\-_ ]+\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function companionKeys(value: string) {
  const base = normalizeCompanionName(value);
  const keys = new Set<string>();
  if (base) keys.add(base);
  const withoutBrackets = base
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutBrackets) keys.add(withoutBrackets);
  const rawBase = String(value || "").replace(/\.[^/.]+$/, "").trim();
  const parts = rawBase
    .split(/\s+[-–—|]\s+/)
    .map((part) => normalizeCompanionName(part))
    .filter(Boolean);
  if (parts.length > 1) keys.add(parts[parts.length - 1]);
  return keys;
}

export function resolveCompanionMatches<A extends NamedUploadFile, C extends NamedUploadFile>(
  audioFiles: A[],
  companionFiles: C[]
) {
  const preliminary = audioFiles.map((audio) => {
    const exactKey = normalizeCompanionName(audio.name);
    const exact = companionFiles.filter(
      (candidate) => normalizeCompanionName(candidate.name) === exactKey
    );
    if (exact.length === 1) {
      return { audio, exact: true, matches: exact };
    }
    if (exact.length > 1) {
      return { audio, exact: true, matches: exact };
    }
    const keys = companionKeys(audio.name);
    const relaxed = companionFiles.filter((candidate) =>
      [...companionKeys(candidate.name)].some((key) => keys.has(key))
    );
    return { audio, exact: false, matches: relaxed };
  });

  return new Map(
    preliminary.map(({ audio, exact, matches }) => {
      let result: CompanionMatch<C>;
      const sharedRelaxedMatch =
        !exact &&
        matches.length === 1 &&
        preliminary.filter(
          (entry) => !entry.exact && entry.matches.length === 1 && entry.matches[0] === matches[0]
        ).length > 1;
      if (matches.length === 0) {
        result = { status: "none", file: null, candidates: [] };
      } else if (matches.length === 1 && !sharedRelaxedMatch) {
        result = { status: "unique", file: matches[0], candidates: [matches[0]] };
      } else {
        result = { status: "ambiguous", file: null, candidates: matches };
      }
      return [audio, result] as const;
    })
  );
}

function fractionToSeconds(value: string | undefined) {
  if (!value) return 0;
  return Number(`0.${value.padEnd(3, "0").slice(0, 3)}`);
}

export function validateImportedLrc(value: string): LrcValidation {
  const plainLines: string[] = [];
  const timestamps: number[] = [];
  let malformed = false;

  for (const rawLine of String(value || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    TIMESTAMP.lastIndex = 0;
    const matches = [...line.matchAll(TIMESTAMP)];
    if (!matches.length) {
      if (BRACKETED_TIME_LIKE.test(line)) malformed = true;
      if (!/^\[(ar|al|ti|by|offset|re|ve):/i.test(line)) plainLines.push(line);
      continue;
    }
    const lyric = line.replace(TIMESTAMP, "").trim();
    if (lyric) plainLines.push(lyric);
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (!Number.isFinite(minutes) || seconds >= 60) {
        malformed = true;
        continue;
      }
      timestamps.push(minutes * 60 + seconds + fractionToSeconds(match[3]));
    }
  }

  if (malformed) {
    return { valid: false, timedLineCount: timestamps.length, plainText: plainLines.join("\n"), error: "malformed_timestamp" };
  }
  if (!timestamps.length) {
    return { valid: false, timedLineCount: 0, plainText: plainLines.join("\n"), error: "no_timed_lines" };
  }
  if (timestamps.some((time, index) => index > 0 && time < timestamps[index - 1])) {
    return { valid: false, timedLineCount: timestamps.length, plainText: plainLines.join("\n"), error: "timestamps_out_of_order" };
  }
  return { valid: true, timedLineCount: timestamps.length, plainText: plainLines.join("\n") };
}

export function normalizeLyricsForPersistence(input: {
  legacyLyricsText?: string;
  plainLyricsText?: string;
  syncedLrcText?: string;
}) {
  let plainLyrics = String(input.plainLyricsText || "").trim() || null;
  let syncedLrc = String(input.syncedLrcText || "").trim() || null;
  const legacy = String(input.legacyLyricsText || "").trim();
  if (!plainLyrics && !syncedLrc && legacy) {
    const validation = validateImportedLrc(legacy);
    if (validation.valid) syncedLrc = legacy;
    else plainLyrics = validation.plainText || legacy;
  }
  if (syncedLrc) {
    const validation = validateImportedLrc(syncedLrc);
    if (!validation.valid) {
      plainLyrics = plainLyrics || validation.plainText || syncedLrc;
      syncedLrc = null;
    }
  }
  return {
    plainLyrics,
    syncedLrc,
    lyricsType: syncedLrc ? ("lrc" as const) : plainLyrics ? ("plain" as const) : null,
    hasLyrics: Boolean(plainLyrics || syncedLrc),
  };
}
