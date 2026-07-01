import { NextResponse } from "next/server";

import { toPodcastPublicCategory } from "@/lib/podcastCatalog";
import { jsonPodcastError } from "@/lib/podcastPublicApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("podcast_categories")
    .select("id, name, slug, description, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return jsonPodcastError(
      "Failed to load podcast categories.",
      500,
      error.message
    );
  }

  const categories = ((data || []) as Record<string, unknown>[]).map((row) =>
    toPodcastPublicCategory(row)
  );

  return NextResponse.json({
    success: true,
    categories,
  });
}
