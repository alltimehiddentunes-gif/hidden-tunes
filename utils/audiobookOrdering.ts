/**
 * Numeric-aware audiobook chapter ordering.
 * Prefer explicit chapter_number, then carefully parsed title numbers,
 * then stable source order (never lexicographic "1, 10, 11, 2").
 */

type ChapterLike = {
  id?: string | null;
  title?: string | null;
  chapter_number?: number | null;
  part_number?: number | null;
  sequence?: number | null;
  track_number?: number | null;
  order?: number | null;
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Extract a chapter/part index from titles like "Chapter 2", "Ch. 10", "Part 3". */
export function parseAudiobookChapterNumberFromTitle(title?: string | null): number | null {
  const raw = String(title || "").trim();
  if (!raw) return null;
  const patterns = [
    /\b(?:chapter|ch\.?|part|pt\.?|episode|ep\.?)\s*0*(\d+)\b/i,
    /^0*(\d+)(?:\s*[\.\):-]|\s+)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export function audiobookChapterSortKey(chapter: ChapterLike, sourceIndex = 0) {
  const explicit =
    finiteNumber(chapter.chapter_number) ??
    finiteNumber(chapter.track_number) ??
    finiteNumber(chapter.part_number) ??
    finiteNumber(chapter.sequence) ??
    finiteNumber(chapter.order);
  const parsed = explicit == null ? parseAudiobookChapterNumberFromTitle(chapter.title) : null;
  return {
    index: explicit ?? parsed ?? Number.POSITIVE_INFINITY,
    sourceIndex,
    id: String(chapter.id || ""),
  };
}

export function compareAudiobookChapters(
  left: ChapterLike,
  right: ChapterLike,
  leftSourceIndex = 0,
  rightSourceIndex = 0
) {
  const a = audiobookChapterSortKey(left, leftSourceIndex);
  const b = audiobookChapterSortKey(right, rightSourceIndex);
  if (a.index !== b.index) return a.index - b.index;
  if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
  return a.id.localeCompare(b.id);
}

export function orderAudiobookChapters<T extends ChapterLike>(chapters: T[]): T[] {
  return chapters
    .map((chapter, sourceIndex) => ({ chapter, sourceIndex }))
    .sort((a, b) =>
      compareAudiobookChapters(a.chapter, b.chapter, a.sourceIndex, b.sourceIndex)
    )
    .map((entry) => entry.chapter);
}
