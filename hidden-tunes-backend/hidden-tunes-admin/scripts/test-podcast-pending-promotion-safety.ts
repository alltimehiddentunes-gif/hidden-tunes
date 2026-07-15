import {
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  PODCAST_PUBLIC_SHOW_SELECT,
  applyPublicEpisodeFilters,
  applyPublicShowFilters,
} from "@/lib/podcastCatalog";
import {
  computeExpansionRemaining,
  isExpansionTargetMet,
} from "@/lib/podcastMassExpansionStatus";
import { clampPodcastPendingPromotionLimit } from "@/lib/podcastPendingPromotion";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  assert(!PODCAST_PUBLIC_EPISODE_LIST_SELECT.includes("audio_url"), "episode list must be metadata-only");
  assert(!PODCAST_PUBLIC_SHOW_SELECT.includes("feed_url"), "show list must hide feed_url");
  assert(!PODCAST_PUBLIC_SHOW_SELECT.includes("audio_url"), "show list must hide audio_url");

  const mockQuery = {
    filters: [] as string[],
    eq(field: string, value: unknown) {
      this.filters.push(`eq:${field}=${String(value)}`);
      return this;
    },
    or(value: string) {
      this.filters.push(`or:${value}`);
      return this;
    },
    ilike(field: string, value: string) {
      this.filters.push(`ilike:${field}:${value}`);
      return this;
    },
  };

  applyPublicShowFilters(mockQuery, { includeMature: false, searchQuery: "music" });
  assert(mockQuery.filters.includes("eq:is_mature=false"), "standard browse excludes mature");
  assert(mockQuery.filters.includes("eq:status=approved"), "public shows require approved");
  assert(mockQuery.filters.includes("eq:is_active=true"), "public shows require active");

  const episodeQuery = {
    filters: [] as string[],
    eq(field: string, value: unknown) {
      this.filters.push(`eq:${field}=${String(value)}`);
      return this;
    },
    or(value: string) {
      this.filters.push(`or:${value}`);
      return this;
    },
  };

  applyPublicEpisodeFilters(episodeQuery, {});
  assert(episodeQuery.filters.includes("eq:playback_status=playable"), "public episodes require playable");
  assert(episodeQuery.filters.includes("eq:status=approved"), "public episodes require approved");

  const counts = {
    standard_shows: 9000,
    mature_shows: 500,
    total_shows: 9500,
    total_episodes: 100000,
    public_standard_shows: 44,
    public_mature_shows: 5,
    public_episodes: 2043,
    languages: ["en"],
    categories: ["news"],
  };

  const remaining = computeExpansionRemaining(counts, { standard: 100_000, mature: 30_000 });
  assert(remaining.standard === 99_956, "remaining uses public standard count");
  assert(remaining.mature === 29_995, "remaining uses public mature count");
  assert(!isExpansionTargetMet(counts, { standard: 100_000, mature: 30_000 }), "targets use public counts");

  assert(clampPodcastPendingPromotionLimit(100_000) === 500, "promotion limit is clamped");
  assert(clampPodcastPendingPromotionLimit(10) === 10, "small promotion limits allowed");

  console.log(JSON.stringify({ success: true, checks: 12 }, null, 2));
}

main();
