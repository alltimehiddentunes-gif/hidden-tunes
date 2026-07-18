import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { SPORTS_PUBLIC_CATALOG_STATUSES } from "../constants";
import { toSportsBrowseItem } from "../catalog";
import type { SportsBrowseItem, SportsPagination } from "../types";

export type SportsSearchResultGroup = {
  type: string;
  items: SportsBrowseItem[];
};

export type SportsSearchResponse = {
  query: string;
  groups: SportsSearchResultGroup[];
  pagination: SportsPagination;
};

/**
 * Metadata-first Sports search.
 * Never invents a Watch action without an authorized source path.
 */
export async function searchSportsCatalog(input: {
  q: string;
  country: string;
  platform: string;
  page: number;
  limit: number;
}): Promise<SportsSearchResponse> {
  const term = String(input.q || "").trim();
  const from = (input.page - 1) * input.limit;
  const to = from + input.limit;

  if (!term) {
    return {
      query: term,
      groups: [],
      pagination: { page: input.page, limit: input.limit, hasMore: false },
    };
  }

  const like = `%${term.replace(/%/g, "")}%`;
  const groups: SportsSearchResultGroup[] = [];
  const seen = new Set<string>();

  const pushUnique = (type: string, items: SportsBrowseItem[]) => {
    const unique = items.filter((item) => {
      const key = `${type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) groups.push({ type, items: unique });
  };

  const [fixtures, teams, competitions, channels, videos, athletes] =
    await Promise.all([
      supabaseAdmin
        .from("sports_fixtures")
        .select("id, title, starts_at, ends_at, status")
        .ilike("title", like)
        .in("status", [
          ...SPORTS_PUBLIC_CATALOG_STATUSES,
          "completed",
          "geo_blocked",
        ])
        .order("starts_at", { ascending: false })
        .range(from, to),
      supabaseAdmin
        .from("sports_teams")
        .select("id, name, short_name, status, artwork_url")
        .or(`name.ilike.${like},short_name.ilike.${like}`)
        .eq("status", "active")
        .order("name", { ascending: true })
        .range(from, to),
      supabaseAdmin
        .from("sports_competitions")
        .select("id, name, short_name, status, artwork_url")
        .or(`name.ilike.${like},short_name.ilike.${like}`)
        .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES, "active"])
        .order("name", { ascending: true })
        .range(from, to),
      supabaseAdmin
        .from("sports_channels")
        .select("id, name, status, artwork_url")
        .ilike("name", like)
        .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("name", { ascending: true })
        .range(from, to),
      supabaseAdmin
        .from("sports_videos")
        .select("id, title, status, artwork_url, video_type")
        .ilike("title", like)
        .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("published_at", { ascending: false })
        .range(from, to),
      supabaseAdmin
        .from("sports_athletes")
        .select("id, name, status, artwork_url")
        .ilike("name", like)
        .eq("status", "active")
        .order("name", { ascending: true })
        .range(from, to),
    ]);

  pushUnique(
    "fixtures",
    (fixtures.data || []).map((row) =>
      toSportsBrowseItem({
        ...row,
        // No fake Watch — fixtures without authorized source stay metadata/reminder.
        watch_action: "none",
        watch_label: "Match details",
        region_message: null,
      })
    )
  );
  pushUnique(
    "teams",
    (teams.data || []).map((row) =>
      toSportsBrowseItem({
        id: row.id,
        name: row.name,
        status: row.status,
        artwork_url: row.artwork_url,
        watch_action: "none",
      })
    )
  );
  pushUnique(
    "competitions",
    (competitions.data || []).map((row) =>
      toSportsBrowseItem({
        id: row.id,
        name: row.name,
        status: row.status,
        artwork_url: row.artwork_url,
        watch_action: "none",
      })
    )
  );
  pushUnique(
    "channels",
    (channels.data || []).map((row) =>
      toSportsBrowseItem({
        id: row.id,
        name: row.name,
        status: row.status,
        artwork_url: row.artwork_url,
        watch_action: "none",
        watch_label: "Resolve on tap",
      })
    )
  );
  pushUnique(
    "videos",
    (videos.data || []).map((row) =>
      toSportsBrowseItem({
        id: row.id,
        title: row.title,
        status: row.status,
        artwork_url: row.artwork_url,
        subtitle: row.video_type,
        watch_action: "none",
        watch_label: "Resolve on tap",
      })
    )
  );
  pushUnique(
    "athletes",
    (athletes.data || []).map((row) =>
      toSportsBrowseItem({
        id: row.id,
        name: row.name,
        status: row.status,
        artwork_url: row.artwork_url,
        watch_action: "none",
      })
    )
  );

  const totalReturned = groups.reduce((n, g) => n + g.items.length, 0);

  return {
    query: term,
    groups,
    pagination: {
      page: input.page,
      limit: input.limit,
      hasMore: totalReturned >= input.limit,
    },
  };
}
