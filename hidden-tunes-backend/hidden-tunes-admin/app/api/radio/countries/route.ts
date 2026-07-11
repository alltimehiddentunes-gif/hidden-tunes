import { NextResponse } from "next/server";

import { applyPublicRadioFilters, cleanRadioText, jsonRadioError } from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const query = applyPublicRadioFilters(
    supabaseAdmin
      .from("radio_stations")
      .select("country, country_code")
      .range(0, 4999),
    {}
  );
  const { data, error } = await query;

  if (error) {
    return jsonRadioError("Failed to load radio countries.", 500, error.message);
  }

  const counts = new Map<string, { id: string; name: string; code: string | null; count: number }>();
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

  const countries = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, 250);

  return NextResponse.json({
    success: true,
    countries,
  });
}
