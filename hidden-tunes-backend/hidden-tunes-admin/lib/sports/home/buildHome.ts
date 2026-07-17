/**
 * Sports home IA orchestrator — Promise.allSettled isolation.
 */

import { sportsCacheGet, sportsCacheKey, sportsCacheSet } from "../cache";
import { SPORTS_LIVE_CACHE_TTL_MS } from "../constants";
import { isSportsFeatureEnabled } from "../featureFlags";
import { logSportsEvent } from "../telemetry";
import {
  assembleSportsHomeFromSettled,
  type SectionLoaderResult,
} from "./assemble";
import {
  resolveSportsHomeLimits,
  type SportsHomeLimits,
} from "./limits";
import {
  loadBecauseYouFollow,
  loadBrowseCountries,
  loadBrowseSports,
  loadContinueWatching,
  loadFeatured,
  loadHighlights,
  loadLiveNow,
  loadPopularCompetitions,
  loadRecentlyFinished,
  loadReplays,
  loadStartingSoon,
  loadTodaySchedule,
  loadTrending,
  type HomeLoaderContext,
} from "./loaders";
import type { SportsHomeResponse, SportsHomeSectionId } from "./types";

const SECTION_LABELS: SportsHomeSectionId[] = [
  "live_now",
  "starting_soon",
  "featured",
  "because_you_follow",
  "continue_watching",
  "popular_competitions",
  "browse_sports",
  "browse_countries",
  "todays_schedule",
  "trending",
  "recently_finished",
  "highlights",
  "replays",
];

export type BuildSportsHomeInput = {
  country: string;
  platform: string;
  userId?: string | null;
  timeZone?: string | null;
  limits?: Partial<SportsHomeLimits>;
  now?: Date;
  trendingSignalsAvailable?: boolean;
  /** Skip short cache (tests). */
  bypassCache?: boolean;
};

export async function buildSportsHomeContract(
  input: BuildSportsHomeInput
): Promise<{
  response: SportsHomeResponse;
  sectionErrors: Array<{ section: string; error: string }>;
  featureEnabled: boolean;
  homeIaEnabled: boolean;
}> {
  const featureEnabled = await isSportsFeatureEnabled("sports_enabled");
  const homeIaEnabled = await isSportsFeatureEnabled("sports_home_ia_enabled");

  if (!featureEnabled) {
    return {
      response: { generatedAt: new Date().toISOString(), sections: [] },
      sectionErrors: [],
      featureEnabled: false,
      homeIaEnabled: false,
    };
  }

  if (!homeIaEnabled) {
    return {
      response: { generatedAt: new Date().toISOString(), sections: [] },
      sectionErrors: [],
      featureEnabled: true,
      homeIaEnabled: false,
    };
  }

  const limits = resolveSportsHomeLimits(input.limits);
  const cacheKey = sportsCacheKey([
    "sports-home-ia",
    input.country,
    input.platform,
    input.userId || "anon",
    input.timeZone || "UTC",
    String(limits.liveNow),
  ]);

  if (!input.bypassCache && !input.userId) {
    const cached = sportsCacheGet<{
      response: SportsHomeResponse;
      sectionErrors: Array<{ section: string; error: string }>;
    }>(cacheKey);
    if (cached) {
      return { ...cached, featureEnabled: true, homeIaEnabled: true };
    }
  }

  const ctx: HomeLoaderContext = {
    country: input.country,
    platform: input.platform,
    userId: input.userId ?? null,
    timeZone: input.timeZone ?? null,
    limits,
    now: input.now,
    trendingSignalsAvailable: input.trendingSignalsAvailable === true,
  };

  const settled = await Promise.allSettled([
    loadLiveNow(ctx),
    loadStartingSoon(ctx),
    loadFeatured(ctx),
    loadBecauseYouFollow(ctx),
    loadContinueWatching(ctx),
    loadPopularCompetitions(ctx),
    loadBrowseSports(ctx),
    loadBrowseCountries(ctx),
    loadTodaySchedule(ctx),
    loadTrending(ctx),
    loadRecentlyFinished(ctx),
    loadHighlights(ctx),
    loadReplays(ctx),
  ]);

  const assembled = assembleSportsHomeFromSettled({
    settled: settled as PromiseSettledResult<SectionLoaderResult>[],
    labels: SECTION_LABELS,
  });

  logSportsEvent("home_contract_built", {
    sectionCount: assembled.response.sections.length,
    errorCount: assembled.sectionErrors.length,
    country: input.country,
    platform: input.platform,
    anonymous: !input.userId,
  });

  if (!input.bypassCache && !input.userId) {
    sportsCacheSet(cacheKey, assembled, SPORTS_LIVE_CACHE_TTL_MS);
  }

  return {
    ...assembled,
    featureEnabled: true,
    homeIaEnabled: true,
  };
}

/** Test helper: run assemblers against injected settled results. */
export { assembleSportsHomeFromSettled, SECTION_LABELS };
