/**
 * Lectures duplicate-ID guard.
 * Run: npx tsx scripts/test-lecture-dedupe.mjs
 */

function dedupeLectureItemsById(items, source = "lectures") {
  const seen = new Set();
  const output = [];
  const duplicateIds = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    if (seen.has(id)) {
      duplicateIds.push(id);
      continue;
    }
    seen.add(id);
    output.push(item);
  }
  return { output, duplicateIds, source };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const id = "e17539a3-c32d-4eff-b4f5-c78e79a74a6b";
const recentMapped = [
  { id, title: "Session A" },
  { id, title: "Session B" },
  { id: "other-id", title: "Other" },
];

const result = dedupeLectureItemsById(recentMapped, "home:recent");
assert(result.output.length === 2, "keeps first + other");
assert(result.output[0].title === "Session A", "preserves first occurrence");
assert(result.duplicateIds.length === 1 && result.duplicateIds[0] === id, "reports duplicate");

const clean = dedupeLectureItemsById(
  [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
  ],
  "browse"
);
assert(clean.output.length === 2 && clean.duplicateIds.length === 0, "clean list unchanged");

console.log("PASS lecture dedupe tests");
