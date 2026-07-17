import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toSportsBrowseItem } from "@/lib/sports/catalog";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const { page, limit, from, to } = parseSportsPageLimit(request);
    const { data, error } = await supabaseAdmin
      .from("sports_broadcasts")
      .select(
        "id, title, starts_at, ends_at, availability_status, access_type, broadcast_type"
      )
      .eq("availability_status", "live")
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .order("starts_at", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const pageLimit = to - from;
    const hasMore = rows.length > pageLimit;
    const items = (hasMore ? rows.slice(0, pageLimit) : rows).map((row) =>
      toSportsBrowseItem({
        ...row,
        watch_action: "none",
        watch_label: "Resolve on tap",
      })
    );
    return jsonSportsOk({
      enabled: true,
      items,
      pagination: { page, limit, hasMore },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list live Sports broadcasts.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
