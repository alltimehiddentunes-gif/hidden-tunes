import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listPaginated } from "@/lib/sports/catalog";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_LIST_SELECT =
  "id, title, slug, description, sport_id, competition_id, fixture_id, video_type, artwork_url, duration_seconds, status, published_at";

export async function GET(request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const videoType = String(url.searchParams.get("videoType") || "").trim();
    const { page, limit, from, to } = parseSportsPageLimit(request);

    if (videoType) {
      let query = supabaseAdmin
        .from("sports_videos")
        .select(VIDEO_LIST_SELECT)
        .eq("video_type", videoType)
        .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES])
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("published_at", { ascending: false })
        .range(from, to);

      if (q) {
        query = query.ilike("title", `%${q.replace(/%/g, "")}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data || [];
      const pageLimit = to - from;
      const hasMore = rows.length > pageLimit;
      const items = hasMore ? rows.slice(0, pageLimit) : rows;

      return jsonSportsOk({
        enabled: true,
        items,
        pagination: { page, limit, hasMore },
      });
    }

    const { items, pagination } = await listPaginated(
      "sports_videos",
      VIDEO_LIST_SELECT,
      {
        statusIn: [...SPORTS_PUBLIC_CATALOG_STATUSES],
        publishedOnly: true,
        q: q || undefined,
        qColumns: q ? ["title", "slug"] : undefined,
        from,
        to,
        order: { column: "published_at", ascending: false },
      }
    );

    return jsonSportsOk({
      enabled: true,
      items,
      pagination: { ...pagination, page, limit },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list videos.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
