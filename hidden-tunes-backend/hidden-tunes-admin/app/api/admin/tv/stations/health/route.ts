import { NextResponse } from "next/server";

import { getTvHealthSummary } from "@/lib/tvStationHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
}

export async function GET() {
  try {
    const health = await getTvHealthSummary();
    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load TV health.";
    return jsonError("Failed to load TV station health.", 500, message);
  }
}
