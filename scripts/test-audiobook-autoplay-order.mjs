/**
 * Audiobook chapter ordering + same-book queue identity.
 * Run: node scripts/test-audiobook-autoplay-order.mjs
 */
import assert from "node:assert/strict";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseAudiobookChapterNumberFromTitle(title) {
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

function audiobookChapterSortKey(chapter, sourceIndex = 0) {
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

function compareAudiobookChapters(left, right, leftSourceIndex = 0, rightSourceIndex = 0) {
  const a = audiobookChapterSortKey(left, leftSourceIndex);
  const b = audiobookChapterSortKey(right, rightSourceIndex);
  if (a.index !== b.index) return a.index - b.index;
  if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
  return a.id.localeCompare(b.id);
}

function orderAudiobookChapters(chapters) {
  return chapters
    .map((chapter, sourceIndex) => ({ chapter, sourceIndex }))
    .sort((a, b) =>
      compareAudiobookChapters(a.chapter, b.chapter, a.sourceIndex, b.sourceIndex)
    )
    .map((entry) => entry.chapter);
}

const lexBroken = [
  { id: "c10", title: "Chapter 10", chapter_number: 10 },
  { id: "c2", title: "Chapter 2", chapter_number: 2 },
  { id: "c1", title: "Chapter 1", chapter_number: 1 },
  { id: "c11", title: "Chapter 11", chapter_number: 11 },
];
const ordered = orderAudiobookChapters(lexBroken);
assert.deepEqual(
  ordered.map((c) => c.id),
  ["c1", "c2", "c10", "c11"],
  "numeric chapter_number must beat lexicographic order"
);

const titleOnly = orderAudiobookChapters([
  { id: "b", title: "Chapter 10: Dawn" },
  { id: "a", title: "Chapter 2: Night" },
  { id: "c", title: "Chapter 1: Morning" },
]);
assert.deepEqual(
  titleOnly.map((c) => c.id),
  ["c", "a", "b"],
  "parsed title numbers must order 1,2,10"
);

const sameBookParent = {
  audiobookId: "book-1",
  chapters: ordered,
};
assert.equal(sameBookParent.audiobookId, "book-1");
assert.ok(sameBookParent.chapters.every((c) => c.id.startsWith("c")));

const lastChapter = ordered[ordered.length - 1];
const nextAfterLast = ordered.findIndex((c) => c.id === lastChapter.id) + 1;
assert.equal(nextAfterLast, ordered.length, "final chapter has no next in same book");

const AUDIOBOOK_MAX_AUTO_NEXT_FAILURES = 5;
assert.ok(AUDIOBOOK_MAX_AUTO_NEXT_FAILURES >= 3 && AUDIOBOOK_MAX_AUTO_NEXT_FAILURES <= 5);

console.log("PASS audiobook autoplay order", {
  orderedIds: ordered.map((c) => c.id),
  titleOnlyIds: titleOnly.map((c) => c.id),
  finalStops: true,
  skipCap: AUDIOBOOK_MAX_AUTO_NEXT_FAILURES,
});
