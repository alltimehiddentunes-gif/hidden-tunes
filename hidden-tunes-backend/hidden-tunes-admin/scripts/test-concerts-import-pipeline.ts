/**
 * Concerts Phase 4 import pipeline tests — fixtures only (no DB / no API key required).
 * Run: npx tsx scripts/test-concerts-import-pipeline.ts
 */

import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { classifyConcertCandidate } from "../lib/concerts/import/classify";
import { buildConcertDedupeKey } from "../lib/concerts/import/dedupe";
import { isConcertSourceImportEligible } from "../lib/concerts/import/sourceEligibility";
import { runConcertsImport } from "../lib/concerts/import/runner";
import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import type { ConcertYouTubeVideoCandidate } from "../lib/concerts/providers/youtubeClient";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok - ${name}`);
    });
}

function video(
  over: Partial<ConcertYouTubeVideoCandidate> = {}
): ConcertYouTubeVideoCandidate {
  return {
    provider: "youtube",
    providerContentId: "dQw4w9WgXcQ",
    title: "Full Concert Live at Festival Hall",
    description: "Official full concert livestream replay",
    channelId: "UC-smeLB9AnOTeypr1YyjJ3A",
    channelTitle: "ARTE Concert",
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 5400,
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    tags: ["concert", "live"],
    liveBroadcastContent: "none",
    embedHtmlPresent: true,
    embeddable: true,
    regionRestriction: {},
    officialWatchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ...over,
  };
}

async function main() {
  await test("classify accepts substantial live concerts", () => {
    const result = classifyConcertCandidate(video());
    assert.equal(result.decision, "accept_candidate");
    assert.equal(result.isReplay, true);
  });

  await test("classify rejects interviews and music videos", () => {
    assert.equal(
      classifyConcertCandidate(video({ title: "Artist Interview backstage" })).decision,
      "reject_non_concert"
    );
    assert.equal(
      classifyConcertCandidate(video({ title: "Official Music Video" })).decision,
      "reject_non_concert"
    );
  });

  await test("classify rejects embed-disabled videos", () => {
    assert.equal(
      classifyConcertCandidate(video({ embeddable: false })).decision,
      "reject_embed_disabled"
    );
  });

  await test("classify accepts short live sessions with strong signals", () => {
    const result = classifyConcertCandidate(
      video({
        title: "Tiny Desk Concert",
        description: "Live session performance",
        durationSeconds: 12 * 60,
      })
    );
    assert.equal(result.decision, "accept_candidate");
  });

  await test("dedupe key prefers provider content id", () => {
    const key = buildConcertDedupeKey({
      title: "A",
      providerContentId: "abcdefghijk",
    });
    assert.equal(key, "provider:abcdefghijk");
  });

  await test("eligible sources are import-enabled under Phase 4 rules", () => {
    const sources = getCuratedConcertSources();
    const arte = sources.find((s) => s.stableKey === "arte-concert");
    const medici = sources.find((s) => s.stableKey === "medici-tv");
    const dch = sources.find((s) => s.stableKey === "digital-concert-hall");
    assert.ok(arte && isConcertSourceImportEligible(arte));
    assert.ok(medici && !isConcertSourceImportEligible(medici));
    assert.ok(dch && !isConcertSourceImportEligible(dch));
    assert.ok(sources.filter(isConcertSourceImportEligible).length >= 20);
  });

  await test("import runner processes fixtures with checkpoints (dry-run)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concerts-import-"));
    const sources = getCuratedConcertSources().filter((s) => s.stableKey === "arte-concert");
    const report = await runConcertsImport({
      sources,
      dryRun: true,
      resume: false,
      skipPlaybackProbe: true,
      adminRoot: tmp,
      maxPagesPerSource: 1,
      fixtures: {
        "arte-concert": [
          video({ providerContentId: "aaaaaaaaaaa", title: "Live Concert Replay" }),
          video({
            providerContentId: "bbbbbbbbbbb",
            title: "Backstage Interview",
            description: "interview with the artist",
          }),
        ],
      },
    });

    assert.equal(report.dry_run, true);
    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].seen, 2);
    assert.equal(report.sources[0].accepted, 1);
    assert.equal(report.sources[0].rejected, 1);
    assert.equal(report.totals.inserted, 0);

    const checkpointPath = path.join(
      tmp,
      "data",
      "concert-import-checkpoints",
      "arte-concert.json"
    );
    assert.equal(fs.existsSync(checkpointPath), true);
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
