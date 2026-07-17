/**
 * Isolated Sports catalog API client.
 * Browse methods never request playback. Playback resolves only on Watch tap.
 */
import {
  isSportsClientEnabled,
  isSportsDevFixturesEnabled,
} from "../constants/sportsFlags";
import { buildDevSportsHome } from "../lib/sports/devFixtures";
import {
  getDevCompetition,
  getDevFixtureDetail,
  getDevSportHub,
  searchDevSports,
} from "../lib/sports/devFixtures/lookups";
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
export const SPORTS_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const SPORTS_DEFAULT_PAGE_LIMIT = 20;
type FetchOptions = {
  signal?: AbortSignal;
  country?: string;
  platform?: string;
  userId?: string | null;
  timeZone?: string | null;
  locale?: string | null;
};
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
  options: FetchOptions = {}
): Promise<SportsHomeResponse> {
  if (isSportsDevFixturesEnabled()) {
    return buildDevSportsHome(options.userId ? "personalized" : "anonymous");
  }
  const country = options.country || "ZZ";
  const platform = options.platform || "ios";
  const tz = options.timeZone || undefined;
  const locale = options.locale || undefined;
  const qs = new URLSearchParams();
  if (tz) qs.set("tz", tz);
  if (locale) qs.set("locale", locale);
  const path = `/api/sports/home${qs.toString() ? `?${qs}` : ""}`;
  return dedupe(
    `home:${country}:${platform}:${options.userId || "anon"}:${tz || ""}`,
    () =>
      sportsFetch<SportsHomeResponse>(path, {
        signal: options.signal,
        country,
        platform,
        userId: options.userId,
      })
  );
}
export async function fetchSportsFixtures(
  options: FetchOptions & {
    page?: number;
    limit?: number;
    sportSlug?: string;
    competitionId?: string;
    status?: string;
    date?: string;
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
  if (options.sportSlug) qs.set("sport", options.sportSlug);
  if (options.competitionId) qs.set("competitionId", options.competitionId);
  if (options.status) qs.set("status", options.status);
  if (options.date) qs.set("date", options.date);
  return sportsFetch(`/api/sports/fixtures?${qs}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
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
  return sportsFetch(`/api/sports/fixtures/${encodeURIComponent(fixtureId)}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
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
  if (isSportsDevFixturesEnabled()) {
    return {
      success: true,
      enabled: true,
      ...getDevSportHub(sportSlug),
    };
  }
  // Backend sport hub may be assembled from fixtures + competitions filters.
  const [sports, fixtures, competitions] = await Promise.all([
    fetchSportsList(options),
    fetchSportsFixtures({ ...options, sportSlug, limit: 40 }),
    fetchSportsCompetitions({ ...options, sportSlug, limit: 20 }),
  ]);
  const sport =
    (sports.items || []).find((s) => s.slug === sportSlug) ||
    ({
      id: sportSlug,
      slug: sportSlug,
      name: sportSlug.replace(/-/g, " "),
    } as SportsWorldCard);
  const live = (fixtures.items || []).filter((f) => f.status?.live);
  const soon = (fixtures.items || []).filter(
    (f) => String(f.status?.code || "") === "starting_soon"
  );
  const schedule = fixtures.items || [];
  return {
    success: true,
    enabled: true,
    sport,
    sections: [
      {
        id: "live_now",
        type: "live",
        title: "Live Now",
        rank: 10,
        items: live,
      },
      {
        id: "starting_soon",
        type: "fixtures",
        title: "Starting Soon",
        rank: 20,
        items: soon,
      },
      {
        id: "popular_competitions",
        type: "competitions",
        title: "Popular Competitions",
        rank: 60,
        items: competitions.items || [],
      },
      {
        id: "todays_schedule",
        type: "fixtures",
        title: "Today's Schedule",
        rank: 90,
        items: schedule,
      },
    ],
  };
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
  const qs = new URLSearchParams({
    q,
    page: String(page),
    limit: String(limit),
  });
  return sportsFetch(`/api/sports/search?${qs}`, {
    signal: options.signal,
    country: options.country || "ZZ",
    platform: options.platform || "ios",
  });
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
    `video-play:${input.videoId}:${input.platform}:${input.country}`,
    async () => {
      const response = await fetch(
        `${SPORTS_CATALOG_BASE_URL}/api/sports/videos/${encodeURIComponent(input.videoId)}/play`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ht-platform": input.platform,
          },
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
    `play:${input.broadcastId}:${input.platform}:${input.country}`,
    async () => {
      const response = await fetch(
        `${SPORTS_CATALOG_BASE_URL}/api/sports/broadcasts/${encodeURIComponent(input.broadcastId)}/play`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ht-platform": input.platform,
          },
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
/** Resolve fixture playback into the provider-neutral session DTO. */
export async function resolveSportsFixturePlaySession(input: {
  fixtureId: string;
  platform: string;
  country: string;
  signal?: AbortSignal;
}): Promise<SportsPlaybackSession> {
  const fixtureId = input.fixtureId;

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

    // Dev-only controlled HTML surface — clearly labeled, never a fake live stream.
    const fixtureHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sports Dev Fixture</title>
<style>body{margin:0;background:#0A1220;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}h1{font-size:18px;margin:0 0 8px}p{opacity:.75;font-size:14px;line-height:1.4}</style></head>
<body><div><h1>Development fixture player</h1><p>${title.replace(/[<>&]/g, "")}</p><p>Not a live provider stream. Used only to validate tap-to-watch in __DEV__.</p></div></body></html>`;

    return {
      status: "ready",
      fixtureId,
      playbackKind: "webview",
      playbackToken: `dev-fixture-${fixtureId}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      title,
      providerLabel: "Dev fixture",
      fixtureHtml,
      embedUrl: null,
    };
  }

  if (!isSportsClientEnabled("sports_enabled")) {
    return unavailableSession(fixtureId, "provider_disabled", "Sports is disabled.");
  }

  // Prefer dedicated fixture play endpoint; fall back to watch-options → broadcast.
  try {
    const response = await fetch(
      `${SPORTS_CATALOG_BASE_URL}/api/sports/fixtures/${encodeURIComponent(fixtureId)}/play`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ht-platform": input.platform,
          "x-ht-storefront-country": input.country,
        },
        body: JSON.stringify({
          platform: input.platform,
          country: input.country,
        }),
        signal: input.signal,
        cache: "no-store",
      }
    );
    if (response.ok) {
      const json = (await response.json()) as {
        success?: boolean;
        session?: SportsPlaybackSession;
        playback?: SportsPlaybackResult;
        title?: string;
        error?: string;
        code?: string;
      };
      if (json.session) return json.session;
      if (json.playback) {
        return sessionFromLegacyPlayback(
          fixtureId,
          json.title || "Match",
          json.playback
        );
      }
      if (json.success === false) {
        return unavailableSession(
          fixtureId,
          json.code === "GEO_BLOCKED" ? "geo_blocked" : "validation_failed",
          json.error || "This match is currently unavailable."
        );
      }
    }
  } catch {
    // Fall through to watch-options path.
  }

  const options = await fetchSportsWatchOptions(fixtureId, {
    signal: input.signal,
    country: input.country,
    platform: input.platform,
  });
  const broadcast = options.broadcasts?.[0];
  if (!broadcast?.id) {
    return unavailableSession(fixtureId, "no_broadcast", "This match is currently unavailable.");
  }
  const legacy = await resolveSportsBroadcastPlayback({
    broadcastId: broadcast.id,
    platform: input.platform,
    country: input.country,
    signal: input.signal,
  });
  if (!legacy.success || !legacy.playback) {
    return unavailableSession(
      fixtureId,
      legacy.code === "GEO_BLOCKED" ? "geo_blocked" : "validation_failed",
      legacy.error || "This match is currently unavailable."
    );
  }
  return sessionFromLegacyPlayback(fixtureId, broadcast.title || "Match", legacy.playback);
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
