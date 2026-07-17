/**
 * Sports home IA orchestrator — Promise.allSettled isolation.
 * Phase 2C: optional preference-aware ranking after loaders.
 */

import { sportsCacheGet, sportsCacheKey, sportsCacheSet } from "../cache";
import { SPORTS_LIVE_CACHE_TTL_MS } from "../constants";
import { isSportsFeatureEnabled } from "../featureFlags";
import {
  loadSportsPreferenceProfile,
  personalizeSectionResult,
  profileHasSignals,
  type SportsPreferenceProfile,
} from "../personalization";
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
  locale?: string | null;
  limits?: Partial<SportsHomeLimits>;
  now?: Date;
  trendingSignalsAvailable?: boolean;
  /** Skip short cache (tests). */
  bypassCache?: boolean;
  /** Injected profile for tests — skips DB load. */
  preferenceProfile?: SportsPreferenceProfile | null;
  /** Force personalization on/off in tests. */
  personalizationEnabled?: boolean;
};

function languageCodesFromLocale(locale?: string | null): string[] {
  const raw = String(locale || "").trim().toLowerCase();
  if (!raw) return [];
  const primary = raw.split(/[-_]/)[0];
  return primary ? [primary] : [];
}

function applyPersonalizationToSettled(input: {
  settled: PromiseSettledResult<SectionLoaderResult>[];
  labels: SportsHomeSectionId[];
  personalizationEnabled: boolean;
  profile: SportsPreferenceProfile | null;
  now?: Date;
}): PromiseSettledResult<SectionLoaderResult>[] {
  if (!input.personalizationEnabled) return input.settled;

  return input.settled.map((result, index) => {
    if (result.status !== "fulfilled") return result;
    const sectionId = input.labels[index];
    const value = result.value;
    const items = personalizeSectionResult(sectionId, value.type, value.items, {
      profile: input.profile,
      personalizationEnabled: true,
      now: input.now,
      attachReasons: profileHasSignals(input.profile),
    });
    return {
      status: "fulfilled" as const,
      value: { ...value, items },
    };
  });
}

export async function buildSportsHomeContract(
  input: BuildSportsHomeInput
): Promise<{
  response: SportsHomeResponse;
  sectionErrors: Array<{ section: string; error: string }>;
  featureEnabled: boolean;
  homeIaEnabled: boolean;
  personalizationEnabled: boolean;
  personalizationApplied: boolean;
  timingMs?: {
    profileMs: number;
    loadersMs: number;
    rankMs: number;
    totalMs: number;
  };
}> {
  const started = Date.now();
  const featureEnabled = await isSportsFeatureEnabled("sports_enabled");
  const homeIaEnabled = await isSportsFeatureEnabled("sports_home_ia_enabled");
  const personalizationFlag =
    input.personalizationEnabled ??
    (await isSportsFeatureEnabled("sports_personalization_enabled"));

  if (!featureEnabled) {
    return {
      response: { generatedAt: new Date().toISOString(), sections: [] },
      sectionErrors: [],
      featureEnabled: false,
      homeIaEnabled: false,
      personalizationEnabled: false,
      personalizationApplied: false,
    };
  }

  if (!homeIaEnabled) {
    return {
      response: { generatedAt: new Date().toISOString(), sections: [] },
      sectionErrors: [],
      featureEnabled: true,
      homeIaEnabled: false,
      personalizationEnabled: false,
      personalizationApplied: false,
    };
  }

  const limits = resolveSportsHomeLimits(input.limits);
  const cacheKey = sportsCacheKey([
    "sports-home-ia",
    input.country,
    input.platform,
    input.userId || "anon",
    input.timeZone || "UTC",
    personalizationFlag ? "p1" : "p0",
    String(limits.liveNow),
  ]);

  // Only cache neutral anonymous responses (no per-user prefs).
  if (!input.bypassCache && !input.userId && !personalizationFlag) {
    const cached = sportsCacheGet<{
      response: SportsHomeResponse;
      sectionErrors: Array<{ section: string; error: string }>;
    }>(cacheKey);
    if (cached) {
      return {
        ...cached,
        featureEnabled: true,
        homeIaEnabled: true,
        personalizationEnabled: false,
        personalizationApplied: false,
      };
    }
  }

  let profile: SportsPreferenceProfile | null = null;
  let profileMs = 0;
  if (personalizationFlag) {
    const profileStarted = Date.now();
    if (input.preferenceProfile !== undefined) {
      profile = input.preferenceProfile;
    } else if (input.userId) {
      profile = await loadSportsPreferenceProfile({
        userId: input.userId,
        languageCodes: languageCodesFromLocale(input.locale),
        now: input.now,
        bypassCache: input.bypassCache,
      });
      // Profile failure → null → Phase 2B-compatible neutral path when no signals.
    }
    profileMs = Date.now() - profileStarted;
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

  const loadersStarted = Date.now();
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
  const loadersMs = Date.now() - loadersStarted;

  const rankStarted = Date.now();
  const personalized = applyPersonalizationToSettled({
    settled: settled as PromiseSettledResult<SectionLoaderResult>[],
    labels: SECTION_LABELS,
    personalizationEnabled: personalizationFlag,
    profile,
    now: input.now,
  });
  const rankMs = Date.now() - rankStarted;

  const assembled = assembleSportsHomeFromSettled({
    settled: personalized,
    labels: SECTION_LABELS,
  });

  const personalizationApplied =
    personalizationFlag && profileHasSignals(profile);

  logSportsEvent("home_contract_built", {
    sectionCount: assembled.response.sections.length,
    errorCount: assembled.sectionErrors.length,
    country: input.country,
    platform: input.platform,
    anonymous: !input.userId,
    personalizationEnabled: personalizationFlag,
    personalizationApplied,
    profileMs,
    loadersMs,
    rankMs,
  });

  if (!input.bypassCache && !input.userId && !personalizationFlag) {
    sportsCacheSet(cacheKey, assembled, SPORTS_LIVE_CACHE_TTL_MS);
  }

  return {
    ...assembled,
    featureEnabled: true,
    homeIaEnabled: true,
    personalizationEnabled: personalizationFlag,
    personalizationApplied,
    timingMs: {
      profileMs,
      loadersMs,
      rankMs,
      totalMs: Date.now() - started,
    },
  };
}

/** Test helper: run assemblers against injected settled results. */
export { assembleSportsHomeFromSettled, SECTION_LABELS };
