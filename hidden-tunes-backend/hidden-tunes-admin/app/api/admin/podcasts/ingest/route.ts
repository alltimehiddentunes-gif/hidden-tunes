import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { ingestPodcastFeed } from "@/lib/podcastRssIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function POST(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  try {
    const result = await ingestPodcastFeed(body.feed_url ?? body.feedUrl, {
      auto_approve:
        body.auto_approve === true ||
        body.auto_approve === "true" ||
        body.autoApprove === true ||
        body.autoApprove === "true",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Podcast ingest failed.";
    return jsonError(message, 400);
  }
}
