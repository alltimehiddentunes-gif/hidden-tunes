/**
 * Load a bounded Sports preference profile from existing user-state tables.
 * One batched load per home request. Failures return null (Phase 2B fallback).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { sportsCacheGet, sportsCacheInvalidate, sportsCacheKey, sportsCacheSet } from "../cache";
import { logSportsEvent } from "../telemetry";
import { buildPreferenceProfileFromSignals } from "./buildPreferenceProfile";
import { profileToData, profileFromData } from "./profileHelpers";
import type {
  SportsPreferenceProfile,
  SportsPreferenceProfileData,
} from "./types";
import { SPORTS_PERSONALIZATION_BOUNDS } from "./weights";

export async function loadSportsPreferenceProfile(input: {
  userId: string;
  languageCodes?: string[];
  now?: Date;
  bypassCache?: boolean;
}): Promise<SportsPreferenceProfile | null> {
  const cacheKey = sportsCacheKey([
    "sports-pref-profile",
    input.userId,
    (input.languageCodes || []).join(","),
  ]);

  if (!input.bypassCache) {
    const cached = sportsCacheGet<SportsPreferenceProfileData>(cacheKey);
    if (cached) return profileFromData(cached);
  }

  try {
    const lookback = new Date(
      (input.now ?? new Date()).getTime() -
        SPORTS_PERSONALIZATION_BOUNDS.maxLookbackDays * 24 * 60 * 60_000
    ).toISOString();

    const [
      followsRes,
      favoritesRes,
      prefsRes,
      remindersRes,
      historyRes,
      continueRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("sports_follows")
        .select("target_type, target_id")
        .eq("user_id", input.userId)
        .limit(SPORTS_PERSONALIZATION_BOUNDS.maxFollows),
      supabaseAdmin
        .from("sports_favorites")
        .select("target_type, target_id")
        .eq("user_id", input.userId)
        .limit(SPORTS_PERSONALIZATION_BOUNDS.maxFavorites),
      supabaseAdmin
        .from("sports_preferences")
        .select("preferred_country, preferred_sports, preferred_teams")
        .eq("user_id", input.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("sports_reminders")
        .select("fixture_id, status")
        .eq("user_id", input.userId)
        .neq("status", "cancelled")
        .limit(SPORTS_PERSONALIZATION_BOUNDS.maxReminders),
      supabaseAdmin
        .from("sports_watch_history")
        .select(
          "fixture_id, position_ms, duration_ms, completed, last_watched_at, broadcast_id, video_id"
        )
        .eq("user_id", input.userId)
        .gte("last_watched_at", lookback)
        .order("last_watched_at", { ascending: false })
        .limit(SPORTS_PERSONALIZATION_BOUNDS.maxHistoryRows),
      supabaseAdmin
        .from("sports_continue_watching")
        .select("broadcast_id, video_id, updated_at")
        .eq("user_id", input.userId)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

    // Soft-fail individual relation lookups — do not fail the whole profile.
    const follows = followsRes.error ? [] : followsRes.data || [];
    const favorites = favoritesRes.error ? [] : favoritesRes.data || [];
    const preferences = prefsRes.error ? null : prefsRes.data;
    const reminders = remindersRes.error ? [] : remindersRes.data || [];
    const history = historyRes.error ? [] : historyRes.data || [];
    const continueRows = continueRes.error ? [] : continueRes.data || [];

    if (followsRes.error) {
      logSportsEvent("pref_follows_failed", { error: followsRes.error.message });
    }

    // Enrich watch history with fixture sport/competition/participants (bounded).
    const fixtureIds = [
      ...new Set(
        history
          .map((h) => h.fixture_id)
          .filter(Boolean) as string[]
      ),
    ].slice(0, 150);

    const broadcastIds = [
      ...new Set(
        [
          ...history.map((h) => h.broadcast_id).filter(Boolean),
          ...continueRows.map((c) => c.broadcast_id).filter(Boolean),
        ] as string[]
      ),
    ].slice(0, 80);

    const fixtureMeta = new Map<
      string,
      {
        sport_id: string;
        competition_id: string | null;
        team_ids: string[];
        athlete_ids: string[];
      }
    >();
    const broadcastToFixture = new Map<string, string>();

    if (broadcastIds.length) {
      const { data: broadcasts } = await supabaseAdmin
        .from("sports_broadcasts")
        .select("id, fixture_id")
        .in("id", broadcastIds);
      for (const b of broadcasts || []) {
        if (b.fixture_id) broadcastToFixture.set(b.id, b.fixture_id);
      }
    }

    const continueFixtureIds = new Set<string>();
    for (const row of continueRows) {
      if (row.broadcast_id && broadcastToFixture.has(row.broadcast_id)) {
        continueFixtureIds.add(broadcastToFixture.get(row.broadcast_id)!);
      }
    }

    for (const h of history) {
      if (!h.fixture_id && h.broadcast_id) {
        const fx = broadcastToFixture.get(h.broadcast_id);
        if (fx) h.fixture_id = fx;
      }
    }

    const allFixtureIds = [
      ...new Set([
        ...fixtureIds,
        ...[...continueFixtureIds],
        ...history.map((h) => h.fixture_id).filter(Boolean) as string[],
      ]),
    ].slice(0, 150);

    if (allFixtureIds.length) {
      const { data: fixtures } = await supabaseAdmin
        .from("sports_fixtures")
        .select("id, sport_id, competition_id")
        .in("id", allFixtureIds);
      for (const f of fixtures || []) {
        fixtureMeta.set(f.id, {
          sport_id: f.sport_id,
          competition_id: f.competition_id,
          team_ids: [],
          athlete_ids: [],
        });
      }

      const { data: participants } = await supabaseAdmin
        .from("sports_fixture_participants")
        .select("fixture_id, team_id, athlete_id")
        .in("fixture_id", allFixtureIds);
      for (const p of participants || []) {
        const meta = fixtureMeta.get(p.fixture_id);
        if (!meta) continue;
        if (p.team_id) meta.team_ids.push(p.team_id);
        if (p.athlete_id) meta.athlete_ids.push(p.athlete_id);
      }
    }

    const enrichedHistory = history.map((h) => {
      const fx = h.fixture_id ? fixtureMeta.get(h.fixture_id) : null;
      return {
        fixture_id: h.fixture_id,
        position_ms: h.position_ms,
        duration_ms: h.duration_ms,
        completed: h.completed,
        last_watched_at: h.last_watched_at,
        sport_id: fx?.sport_id || null,
        competition_id: fx?.competition_id || null,
        team_ids: fx?.team_ids || [],
        athlete_ids: fx?.athlete_ids || [],
      };
    });

    const profile = buildPreferenceProfileFromSignals({
      userId: input.userId,
      follows,
      favorites,
      preferences,
      reminders,
      continueWatching: [...continueFixtureIds].map((fixture_id) => ({
        fixture_id,
      })),
      watchHistory: enrichedHistory,
      languageCodes: input.languageCodes,
      now: input.now,
    });

    sportsCacheSet(
      cacheKey,
      profileToData(profile),
      SPORTS_PERSONALIZATION_BOUNDS.profileCacheTtlMs
    );

    return profile;
  } catch (err) {
    logSportsEvent("pref_profile_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function invalidateSportsPreferenceProfileCache(userId: string) {
  sportsCacheInvalidate(`sports-pref-profile:${userId}`);
}
