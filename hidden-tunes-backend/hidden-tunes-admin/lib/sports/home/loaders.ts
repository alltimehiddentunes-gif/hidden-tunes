/**
 * Isolated Sports home section loaders.
 * Each loader is independently failable; no playback resolution.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { SPORTS_PUBLIC_CATALOG_STATUSES } from "../constants";
import type { SectionLoaderResult } from "./assemble";
import { encodeSportsCursor } from "./assemble";
import {
  batchLoadMatchCards,
  COMPETITION_TYPE_RANK,
  featuredPriority,
  isFeaturedFixture,
  type FixtureRow,
} from "./fixtureCards";
import type { SportsHomeLimits } from "./limits";
import { getCalendarDayBounds } from "./timezone";
import type {
  SportsCompetitionCard,
  SportsCountryCard,
  SportsVideoCard,
  SportsWorldCard,
} from "./types";

export type HomeLoaderContext = {
  country: string;
  platform: string;
  userId?: string | null;
  timeZone?: string | null;
  limits: SportsHomeLimits;
  now?: Date;
  /** When false, Trending is omitted (no reliable signals). */
  trendingSignalsAvailable?: boolean;
};

function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Sports home section timed out after ${ms}ms`)),
      ms
    );
    fn()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function loadFixtures(query: {
  statusIn?: string[];
  startsFrom?: string;
  startsTo?: string;
  endsFrom?: string;
  orderAsc?: boolean;
  limit: number;
  featuredOnly?: boolean;
}): Promise<FixtureRow[]> {
  let q = supabaseAdmin
    .from("sports_fixtures")
    .select(
      "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata"
    )
    .limit(query.featuredOnly ? Math.min(100, query.limit * 5) : query.limit);

  if (query.statusIn?.length) q = q.in("status", query.statusIn);
  if (query.startsFrom) q = q.gte("starts_at", query.startsFrom);
  if (query.startsTo) q = q.lte("starts_at", query.startsTo);
  if (query.endsFrom) q = q.gte("ends_at", query.endsFrom);

  q = q.order("starts_at", { ascending: query.orderAsc ?? true });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data || []) as FixtureRow[];
  if (query.featuredOnly) {
    rows = rows
      .filter(isFeaturedFixture)
      .sort((a, b) => featuredPriority(a) - featuredPriority(b))
      .slice(0, query.limit);
  }
  return rows;
}

export async function loadLiveNow(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const fixtures = await loadFixtures({
      statusIn: ["live"],
      limit: ctx.limits.liveNow,
      orderAsc: true,
    });
    const cards = await batchLoadMatchCards(fixtures, {
      now: ctx.now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    // Live Now requires a playable broadcast.
    const items = cards
      .filter((c) => c.watchability.playable && c.status.live)
      .sort((a, b) => {
        const aFeatured = a.badges?.includes("featured") ? 0 : 1;
        const bFeatured = b.badges?.includes("featured") ? 0 : 1;
        if (aFeatured !== bFeatured) return aFeatured - bFeatured;
        const aStart = a.timing.startsAt || "";
        const bStart = b.timing.startsAt || "";
        return aStart.localeCompare(bStart);
      });
    return {
      id: "live_now",
      type: "live",
      items,
      nextCursor:
        items.length >= ctx.limits.liveNow
          ? encodeSportsCursor(ctx.limits.liveNow)
          : null,
    };
  });
}

export async function loadStartingSoon(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const now = ctx.now ?? new Date();
    const soon = new Date(
      now.getTime() + ctx.limits.startingSoonWindowMs
    ).toISOString();
    const fixtures = await loadFixtures({
      statusIn: ["scheduled", "verified"],
      startsFrom: now.toISOString(),
      startsTo: soon,
      limit: ctx.limits.startingSoon,
      orderAsc: true,
    });
    const cards = await batchLoadMatchCards(fixtures, {
      now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    // Never claim playable for starting soon unless genuinely live (should not).
    const items = cards.map((c) => ({
      ...c,
      watchability: {
        ...c.watchability,
        playable: false,
        state:
          c.watchability.state === "watch"
            ? ("starting_soon" as const)
            : c.watchability.state,
      },
    }));
    return {
      id: "starting_soon",
      type: "fixtures",
      items,
      nextCursor:
        items.length >= ctx.limits.startingSoon
          ? encodeSportsCursor(ctx.limits.startingSoon)
          : null,
    };
  });
}

export async function loadFeatured(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const now = ctx.now ?? new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();
    const fixtures = await loadFixtures({
      statusIn: ["scheduled", "verified", "live"],
      startsFrom: now.toISOString(),
      startsTo: horizon,
      limit: ctx.limits.featured,
      featuredOnly: true,
      orderAsc: true,
    });
    const items = await batchLoadMatchCards(fixtures, {
      now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    return { id: "featured", type: "fixtures", items };
  });
}

export async function loadBecauseYouFollow(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    if (!ctx.userId) {
      return { id: "because_you_follow", type: "fixtures", items: [] };
    }

    const { data: follows, error } = await supabaseAdmin
      .from("sports_follows")
      .select("target_type, target_id")
      .eq("user_id", ctx.userId)
      .limit(100);
    if (error) throw new Error(error.message);
    if (!follows?.length) {
      return { id: "because_you_follow", type: "fixtures", items: [] };
    }

    const teamIds = follows
      .filter((f) => f.target_type === "team")
      .map((f) => f.target_id);
    const athleteIds = follows
      .filter((f) => f.target_type === "athlete")
      .map((f) => f.target_id);
    const competitionIds = follows
      .filter((f) => f.target_type === "competition")
      .map((f) => f.target_id);
    const sportIds = follows
      .filter((f) => f.target_type === "sport")
      .map((f) => f.target_id);

    const fixtureIdSet = new Set<string>();

    if (teamIds.length || athleteIds.length) {
      let pq = supabaseAdmin
        .from("sports_fixture_participants")
        .select("fixture_id")
        .limit(80);
      if (teamIds.length && athleteIds.length) {
        pq = pq.or(
          `team_id.in.(${teamIds.join(",")}),athlete_id.in.(${athleteIds.join(",")})`
        );
      } else if (teamIds.length) {
        pq = pq.in("team_id", teamIds);
      } else {
        pq = pq.in("athlete_id", athleteIds);
      }
      const { data, error: pErr } = await pq;
      if (pErr) throw new Error(pErr.message);
      for (const row of data || []) fixtureIdSet.add(row.fixture_id);
    }

    const now = ctx.now ?? new Date();
    const horizon = new Date(
      now.getTime() + 14 * 24 * 60 * 60_000
    ).toISOString();

    let fixtureQuery = supabaseAdmin
      .from("sports_fixtures")
      .select(
        "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata"
      )
      .in("status", ["scheduled", "verified", "live"])
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizon)
      .order("starts_at", { ascending: true })
      .limit(ctx.limits.becauseYouFollow);

    const orParts: string[] = [];
    if (fixtureIdSet.size) {
      orParts.push(`id.in.(${[...fixtureIdSet].join(",")})`);
    }
    if (competitionIds.length) {
      orParts.push(`competition_id.in.(${competitionIds.join(",")})`);
    }
    if (sportIds.length) {
      orParts.push(`sport_id.in.(${sportIds.join(",")})`);
    }
    if (!orParts.length) {
      return { id: "because_you_follow", type: "fixtures", items: [] };
    }
    fixtureQuery = fixtureQuery.or(orParts.join(","));

    const { data: fixtures, error: fErr } = await fixtureQuery;
    if (fErr) throw new Error(fErr.message);

    const items = await batchLoadMatchCards((fixtures || []) as FixtureRow[], {
      now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    return { id: "because_you_follow", type: "fixtures", items };
  });
}

export async function loadContinueWatching(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    if (!ctx.userId) {
      return { id: "continue_watching", type: "fixtures", items: [] };
    }

    const { data: rows, error } = await supabaseAdmin
      .from("sports_continue_watching")
      .select("broadcast_id, video_id, channel_id, position_ms, duration_ms, updated_at")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(ctx.limits.continueWatching);
    if (error) throw new Error(error.message);
    if (!rows?.length) {
      return { id: "continue_watching", type: "fixtures", items: [] };
    }

    const broadcastIds = rows
      .map((r) => r.broadcast_id)
      .filter(Boolean) as string[];
    if (!broadcastIds.length) {
      return { id: "continue_watching", type: "fixtures", items: [] };
    }

    const { data: broadcasts, error: bErr } = await supabaseAdmin
      .from("sports_broadcasts")
      .select("id, fixture_id, availability_status, starts_at, ends_at")
      .in("id", broadcastIds)
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null);
    if (bErr) throw new Error(bErr.message);

    const fixtureIds = [
      ...new Set(
        (broadcasts || [])
          .map((b) => b.fixture_id)
          .filter(Boolean) as string[]
      ),
    ];
    if (!fixtureIds.length) {
      return { id: "continue_watching", type: "fixtures", items: [] };
    }

    const { data: fixtures, error: fErr } = await supabaseAdmin
      .from("sports_fixtures")
      .select(
        "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata"
      )
      .in("id", fixtureIds)
      .limit(ctx.limits.continueWatching);
    if (fErr) throw new Error(fErr.message);

    // Only meaningful resumable / still-live.
    const liveOrResumable = new Set(
      (broadcasts || [])
        .filter(
          (b) =>
            b.availability_status === "live" ||
            b.availability_status === "degraded" ||
            b.availability_status === "verified"
        )
        .map((b) => b.fixture_id)
        .filter(Boolean) as string[]
    );

    const filtered = ((fixtures || []) as FixtureRow[]).filter((f) =>
      liveOrResumable.has(f.id)
    );

    const items = await batchLoadMatchCards(filtered, {
      now: ctx.now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    return { id: "continue_watching", type: "fixtures", items };
  });
}

export async function loadPopularCompetitions(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const { data, error } = await supabaseAdmin
      .from("sports_competitions")
      .select(
        "id, name, slug, short_name, sport_id, country_code, competition_type, artwork_url, status"
      )
      .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES, "active"])
      .order("name", { ascending: true })
      .limit(80);
    if (error) throw new Error(error.message);

    const sportIds = [
      ...new Set((data || []).map((c) => c.sport_id).filter(Boolean)),
    ];
    const sportsMap = new Map<string, string>();
    if (sportIds.length) {
      const { data: sports } = await supabaseAdmin
        .from("sports")
        .select("id, slug")
        .in("id", sportIds);
      for (const s of sports || []) sportsMap.set(s.id, s.slug);
    }

    const ranked = (data || []).map((c) => {
      const card: SportsCompetitionCard & { rank: number } = {
        id: c.id,
        slug: c.slug,
        name: c.name,
        shortName: c.short_name,
        sportSlug: sportsMap.get(c.sport_id) || null,
        countryCode: c.country_code,
        logoUrl: c.artwork_url,
        competitionType: c.competition_type,
        rank:
          COMPETITION_TYPE_RANK[String(c.competition_type || "other")] ?? 120,
      };
      return card;
    });
    ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    const items: SportsCompetitionCard[] = ranked
      .slice(0, ctx.limits.popularCompetitions)
      .map((card) => ({
        id: card.id,
        slug: card.slug,
        name: card.name,
        shortName: card.shortName,
        sportSlug: card.sportSlug,
        countryCode: card.countryCode,
        logoUrl: card.logoUrl,
        competitionType: card.competitionType,
      }));

    return {
      id: "popular_competitions",
      type: "competitions",
      items,
      nextCursor:
        items.length >= ctx.limits.popularCompetitions
          ? encodeSportsCursor(ctx.limits.popularCompetitions)
          : null,
    };
  });
}

export async function loadBrowseSports(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const { data, error } = await supabaseAdmin
      .from("sports")
      .select("id, slug, name, artwork_url, sort_order, status")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(ctx.limits.browseSports);
    if (error) throw new Error(error.message);

    const items: SportsWorldCard[] = (data || []).map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      icon: s.artwork_url,
      artworkUrl: s.artwork_url,
      sortOrder: s.sort_order,
    }));

    return {
      id: "browse_sports",
      type: "sports",
      items,
      nextCursor:
        items.length >= ctx.limits.browseSports
          ? encodeSportsCursor(ctx.limits.browseSports)
          : null,
    };
  });
}

export async function loadBrowseCountries(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const codes = new Set<string>();

    const [compRes, fixRes, teamRes] = await Promise.all([
      supabaseAdmin
        .from("sports_competitions")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(200),
      supabaseAdmin
        .from("sports_fixtures")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(200),
      supabaseAdmin
        .from("sports_teams")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(200),
    ]);

    for (const row of [
      ...(compRes.data || []),
      ...(fixRes.data || []),
      ...(teamRes.data || []),
    ]) {
      if (row.country_code) codes.add(String(row.country_code).toUpperCase());
    }

    if (!codes.size) {
      return { id: "browse_countries", type: "countries", items: [] };
    }

    const { data, error } = await supabaseAdmin
      .from("sports_countries")
      .select("code, name, region")
      .in("code", [...codes])
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(ctx.limits.browseCountries);
    if (error) throw new Error(error.message);

    const items: SportsCountryCard[] = (data || []).map((c) => ({
      code: c.code,
      name: c.name,
      region: c.region,
      artworkUrl: null,
    }));

    return {
      id: "browse_countries",
      type: "countries",
      items,
      nextCursor:
        items.length >= ctx.limits.browseCountries
          ? encodeSportsCursor(ctx.limits.browseCountries)
          : null,
    };
  });
}

export async function loadTodaySchedule(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const now = ctx.now ?? new Date();
    const bounds = getCalendarDayBounds(now, ctx.timeZone);
    const fixtures = await loadFixtures({
      startsFrom: bounds.startIso,
      startsTo: bounds.endIso,
      limit: ctx.limits.todaysSchedule,
      orderAsc: true,
      statusIn: [
        "scheduled",
        "verified",
        "live",
        "completed",
        "postponed",
        "cancelled",
      ],
    });
    const items = await batchLoadMatchCards(fixtures, {
      now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    return {
      id: "todays_schedule",
      type: "fixtures",
      items,
      subtitle: `${bounds.localDate} (${bounds.timeZone})`,
      nextCursor:
        items.length >= ctx.limits.todaysSchedule
          ? encodeSportsCursor(ctx.limits.todaysSchedule)
          : null,
    };
  });
}

export async function loadTrending(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    // No reliable trending signal store yet — omit rather than invent.
    if (!ctx.trendingSignalsAvailable) {
      return { id: "trending", type: "fixtures", items: [] };
    }
    // Reserved for future signal-backed trending.
    return { id: "trending", type: "fixtures", items: [] };
  });
}

export async function loadRecentlyFinished(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const now = ctx.now ?? new Date();
    const since = new Date(
      now.getTime() - ctx.limits.recentlyFinishedWindowMs
    ).toISOString();
    const fixtures = await loadFixtures({
      statusIn: ["completed", "expired"],
      endsFrom: since,
      limit: ctx.limits.recentlyFinished,
      orderAsc: false,
    });
    // Fallback: completed fixtures by starts_at if ends_at sparse
    let rows = fixtures;
    if (!rows.length) {
      const { data, error } = await supabaseAdmin
        .from("sports_fixtures")
        .select(
          "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata"
        )
        .in("status", ["completed", "expired"])
        .gte("starts_at", since)
        .order("starts_at", { ascending: false })
        .limit(ctx.limits.recentlyFinished);
      if (error) throw new Error(error.message);
      rows = (data || []) as FixtureRow[];
    }

    const cards = await batchLoadMatchCards(rows, {
      now,
      startingSoonWindowMs: ctx.limits.startingSoonWindowMs,
    });
    // Never show Watch when live playback has expired.
    const items = cards.map((c) => ({
      ...c,
      watchability: {
        ...c.watchability,
        playable: false,
        state:
          c.watchability.state === "watch"
            ? c.status.code === "replay_available"
              ? ("replay" as const)
              : c.status.code === "highlights_available"
                ? ("highlights" as const)
                : ("unavailable" as const)
            : c.watchability.state,
      },
    }));
    return { id: "recently_finished", type: "fixtures", items };
  });
}

export async function loadHighlights(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const { data, error } = await supabaseAdmin
      .from("sports_videos")
      .select("id, title, status, artwork_url, video_type, fixture_id, published_at")
      .eq("video_type", "highlights")
      .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .order("published_at", { ascending: false })
      .limit(ctx.limits.highlights);
    if (error) throw new Error(error.message);

    const items: SportsVideoCard[] = (data || []).map((v) => ({
      id: v.id,
      title: v.title,
      videoType: v.video_type,
      status: v.status,
      artworkUrl: v.artwork_url,
      fixtureId: v.fixture_id,
      publishedAt: v.published_at,
    }));
    return { id: "highlights", type: "videos", items };
  });
}

export async function loadReplays(
  ctx: HomeLoaderContext
): Promise<SectionLoaderResult> {
  return withTimeout(ctx.limits.sectionTimeoutMs, async () => {
    const { data, error } = await supabaseAdmin
      .from("sports_videos")
      .select("id, title, status, artwork_url, video_type, fixture_id, published_at")
      .eq("video_type", "replay")
      .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .order("published_at", { ascending: false })
      .limit(ctx.limits.replays);
    if (error) throw new Error(error.message);

    const items: SportsVideoCard[] = (data || []).map((v) => ({
      id: v.id,
      title: v.title,
      videoType: v.video_type,
      status: v.status,
      artworkUrl: v.artwork_url,
      fixtureId: v.fixture_id,
      publishedAt: v.published_at,
    }));
    return { id: "replays", type: "videos", items };
  });
}
