/**
 * Isolated Sports catalog API client.
 * Browse methods never request playback. Playback resolves only on Watch tap.
 */
import {
  isSportsClientEnabled,
  isSportsDevFixturesEnabled,
  isSportsTestPlayerEnabled,
} from "../constants/sportsFlags";
import { buildDevSportsHome } from "../lib/sports/devFixtures";
import {
  getDevCompetition,
  getDevFixtureDetail,
  getDevSportHub,
  searchDevSports,
} from "../lib/sports/devFixtures/lookups";
import { normalizeSportsSlug } from "../lib/sports/normalizeSportsSlug";
import type {
  SportsCompetitionCard,
  SportsCountryCard,
  SportsFixtureDetail,
  SportsHomeResponse,
  SportsHomeSection,
  SportsMatchCard,
  SportsPlaybackResult,
  SportsPlaybackSession,
  SportsSearchResponse,
  SportsVideoCard,
  SportsWorldCard,
} from "../types/sports";
import { deriveSportsAvailability } from "../lib/sports/ui/availability";
import {
  sessionFromLegacyPlayback,
  unavailableSession,
} from "../lib/sports/ui/playbackSession";
import { formatMatchTitle } from "../lib/sports/ui/formatScore";
import {
  normalizeFixtureDetail,
  normalizeMatchCards,
  sortFinishedNewestFirst,
} from "../lib/sports/ui/normalizeMatchCard";
import { isSportsResolveAbortError } from "./sports/sportsPlaybackResolver";
import {
  getSportsBrowseCache,
  setSportsBrowseCache,
  sportsCountryHubCacheKey,
  sportsHomeCacheKey,
  sportsSearchCacheKey,
  sportsSportHubCacheKey,
  SPORTS_HOME_CACHE_TTL_MS,
  SPORTS_HUB_CACHE_TTL_MS,
  SPORTS_SEARCH_CACHE_TTL_MS,
} from "./sports/sportsBrowseCache";
export const SPORTS_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const SPORTS_DEFAULT_PAGE_LIMIT = 20;

/** Dev+production private pilot header when token is configured.
 * Token is EXPO_PUBLIC (client-visible). Production EAS must supply it for Metro parity.
 * Streams remain independently gated off.
 */
const SPORTS_PRIVATE_PILOT_HEADER = "X-Hidden-Tunes-Sports-Pilot";

function privatePilotToken(): string | null {
  const token = String(
    process.env.EXPO_PUBLIC_SPORTS_PRIVATE_PILOT_TOKEN || ""
  ).trim();
  return token.length >= 16 ? token : null;
}

function sportsAccessMode(): "private-pilot" | "public" {
  return privatePilotToken() ? "private-pilot" : "public";
}

function sportsRequestHeaders(
  base: Record<string, string> = {}
): Record<string, string> {
  const headers = { ...base };
  const pilot = privatePilotToken();
  if (pilot) headers[SPORTS_PRIVATE_PILOT_HEADER] = pilot;
  return headers;
}

type FetchOptions = {
  signal?: AbortSignal;
  country?: string;
  platform?: string;
  userId?: string | null;
  timeZone?: string | null;
  locale?: string | null;
};
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
/** Dev fixtures always populate `sections` as an array; narrow away the browse-item-map union. */
function devHomeSections(home: SportsHomeResponse): SportsHomeSection[] {
  return Array.isArray(home.sections) ? home.sections : [];
}
const inflight = new Map<string, Promise<unknown>>();
function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
function friendlyError(status: number, text: string): Error {
  if (status >= 500) return new Error("Sports could not be loaded right now.");
  if (status === 404) return new Error("This Sports content was not found.");
  return new Error(
    text?.trim()
      ? "Sports could not be loaded right now."
      : "Sports could not be loaded right now."
  );
}
async function sportsFetch<T>(
  path: string,
  init: RequestInit & {
    country?: string;
    platform?: string;
    userId?: string | null;
  } = {}
): Promise<T> {
  if (!isSportsClientEnabled("sports_enabled")) {
    return {
      success: true,
      enabled: false,
    } as T;
  }
  const url = new URL(path, SPORTS_CATALOG_BASE_URL);
  if (init.country) url.searchParams.set("country", init.country);
  if (init.platform) url.searchParams.set("platform", init.platform);
  const headers = new Headers(init.headers || {});
  if (init.platform) headers.set("x-ht-platform", init.platform);
  if (init.country) headers.set("x-ht-storefront-country", init.country);
  if (init.userId) headers.set("x-ht-user-id", init.userId);
  const pilot = privatePilotToken();
  if (pilot) headers.set(SPORTS_PRIVATE_PILOT_HEADER, pilot);
  const response = await fetch(url.toString(), {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw friendlyError(response.status, text);
  }
  return (await response.json()) as T;
}
export async function fetchSportsHome(
  options: FetchOptions & { forceNetwork?: boolean } = {}
): Promise<SportsHomeResponse> {
  if (isSportsDevFixturesEnabled()) {
    return buildDevSportsHome(options.userId ? "personalized" : "anonymous");
  }
  const country = options.country || "ZZ";
  const platform = options.platform || "ios";
  const tz = options.timeZone || deviceTimeZone();
  const locale = options.locale || undefined;
  const cacheKey = sportsHomeCacheKey(
    country,
    platform,
    sportsAccessMode(),
    options.userId
  );

  if (!options.forceNetwork && !options.signal?.aborted) {
    const cached = getSportsBrowseCache<SportsHomeResponse>(cacheKey);
    if (cached && cached.enabled !== false) {
      return cached;
    }
  }

  const qs = new URLSearchParams();
  if (tz) qs.set("tz", tz);
  if (locale) qs.set("locale", locale);
  const path = `/api/sports/home${qs.toString() ? `?${qs}` : ""}`;
  const home = await dedupe(
    `home:${sportsAccessMode()}:${country}:${platform}:${options.userId || "anon"}:${tz || ""}`,
    () =>
      sportsFetch<SportsHomeResponse>(path, {
        signal: options.signal,
        country,
        platform,
        userId: options.userId,
      })
  );

  if (options.signal?.aborted) {
    return home;
  }

  // When Sports is enabled but the home payload has no fixture/live shelves
  // (home IA off, or private-pilot browse-only sections), compose Live /
  // Upcoming / Results from the fixtures endpoints and keep any browse rails.
  const sections = Array.isArray(home.sections) ? home.sections : [];
  const hasFixtureSections = sections.some(
    (s) =>
      s.type === "live" ||
      s.type === "fixtures" ||
      s.id === "live_now" ||
      s.id === "upcoming" ||
      s.id === "todays_schedule" ||
      s.id === "recently_finished" ||
      s.id === "later_today"
  );
  let result = home;
  if (
    home.enabled !== false &&
    !hasFixtureSections &&
    isSportsClientEnabled("sports_fixtures_enabled")
  ) {
    const composed = await composeFixturesOnlyHome(
      { ...home, sections: [] },
      options
    );
    const composedSections = Array.isArray(composed.sections)
      ? composed.sections
      : [];
    result = {
      ...composed,
      sections: [...composedSections, ...sections],
    };
  }

  // Never cache disabled / empty-failed payloads as durable success.
  if (result.enabled !== false) {
    setSportsBrowseCache(cacheKey, result, SPORTS_HOME_CACHE_TTL_MS);
  }
  return result;
}

async function composeFixturesOnlyHome(
  home: SportsHomeResponse,
  options: FetchOptions
): Promise<SportsHomeResponse> {
  const platform = options.platform || "ios";
  const country = options.country || "ZZ";
  const limit = SPORTS_DEFAULT_PAGE_LIMIT;
  const [liveRes, upcomingRes, finishedRes] = await Promise.all([
    sportsFetch<{
      success?: boolean;
      enabled?: boolean;
      items?: SportsMatchCard[];
    }>(`/api/sports/live?limit=${limit}`, {
      signal: options.signal,
      country,
      platform,
      userId: options.userId,
    }),
    fetchSportsFixtures({
      ...options,
      upcoming: true,
      limit,
    }),
    fetchSportsFixtures({
      ...options,
      finished: true,
      limit,
    }),
  ]);

  const live = normalizeMatchCards(liveRes.items);
  const upcoming = normalizeMatchCards(upcomingRes.items);
  const finished = sortFinishedNewestFirst(
    normalizeMatchCards(finishedRes.items)
  );

  const composed: SportsHomeSection[] = [
    {
      id: "live_now",
      type: "live",
      title: "Live now",
      subtitle:
        live.length === 0
          ? "No confirmed live events right now"
          : undefined,
      rank: 10,
      items: live,
    },
    {
      id: "upcoming",
      type: "fixtures",
      title: "Upcoming fixtures",
      rank: 30,
      items: upcoming,
    },
    {
      id: "recently_finished",
      type: "fixtures",
      title: "Recently finished",
      rank: 90,
      items: finished,
    },
  ];

  return {
    ...home,
    enabled: true,
    sections: composed,
    message: undefined,
  };
}
export async function fetchSportsFixtures(
  options: FetchOptions & {
    page?: number;
    limit?: number;
    sportSlug?: string;
    competitionId?: string;
    status?: string;
    date?: string;
    upcoming?: boolean;
    finished?: boolean;
    live?: boolean;
  } = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  items?: SportsMatchCard[];
  pagination?: { page: number; limit: number; hasMore: boolean };
}> {
  if (isSportsDevFixturesEnabled()) {
    const hub = options.sportSlug
      ? getDevSportHub(options.sportSlug)
      : options.competitionId
        ? getDevCompetition(options.competitionId)
        : null;
    return {
      success: true,
      enabled: true,
      items: (hub?.fixtures || []).slice(0, options.limit || SPORTS_DEFAULT_PAGE_LIMIT),
      pagination: { page: 1, limit: options.limit || 20, hasMore: false },
    };
  }
  const page = options.page || 1;
  const limit = options.limit || SPORTS_DEFAULT_PAGE_LIMIT;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (options.sportSlug) qs.set("sport", normalizeSportsSlug(options.sportSlug));
  if (options.competitionId) qs.set("competitionId", options.competitionId);
  if (options.status) qs.set("status", options.status);
  if (options.date) qs.set("date", options.date);
  if (options.upcoming) qs.set("upcoming", "true");
  if (options.finished) qs.set("finished", "true");
  if (options.live) qs.set("live", "true");
  // Do not pass storefront country as fixtureCountry — that poisoned sport hubs with ZZ.
  const res = await dedupe(
    `fixtures:${sportsAccessMode()}:${qs.toString()}:${options.platform || "ios"}`,
    () =>
      sportsFetch<{
        success: boolean;
        enabled?: boolean;
        items?: SportsMatchCard[];
        pagination?: { page: number; limit: number; hasMore: boolean };
      }>(`/api/sports/fixtures?${qs}`, {
        signal: options.signal,
        country: options.country || "ZZ",
        platform: options.platform || "ios",
      })
  );
  let items = normalizeMatchCards(res.items);
  if (options.finished) {
    items = sortFinishedNewestFirst(items);
  }
  return { ...res, items };
}

/** Small foreground payload used by Sports Home; never resolves playback. */
export async function fetchSportsLiveState(
  options: FetchOptions & { limit?: number } = {}
): Promise<{
  live: SportsMatchCard[];
  finished: SportsMatchCard[];
  fetchedAt: string;
}> {
  const limit = Math.min(40, Math.max(1, options.limit || SPORTS_DEFAULT_PAGE_LIMIT));
  if (isSportsDevFixturesEnabled()) {
    const sections = devHomeSections(buildDevSportsHome("anonymous"));
    return {
      live: normalizeMatchCards(
        sections.find((section) => section.id === "live_now")?.items as SportsMatchCard[]
      ),
      finished: sortFinishedNewestFirst(
        normalizeMatchCards(
          sections.find((section) => section.id === "recently_finished")
            ?.items as SportsMatchCard[]
        )
      ),
      fetchedAt: new Date().toISOString(),
    };
  }
  const country = options.country || "ZZ";
  const platform = options.platform || "ios";
  const [liveResponse, finishedResponse] = await Promise.all([
    sportsFetch<{
      success?: boolean;
      enabled?: boolean;
      items?: SportsMatchCard[];
    }>(`/api/sports/live?limit=${limit}`, {
      signal: options.signal,
      country,
      platform,
      userId: options.userId,
    }),
    fetchSportsFixtures({
      ...options,
      country,
      platform,
      finished: true,
      limit,
    }),
  ]);
  return {
    live: normalizeMatchCards(liveResponse.items),
    finished: sortFinishedNewestFirst(normalizeMatchCards(finishedResponse.items)),
    fetchedAt: new Date().toISOString(),
  };
}
export async function fetchSportsFixtureDetail(
  fixtureId: string,
  options: FetchOptions = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  fixture?: SportsFixtureDetail | null;
  message?: string;
}> {
  if (isSportsDevFixturesEnabled()) {
    const fixture = getDevFixtureDetail(fixtureId);
    return {
      success: true,
      enabled: true,
      fixture,
      message: fixture ? undefined : "Fixture not found.",
    };
  }
  return dedupe(
    `fixture:${sportsAccessMode()}:${fixtureId}:${options.platform || "ios"}`,
    async () => {
      const res = await sportsFetch<{
        success: boolean;
        enabled?: boolean;
        fixture?: SportsFixtureDetail | null;
        message?: string;
      }>(`/api/sports/fixtures/${encodeURIComponent(fixtureId)}`, {
        signal: options.signal,
        country: options.country || "ZZ",
        platform: options.platform || "ios",
      });
      return {
        ...res,
        fixture: normalizeFixtureDetail(res.fixture) ?? null,
      };
    }
  );
}
export async function fetchSportsWatchOptions(
  fixtureId: string,
  options: FetchOptions = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  broadcasts?: { id: string; title: string; status?: string | null }[];
  message?: string;
}> {
  if (isSportsDevFixturesEnabled()) {
    const fixture = getDevFixtureDetail(fixtureId);
    return {
      success: true,
      enabled: true,
      broadcasts: fixture?.broadcasts || [],
    };
  }
  return sportsFetch(
    `/api/sports/fixtures/${encodeURIComponent(fixtureId)}/watch-options`,
    {
      signal: options.signal,
      country: options.country || "ZZ",
      platform: options.platform || "ios",
    }
  );
}
export async function fetchSportsList(
  options: FetchOptions & { page?: number; limit?: number } = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  items?: SportsWorldCard[];
}> {
  if (isSportsDevFixturesEnabled()) {
    const home = buildDevSportsHome("anonymous");
    const section = devHomeSections(home).find((s) => s.id === "browse_sports");
    return {
      success: true,
      enabled: true,
      items: (section?.items || []) as SportsWorldCard[],
    };
  }
  const page = options.page || 1;
  const limit = options.limit || 40;
  return sportsFetch(`/api/sports/sports?page=${page}&limit=${limit}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
}
export async function fetchSportsCountries(
  options: FetchOptions & { page?: number; limit?: number } = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  items?: SportsCountryCard[];
}> {
  if (isSportsDevFixturesEnabled()) {
    const home = buildDevSportsHome("anonymous");
    const section = devHomeSections(home).find((s) => s.id === "browse_countries");
    return {
      success: true,
      enabled: true,
      items: (section?.items || []) as SportsCountryCard[],
    };
  }
  const page = options.page || 1;
  const limit = options.limit || 40;
  return sportsFetch(`/api/sports/countries?page=${page}&limit=${limit}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
}
export async function fetchSportsCompetitions(
  options: FetchOptions & {
    page?: number;
    limit?: number;
    sportSlug?: string;
  } = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  items?: SportsCompetitionCard[];
}> {
  if (isSportsDevFixturesEnabled()) {
    const home = buildDevSportsHome("anonymous");
    const section = devHomeSections(home).find(
      (s) => s.id === "popular_competitions"
    );
    let items = (section?.items || []) as SportsCompetitionCard[];
    if (options.sportSlug) {
      items = items.filter((c) => c.sportSlug === options.sportSlug);
    }
    return { success: true, enabled: true, items };
  }
  const page = options.page || 1;
  const limit = options.limit || 20;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (options.sportSlug) qs.set("sport", options.sportSlug);
  return sportsFetch(`/api/sports/competitions?${qs}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
}
export async function fetchSportsCompetitionDetail(
  competitionId: string,
  options: FetchOptions = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  competition?: SportsCompetitionCard | null;
  fixtures?: SportsMatchCard[];
  highlights?: SportsVideoCard[];
  replays?: SportsVideoCard[];
}> {
  if (isSportsDevFixturesEnabled()) {
    const data = getDevCompetition(competitionId);
    return {
      success: true,
      enabled: true,
      competition: data?.competition || null,
      fixtures: data?.fixtures || [],
      highlights: data?.highlights || [],
      replays: data?.replays || [],
    };
  }
  return sportsFetch(
    `/api/sports/competitions/${encodeURIComponent(competitionId)}`,
    {
      signal: options.signal,
      country: options.country || "ZZ",
      platform: options.platform || "ios",
    }
  );
}
export async function fetchSportsSportHub(
  sportSlug: string,
  options: FetchOptions = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  sport?: SportsWorldCard | null;
  sections?: import("../types/sports").SportsHomeSection[];
}> {
  const slug = normalizeSportsSlug(sportSlug);
  if (isSportsDevFixturesEnabled()) {
    return {
      success: true,
      enabled: true,
      ...getDevSportHub(slug),
    };
  }
  const hubCacheKey = sportsSportHubCacheKey(
    slug,
    options.country || "ZZ",
    options.platform || "ios"
  );
  if (!options.signal?.aborted) {
    const cached = getSportsBrowseCache<{
      success: boolean;
      enabled?: boolean;
      sport?: SportsWorldCard | null;
      sections?: import("../types/sports").SportsHomeSection[];
    }>(hubCacheKey);
    if (cached && cached.enabled !== false) return cached;
  }

  // Two bounded requests — do not fan-out the full sports taxonomy list.
  const [fixtures, competitions] = await Promise.all([
    fetchSportsFixtures({ ...options, sportSlug: slug, limit: 40 }),
    fetchSportsCompetitions({ ...options, sportSlug: slug, limit: 20 }),
  ]);

  if (fixtures.enabled === false && competitions.enabled === false) {
    return {
      success: true,
      enabled: false,
      sport: null,
      sections: [],
    };
  }

  const sport = {
    id: slug,
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  } as SportsWorldCard;

  const all = fixtures.items || [];
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const live = all.filter((f) => f.status?.live);
  const laterToday = all.filter((f) => {
    if (f.status?.live || f.status?.finished) return false;
    const t = Date.parse(String(f.timing?.startsAt || ""));
    return Number.isFinite(t) && t >= now && t <= endOfToday.getTime();
  });
  const upcoming = all.filter((f) => {
    if (f.status?.live || f.status?.finished) return false;
    const t = Date.parse(String(f.timing?.startsAt || ""));
    return Number.isFinite(t) && t > endOfToday.getTime();
  });
  const finished = sortFinishedNewestFirst(
    all.filter((f) => f.status?.finished)
  );
  const comps = (competitions.items || []).filter(
    (c) => !c.sportSlug || normalizeSportsSlug(c.sportSlug) === slug
  );

  const sections: SportsHomeSection[] = [
    { id: "live_now", type: "live", title: "Live", rank: 10, items: live },
    {
      id: "later_today",
      type: "fixtures",
      title: "Later Today",
      rank: 20,
      items: laterToday,
    },
    {
      id: "upcoming",
      type: "fixtures",
      title: "Upcoming",
      rank: 30,
      items: upcoming,
    },
    {
      id: "recently_finished",
      type: "fixtures",
      title: "Recently Finished",
      rank: 40,
      items: finished,
    },
    {
      id: "popular_competitions",
      type: "competitions",
      title: "Competitions",
      rank: 60,
      items: comps,
    },
  ].filter((s) => (s.items?.length || 0) > 0);

  const result = {
    success: true,
    enabled: true,
    sport,
    sections,
  };
  if (!options.signal?.aborted) {
    setSportsBrowseCache(hubCacheKey, result, SPORTS_HUB_CACHE_TTL_MS);
  }
  return result;
}

export async function fetchSportsCountryHub(
  countryCode: string,
  options: FetchOptions = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  country?: SportsCountryCard | null;
  sections?: SportsHomeSection[];
}> {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!code) {
    return { success: true, enabled: true, country: null, sections: [] };
  }

  if (isSportsDevFixturesEnabled()) {
    const home = buildDevSportsHome("anonymous");
    const countries = (devHomeSections(home).find((s) => s.id === "browse_countries")
      ?.items || []) as SportsCountryCard[];
    const country = countries.find((c) => c.code === code) || {
      code,
      name: code,
    };
    const fixtures = ALL_DEV_COUNTRY_FIXTURES(code);
    return {
      success: true,
      enabled: true,
      country,
      sections: buildCountrySections(fixtures, []),
    };
  }

  const hubCacheKey = sportsCountryHubCacheKey(
    code,
    options.country || "ZZ",
    options.platform || "ios"
  );
  if (!options.signal?.aborted) {
    const cached = getSportsBrowseCache<{
      success: boolean;
      enabled?: boolean;
      country?: SportsCountryCard | null;
      sections?: SportsHomeSection[];
    }>(hubCacheKey);
    if (cached && cached.enabled !== false) return cached;
  }

  const qs = new URLSearchParams({
    page: "1",
    limit: "40",
    countryCode: code,
  });
  // One fixtures request — derive competitions from fixture cards.
  // Avoid full countries + global competitions fan-out.
  const fixturesRes = await dedupe(
    `country-fixtures:${sportsAccessMode()}:${code}:${options.platform || "ios"}`,
    () =>
      sportsFetch<{
        success: boolean;
        enabled?: boolean;
        items?: SportsMatchCard[];
      }>(`/api/sports/fixtures?${qs}`, {
        signal: options.signal,
        country: options.country || "ZZ",
        platform: options.platform || "ios",
      })
  );

  if (fixturesRes.enabled === false) {
    return { success: true, enabled: false, country: null, sections: [] };
  }

  const country = { code, name: code } as SportsCountryCard;
  const fixtures = fixturesRes.items || [];
  const competitionMap = new Map<string, SportsCompetitionCard>();
  for (const f of fixtures) {
    if (!f.competition?.id) continue;
    if (competitionMap.has(f.competition.id)) continue;
    competitionMap.set(f.competition.id, {
      id: f.competition.id,
      slug: f.competition.slug,
      name: f.competition.name,
      shortName: f.competition.shortName,
      sportSlug: f.sport?.slug,
      sportName: f.sport?.name,
      countryCode: f.competition.countryCode || code,
      logoUrl: f.competition.logoUrl,
    });
  }
  const comps = [...competitionMap.values()];

  const result = {
    success: true,
    enabled: true,
    country,
    sections: buildCountrySections(fixtures, comps),
  };
  if (!options.signal?.aborted) {
    setSportsBrowseCache(hubCacheKey, result, SPORTS_HUB_CACHE_TTL_MS);
  }
  return result;
}

function buildCountrySections(
  fixtures: SportsMatchCard[],
  competitions: SportsCompetitionCard[]
): SportsHomeSection[] {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const live = fixtures.filter((f) => f.status?.live);
  const today = fixtures.filter((f) => {
    const t = Date.parse(String(f.timing?.startsAt || ""));
    return Number.isFinite(t) && t <= endOfToday.getTime() && !f.status?.finished;
  });
  const upcoming = fixtures.filter((f) => {
    const t = Date.parse(String(f.timing?.startsAt || ""));
    return Number.isFinite(t) && t > endOfToday.getTime();
  });
  const finished = sortFinishedNewestFirst(
    fixtures.filter((f) => f.status?.finished)
  );
  return [
    { id: "live_now", type: "live", title: "Live", rank: 10, items: live },
    { id: "today", type: "fixtures", title: "Today", rank: 20, items: today },
    {
      id: "upcoming",
      type: "fixtures",
      title: "Upcoming",
      rank: 30,
      items: upcoming,
    },
    {
      id: "popular_competitions",
      type: "competitions",
      title: "Competitions",
      rank: 50,
      items: competitions,
    },
    {
      id: "recently_finished",
      type: "fixtures",
      title: "Recent results",
      rank: 60,
      items: finished,
    },
  ].filter((s) => (s.items?.length || 0) > 0);
}

function ALL_DEV_COUNTRY_FIXTURES(code: string): SportsMatchCard[] {
  return (getDevSportHub("football").fixtures || []).filter(
    (f) => String(f.competition?.countryCode || "").toUpperCase() === code
  );
}
export async function searchSportsCatalog(
  query: string,
  options: FetchOptions & { page?: number; limit?: number } = {}
): Promise<SportsSearchResponse> {
  const q = query.trim();
  if (isSportsDevFixturesEnabled()) {
    return searchDevSports(q, options.page || 1, options.limit || 40);
  }
  if (!q) {
    return {
      success: true,
      enabled: true,
      query: "",
      groups: [],
      pagination: { page: 1, limit: options.limit || 40, hasMore: false },
    };
  }
  const page = options.page || 1;
  const limit = options.limit || 40;
  const country = options.country || "ZZ";
  const platform = options.platform || "ios";
  const cacheKey = sportsSearchCacheKey(q, page, limit, country, platform);
  if (!options.signal?.aborted) {
    const cached = getSportsBrowseCache<SportsSearchResponse>(cacheKey);
    if (cached && cached.enabled !== false) return cached;
  }
  const qs = new URLSearchParams({
    q,
    page: String(page),
    limit: String(limit),
  });
  const result = await sportsFetch<SportsSearchResponse>(`/api/sports/search?${qs}`, {
    signal: options.signal,
    country,
    platform,
  });
  if (!options.signal?.aborted && result.enabled !== false) {
    setSportsBrowseCache(cacheKey, result, SPORTS_SEARCH_CACHE_TTL_MS);
  }
  return result;
}
export async function fetchSportsVideos(
  options: FetchOptions & {
    page?: number;
    limit?: number;
    videoType?: string;
  } = {}
): Promise<{
  success: boolean;
  enabled?: boolean;
  items?: SportsVideoCard[];
  pagination?: { page: number; limit: number; hasMore: boolean };
}> {
  if (isSportsDevFixturesEnabled()) {
    const home = buildDevSportsHome("anonymous");
    const id = options.videoType === "replay" ? "replays" : "highlights";
    const section = devHomeSections(home).find((s) => s.id === id);
    return {
      success: true,
      enabled: true,
      items: (section?.items || []) as SportsVideoCard[],
      pagination: { page: 1, limit: 20, hasMore: false },
    };
  }
  const page = options.page || 1;
  const limit = options.limit || SPORTS_DEFAULT_PAGE_LIMIT;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (options.videoType) qs.set("type", options.videoType);
  return sportsFetch(`/api/sports/videos?${qs}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
}
export async function resolveSportsVideoPlayback(input: {
  videoId: string;
  platform: string;
  country: string;
  signal?: AbortSignal;
}): Promise<{
  success: boolean;
  playback?: SportsPlaybackResult;
  code?: string;
  error?: string;
  title?: string;
}> {
  if (isSportsDevFixturesEnabled()) {
    return {
      success: true,
      playback: {
        mode: "embedded",
        provider: "dev-fixture",
        embedUrl: "about:blank",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      title: "Development fixture playback",
    };
  }
  if (!isSportsClientEnabled("sports_enabled")) {
    return {
      success: false,
      code: "FEATURE_DISABLED",
      error: "Sports is disabled.",
    };
  }
  return dedupe(
    `video-play:${sportsAccessMode()}:${input.videoId}:${input.platform}:${input.country}`,
    async () => {
      const response = await fetch(
        `${SPORTS_CATALOG_BASE_URL}/api/sports/videos/${encodeURIComponent(input.videoId)}/play`,
        {
          method: "POST",
        headers: sportsRequestHeaders({
            "Content-Type": "application/json",
            "x-ht-platform": input.platform,
          }),
          body: JSON.stringify({
            platform: input.platform,
            country: input.country,
          }),
          signal: input.signal,
          cache: "no-store",
        }
      );
      return (await response.json()) as {
        success: boolean;
        playback?: SportsPlaybackResult;
        code?: string;
        error?: string;
        title?: string;
      };
    }
  );
}
export async function resolveSportsBroadcastPlayback(input: {
  broadcastId: string;
  platform: string;
  country: string;
  deviceId?: string;
  appVersion?: string;
  signal?: AbortSignal;
}): Promise<{
  success: boolean;
  playback?: SportsPlaybackResult;
  code?: string;
  error?: string;
}> {
  if (isSportsDevFixturesEnabled()) {
    if (input.broadcastId.includes("unavailable")) {
      return {
        success: false,
        code: "UNAVAILABLE",
        error: "This match is currently unavailable.",
      };
    }
    return {
      success: true,
      playback: {
        mode: "embedded",
        provider: "dev-fixture",
        embedUrl: "about:blank",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    };
  }
  if (!isSportsClientEnabled("sports_enabled")) {
    return {
      success: false,
      code: "FEATURE_DISABLED",
      error: "Sports is disabled.",
    };
  }
  return dedupe(
    `play:${sportsAccessMode()}:${input.broadcastId}:${input.platform}:${input.country}`,
    async () => {
      const response = await fetch(
        `${SPORTS_CATALOG_BASE_URL}/api/sports/broadcasts/${encodeURIComponent(input.broadcastId)}/play`,
        {
          method: "POST",
        headers: sportsRequestHeaders({
            "Content-Type": "application/json",
            "x-ht-platform": input.platform,
          }),
          body: JSON.stringify({
            platform: input.platform,
            country: input.country,
            deviceId: input.deviceId,
            appVersion: input.appVersion,
          }),
          signal: input.signal,
          cache: "no-store",
        }
      );
      return (await response.json()) as {
        success: boolean;
        playback?: SportsPlaybackResult;
        code?: string;
        error?: string;
      };
    }
  );
}
/**
 * Play endpoint returns an opaque playbackToken; embedUrl is resolved only
 * via the short-lived session endpoint (never from browse APIs).
 */
async function hydrateSportsPlaybackSessionEmbed(
  session: SportsPlaybackSession,
  signal?: AbortSignal
): Promise<SportsPlaybackSession> {
  if (session.status !== "ready") return session;
  const existing = session.embedUrl?.trim();
  if (existing && existing !== "about:blank") return session;
  const token = String(session.playbackToken || "").trim();
  if (!token || token.startsWith("dev-") || token.startsWith("legacy-")) {
    return session;
  }
  try {
    const response = await fetch(
      `${SPORTS_CATALOG_BASE_URL}/api/sports/playback-sessions/${encodeURIComponent(token)}`,
      {
        method: "GET",
        headers: sportsRequestHeaders({
          "x-ht-platform": "ios",
        }),
        signal,
        cache: "no-store",
      }
    );
    if (!response.ok) return session;
    const json = (await response.json()) as {
      success?: boolean;
      embedUrl?: string | null;
      title?: string;
      providerLabel?: string;
      playbackKind?: string;
      manifestUrl?: string | null;
      headers?: Record<string, string>;
      expiresAt?: string;
    };
    const embedUrl = String(json.embedUrl || "").trim();
    const manifestUrl = String(json.manifestUrl || "").trim();
    if (
      (!embedUrl || embedUrl === "about:blank") &&
      !manifestUrl
    ) return session;
    const kindRaw = String(json.playbackKind || session.playbackKind || "iframe")
      .trim()
      .toLowerCase();
    const playbackKind =
      kindRaw === "webview"
        ? "webview"
        : kindRaw === "hls"
          ? "hls"
        : kindRaw === "dash"
          ? "dash"
          : kindRaw === "progressive" || kindRaw === "mp4"
            ? "progressive"
            : kindRaw === "embed" || kindRaw === "iframe"
              ? "embed"
              : session.playbackKind;
    return {
      ...session,
      playbackKind,
      title: json.title || session.title,
      providerLabel: json.providerLabel || session.providerLabel,
      expiresAt: json.expiresAt || session.expiresAt,
      embedUrl: embedUrl && embedUrl !== "about:blank" ? embedUrl : null,
      manifestUrl: manifestUrl || session.manifestUrl || null,
      headers: json.headers || session.headers,
    };
  } catch {
    return session;
  }
}

function normalizePlayableSession(
  fixtureId: string,
  session: SportsPlaybackSession
): SportsPlaybackSession {
  if (session.status !== "ready") return session;

  const embedUrl = String(session.embedUrl || "").trim();
  const hasEmbed = Boolean(embedUrl && embedUrl !== "about:blank");
  const hasDevHtml = Boolean(session.fixtureHtml && isSportsTestPlayerEnabled());
  const nativeEnabled = isSportsClientEnabled("sports_native_playback_enabled");
  const hasNative =
    nativeEnabled &&
    Boolean(String(session.manifestUrl || "").trim()) &&
    (session.playbackKind === "hls" ||
      session.playbackKind === "dash" ||
      session.playbackKind === "progressive");

  if (hasEmbed || hasDevHtml || hasNative) return session;

  if (
    !nativeEnabled &&
    (session.playbackKind === "hls" ||
      session.playbackKind === "dash" ||
      session.playbackKind === "progressive")
  ) {
    return unavailableSession(
      fixtureId,
      "validation_failed",
      "This match stream is not available in the app yet."
    );
  }

  return unavailableSession(
    fixtureId,
    "validation_failed",
    "No playable stream was returned for this match."
  );
}

/** Resolve fixture playback into the provider-neutral session DTO. */
export async function resolveSportsFixturePlaySession(input: {
  fixtureId: string;
  platform: string;
  country: string;
  signal?: AbortSignal;
}): Promise<SportsPlaybackSession> {
  const fixtureId = input.fixtureId;

  if (input.signal?.aborted) {
    return unavailableSession(fixtureId, "validation_failed", "Playback request was cancelled.");
  }

  if (isSportsDevFixturesEnabled()) {
    const fixture = getDevFixtureDetail(fixtureId);
    if (!fixture) {
      return unavailableSession(fixtureId, "no_broadcast", "This match is currently unavailable.");
    }
    const availability = deriveSportsAvailability(fixture);
    const title = formatMatchTitle(fixture);

    if (availability === "live_external") {
      return {
        status: "external",
        fixtureId,
        officialUrl: "https://www.example.com/official-sports-broadcast",
        providerLabel: "Official Provider",
      };
    }
    if (availability === "live_subscription") {
      return {
        status: "subscription_required",
        fixtureId,
        providerLabel: "Official Broadcaster",
        officialUrl: "https://www.example.com/subscribe",
      };
    }
    if (
      availability !== "live_in_app" &&
      availability !== "replay_available" &&
      availability !== "highlights_available"
    ) {
      return unavailableSession(
        fixtureId,
        availability === "upcoming" ? "not_started" : "no_broadcast",
        "This match is currently unavailable."
      );
    }

    // Fake HTML player requires explicit test flag — never __DEV__ alone.
    if (!isSportsTestPlayerEnabled()) {
      return unavailableSession(
        fixtureId,
        "no_broadcast",
        "No stream available."
      );
    }

    const fixtureHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sports Dev Fixture</title>
<style>body{margin:0;background:#0A1220;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}h1{font-size:18px;margin:0 0 8px}p{opacity:.75;font-size:14px;line-height:1.4}</style></head>
<body><div><h1>Development fixture player</h1><p>${title.replace(/[<>&]/g, "")}</p><p>Not a live provider stream. Used only to validate tap-to-watch when EXPO_PUBLIC_SPORTS_ENABLE_TEST_PLAYER=true.</p></div></body></html>`;

    return normalizePlayableSession(fixtureId, {
      status: "ready",
      fixtureId,
      playbackKind: "webview",
      playbackToken: `dev-fixture-${fixtureId}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      title,
      providerLabel: "Dev fixture",
      fixtureHtml,
      embedUrl: null,
    });
  }

  if (!isSportsClientEnabled("sports_enabled")) {
    return unavailableSession(fixtureId, "provider_disabled", "Sports is disabled.");
  }

  // Prefer dedicated fixture play endpoint. Watch-options fallback only when
  // the play response explicitly allows it — never on network/parse failure.
  let playFailureMessage: string | null = null;
  let playFailureReason:
    | "geo_blocked"
    | "validation_failed"
    | "no_broadcast" = "validation_failed";
  let allowWatchOptionsFallback = false;

  try {
    const response = await fetch(
      `${SPORTS_CATALOG_BASE_URL}/api/sports/fixtures/${encodeURIComponent(fixtureId)}/play`,
      {
        method: "POST",
        headers: sportsRequestHeaders({
          "Content-Type": "application/json",
          "x-ht-platform": input.platform,
          "x-ht-storefront-country": input.country,
        }),
        body: JSON.stringify({
          platform: input.platform,
          country: input.country,
        }),
        signal: input.signal,
        cache: "no-store",
      }
    );

    if (input.signal?.aborted) {
      return unavailableSession(fixtureId, "validation_failed", "Playback request was cancelled.");
    }

    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      session?: SportsPlaybackSession;
      playback?: SportsPlaybackResult;
      title?: string;
      error?: string;
      code?: string;
      allowBroadcastFallback?: boolean;
      fallback?: string;
    } | null;

    // Accept an explicit session on any HTTP status (e.g. 409 finished).
    if (json?.session) {
      const hydrated = await hydrateSportsPlaybackSessionEmbed(
        json.session,
        input.signal
      );
      return normalizePlayableSession(fixtureId, hydrated);
    }

    if (response.ok && json?.playback) {
      const hydrated = await hydrateSportsPlaybackSessionEmbed(
        sessionFromLegacyPlayback(
          fixtureId,
          json.title || "Match",
          json.playback
        ),
        input.signal
      );
      return normalizePlayableSession(fixtureId, hydrated);
    }

    if (json?.success === false) {
      playFailureMessage =
        json.error || "This match is currently unavailable.";
      playFailureReason =
        json.code === "GEO_BLOCKED" ? "geo_blocked" : "validation_failed";
      allowWatchOptionsFallback =
        json.allowBroadcastFallback === true ||
        String(json.fallback || "").toLowerCase() === "broadcast" ||
        String(json.code || "").toUpperCase() === "TRY_BROADCAST_FALLBACK";
      if (!allowWatchOptionsFallback) {
        return unavailableSession(fixtureId, playFailureReason, playFailureMessage);
      }
    } else if (!response.ok) {
      playFailureMessage = "This match could not be started right now.";
      return unavailableSession(fixtureId, "validation_failed", playFailureMessage);
    } else {
      playFailureMessage = "This match is currently unavailable.";
      return unavailableSession(fixtureId, "no_broadcast", playFailureMessage);
    }
  } catch (error) {
    if (isSportsResolveAbortError(error) || input.signal?.aborted) {
      return unavailableSession(
        fixtureId,
        "validation_failed",
        "Playback request was cancelled."
      );
    }
    return unavailableSession(
      fixtureId,
      "validation_failed",
      "This match could not be started right now."
    );
  }

  if (!allowWatchOptionsFallback) {
    return unavailableSession(
      fixtureId,
      playFailureReason,
      playFailureMessage || "This match is currently unavailable."
    );
  }

  const options = await fetchSportsWatchOptions(fixtureId, {
    signal: input.signal,
    country: input.country,
    platform: input.platform,
  });
  if (input.signal?.aborted) {
    return unavailableSession(fixtureId, "validation_failed", "Playback request was cancelled.");
  }

  const broadcasts = (options.broadcasts || []).filter((b) => b?.id);
  const preferred =
    broadcasts.find((b) => {
      const status = String(b.status || "").toLowerCase();
      return status === "live" || status === "ready" || status === "available";
    }) || null;

  if (!preferred?.id) {
    return unavailableSession(
      fixtureId,
      playFailureReason,
      playFailureMessage || "This match is currently unavailable."
    );
  }

  const legacy = await resolveSportsBroadcastPlayback({
    broadcastId: preferred.id,
    platform: input.platform,
    country: input.country,
    signal: input.signal,
  });
  if (input.signal?.aborted) {
    return unavailableSession(fixtureId, "validation_failed", "Playback request was cancelled.");
  }
  if (!legacy.success || !legacy.playback) {
    return unavailableSession(
      fixtureId,
      legacy.code === "GEO_BLOCKED" ? "geo_blocked" : playFailureReason,
      legacy.error || playFailureMessage || "This match is currently unavailable."
    );
  }
  const hydrated = await hydrateSportsPlaybackSessionEmbed(
    sessionFromLegacyPlayback(fixtureId, preferred.title || "Match", legacy.playback),
    input.signal
  );
  return normalizePlayableSession(fixtureId, hydrated);
}

/** Legacy wrapper — prefer resolveSportsFixturePlaySession. */
export async function resolveSportsFixturePlayback(input: {
  fixtureId: string;
  platform: string;
  country: string;
  signal?: AbortSignal;
}): Promise<{
  success: boolean;
  playback?: SportsPlaybackResult;
  session?: SportsPlaybackSession;
  code?: string;
  error?: string;
  title?: string;
}> {
  const session = await resolveSportsFixturePlaySession(input);
  if (session.status === "unavailable") {
    return {
      success: false,
      session,
      code: session.reason.toUpperCase(),
      error: session.message || "This match is currently unavailable.",
    };
  }
  if (session.status === "external" || session.status === "subscription_required") {
    return {
      success: true,
      session,
      title: session.providerLabel,
      playback: {
        mode: "external",
        provider: session.providerLabel,
        deepLink: null,
        fallbackUrl: session.officialUrl || "",
        accessType:
          session.status === "subscription_required" ? "subscription" : "free",
      },
    };
  }
  const legacy =
    session.embedUrl
      ? ({
          mode: "embedded" as const,
          provider: session.providerLabel || "sports",
          embedUrl: session.embedUrl,
          expiresAt: session.expiresAt,
        } satisfies SportsPlaybackResult)
      : session.manifestUrl
        ? ({
            mode: "native" as const,
            manifestUrl: session.manifestUrl,
            expiresAt: session.expiresAt,
            headers: {},
            drm: null,
            heartbeatInterval: 30,
          } satisfies SportsPlaybackResult)
        : undefined;
  return {
    success: true,
    session,
    playback: legacy,
    title: session.title,
  };
}
