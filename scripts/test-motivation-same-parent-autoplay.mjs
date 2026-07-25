/**
 * Motivational same-parent continuation — no broad category speaker mixing.
 * Run: node scripts/test-motivation-same-parent-autoplay.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeSpeakerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function itemMatchesSpeaker(item, speakerKey) {
  if (!speakerKey) return false;
  return (
    normalizeSpeakerKey(item.speaker_name) === speakerKey ||
    normalizeSpeakerKey(item.channel_name) === speakerKey
  );
}

function buildSafeMotivationContinuation(programItems, speakerName, parentScope = "program") {
  const speakerKey = normalizeSpeakerKey(speakerName);
  const seen = new Set(programItems.map((i) => i.id));
  const queue = [...programItems];
  const sources = ["program"];

  const speakerPool = [
    { id: "s1", speaker_name: speakerName, title: "Same speaker A" },
    { id: "s2", speaker_name: speakerName, title: "Same speaker B" },
    { id: "x1", speaker_name: "Other Person", title: "Unrelated" },
  ];
  for (const item of speakerPool) {
    if (!itemMatchesSpeaker(item, speakerKey)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    queue.push(item);
  }
  if (queue.length > programItems.length) sources.push("speaker");

  if (parentScope === "category") {
    const categoryPeers = [
      { id: "c1", speaker_name: speakerName, category_slug: "success" },
      { id: "c2", speaker_name: "Stranger", category_slug: "success" },
    ];
    for (const item of categoryPeers) {
      if (!itemMatchesSpeaker(item, speakerKey)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      queue.push(item);
    }
    sources.push("category-same-speaker");
  }

  return { queue, sources: sources.join(">") };
}

const programItems = [
  { id: "p1", speaker_name: "Tony Robbins", title: "Program ep 1" },
  { id: "p2", speaker_name: "Tony Robbins", title: "Program ep 2" },
];

const programScope = buildSafeMotivationContinuation(programItems, "Tony Robbins", "program");
assert.ok(programScope.queue.every((item) => itemMatchesSpeaker(item, "tony-robbins")));
assert.ok(!programScope.sources.includes("related"));
assert.ok(!programScope.sources.includes("category"));
assert.ok(programScope.queue.some((item) => item.id === "s1"));
assert.ok(!programScope.queue.some((item) => item.id === "x1"));

const categoryScope = buildSafeMotivationContinuation(programItems, "Tony Robbins", "category");
assert.ok(categoryScope.queue.every((item) => itemMatchesSpeaker(item, "tony-robbins")));
assert.ok(!categoryScope.queue.some((item) => item.id === "c2"), "unrelated speaker blocked");

const adapter = fs.readFileSync(
  path.join(root, "utils/motivationPlaybackAdapter.ts"),
  "utf8"
);
assert.match(adapter, /Never mixes unrelated speakers/);
assert.match(adapter, /parentScope/);
assert.doesNotMatch(adapter, /appendGroup\(relatedResult\.items,\s*"related"\)/);

console.log("PASS motivation same-parent autoplay", {
  programContinuation: programScope.sources,
  categoryContinuation: categoryScope.sources,
  queueIds: categoryScope.queue.map((i) => i.id),
});
