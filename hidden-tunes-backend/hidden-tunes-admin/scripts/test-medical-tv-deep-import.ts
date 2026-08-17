import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const m = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../data/medical-tv-deep/candidate-manifest.json"),
    "utf8",
  ),
);
assert.equal(m.category, "Medical & Health");
assert.ok(m.candidates.length >= 10);
assert.equal(
  new Set(m.candidates.map((c: any) => `${c.country}:${c.name.toLowerCase()}`))
    .size,
  m.candidates.length,
);
for (const c of m.candidates) {
  for (const k of [
    "name",
    "country",
    "language",
    "subcategory",
    "website",
    "description",
    "provenance",
    "rights",
    "classification",
  ])
    assert.ok(c[k]);
  if (c.eligible) {
    assert.match(c.streamUrl, /^https:\/\//);
    assert.equal(c.classification, "PENDING_VERIFICATION");
  }
  assert.ok(!String(c.streamUrl || "").includes("youtube"));
}
console.log(
  `medical TV manifest tests passed (${m.candidates.length} candidates)`,
);
