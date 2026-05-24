import type { CreatorLyricsCatalogTrack } from "@/lib/creatorLyricsCatalog";

export type BulkLyricsKind = "plain" | "synced";

export type BulkLyricsMatchStatus = "matched" | "possible" | "unmatched";

export type BulkLyricsBlock = {
  id: string;
  sourceLabel: string;
  filename: string | null;
  content: string;
  kind: BulkLyricsKind;
  titleHint: string | null;
  artistHint: string | null;
  albumHint: string | null;
};

export type BulkLyricsMatchCandidate = {
  trackId: string;
  releaseId: string;
  trackTitle: string;
  artistName: string;
  albumTitle: string;
  score: number;
};

export type BulkLyricsMatchedRow = {
  block: BulkLyricsBlock;
  status: BulkLyricsMatchStatus;
  score: number;
  match: BulkLyricsMatchCandidate | null;
  candidates: BulkLyricsMatchCandidate[];
};

const MATCH_THRESHOLD = 0.85;
const POSSIBLE_THRESHOLD = 0.55;
const BLOCK_SPLIT_REGEX = /\n-{3,}\n|\n={3,}\n|\n\n(?=[#\[])/g;
const LRC_TAG_REGEX = /^\[(ti|ar|al|by|offset):(.+)\]$/i;
const LRC_TIMESTAMP_REGEX = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/;

const SAFE_TEXT_EXTENSIONS = new Set(["txt", "lrc"]);
const MAX_FILE_BYTES = 512_000;
const MAX_FILES = 80;

function text(value: unknown) {
  return String(value || "").trim();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasLrcTimestamps(value: string) {
  if (!value.trim()) return false;
  return LRC_TIMESTAMP_REGEX.test(value);
}

export function detectLyricsKind(content: string): BulkLyricsKind {
  return hasLrcTimestamps(content) ? "synced" : "plain";
}

export function normalizeMatchText(value: string) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  const tokens = normalizeMatchText(value)
    .split(" ")
    .filter((token) => token.length > 1);
  return new Set(tokens);
}

function jaccardSimilarity(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) intersection += 1;
  });

  return intersection / (a.size + b.size - intersection);
}

function containsSimilarity(haystack: string, needle: string) {
  const normalizedHaystack = normalizeMatchText(haystack);
  const normalizedNeedle = normalizeMatchText(needle);
  if (!normalizedHaystack || !normalizedNeedle) return 0;
  if (normalizedHaystack === normalizedNeedle) return 1;
  if (normalizedHaystack.includes(normalizedNeedle)) return 0.92;
  if (normalizedNeedle.includes(normalizedHaystack)) return 0.88;
  return jaccardSimilarity(normalizedHaystack, normalizedNeedle);
}

export function extractLrcMetadata(content: string) {
  const metadata = {
    titleHint: null as string | null,
    artistHint: null as string | null,
    albumHint: null as string | null,
  };

  content.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(LRC_TAG_REGEX);
    if (!match) return;

    const tag = match[1].toLowerCase();
    const value = text(match[2]);
    if (!value) return;

    if (tag === "ti") metadata.titleHint = value;
    if (tag === "ar" || tag === "by") metadata.artistHint = value;
    if (tag === "al") metadata.albumHint = value;
  });

  return metadata;
}

function parseFilenameHints(filename: string | null) {
  if (!filename) {
    return { titleHint: null, artistHint: null, albumHint: null };
  }

  const base = text(filename.replace(/\.[^.]+$/, ""));
  const parts = base
    .split(/\s*[-–—_|]\s*/)
    .map((part) => text(part))
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      albumHint: parts[0],
      artistHint: parts[1],
      titleHint: parts.slice(2).join(" "),
    };
  }

  if (parts.length === 2) {
    return {
      albumHint: null,
      artistHint: parts[0],
      titleHint: parts[1],
    };
  }

  return {
    albumHint: null,
    artistHint: null,
    titleHint: base || null,
  };
}

export function buildBulkLyricsBlock(input: {
  content: string;
  sourceLabel: string;
  filename?: string | null;
}): BulkLyricsBlock {
  const content = String(input.content || "");
  const filename = input.filename ? text(input.filename) : null;
  const lrcMetadata = extractLrcMetadata(content);
  const filenameHints = parseFilenameHints(filename);

  return {
    id: createId("block"),
    sourceLabel: text(input.sourceLabel) || filename || "Lyrics block",
    filename,
    content,
    kind: detectLyricsKind(content),
    titleHint: lrcMetadata.titleHint || filenameHints.titleHint,
    artistHint: lrcMetadata.artistHint || filenameHints.artistHint,
    albumHint: lrcMetadata.albumHint || filenameHints.albumHint,
  };
}

export function parsePastedBulkLyrics(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [] as BulkLyricsBlock[];

  const chunks = trimmed
    .split(BLOCK_SPLIT_REGEX)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const blocks = (chunks.length ? chunks : [trimmed]).map((chunk, index) =>
    buildBulkLyricsBlock({
      content: chunk,
      sourceLabel: `Pasted block ${index + 1}`,
    })
  );

  return blocks;
}

export function isSafeBulkLyricsFile(file: File) {
  const extension = text(file.name.split(".").pop()).toLowerCase();
  if (!SAFE_TEXT_EXTENSIONS.has(extension)) return false;
  if (file.size > MAX_FILE_BYTES) return false;
  return true;
}

export async function parseBulkLyricsFiles(files: File[]) {
  const accepted = files.filter(isSafeBulkLyricsFile).slice(0, MAX_FILES);
  const blocks: BulkLyricsBlock[] = [];

  for (const file of accepted) {
    const content = await file.text();
    if (!content.trim()) continue;

    blocks.push(
      buildBulkLyricsBlock({
        content,
        sourceLabel: file.name,
        filename: file.name,
      })
    );
  }

  return blocks;
}

function scoreBlockAgainstTrack(block: BulkLyricsBlock, track: CreatorLyricsCatalogTrack) {
  const comparisons: number[] = [];

  const trackLabel = `${track.artistName} ${track.trackTitle}`;
  const reverseLabel = `${track.trackTitle} ${track.artistName}`;
  const albumTrackLabel = `${track.albumTitle} ${track.trackTitle}`;

  if (block.filename) {
    comparisons.push(containsSimilarity(block.filename, trackLabel));
    comparisons.push(containsSimilarity(block.filename, reverseLabel));
    comparisons.push(containsSimilarity(block.filename, track.trackTitle));
    comparisons.push(containsSimilarity(block.filename, albumTrackLabel));
  }

  if (block.titleHint) {
    comparisons.push(containsSimilarity(block.titleHint, track.trackTitle));
    comparisons.push(
      containsSimilarity(`${block.artistHint || ""} ${block.titleHint}`, trackLabel)
    );
  }

  if (block.artistHint) {
    comparisons.push(containsSimilarity(block.artistHint, track.artistName));
  }

  if (block.albumHint) {
    comparisons.push(containsSimilarity(block.albumHint, track.albumTitle));
    comparisons.push(
      containsSimilarity(`${block.albumHint} ${block.titleHint || ""}`, albumTrackLabel)
    );
  }

  if (!comparisons.length) {
    comparisons.push(jaccardSimilarity(block.sourceLabel, trackLabel));
  }

  return Math.max(0, ...comparisons);
}

export function autoMatchBulkLyricsBlocks(
  blocks: BulkLyricsBlock[],
  catalog: CreatorLyricsCatalogTrack[]
): BulkLyricsMatchedRow[] {
  return blocks.map((block) => {
    const candidates = catalog
      .map((track) => ({
        trackId: track.trackId,
        releaseId: track.releaseId,
        trackTitle: track.trackTitle,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        score: scoreBlockAgainstTrack(block, track),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const best = candidates[0] || null;
    const score = best?.score || 0;
    let status: BulkLyricsMatchStatus = "unmatched";

    if (score >= MATCH_THRESHOLD) status = "matched";
    else if (score >= POSSIBLE_THRESHOLD) status = "possible";

    return {
      block,
      status,
      score,
      match: best,
      candidates,
    };
  });
}

export function applyManualBulkMatch(
  row: BulkLyricsMatchedRow,
  track: CreatorLyricsCatalogTrack | null
): BulkLyricsMatchedRow {
  if (!track) {
    return {
      ...row,
      status: "unmatched",
      score: 0,
      match: null,
    };
  }

  return {
    ...row,
    status: "matched",
    score: 1,
    match: {
      trackId: track.trackId,
      releaseId: track.releaseId,
      trackTitle: track.trackTitle,
      artistName: track.artistName,
      albumTitle: track.albumTitle,
      score: 1,
    },
    candidates: row.candidates,
  };
}

export function getBulkMatchThresholds() {
  return {
    matched: MATCH_THRESHOLD,
    possible: POSSIBLE_THRESHOLD,
  };
}
