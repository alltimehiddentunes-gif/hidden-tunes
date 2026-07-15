import {
  PODCAST_EXPANSION_DEFAULT_BATCH_SIZE,
  PODCAST_EXPANSION_TARGET_MATURE,
  PODCAST_EXPANSION_TARGET_STANDARD,
} from "@/lib/podcastExpansionConstants";
import { pickCatalogForBatch } from "@/lib/podcastMassExpansionDiscover";
import {
  computeExpansionRemaining,
  isExpansionTargetMet,
} from "@/lib/podcastMassExpansionStatus";
import {
  formatSourceCursor,
  hasPodcastIndexCredentials,
  listEnabledPodcastSources,
  loadPodcastSourceRegistry,
  parseSourceCursor,
  pickNextPodcastSource,
} from "@/lib/podcastSourceRegistry";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  assert(PODCAST_EXPANSION_TARGET_STANDARD === 100_000, "standard target must be 100k");
  assert(PODCAST_EXPANSION_TARGET_MATURE === 30_000, "mature target must be 30k");
  assert(PODCAST_EXPANSION_DEFAULT_BATCH_SIZE >= 500, "default batch size must be >= 500");

  const sources = loadPodcastSourceRegistry();
  assert(sources.length >= 4, "source registry must define multiple sources");

  const standardSources = sources.filter((entry) => entry.catalog === "standard");
  const matureSources = sources.filter((entry) => entry.catalog === "mature");
  assert(standardSources.length >= 2, "standard sources required");
  assert(matureSources.length >= 2, "mature sources required");

  const enabled = listEnabledPodcastSources();
  assert(enabled.length >= 2, "enabled sources required without PI credentials");

  const remaining = computeExpansionRemaining(
    {
      standard_shows: 1000,
      mature_shows: 100,
      total_shows: 1100,
      total_episodes: 50_000,
      public_standard_shows: 1000,
      public_mature_shows: 100,
      public_episodes: 2043,
      languages: ["en"],
      categories: ["news"],
    },
    { standard: 100_000, mature: 30_000 }
  );
  assert(remaining.standard === 99_000, "remaining standard calculation");
  assert(remaining.mature === 29_900, "remaining mature calculation");

  assert(
    pickCatalogForBatch({ standard: 90_000, mature: 10_000 }, 0) === "standard",
    "prioritize standard when gap is larger"
  );
  assert(
    pickCatalogForBatch({ standard: 10_000, mature: 25_000 }, 1) === "mature",
    "prioritize mature when gap is larger"
  );

  assert(
    !isExpansionTargetMet(
      {
        public_standard_shows: 99_999,
        public_mature_shows: 29_999,
      } as never,
      { standard: 100_000, mature: 30_000 }
    ),
    "target not met below public thresholds"
  );

  const cursor = parseSourceCursor("2:3:150");
  assert(
    cursor.queryIndex === 2 && cursor.languageIndex === 3 && cursor.offset === 150,
    "cursor parse"
  );
  assert(formatSourceCursor(cursor) === "2:3:150", "cursor roundtrip");

  const picked = pickNextPodcastSource(standardSources, "standard", 0);
  assert(picked?.catalog === "standard", "pickNextPodcastSource returns standard source");

  console.log(
    JSON.stringify(
      {
        success: true,
        podcast_index_credentials: hasPodcastIndexCredentials(),
        sources: sources.length,
        enabled_sources: enabled.length,
      },
      null,
      2
    )
  );
}

main();
