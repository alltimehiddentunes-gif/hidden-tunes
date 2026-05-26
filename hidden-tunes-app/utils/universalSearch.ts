export type UniversalMatchReason =
  | "Matched lyric"
  | "Matched title"
  | "Matched artist"
  | "Matched album"
  | "Matched genre"
  | "Matched mood"
  | "Matched tag"
  | "Matched TV"
  | "Matched phrase";

export type UniversalSearchHit<T = unknown> = {
  id: string;
  score: number;
  reason: UniversalMatchReason;
  payload: T;
  subtitle?: string;
  lyricSnippet?: string;
};

const PUNCTUATION_RE = /[''`´"]/g;
const NON_WORD_RE = /[^a-z0-9\s]+/gi;
const LRC_TIMESTAMP_RE = /\[[\d:.]+\]|<\d+,\d+>/g;

export function normalizeSearchText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(PUNCTUATION_RE, "")
    .replace(NON_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: unknown): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  return normalized.split(" ").filter((token) => token.length > 0);
}

export function stripLrcTimestamps(value: unknown): string {
  return String(value || "")
    .replace(LRC_TIMESTAMP_RE, " ")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectSearchTags(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeSearchText(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,#/|]+/)
      .map((item) => normalizeSearchText(item))
      .filter(Boolean);
  }

  return [];
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function fuzzyTokenMatch(candidate: string, token: string): boolean {
  if (!token) return true;
  if (!candidate) return false;
  if (candidate === token) return true;
  if (candidate.includes(token) || token.includes(candidate)) return true;

  const maxDistance =
    token.length <= 3 ? 1 : token.length <= 6 ? 2 : Math.max(2, Math.floor(token.length * 0.34));

  return levenshteinDistance(candidate, token) <= maxDistance;
}

function phraseMatchScore(normalizedHaystack: string, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  if (normalizedHaystack.includes(normalizedQuery)) return 120;

  const queryTokens = tokenizeSearchText(normalizedQuery);
  if (!queryTokens.length) return 0;

  const haystackTokens = tokenizeSearchText(normalizedHaystack);

  let matched = 0;
  let fuzzyMatched = 0;

  for (const queryToken of queryTokens) {
    if (normalizedHaystack.includes(queryToken)) {
      matched += 1;
      continue;
    }

    const tokenHit = haystackTokens.some((haystackToken) =>
      fuzzyTokenMatch(haystackToken, queryToken)
    );

    if (tokenHit) {
      fuzzyMatched += 1;
      continue;
    }

    const wordHit = normalizedHaystack
      .split(" ")
      .some((word) => fuzzyTokenMatch(word, queryToken));

    if (wordHit) {
      fuzzyMatched += 1;
    }
  }

  const totalMatched = matched + fuzzyMatched;
  if (totalMatched === 0) return 0;

  if (totalMatched === queryTokens.length) {
    return matched === queryTokens.length ? 95 : 78;
  }

  return 42 + totalMatched * 8;
}

export function extractLyricSnippet(
  lyricsText: string,
  query: string,
  radius = 56
): string | undefined {
  const plain = stripLrcTimestamps(lyricsText);
  const normalizedPlain = normalizeSearchText(plain);
  const normalizedQuery = normalizeSearchText(query);

  if (!plain || !normalizedQuery) return undefined;

  const directIndex = normalizedPlain.indexOf(normalizedQuery);
  const tokens = tokenizeSearchText(normalizedQuery);
  let index = directIndex;

  if (index < 0 && tokens.length) {
    for (const token of tokens) {
      const tokenIndex = normalizedPlain.indexOf(token);
      if (tokenIndex >= 0) {
        index = tokenIndex;
        break;
      }
    }
  }

  if (index < 0) return undefined;

  const start = Math.max(0, index - radius);
  const end = Math.min(plain.length, index + normalizedQuery.length + radius);
  const snippet = plain.slice(start, end).trim();

  if (!snippet) return undefined;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";

  return `${prefix}${snippet}${suffix}`;
}

export type UniversalSearchDocument = {
  id: string;
  normalized: string;
  tokens: string[];
};

export function buildSearchDocument(parts: unknown[]): UniversalSearchDocument {
  const normalized = normalizeSearchText(
    parts
      .flatMap((part) => {
        if (Array.isArray(part)) return part;
        return [part];
      })
      .filter(Boolean)
      .join(" ")
  );

  return {
    id: "",
    normalized,
    tokens: tokenizeSearchText(normalized),
  };
}

export function scoreSearchDocument(
  document: UniversalSearchDocument,
  query: string,
  weight = 1
): number {
  const score = phraseMatchScore(document.normalized, normalizeSearchText(query));
  return score > 0 ? Math.round(score * weight) : 0;
}

export function rankSearchHits<T>(
  hits: UniversalSearchHit<T>[],
  limit = 24
): UniversalSearchHit<T>[] {
  return [...hits]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function mergeSearchHits<T>(
  ...groups: UniversalSearchHit<T>[][]
): UniversalSearchHit<T>[] {
  const seen = new Set<string>();
  const merged: UniversalSearchHit<T>[] = [];

  for (const group of groups) {
    for (const hit of group) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      merged.push(hit);
    }
  }

  return rankSearchHits(merged);
}

export const UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS = [
  "Blues",
  "Gospel",
  "Love",
  "Healing",
  "Midnight",
  "Piano",
] as const;
