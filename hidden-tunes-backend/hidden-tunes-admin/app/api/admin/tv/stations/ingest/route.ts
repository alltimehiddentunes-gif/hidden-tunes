import { NextRequest, NextResponse } from "next/server";

import {
  TvGrowthCandidate,
  importVerifiedTvGrowthCandidates,
} from "@/lib/tvStationHealth";

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

function normalizeStation(raw: Record<string, unknown>): TvGrowthCandidate | null {
  const title = String(raw.title || raw.name || "").trim();
  const streamUrl = String(raw.stream_url || raw.streamUrl || raw.source_url || "").trim();
  const sourceId = String(raw.source_id || raw.id || streamUrl || title).trim();

  if (!title || !streamUrl || !sourceId) return null;

  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((category) => String(category).trim()).filter(Boolean)
    : [];

  return {
    source_type: String(raw.source_type || "hls_stream"),
    source_id: sourceId,
    source_url: streamUrl,
    embed_url: typeof raw.embed_url === "string" ? raw.embed_url : null,
    title,
    channel_name:
      typeof raw.channel_name === "string"
        ? raw.channel_name
        : typeof raw.name === "string"
          ? raw.name
          : title,
    thumbnail_url:
      typeof raw.logo_url === "string"
        ? raw.logo_url
        : typeof raw.thumbnail_url === "string"
          ? raw.thumbnail_url
          : null,
    category: categories[0] || (typeof raw.category === "string" ? raw.category : null),
    genre: typeof raw.genre === "string" ? raw.genre : null,
    country:
      typeof raw.country === "string"
        ? raw.country
        : typeof raw.region === "string"
          ? raw.region
          : null,
    region:
      typeof raw.region === "string"
        ? raw.region
        : typeof raw.country === "string"
          ? raw.country
          : null,
    source_key:
      typeof raw.source_key === "string"
        ? raw.source_key
        : `${String(raw.source_type || "hls_stream")}:${sourceId}`,
  };
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const autoApprove = payload.auto_approve === true;
  if (!autoApprove) {
    return jsonError("auto_approve must be true for verified station ingest.", 400);
  }

  const stations = Array.isArray(payload.stations) ? payload.stations : [];
  if (stations.length === 0) {
    return jsonError("stations must be a non-empty array.", 400);
  }

  const candidates = stations
    .map((station) => normalizeStation((station || {}) as Record<string, unknown>))
    .filter((station): station is TvGrowthCandidate => station !== null);

  if (candidates.length === 0) {
    return jsonError("No valid station records were provided.", 400);
  }

  try {
    const result = await importVerifiedTvGrowthCandidates(candidates);
    return NextResponse.json({
      success: true,
      auto_approve: true,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TV station ingest failed.";
    return jsonError("TV station ingest failed.", 500, message);
  }
}
