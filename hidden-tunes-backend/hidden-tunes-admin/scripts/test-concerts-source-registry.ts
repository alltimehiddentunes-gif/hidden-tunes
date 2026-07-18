/**
 * Concerts Phase 3 source-registry tests — pure domain logic (no DB required).
 * Run: npx tsx scripts/test-concerts-source-registry.ts
 */

import assert from "node:assert/strict";

import { evaluateConcertSourceAuthorization } from "../lib/concerts/sourceAuthorization";
import { decideConcertEmbedPolicy } from "../lib/concerts/providers/embedPolicy";
import {
  isValidYouTubeChannelId,
  buildYouTubeOfficialEmbedUrl,
  rejectExtractedYouTubeMediaUrl,
} from "../lib/concerts/providers/youtubeOfficial";
import {
  isValidConcertStableKey,
  normalizeConcertStableKey,
  normalizeConcertSourceSeed,
  normalizeReliabilityScore,
} from "../lib/concerts/sourceNormalization";
import {
  validateConcertSourceRecord,
  validateConcertSourceRegistry,
} from "../lib/concerts/sourceValidation";
import { mapConcertSourceSeedToRow } from "../lib/concerts/sourceRepository";
import {
  auditCuratedConcertSourceRegistry,
  getCuratedConcertSources,
} from "../lib/concerts/sourceRegistry";
import type { ConcertSourceSeed } from "../lib/concerts/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function baseSeed(over: Partial<ConcertSourceSeed> = {}): ConcertSourceSeed {
  return {
    stableKey: "test-orchestra",
    name: "Test Orchestra",
    providerType: "orchestra",
    provider: "youtube",
    officialUrl: "https://www.example-orchestra.org/",
    mediaChannelUrl: "https://www.youtube.com/channel/UC1234567890123456789012",
    providerChannelId: "UC1234567890123456789012",
    countryCode: "DE",
    region: "europe",
    languageCodes: ["en"],
    sourceOwner: "Test Orchestra",
    ownershipEvidenceUrl: "https://www.example-orchestra.org/about",
    authorizationBasis: "official_owner",
    termsUrl: "https://www.youtube.com/static?template=terms",
    embedPolicy: "provider_player_required",
    contentScope: "Official test concerts",
    expectedConcertFormats: ["orchestra_performance"],
    supportedCountries: ["DE"],
    geoRestrictions: {},
    matureContentPossible: false,
    enabled: true,
    importEnabled: false,
    validationMethod: "test",
    reliabilityScore: 80,
    lastReviewedAt: "2026-07-18",
    reviewNotes: "Test source",
    ...over,
  };
}

test("authorization: unclear cannot enable", () => {
  const result = evaluateConcertSourceAuthorization({
    authorizationBasis: "unclear",
    embedPolicy: "provider_player_required",
    enabled: true,
    importEnabled: false,
  });
  assert.equal(result.requestedEnabledOk, false);
});

test("authorization: denied cannot enable", () => {
  const result = evaluateConcertSourceAuthorization({
    authorizationBasis: "denied",
    embedPolicy: "official_embed_allowed",
    enabled: true,
    importEnabled: false,
  });
  assert.equal(result.canEnable, false);
});

test("embed policy: unknown/prohibited not importable", () => {
  assert.equal(decideConcertEmbedPolicy("unknown").importEligible, false);
  assert.equal(decideConcertEmbedPolicy("prohibited").importEligible, false);
  assert.equal(decideConcertEmbedPolicy("external_link_only").inAppPlayable, false);
  assert.equal(decideConcertEmbedPolicy("provider_player_required").inAppPlayable, true);
});

test("disabled defaults: importEnabled false even when enabled", () => {
  const seed = baseSeed({ enabled: true, importEnabled: false });
  const result = validateConcertSourceRecord(seed);
  assert.equal(result.ok, true);
  assert.equal(seed.importEnabled, false);
});

test("registry deduplication detects duplicate stable keys", () => {
  const result = validateConcertSourceRegistry([
    baseSeed({ stableKey: "dup-a" }),
    baseSeed({ stableKey: "dup-a", name: "Other" }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes("Duplicate stable key")));
});

test("registry deduplication detects duplicate provider channel ids", () => {
  const result = validateConcertSourceRegistry([
    baseSeed({ stableKey: "one", providerChannelId: "UC1234567890123456789012" }),
    baseSeed({
      stableKey: "two",
      name: "Two",
      officialUrl: "https://www.example-orchestra-2.org/",
      ownershipEvidenceUrl: "https://www.example-orchestra-2.org/about",
      providerChannelId: "UC1234567890123456789012",
    }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes("Duplicate provider channel")));
});

test("stable-key normalization and validation", () => {
  assert.equal(normalizeConcertStableKey("ARTE Concert!"), "arte-concert");
  assert.equal(isValidConcertStableKey("arte-concert"), true);
  assert.equal(isValidConcertStableKey("ARTE"), false);
});

test("YouTube channel ID validation and embed URL builder", () => {
  assert.equal(isValidYouTubeChannelId("UC-smeLB9AnOTeypr1YyjJ3A"), true);
  assert.equal(isValidYouTubeChannelId("not-a-channel"), false);
  assert.equal(
    buildYouTubeOfficialEmbedUrl("dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ"
  );
  assert.equal(rejectExtractedYouTubeMediaUrl("https://googlevideo.com/videoplayback"), true);
});

test("reliability score bounds", () => {
  assert.equal(normalizeReliabilityScore(80), 80);
  assert.equal(normalizeReliabilityScore(101), null);
  assert.equal(normalizeReliabilityScore(-1), null);
});

test("repository mapping sets embed_permitted from policy", () => {
  const row = mapConcertSourceSeedToRow(
    baseSeed({ embedPolicy: "provider_player_required", importEnabled: false })
  );
  assert.equal(row.stable_key, "test-orchestra");
  assert.equal(row.embed_permitted, true);
  assert.equal(row.import_enabled, false);
  assert.equal(row.language_code, "en");
});

test("external_link_only cannot be import-enabled", () => {
  const result = validateConcertSourceRecord(
    baseSeed({ embedPolicy: "external_link_only", enabled: true, importEnabled: true })
  );
  assert.equal(result.ok, false);
});

test("curated registry dry-run audit passes", () => {
  const audit = auditCuratedConcertSourceRegistry();
  assert.equal(audit.ok, true);
  assert.ok(audit.total >= 20 && audit.total <= 50);
  assert.equal(audit.importEnabledCount, 0);
  assert.ok(audit.enabledCount > 0);
  assert.ok(getCuratedConcertSources().every((s) => s.importEnabled === false));
});

test("normalize preserves https official urls", () => {
  const normalized = normalizeConcertSourceSeed(baseSeed());
  assert.ok(normalized.officialUrl.startsWith("https://"));
});

console.log(`\n${passed} tests passed`);
