export type TimedTranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type AudioLyricAlignmentResult = {
  ok: boolean;
  lrcText?: string;
  confidence: number;
  matchedTokens: number;
  totalTokens: number;
  matchedLines: number;
  totalLines: number;
  reason?:
    | "empty_lyrics"
    | "missing_timestamps"
    | "alignment_too_large"
    | "low_confidence";
};

type LyricLine = { text: string; tokens: string[] };
type TokenMatch = { lyricIndex: number; transcriptIndex: number };

const MIN_TOKEN_CONFIDENCE = 0.58;
const MIN_LINE_CONFIDENCE = 1;
const MAX_ALIGNMENT_CELLS = 10_000_000;

function normalizeToken(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function tokenize(value: string) {
  return value.split(/\s+/).map(normalizeToken).filter(Boolean);
}

function parseLyricLines(plainLyrics: string): LyricLine[] {
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, tokens: tokenize(text) }))
    .filter((line) => line.tokens.length > 0);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length >= 5 && right.length >= 5) {
    if (left.startsWith(right) || right.startsWith(left)) return 0.86;
    if (Math.abs(left.length - right.length) <= 1) {
      let differences = 0;
      const length = Math.min(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        if (left[index] !== right[index]) differences += 1;
        if (differences > 1) break;
      }
      if (differences + Math.abs(left.length - right.length) <= 1) return 0.8;
    }
  }
  return 0;
}

function alignTokenSequences(lyrics: string[], transcript: string[]) {
  const width = transcript.length + 1;
  const scores = new Float32Array((lyrics.length + 1) * width);

  for (let lyricIndex = 1; lyricIndex <= lyrics.length; lyricIndex += 1) {
    for (
      let transcriptIndex = 1;
      transcriptIndex <= transcript.length;
      transcriptIndex += 1
    ) {
      const offset = lyricIndex * width + transcriptIndex;
      const similarity = tokenSimilarity(
        lyrics[lyricIndex - 1],
        transcript[transcriptIndex - 1],
      );
      const diagonal = scores[offset - width - 1] + similarity;
      scores[offset] = Math.max(
        diagonal,
        scores[offset - width],
        scores[offset - 1],
      );
    }
  }

  const matches: TokenMatch[] = [];
  let lyricIndex = lyrics.length;
  let transcriptIndex = transcript.length;
  while (lyricIndex > 0 && transcriptIndex > 0) {
    const offset = lyricIndex * width + transcriptIndex;
    const similarity = tokenSimilarity(
      lyrics[lyricIndex - 1],
      transcript[transcriptIndex - 1],
    );
    const diagonal = scores[offset - width - 1] + similarity;
    if (similarity > 0 && Math.abs(scores[offset] - diagonal) < 0.0001) {
      matches.push({
        lyricIndex: lyricIndex - 1,
        transcriptIndex: transcriptIndex - 1,
      });
      lyricIndex -= 1;
      transcriptIndex -= 1;
    } else if (scores[offset - width] >= scores[offset - 1]) {
      lyricIndex -= 1;
    } else {
      transcriptIndex -= 1;
    }
  }
  return matches.reverse();
}

function formatLrcTimestamp(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  const remainder = centiseconds % 6000;
  return `[${String(minutes).padStart(2, "0")}:${String(Math.floor(remainder / 100)).padStart(2, "0")}.${String(remainder % 100).padStart(2, "0")}]`;
}

export function alignLyricsToWordTimestamps(
  plainLyrics: string,
  timedWords: TimedTranscriptWord[],
): AudioLyricAlignmentResult {
  const lines = parseLyricLines(plainLyrics);
  const words = timedWords
    .filter(
      (word) =>
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.start >= 0 &&
        word.end >= word.start,
    )
    .map((word) => ({ ...word, normalized: normalizeToken(word.word) }))
    .filter((word) => Boolean(word.normalized));
  const totalTokens = lines.reduce((sum, line) => sum + line.tokens.length, 0);

  if (lines.length === 0 || totalTokens === 0) {
    return {
      ok: false,
      confidence: 0,
      matchedTokens: 0,
      totalTokens,
      matchedLines: 0,
      totalLines: lines.length,
      reason: "empty_lyrics",
    };
  }
  if (words.length === 0) {
    return {
      ok: false,
      confidence: 0,
      matchedTokens: 0,
      totalTokens,
      matchedLines: 0,
      totalLines: lines.length,
      reason: "missing_timestamps",
    };
  }

  const lyricTokens = lines.flatMap((line) => line.tokens);
  if ((lyricTokens.length + 1) * (words.length + 1) > MAX_ALIGNMENT_CELLS) {
    return {
      ok: false,
      confidence: 0,
      matchedTokens: 0,
      totalTokens,
      matchedLines: 0,
      totalLines: lines.length,
      reason: "alignment_too_large",
    };
  }
  const matches = alignTokenSequences(
    lyricTokens,
    words.map((word) => word.normalized),
  );
  const tokenToTranscript = new Map(
    matches.map((match) => [match.lyricIndex, match.transcriptIndex]),
  );
  let tokenOffset = 0;
  const lineStarts = lines.map((line) => {
    const transcriptIndexes = line.tokens
      .map((_, index) => tokenToTranscript.get(tokenOffset + index))
      .filter((index): index is number => index !== undefined);
    tokenOffset += line.tokens.length;
    return transcriptIndexes.length > 0
      ? words[Math.min(...transcriptIndexes)].start
      : null;
  });
  const matchedLines = lineStarts.filter((start) => start !== null).length;
  const tokenConfidence = matches.length / totalTokens;
  const lineConfidence = matchedLines / lines.length;
  const confidence = tokenConfidence * 0.7 + lineConfidence * 0.3;

  if (
    tokenConfidence < MIN_TOKEN_CONFIDENCE ||
    lineConfidence < MIN_LINE_CONFIDENCE
  ) {
    return {
      ok: false,
      confidence,
      matchedTokens: matches.length,
      totalTokens,
      matchedLines,
      totalLines: lines.length,
      reason: "low_confidence",
    };
  }

  let lastStart = 0;
  const lrcText = lines
    .map((line, index) => {
      const matchedStart = lineStarts[index];
      if (matchedStart !== null) lastStart = Math.max(lastStart, matchedStart);
      return `${formatLrcTimestamp(lastStart)} ${line.text}`;
    })
    .join("\n");

  return {
    ok: true,
    lrcText,
    confidence,
    matchedTokens: matches.length,
    totalTokens,
    matchedLines,
    totalLines: lines.length,
  };
}
