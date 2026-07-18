/**
 * Bounded related-fixture query for fixture detail.
 * Order: same competition → same sport → nearby time → same country → participant overlap.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  batchLoadMatchCards,
  type FixtureRow,
} from "../home/fixtureCards";
import type { SportsMatchCard } from "../home/types";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "../constants";

const MAX_RELATED = 6;
const NEARBY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadRelatedFixtures(input: {
  fixtureId: string;
  sportId: string;
  competitionId: string | null;
  countryCode: string | null;
  startsAt: string;
  participantTeamIds?: string[];
}): Promise<SportsMatchCard[]> {
  const excludeId = input.fixtureId;
  const startsAtMs = Date.parse(input.startsAt);
  const windowStart = Number.isFinite(startsAtMs)
    ? new Date(startsAtMs - NEARBY_WINDOW_MS).toISOString()
    : null;
  const windowEnd = Number.isFinite(startsAtMs)
    ? new Date(startsAtMs + NEARBY_WINDOW_MS).toISOString()
    : null;

  const statusFilter = [
    ...SPORTS_PUBLIC_CATALOG_STATUSES,
    "completed",
    "postponed",
    "cancelled",
  ];

  const rankedIds: string[] = [];
  const seen = new Set<string>([excludeId]);

  const pushRows = (rows: { id: string }[] | null | undefined) => {
    for (const row of rows || []) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rankedIds.push(row.id);
      if (rankedIds.length >= MAX_RELATED * 3) break;
    }
  };

  if (input.competitionId) {
    let q = supabaseAdmin
      .from("sports_fixtures")
      .select("id, starts_at")
      .eq("competition_id", input.competitionId)
      .neq("id", excludeId)
      .eq("visible", true)
      .in("status", statusFilter)
      .order("starts_at", { ascending: true })
      .limit(12);
    if (windowStart && windowEnd) {
      q = q.gte("starts_at", windowStart).lte("starts_at", windowEnd);
    }
    const { data } = await q;
    pushRows(data);
  }

  if (rankedIds.length < MAX_RELATED) {
    let q = supabaseAdmin
      .from("sports_fixtures")
      .select("id, starts_at")
      .eq("sport_id", input.sportId)
      .neq("id", excludeId)
      .eq("visible", true)
      .in("status", statusFilter)
      .order("starts_at", { ascending: true })
      .limit(12);
    if (windowStart && windowEnd) {
      q = q.gte("starts_at", windowStart).lte("starts_at", windowEnd);
    }
    const { data } = await q;
    pushRows(data);
  }

  if (rankedIds.length < MAX_RELATED && input.countryCode) {
    const { data } = await supabaseAdmin
      .from("sports_fixtures")
      .select("id, starts_at")
      .eq("country_code", input.countryCode.toUpperCase())
      .neq("id", excludeId)
      .eq("visible", true)
      .in("status", statusFilter)
      .order("starts_at", { ascending: true })
      .limit(12);
    pushRows(data);
  }

  const ids = rankedIds.slice(0, MAX_RELATED);
  if (!ids.length) return [];

  const { data: rows, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select(
      "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata, availability_state, playable"
    )
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map((rows || []).map((r) => [r.id, r as FixtureRow]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as FixtureRow[];
  return batchLoadMatchCards(ordered);
}
