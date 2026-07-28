import { NextRequest, NextResponse } from "next/server";

import { applyPublicRadioFilters, cleanRadioText, jsonRadioError } from "@/lib/radioPublicCatalog";
import { parseMatureRadioAccess } from "@/lib/radioMature/platformPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountryFacet = {
  id: string;
  name: string;
  code: string | null;
  count: number;
};

/**
 * Prefer the aggregated public view so country counts are complete
 * (not a 5000-row sample bias that under-reports Africa).
 */
async function loadFromPublicView(): Promise<CountryFacet[] | null> {
  const { data, error } = await supabaseAdmin
    .from("radio_public_countries")
    .select("id, name, code, count")
    .order("count", { ascending: false })
    .limit(250);
  if (error || !data) return null;
  return (data as Array<Record<string, unknown>>)
    .map((row) => {
      const code = cleanRadioText(row.code, 8).toUpperCase() || null;
      const name = cleanRadioText(row.name, 120) || code || "";
      const id = cleanRadioText(row.id, 40) || code || name.toLowerCase();
      const count = Math.max(0, Math.floor(Number(row.count) || 0));
      if (!id || count <= 0) return null;
      return { id, name, code, count };
    })
    .filter((row): row is CountryFacet => Boolean(row));
}

async function loadFromSample(canAccessMature: boolean): Promise<CountryFacet[]> {
  const query = applyPublicRadioFilters(
    supabaseAdmin
      .from("radio_stations")
      .select("country, country_code")
      .range(0, 4999),
    { canAccessMature }
  );
  const { data, error } = await query;
  if (error) throw error;

  const counts = new Map<string, CountryFacet>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const code = cleanRadioText(row.country_code, 8).toUpperCase();
    const name = cleanRadioText(row.country, 120);
    const id = code || name.toLowerCase();
    if (!id) continue;
    const current = counts.get(id) || { id, name: name || code, code: code || null, count: 0 };
    current.count += 1;
    if (!current.name && name) current.name = name;
    counts.set(id, current);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, 250);
}

export async function GET(request: NextRequest) {
  try {
    const canAccessMature = parseMatureRadioAccess(request);
    const fromView = await loadFromPublicView();
    const countries = fromView && fromView.length > 0 ? fromView : await loadFromSample(canAccessMature);

    return NextResponse.json({
      success: true,
      countries,
    });
  } catch (error) {
    return jsonRadioError(
      "Failed to load radio countries.",
      500,
      error instanceof Error ? error.message : error
    );
  }
}
