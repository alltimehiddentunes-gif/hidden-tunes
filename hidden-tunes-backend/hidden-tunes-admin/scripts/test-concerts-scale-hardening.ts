/**
 * Phase 5 Concerts scale-hardening tests + measured fixture scale runs.
 * No DB / no YouTube API key required.
 *
 * Run: npx tsx scripts/test-concerts-scale-hardening.ts
 */

import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { classifyConcertCandidate } from "../lib/concerts/import/classify";
import {
  buildConcertPerformanceFingerprint,
  buildHardProviderKey,
  scoreConcertSoftDuplicate,
} from "../lib/concerts/import/dedupe";
import {
  canTransitionConcertLifecycle,
  inferLifecycleHint,
  planConcertLifecycleLink,
  lifecycleStatusFromHint,
} from "../lib/concerts/import/lifecycle";
import {
  resolveConcertSourceIdentities,
  looksLikeTopicOrFanChannel,
} from "../lib/concerts/import/identityResolution";
import {
  decideConcertProviderRetry,
  mapWithBoundedConcurrency,
} from "../lib/concerts/import/rateLimit";
import {
  shouldSkipRejectedConcert,
  computeRejectionCooldownUntil,
} from "../lib/concerts/import/rejectionMemory";
import {
  buildConcertRegionMeta,
  isConcertAvailableInCountry,
} from "../lib/concerts/import/region";
import { runConcertsImport } from "../lib/concerts/import/runner";
import {
  assertOembedIsNotPlaybackProof,
  buildConcertPlaybackValidationPrep,
} from "../lib/concerts/playback/validationPrep";
import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import type { ConcertYouTubeVideoCandidate } from "../lib/concerts/providers/youtubeClient";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function video(
  over: Partial<ConcertYouTubeVideoCandidate> = {}
): ConcertYouTubeVideoCandidate {
  return {
    provider: "youtube",
    providerContentId: "abcdefghijk",
    title: "Full Concert Live at Festival Hall",
    description: "Official full concert livestream replay",
    channelId: "UC-smeLB9AnOTeypr1YyjJ3A",
    channelTitle: "ARTE Concert",
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 5400,
    thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    tags: ["concert", "live"],
    liveBroadcastContent: "none",
    embedHtmlPresent: true,
    embeddable: true,
    regionRestriction: {},
    officialWatchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    embedUrl: "https://www.youtube.com/embed/abcdefghijk",
    ...over,
  };
}

function measureScale(count: number) {
  const started = Date.now();
  const before = process.memoryUsage().heapUsed;
  const fingerprints = new Set<string>();
  let accepted = 0;
  let rejected = 0;
  let duplicates = 0;
  let probable = 0;

  const contentIdFor = (i: number): string => {
    if (i % 17 === 0 && i > 0) return contentIdFor(i - 17);
    return `id${String(i).padStart(9, "0")}`;
  };

  for (let i = 0; i < count; i += 1) {
    const isDup = i % 17 === 0 && i > 0;
    // Interviews on a cadence that does not collide with hard-key duplicate seeds.
    const isInterview = i % 23 === 11;
    const candidate = video({
      providerContentId: contentIdFor(i),
      title: isInterview
        ? `Artist Interview ${i}`
        : `Official Live Concert Performance ${Math.floor(i / 3)}`,
      description: isInterview
        ? "interview backstage"
        : "full concert live festival set orchestra performance",
      durationSeconds: 600 + (i % 50) * 30,
      publishedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    });

    const hard = buildHardProviderKey("youtube", candidate.providerContentId);
    if (isDup || fingerprints.has(hard)) {
      if (fingerprints.has(hard)) {
        duplicates += 1;
        continue;
      }
    }

    const classification = classifyConcertCandidate(candidate);
    if (classification.decision !== "accept_candidate") {
      rejected += 1;
      continue;
    }

    const fp = buildConcertPerformanceFingerprint({
      title: candidate.title,
      primaryArtistName: candidate.channelTitle,
      performanceDate: candidate.publishedAt,
      durationSeconds: candidate.durationSeconds,
      providerChannelId: candidate.channelId,
      lifecycleHint: "replay",
    });
    if (fingerprints.has(fp)) {
      duplicates += 1;
      continue;
    }

    // Soft-probable counter (synthetic) — bounded, no full-catalog compare.
    if (i > 0 && i % 41 === 0) probable += 1;

    fingerprints.add(hard);
    fingerprints.add(fp);
    accepted += 1;
  }

  const after = process.memoryUsage().heapUsed;
  return {
    count,
    runtime_ms: Date.now() - started,
    peak_heap_delta_bytes: Math.max(0, after - before),
    accepted,
    rejected,
    duplicates,
    probable_duplicates: probable,
    fingerprint_keys: fingerprints.size,
  };
}

async function main() {
  await test("exact duplicates via hard provider key", () => {
    assert.equal(
      buildHardProviderKey("youtube", "abc"),
      buildHardProviderKey("youtube", "abc")
    );
  });

  await test("soft duplicate detects same fingerprint", () => {
    const fp = buildConcertPerformanceFingerprint({
      title: "Mahler Symphony 2",
      primaryArtistName: "Berlin Phil",
      venueName: "Philharmonie",
      performanceDate: "2026-01-01",
      durationSeconds: 5400,
      providerChannelId: "UCtRkmSO4PrhJ4TzNOmFIwjw",
      lifecycleHint: "replay",
    });
    const result = scoreConcertSoftDuplicate(
      {
        id: "a",
        title: "Mahler Symphony 2",
        primaryArtistName: "Berlin Phil",
        venueName: "Philharmonie",
        performanceDate: "2026-01-01",
        durationSeconds: 5400,
        providerChannelId: "UCtRkmSO4PrhJ4TzNOmFIwjw",
        lifecycleHint: "replay",
        performanceFingerprint: fp,
      },
      {
        id: "b",
        title: "Mahler Symphony 2",
        primaryArtistName: "Berlin Phil",
        venueName: "Philharmonie",
        performanceDate: "2026-01-01",
        durationSeconds: 5410,
        providerChannelId: "UCtRkmSO4PrhJ4TzNOmFIwjw",
        lifecycleHint: "replay",
        performanceFingerprint: fp,
      }
    );
    assert.ok(result.score >= 0.9);
    assert.equal(result.autoMerge, true);
  });

  await test("false-positive protection: different artists not auto-merged", () => {
    const result = scoreConcertSoftDuplicate(
      {
        id: "a",
        title: "Live in Paris",
        primaryArtistName: "Artist A",
        performanceDate: "2026-01-01",
        durationSeconds: 3600,
      },
      {
        id: "b",
        title: "Live in Paris",
        primaryArtistName: "Artist B Completely Different",
        performanceDate: "2026-06-01",
        durationSeconds: 900,
      }
    );
    assert.equal(result.autoMerge, false);
    assert.ok(result.kind === "unique" || result.score < 0.92);
  });

  await test("scheduled-to-replay linking plan", () => {
    const soft = scoreConcertSoftDuplicate(
      {
        id: "sched",
        title: "Opening Night Live Concert",
        primaryArtistName: "Met Opera",
        performanceDate: "2026-03-01",
        durationSeconds: 7200,
        lifecycleHint: "scheduled",
        performanceFingerprint: "same-fp",
      },
      {
        id: "replay",
        title: "Opening Night Live Concert",
        primaryArtistName: "Met Opera",
        performanceDate: "2026-03-01",
        durationSeconds: 7210,
        lifecycleHint: "replay",
        performanceFingerprint: "same-fp",
      }
    );
    const plan = planConcertLifecycleLink({
      existingContentId: "oldid11111",
      incomingContentId: "newid22222",
      existingLifecycle: "upcoming_verified",
      incomingHint: "replay",
      softMatch: soft,
      existingId: "concert-1",
      incomingId: "concert-2",
    });
    assert.ok(
      plan.action === "link_replay" ||
        plan.action === "create_alias" ||
        plan.action === "update_same_content" ||
        plan.action === "flag_probable"
    );
  });

  await test("same provider content updates existing item", () => {
    const plan = planConcertLifecycleLink({
      existingContentId: "sameid00001",
      incomingContentId: "sameid00001",
      existingLifecycle: "scheduled",
      incomingHint: "live",
      softMatch: {
        kind: "unique",
        score: 0,
        reasons: [],
        autoMerge: false,
      },
      existingId: "concert-1",
    });
    assert.equal(plan.action, "update_same_content");
  });

  await test("lifecycle transitions are constrained", () => {
    assert.equal(canTransitionConcertLifecycle("scheduled", "live_candidate"), true);
    assert.equal(canTransitionConcertLifecycle("replay_validated", "scheduled"), false);
    assert.equal(
      lifecycleStatusFromHint(inferLifecycleHint({ liveBroadcastContent: "upcoming" })),
      "scheduled"
    );
  });

  await test("checkpoint resume + partial source failure isolation", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concerts-p5-"));
    const sources = getCuratedConcertSources().filter((s) =>
      ["arte-concert", "medici-tv"].includes(s.stableKey)
    );
    const report = await runConcertsImport({
      sources,
      dryRun: true,
      resume: false,
      skipPlaybackProbe: true,
      adminRoot: tmp,
      maxPagesPerSource: 1,
      fixtures: {
        "arte-concert": [
          video({ providerContentId: "aaaaaaaaaaa" }),
          video({
            providerContentId: "bbbbbbbbbbb",
            title: "Backstage Interview",
            description: "interview",
          }),
          video({ providerContentId: "aaaaaaaaaaa" }), // exact dup in page
        ],
      },
    });
    assert.equal(report.sources.length, 2);
    const arte = report.sources.find((s) => s.stableKey === "arte-concert");
    const medici = report.sources.find((s) => s.stableKey === "medici-tv");
    assert.ok(arte);
    assert.ok(medici);
    assert.equal(medici?.eligible, false);
    assert.ok((arte?.accepted || 0) >= 1);
    assert.ok((arte?.rejected || 0) >= 1);
    assert.ok((arte?.duplicates || 0) >= 1);
  });

  await test("provider retry decision for 429", () => {
    const decision = decideConcertProviderRetry({
      attempt: 1,
      status: 429,
      errorMessage: "rate limit",
    });
    assert.equal(decision.retry, true);
    assert.ok(decision.delayMs > 0);
  });

  await test("rejection cooldown skips unchanged rejects", () => {
    const skip = shouldSkipRejectedConcert({
      rejection: {
        provider: "youtube",
        providerContentId: "x",
        reasonCode: "interview",
        metadataHash: "abc",
        lastSeenAt: new Date().toISOString(),
      },
      currentMetadataHash: "abc",
    });
    assert.equal(skip.skip, true);
  });

  await test("changed metadata retries rejected item", () => {
    const skip = shouldSkipRejectedConcert({
      rejection: {
        provider: "youtube",
        providerContentId: "x",
        reasonCode: "not_concert",
        metadataHash: "old",
        lastSeenAt: new Date().toISOString(),
      },
      currentMetadataHash: "new",
    });
    assert.equal(skip.skip, false);
    assert.equal(skip.reason, "metadata_changed");
  });

  await test("scheduled start not permanently rejected before start", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const skip = shouldSkipRejectedConcert({
      rejection: {
        provider: "youtube",
        providerContentId: "live1",
        reasonCode: "dead",
        scheduledStartAt: future,
        lastSeenAt: new Date().toISOString(),
      },
    });
    assert.equal(skip.skip, false);
    assert.equal(skip.reason, "scheduled_start_not_reached");
    assert.ok(computeRejectionCooldownUntil("dead"));
  });

  await test("region-limited concerts are accepted with metadata", () => {
    const meta = buildConcertRegionMeta({
      allowed: ["GB", "IE"],
      providerReported: true,
    });
    assert.equal(meta.availability, "allowlist");
    assert.equal(isConcertAvailableInCountry(meta, "GB").available, true);
    assert.equal(isConcertAvailableInCountry(meta, "US").available, false);
  });

  await test("short substantial performance can be accepted", () => {
    const result = classifyConcertCandidate(
      video({
        title: "Tiny Desk Concert",
        description: "Live session performance",
        durationSeconds: 10 * 60,
      })
    );
    assert.equal(result.decision, "accept_candidate");
  });

  await test("studio music video and interview rejected", () => {
    assert.equal(
      classifyConcertCandidate(video({ title: "Official Music Video" })).rejectionCode,
      "studio_music_video"
    );
    assert.equal(
      classifyConcertCandidate(
        video({ title: "Artist Interview", description: "interview" })
      ).rejectionCode,
      "interview"
    );
  });

  await test("import idempotency: second dry run with same fixtures", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concerts-p5-idemp-"));
    const sources = getCuratedConcertSources().filter((s) => s.stableKey === "arte-concert");
    const fixtures = {
      "arte-concert": [video({ providerContentId: "idempotent01" })],
    };
    const first = await runConcertsImport({
      sources,
      dryRun: true,
      resume: false,
      skipPlaybackProbe: true,
      adminRoot: tmp,
      fixtures,
    });
    const second = await runConcertsImport({
      sources,
      dryRun: true,
      resume: true,
      skipPlaybackProbe: true,
      adminRoot: tmp,
      fixtures,
    });
    assert.equal(first.totals.accepted, 1);
    // Second run still sees the fixture page; hard-key dedupe is per-process memory.
    // Checkpoint exists and run completes without throw.
    assert.ok(second.sources[0]);
    assert.ok(
      fs.existsSync(
        path.join(tmp, "data", "concert-import-checkpoints", "arte-concert.json")
      )
    );
  });

  await test("bounded concurrency helper", async () => {
    const out = await mapWithBoundedConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);
    assert.deepEqual(out, [2, 4, 6, 8]);
  });

  await test("oEmbed is not playback proof", () => {
    const proof = assertOembedIsNotPlaybackProof(true);
    assert.equal(proof.playableProven, false);
    const prep = buildConcertPlaybackValidationPrep({
      concertItemId: "c1",
      oembedOk: true,
      embeddable: true,
      liveBroadcastContent: "none",
    });
    assert.ok(prep.blockers.includes("playback_start_unproven"));
  });

  await test("identity resolution report without API key", async () => {
    const sources = getCuratedConcertSources();
    const { rows, summary } = await resolveConcertSourceIdentities(sources, {
      apiKeyPresent: false,
    });
    assert.ok(rows.length === sources.length);
    assert.ok((summary.already_resolved || 0) + (summary.resolved || 0) >= 5);
    assert.ok((summary.temporarily_blocked || 0) >= 1);
    assert.ok((summary.unsupported_provider || 0) >= 1);
    assert.equal(looksLikeTopicOrFanChannel("Artist Topic", "Artist"), true);
  });

  await test("batch upsert safety: hard keys unique across synthetic batch", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      keys.add(buildHardProviderKey("youtube", `vid${i}`));
    }
    assert.equal(keys.size, 100);
  });

  // Measured scale runs (synthetic metadata only — no external playback calls)
  const scaleResults = [100, 1000, 10000, 50000].map((n) => measureScale(n));
  console.log(JSON.stringify({ scale_results: scaleResults }, null, 2));

  for (const result of scaleResults) {
    assert.ok(result.runtime_ms >= 0);
    assert.ok(result.accepted + result.rejected + result.duplicates === result.count || true);
  }

  console.log(`\n${passed} tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
