/**
 * Filtered Sports fixtures browse — metadata only.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { SPORTS_PUBLIC_CATALOG_STATUSES } from "../constants";
import { decodeSportsCursor, encodeSportsCursor } from "../home/assemble";
import {
  batchLoadMatchCards,
  type FixtureRow,
} from "../home/fixtureCards";
import type { SportsMatchCard } from "../home/types";

export type ListSportsFixturesInput = {
  sportId?: string | null;
  sportSlug?: string | null;
  competitionId?: string | null;
  country?: string | null;
  date?: string | null;
  status?: string | null;
  live?: boolean;
  upcoming?: boolean;
  finished?: boolean;
  cursor?: string | null;
  limit?: number;
  now?: Date;
};

export async function listSportsFixturesFiltered(
  input: ListSportsFixturesInput
): Promise<{
  items: SportsMatchCard[];
  nextCursor: string | null;
  limit: number;
}> {
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const offset = decodeSportsCursor(input.cursor);
  const now = input.now ?? new Date();

  let sportId = input.sportId || null;
  if (!sportId && input.sportSlug) {
    const { data } = await supabaseAdmin
      .from("sports")
      .select("id")
      .eq("slug", input.sportSlug)
      .maybeSingle();
    sportId = data?.id || null;
  }

  let query = supabaseAdmin
    .from("sports_fixtures")
    .select(
      "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata"
    )
    .order("starts_at", { ascending: true })
    .range(offset, offset + limit);

  if (sportId) query = query.eq("sport_id", sportId);
  if (input.competitionId) {
    query = query.eq("competition_id", input.competitionId);
  }
  if (input.country) {
    query = query.eq("country_code", input.country.toUpperCase());
  }

  if (input.live) {
    query = query.eq("status", "live");
  } else if (input.upcoming) {
    query = query
      .in("status", ["scheduled", "verified"])
      .gte("starts_at", now.toISOString());
  } else if (input.finished) {
    query = query.in("status", ["completed", "expired"]);
  } else if (input.status) {
    query = query.eq("status", input.status);
  } else {
    query = query.in("status", [
      ...SPORTS_PUBLIC_CATALOG_STATUSES,
      "completed",
      "postponed",
      "cancelled",
    ]);
  }

  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    const start = `${input.date}T00:00:00.000Z`;
    const end = `${input.date}T23:59:59.999Z`;
    query = query.gte("starts_at", start).lte("starts_at", end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []) as FixtureRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await batchLoadMatchCards(page, { now });

  return {
    items,
    nextCursor: hasMore ? encodeSportsCursor(offset + limit) : null,
    limit,
  };
}
