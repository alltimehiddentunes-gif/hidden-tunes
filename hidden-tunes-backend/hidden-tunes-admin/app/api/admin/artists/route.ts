import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("artists")
      .select("id, name, slug, image_url")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      artists: data || [],
    });
  } catch (error: unknown) {
    console.error("Fetch artists failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to fetch artists."),
      },
      { status: 500 }
    );
  }
}
