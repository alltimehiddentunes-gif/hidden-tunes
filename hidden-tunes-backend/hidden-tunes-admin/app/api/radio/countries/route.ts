import { NextResponse } from "next/server";

import { jsonRadioError } from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("radio_public_countries")
    .select("id, name, code, count")
    .order("count", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    return jsonRadioError("Failed to load radio countries.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    countries: data || [],
  });
}
