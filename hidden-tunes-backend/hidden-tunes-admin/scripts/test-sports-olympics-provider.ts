/**
 * Olympics Phase 2A provider tests — no network / no DB required.
 * Run: npx tsx scripts/test-sports-olympics-provider.ts
 */

import assert from "node:assert/strict";

import { OLYMPICS_FIXTURE_VIDEOS } from "../lib/sports/providers/olympics/fixtures";
import {
  formatOlympicsDisplayTitle,
  mapOlympicsVideoToCanonical,
  mapOlympicsVideos,
} from "../lib/sports/providers/olympics/mapper";
import { evaluateOlympicsVideoRights } from "../lib/sports/providers/olympics/rights";
import { evaluateOlympicsTerritoryForBrowse } from "../lib/sports/providers/olympics/territories";
import {
  buildOlympicsEmbedUrl,
  isOlympicsAllowedHost,
} from "../lib/sports/providers/olympics/client";
import { createOlympicsAdapter } from "../lib/sports/providers/olympics/adapter";
import { verifyTechnicalSafety } from "../lib/sports/verification/engine";
import { OLYMPICS_ALLOWED_HOSTS } from "../lib/sports/providers/olympics/types";
import { importOlympicsProvider } from "../lib/sports/import/olympicsImport";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`ok - ${name}`);
  });
}

async function run() {
  await test("deterministic canonical ids", () => {
    const a = mapOlympicsVideoToCanonical(OLYMPICS_FIXTURE_VIDEOS[0])!;
    const b = mapOlympicsVideoToCanonical(OLYMPICS_FIXTURE_VIDEOS[0])!;
    assert.equal(a.canonicalKey, b.canonicalKey);
    assert.equal(a.canonicalKey, "olympics:video:olympics_phase2a_fixture_001");
    assert.notEqual(a.canonicalKey, a.title);
  });

  await test("malformed / empty title rejected", () => {
    const mapped = mapOlympicsVideoToCanonical({
      ...OLYMPICS_FIXTURE_VIDEOS[0],
      title: "   ",
    });
    assert.equal(mapped, null);
  });

  await test("private video rejected from accepted set", () => {
    const { accepted, rejected } = mapOlympicsVideos(OLYMPICS_FIXTURE_VIDEOS);
    assert.ok(rejected.some((r) => r.videoId.includes("fixture_003")));
    assert.ok(
      accepted.every((a) => a.providerNativeId !== "olympics_phase2a_fixture_003")
    );
  });

  await test("embeddable fixture → official_embed_only (not public)", () => {
    const rights = evaluateOlympicsVideoRights(OLYMPICS_FIXTURE_VIDEOS[0]);
    assert.equal(rights.classification, "official_embed_only");
    assert.equal(rights.playbackMode, "official_embed");
    assert.equal(rights.playablePublic, false);
  });

  await test("non-embeddable → metadata/external only", () => {
    const rights = evaluateOlympicsVideoRights(OLYMPICS_FIXTURE_VIDEOS[1]);
    assert.equal(rights.playbackMode, "external_only");
    assert.notEqual(rights.classification, "verified_allowed");
  });

  await test("partnership/direct play never invented", () => {
    const rights = evaluateOlympicsVideoRights({
      ...OLYMPICS_FIXTURE_VIDEOS[0],
      videoId: "realLookingId123",
      embeddable: true,
      privacyStatus: "public",
    });
    assert.equal(rights.classification, "official_embed_only");
    assert.notEqual(rights.playbackMode, "none");
    // No native/direct classification exists in olympics rights.
    assert.equal(rights.playbackMode === "official_embed", true);
  });

  await test("territory: provider runtime check allows metadata", () => {
    const t = evaluateOlympicsTerritoryForBrowse({ country: "US" });
    assert.equal(t.metadataVisible, true);
    assert.equal(t.playableEligible, true);
  });

  await test("territory: unknown country conservative messaging", () => {
    const t = evaluateOlympicsTerritoryForBrowse({ country: "ZZ" });
    assert.equal(t.metadataVisible, true);
    assert.match(t.reason, /runtime|unknown|YouTube/i);
  });

  await test("SSRF: private IP rejected", () => {
    const result = verifyTechnicalSafety({
      url: "https://127.0.0.1/embed/x",
      allowedDomains: [...OLYMPICS_ALLOWED_HOSTS, "127.0.0.1"],
    });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.includes("ssrf_private_host_blocked"));
  });

  await test("SSRF: non-allowlisted host rejected", () => {
    const result = verifyTechnicalSafety({
      url: "https://evil.example/embed/x",
      allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
    });
    assert.equal(result.pass, false);
  });

  await test("embed host allowlisted", () => {
    const url = buildOlympicsEmbedUrl("dQw4w9WgXcQ");
    const result = verifyTechnicalSafety({
      url,
      allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
    });
    assert.equal(result.pass, true);
    assert.equal(isOlympicsAllowedHost("www.youtube.com"), true);
  });

  await test("adapter defaults kill-switched", () => {
    const adapter = createOlympicsAdapter();
    assert.equal(adapter.config.enabled, false);
    assert.equal(adapter.config.killSwitch, true);
  });

  await test("display title strips quality suffix without changing id", () => {
    const title = formatOlympicsDisplayTitle("Final (1080p)");
    assert.equal(title, "Final");
    const mapped = mapOlympicsVideoToCanonical({
      ...OLYMPICS_FIXTURE_VIDEOS[0],
      title: "Final (1080p)",
    })!;
    assert.equal(mapped.title, "Final (1080p)"); // identity/title stored raw
    assert.equal(formatOlympicsDisplayTitle(mapped.title), "Final");
  });

  await test("import dry-run fixtures bounded", async () => {
    process.env.SPORTS_OLYMPICS_USE_FIXTURES = "1";
    const report = await importOlympicsProvider({
      dryRun: true,
      limit: 10,
      useFixtures: true,
    });
    assert.equal(report.dryRun, true);
    assert.equal(report.provider, "olympics");
    assert.ok(report.discovered > 0);
    assert.ok(report.rejected >= 1); // private fixture
    assert.ok(report.notes.some((n) => /OFFICIAL_EMBED/i.test(n)));
  });

  await test("sports remains disabled by default", () => {
    assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_enabled, false);
    assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_provider_imports_enabled, false);
  });

  console.log(`\n${passed} olympics provider tests passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
