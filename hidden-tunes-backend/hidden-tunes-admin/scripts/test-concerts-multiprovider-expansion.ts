/**
 * Multi-provider Concerts expansion tests (fixtures only).
 * Run: npx tsx scripts/test-concerts-multiprovider-expansion.ts
 */

import assert from "node:assert/strict";
import os from "os";
import path from "path";
import fs from "fs";

import { toConcertMediaCandidate } from "../lib/concerts/candidate";
import {
  clampConcertBrowsePageSize,
  decodeConcertBrowseCursor,
  encodeConcertBrowseCursor,
} from "../lib/concerts/catalog/browse";
import { classifyConcertCandidate } from "../lib/concerts/import/classify";
import { isConcertSourceImportEligible } from "../lib/concerts/import/sourceEligibility";
import { decideConcertCleanAction } from "../lib/concerts/playback/catalogueCleaner";
import { decideConcertCatalogueVisibility } from "../lib/concerts/playback/publish";
import { validateConcertAppPlayback } from "../lib/concerts/playback/validatePlayback";
import {
  CONCERTS_PLAYABLE_TARGET,
  buildConcertScaleProgress,
  emptyConcertScaleCounters,
} from "../lib/concerts/expansion/progress";
import { runConcertsExpansion } from "../lib/concerts/expansion/runner";
import {
  countDiscoverySeedsByProvider,
  listWorldwideConcertDiscoverySeeds,
} from "../lib/concerts/expansion/worldwideSources";
import { resolveConcertProviderAdapter } from "../lib/concerts/providers/adapters";
import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function main() {
  await test("adapters resolve youtube/vimeo/dailymotion/twitch/hls/dash", () => {
    assert.equal(
      resolveConcertProviderAdapter("https://www.youtube.com/watch?v=abcdefghijk")?.id,
      "youtube"
    );
    assert.equal(
      resolveConcertProviderAdapter("https://vimeo.com/123456789")?.id,
      "vimeo"
    );
    assert.equal(
      resolveConcertProviderAdapter("https://www.dailymotion.com/video/x7abcde")?.id,
      "dailymotion"
    );
    assert.equal(
      resolveConcertProviderAdapter("https://www.twitch.tv/videos/123456789")?.id,
      "twitch"
    );
    assert.equal(
      resolveConcertProviderAdapter("https://cdn.example.com/live/a.m3u8")?.id,
      "hls"
    );
    assert.equal(
      resolveConcertProviderAdapter("https://cdn.example.com/live/a.mpd")?.id,
      "dash"
    );
  });

  await test("playback resolution is app-compatible for embeds and streams", () => {
    const yt = resolveConcertProviderAdapter("https://youtu.be/abcdefghijk")!;
    const resolved = yt.resolvePlayback({ watchUrl: "https://youtu.be/abcdefghijk" });
    assert.equal(resolved.appCompatible, true);
    assert.ok(resolved.embedUrl?.includes("/embed/abcdefghijk"));
  });

  await test("eligibility is not YouTube-only", () => {
    const sources = getCuratedConcertSources();
    const youtube = sources.filter((s) => s.provider === "youtube" && s.importEnabled);
    assert.ok(youtube.length >= 1);
    // Region-limited official sources may import; external_link_only may not.
    const dch = sources.find((s) => s.stableKey === "digital-concert-hall")!;
    assert.equal(isConcertSourceImportEligible(dch), false);
    const bbc = sources.find((s) => s.stableKey === "bbc-proms")!;
    assert.equal(isConcertSourceImportEligible(bbc), true);
  });

  await test("no channel ID required for eligibility", () => {
    const sources = getCuratedConcertSources().filter(
      (s) => s.provider === "youtube" && !s.providerChannelId
    );
    assert.ok(sources.some((s) => s.importEnabled));
  });

  await test("auto-publish only when playable", () => {
    const ok = decideConcertCatalogueVisibility({
      playable: true,
      isReplay: true,
    });
    assert.equal(ok.isPublic, true);
    assert.equal(ok.playbackStatus, "playable");
    const bad = decideConcertCatalogueVisibility({ playable: false });
    assert.equal(bad.isPublic, false);
  });

  await test("cleaner hides dead cards", () => {
    assert.equal(
      decideConcertCleanAction({ playable: false }).action,
      "hide"
    );
    assert.equal(
      decideConcertCleanAction({ playable: true, privateOrRemoved: true }).action,
      "mark_unavailable"
    );
  });

  await test("fixture validation skipNetwork is not claimed as production proof", async () => {
    const candidate = toConcertMediaCandidate({
      provider: "youtube",
      providerContentId: "abcdefghijk",
      title: "Full Concert Live",
      officialWatchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      embedUrl: "https://www.youtube.com/embed/abcdefghijk",
      playbackMethod: "youtube_embed",
    });
    const result = await validateConcertAppPlayback(candidate, { skipNetwork: true });
    assert.equal(result.playable, true);
    assert.ok(String(result.evidence.note || "").includes("not publication proof"));
  });

  await test("classify accepts multi-provider concert titles", () => {
    const result = classifyConcertCandidate(
      toConcertMediaCandidate({
        provider: "vimeo",
        providerContentId: "111",
        title: "Jazz Festival Live Set",
        description: "Official live set",
        officialWatchUrl: "https://vimeo.com/111",
        playbackMethod: "vimeo_embed",
        durationSeconds: 3600,
      })
    );
    assert.equal(result.decision, "accept_candidate");
  });

  await test("worldwide seeds include non-YouTube providers", () => {
    const byProvider = countDiscoverySeedsByProvider();
    assert.ok((byProvider.youtube || 0) >= 1);
    assert.ok((byProvider.vimeo || 0) >= 1);
    assert.ok((byProvider.twitch || 0) >= 1);
    assert.ok(listWorldwideConcertDiscoverySeeds().length >= 30);
  });

  await test("expansion dry-run with fixtures reports measured progress", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concerts-exp-"));
    const report = await runConcertsExpansion({
      dryRun: true,
      skipNetworkValidation: true,
      adminRoot: tmp,
      fixtures: [
        toConcertMediaCandidate({
          provider: "youtube",
          providerContentId: "liveconcert1",
          title: "Official Live Concert Performance",
          description: "full concert live festival",
          officialWatchUrl: "https://www.youtube.com/watch?v=liveconcert",
          embedUrl: "https://www.youtube.com/embed/liveconcert",
          playbackMethod: "youtube_embed",
          durationSeconds: 5400,
          countryCode: "FR",
          languageCode: "fr",
          tags: ["concert"],
          embeddable: true,
        }),
        toConcertMediaCandidate({
          provider: "youtube",
          providerContentId: "liveconcert1",
          title: "Official Live Concert Performance",
          description: "full concert live festival",
          officialWatchUrl: "https://www.youtube.com/watch?v=liveconcert",
          playbackMethod: "youtube_embed",
          durationSeconds: 5400,
          tags: ["concert"],
        }),
        toConcertMediaCandidate({
          provider: "youtube",
          providerContentId: "interview99",
          title: "Backstage Interview",
          description: "interview",
          officialWatchUrl: "https://www.youtube.com/watch?v=interview99",
          playbackMethod: "youtube_embed",
        }),
      ],
    });
    assert.equal(report.dryRun, true);
    assert.equal(report.progress.measured, true);
    assert.equal(report.progress.target, CONCERTS_PLAYABLE_TARGET);
    assert.ok(report.progress.playable >= 1);
    assert.ok(report.progress.duplicates >= 1);
    assert.ok(report.progress.remainingToTarget > 0);
    assert.ok(
      fs.existsSync(path.join(tmp, "data", "concert-expansion-checkpoints", "progress.json"))
    );
  });

  await test("progress helper never invents playable counts", () => {
    const report = buildConcertScaleProgress(emptyConcertScaleCounters());
    assert.equal(report.playable, 0);
    assert.equal(report.remainingToTarget, 25000);
    assert.equal(report.measured, true);
  });

  await test("browse pagination helpers", () => {
    assert.equal(clampConcertBrowsePageSize(999), 50);
    const cursor = encodeConcertBrowseCursor({
      publishedAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
    assert.deepEqual(decodeConcertBrowseCursor(cursor), {
      publishedAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
