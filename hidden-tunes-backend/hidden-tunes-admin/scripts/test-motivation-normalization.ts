import assert from "node:assert/strict";

import {
  hashMotivationTitle,
  isWeakMotivationTitle,
  normalizeMotivationLanguage,
  normalizeMotivationMetadata,
} from "../lib/motivationMetadataNormalize";

function testHtmlEntitiesDecoded() {
  const normalized = normalizeMotivationMetadata({
    title: "Faith &amp; Purpose",
    description: "It&#39;s time for &quot;change&quot;.",
  });
  assert.equal(normalized.title, "Faith & Purpose");
  assert.match(normalized.description || "", /It's time for "change"\./);
}

function testMojibakeRepaired() {
  const normalized = normalizeMotivationMetadata({
    title: "Speakerâ€™s Message",
  });
  assert.match(normalized.title || "", /Speaker's Message/);
}

function testDiacriticsPreserved() {
  const normalized = normalizeMotivationMetadata({
    title: "Motivación y éxito",
  });
  assert.match(normalized.title || "", /Motivación/);
}

function testNonLatinPreserved() {
  const normalized = normalizeMotivationMetadata({
    title: "励志演讲",
  });
  assert.equal(normalized.title, "励志演讲");
}

function testWeakTitleDetected() {
  assert.equal(isWeakMotivationTitle("MIT15.969F04"), true);
  assert.equal(isWeakMotivationTitle("unknown"), true);
  assert.equal(isWeakMotivationTitle("Daily Motivation Talk"), false);
}

function testDuplicateTagsRemoved() {
  const normalized = normalizeMotivationMetadata({
    tags: ["Motivation", "motivation", "Focus", "focus"],
  });
  assert.equal(normalized.tags.length, 2);
}

function testLanguageNormalized() {
  assert.equal(normalizeMotivationLanguage("en-US"), "en");
  assert.equal(normalizeMotivationLanguage("Spanish"), "es");
}

function testTitleHashStable() {
  const a = hashMotivationTitle("Leadership Keynote");
  const b = hashMotivationTitle("  leadership   keynote ");
  assert.equal(a, b);
}

function main() {
  testHtmlEntitiesDecoded();
  testMojibakeRepaired();
  testDiacriticsPreserved();
  testNonLatinPreserved();
  testWeakTitleDetected();
  testDuplicateTagsRemoved();
  testLanguageNormalized();
  testTitleHashStable();
  console.log(JSON.stringify({ ok: true, tests: 8 }, null, 2));
}

main();
