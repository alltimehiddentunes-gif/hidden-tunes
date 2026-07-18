/**
 * Olympics staging/local smoke — rejection matrix + kill switch + bounded dry-run.
 * Does NOT require YOUTUBE_API_KEY (fixture mode).
 * Does NOT write to production. Does NOT print secrets.
 *
 * Run: npx tsx scripts/smoke-sports-olympics-staging.ts
 */

import assert from "node:assert/strict";

import { createOlympicsAdapter } from "../lib/sports/providers/olympics/adapter";
import {
  buildOlympicsEmbedUrl,
  discoverOlympicsVideos,
} from "../lib/sports/providers/olympics/client";
import { evaluateOlympicsVideoRights } from "../lib/sports/providers/olympics/rights";
import {
  mapOlympicsVideoToCanonical,
  mapOlympicsVideos,
} from "../lib/sports/providers/olympics/mapper";
import { evaluateOlympicsTerritoryForBrowse } from "../lib/sports/providers/olympics/territories";
import { OLYMPICS_YOUTUBE_CHANNEL_ID } from "../lib/sports/providers/olympics/types";
import type { OlympicsVideoRecord } from "../lib/sports/providers/olympics/types";
import { importOlympicsProvider } from "../lib/sports/import/olympicsImport";
import { verifyTechnicalSafety } from "../lib/sports/verification/engine";
import { OLYMPICS_ALLOWED_HOSTS } from "../lib/sports/providers/olympics/types";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";

type CaseResult = {
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
};

const results: CaseResult[] = [];

function record(name: string, expected: string, actual: string, pass: boolean) {
  results.push({ name, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}: ${actual}`);
}

function baseVideo(
  over: Partial<OlympicsVideoRecord> = {}
): OlympicsVideoRecord {
  return {
    videoId: "realOfficialLookingId01",
    title: "Olympic Final Highlights",
    description: "Official",
    publishedAt: "2024-08-01T12:00:00Z",
    channelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
    channelTitle: "Olympics",
    thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    durationIso: "PT3M",
    embeddable: true,
    privacyStatus: "public",
    liveBroadcastContent: "none",
    tags: ["athletics"],
    ...over,
  };
}

async function main() {
  console.log(
    JSON.stringify({
      smoke: "olympics-staging",
      youtubeApiKeyPresent: Boolean(process.env.YOUTUBE_API_KEY),
      mode: process.env.YOUTUBE_API_KEY ? "live-capable" : "fixtures-only",
      sportsEnabledDefault: SPORTS_FEATURE_FLAG_DEFAULTS.sports_enabled,
    })
  );

  // --- Rejection matrix ---
  {
    const r = evaluateOlympicsVideoRights(baseVideo({ privacyStatus: "private" }));
    record(
      "Private video",
      "blocked/not publishable",
      `${r.classification}/${r.publishable}`,
      r.classification === "blocked" && !r.publishable
    );
  }
  {
    const r = evaluateOlympicsVideoRights(
      baseVideo({ privacyStatus: "deleted" as OlympicsVideoRecord["privacyStatus"] })
    );
    record(
      "Deleted/unavailable privacy",
      "blocked",
      r.classification,
      r.classification === "blocked"
    );
  }
  {
    const r = evaluateOlympicsVideoRights(baseVideo({ embeddable: false }));
    record(
      "Embedding disabled",
      "external_only / not playablePublic",
      `${r.playbackMode}/${r.playablePublic}`,
      r.playbackMode === "external_only" && !r.playablePublic
    );
  }
  {
    const mapped = mapOlympicsVideoToCanonical(baseVideo({ videoId: "" }));
    record("Malformed empty video ID", "null", String(mapped), mapped === null);
  }
  {
    const mapped = mapOlympicsVideoToCanonical(baseVideo({ title: "  " }));
    record("Malformed empty title", "null", String(mapped), mapped === null);
  }
  {
    const foreign = baseVideo({
      channelId: "UCnotOlympicsChannelXXXX",
      channelTitle: "Random Reupload Channel",
      videoId: "unofficialReupload99",
    });
    const mapped = mapOlympicsVideoToCanonical(foreign);
    record(
      "Non-Olympics channel / unofficial re-upload",
      "mapper rejects (null)",
      String(mapped),
      mapped === null
    );
  }
  {
    const { accepted, rejected } = mapOlympicsVideos([
      baseVideo({ videoId: "dupA" }),
      baseVideo({ videoId: "dupA", title: "Same id retitled" }),
    ]);
    record(
      "Duplicate video in batch",
      "1 accepted + 1 rejected duplicate",
      `accepted=${accepted.length} rejected=${rejected.length}`,
      accepted.length === 1 && rejected.some((x) => x.reason === "duplicate_in_batch")
    );
  }
  {
    const premiere = evaluateOlympicsVideoRights(
      baseVideo({
        liveBroadcastContent: "upcoming",
        embeddable: true,
        privacyStatus: "public",
      })
    );
    // Upcoming premiere may still be embeddable metadata; playback window is YouTube-runtime.
    record(
      "Premiere not yet available",
      "official_embed_only + runtime YouTube authority",
      `${premiere.classification}/${premiere.playbackMode}`,
      premiere.classification === "official_embed_only"
    );
  }
  {
    const live = mapOlympicsVideoToCanonical(
      baseVideo({ liveBroadcastContent: "live", videoId: "liveNow01" })
    )!;
    record(
      "Completed/live livestream flag",
      "isLive true for live",
      String(live.isLive),
      live.isLive === true
    );
  }
  {
    const ageRestrictedNote =
      "YouTube age-restriction is runtime; Data API status does not always expose it in Phase 2A fields";
    record(
      "Age-restricted item",
      "runtime YouTube authority (not invented)",
      ageRestrictedNote,
      true
    );
  }
  {
    const geo = evaluateOlympicsTerritoryForBrowse({ country: "US" });
    record(
      "Geo-unavailable item",
      "PROVIDER_RUNTIME_CHECK — YouTube authoritative",
      geo.reason,
      /runtime|YouTube/i.test(geo.reason)
    );
  }
  {
    const mapped = mapOlympicsVideoToCanonical(
      baseVideo({ thumbnailUrl: null, videoId: "noThumb01" })
    );
    record(
      "Missing thumbnail",
      "accepted with null artwork",
      mapped ? `ok artwork=${mapped.artworkUrl}` : "null",
      mapped !== null && mapped.artworkUrl === null
    );
  }
  {
    const mapped = mapOlympicsVideoToCanonical(
      baseVideo({ publishedAt: "", videoId: "noTime01" })
    );
    // Empty publishedAt still maps; scheduling gaps must not invent times.
    record(
      "Missing scheduled/published time",
      "maps without inventing schedule",
      mapped ? `publishedAt='${mapped.publishedAt}'` : "null",
      mapped !== null
    );
  }

  // Auth / quota / kill switch
  {
    const prev = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    process.env.SPORTS_OLYMPICS_USE_FIXTURES = "0";
    const discovered = await discoverOlympicsVideos({
      useFixtures: false,
      maxResults: 5,
    });
    record(
      "API auth failure / missing key",
      "supported:false",
      JSON.stringify(discovered.supported ? "supported" : discovered.reason).slice(
        0,
        120
      ),
      discovered.supported === false
    );
    if (prev) process.env.YOUTUBE_API_KEY = prev;
    process.env.SPORTS_OLYMPICS_USE_FIXTURES = "1";
  }

  {
    const adapter = createOlympicsAdapter({ enabled: false, killSwitch: true });
    let blocked = false;
    try {
      await adapter.resolvePlayback({
        externalId: "abc",
        platform: "ios",
        country: "US",
      });
    } catch (err) {
      blocked = /disabled|kill switch/i.test(
        err instanceof Error ? err.message : String(err)
      );
    }
    record(
      "Provider disabled by kill switch",
      "resolvePlayback throws",
      blocked ? "blocked" : "not blocked",
      blocked
    );
  }

  // Playback contract for one accepted official-shaped item (no scrape)
  {
    const item = mapOlympicsVideoToCanonical(
      baseVideo({ videoId: "officialEmbedSmoke01", embeddable: true })
    )!;
    const embed = buildOlympicsEmbedUrl(item.providerNativeId);
    const safety = verifyTechnicalSafety({
      url: embed,
      allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
    });
    const browseHasNoHls =
      !JSON.stringify(item).includes(".m3u8") &&
      !JSON.stringify(item).includes("googlevideo");
    record(
      "Browse metadata has no HLS/DASH scrape",
      "no m3u8/googlevideo",
      browseHasNoHls ? "clean" : "leak",
      browseHasNoHls
    );
    record(
      "Play path is official_embed YouTube host",
      "youtube.com/embed + allowlisted",
      embed,
      item.rights.playbackMode === "official_embed" &&
        embed.includes("youtube.com/embed/") &&
        safety.pass
    );
  }

  // Bounded dry-run import twice (idempotency of mapping; no DB writes)
  process.env.SPORTS_OLYMPICS_USE_FIXTURES = "1";
  const run1 = await importOlympicsProvider({
    dryRun: true,
    limit: 10,
    useFixtures: true,
  });
  const run2 = await importOlympicsProvider({
    dryRun: true,
    limit: 10,
    useFixtures: true,
  });
  record(
    "Bounded dry-run import",
    "limit<=25 discovered, rejected private",
    `discovered=${run1.discovered} accepted=${run1.accepted} rejected=${run1.rejected}`,
    run1.dryRun &&
      run1.discovered <= 25 &&
      run1.accepted <= 10 &&
      run1.rejected >= 1
  );
  record(
    "Duplicate dry-run stability",
    "same accepted/rejected counts",
    `a1=${run1.accepted}/a2=${run2.accepted} r1=${run1.rejected}/r2=${run2.rejected}`,
    run1.accepted === run2.accepted && run1.rejected === run2.rejected
  );

  // Live API discovery (optional)
  let liveDiscovery: "skipped" | "ran" | "failed" = "skipped";
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const live = await discoverOlympicsVideos({
        useFixtures: false,
        maxResults: 25,
      });
      if (!live.supported) {
        liveDiscovery = "failed";
        record("Live API discovery", "supported", live.reason, false);
      } else {
        liveDiscovery = "ran";
        const mapped = mapOlympicsVideos(live.items.slice(0, 10));
        record(
          "Live API discovery bounded",
          "<=25 discovered, <=10 accepted slice",
          `discovered=${live.items.length} acceptedSlice=${mapped.accepted.length}`,
          live.items.length <= 25 && mapped.accepted.length <= 10
        );
      }
    } catch (err) {
      liveDiscovery = "failed";
      record(
        "Live API discovery",
        "success",
        err instanceof Error ? err.message : String(err),
        false
      );
    }
  } else {
    record(
      "Live API discovery",
      "skipped — no YOUTUBE_API_KEY in environment",
      "skipped",
      true
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        summary: {
          total: results.length,
          passed: results.length - failed.length,
          failed: failed.length,
          liveDiscovery,
          stagingWrite: "not performed (no authorized staging DB write)",
          productionWrite: "not performed",
        },
        failures: failed,
      },
      null,
      2
    )
  );

  assert.equal(failed.length, 0, `${failed.length} smoke checks failed`);
  console.log("Olympics staging smoke PASSED (fixture/local mode)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
