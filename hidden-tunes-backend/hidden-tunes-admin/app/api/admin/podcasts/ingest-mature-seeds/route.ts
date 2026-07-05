import { NextRequest, NextResponse } from "next/server";

import {
  describeMaturePodcastSeedCatalog,
  ingestMaturePodcastSeedCatalog,
  type MaturePodcastSeedIngestOptions,
} from "@/lib/podcastSeedIngest";
import type { MaturePodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_MATURE_CATEGORIES = new Set<MaturePodcastSeedCategorySlug>([
  "relationships",
  "dating",
  "intimacy-education",
  "adult-lifestyle",
  "confessions-stories",
  "wellness-18",
  "mature-comedy",
  "mature-talk-shows",
]);

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

function parseCategories(
  value: unknown
): MaturePodcastSeedCategorySlug[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const categories = value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is MaturePodcastSeedCategorySlug =>
      ALLOWED_MATURE_CATEGORIES.has(entry as MaturePodcastSeedCategorySlug)
    );

  return categories.length > 0 ? categories : undefined;
}

function parseOptions(body: Record<string, unknown>): MaturePodcastSeedIngestOptions {
  return {
    auto_approve:
      body.auto_approve === true ||
      body.auto_approve === "true" ||
      body.autoApprove === true ||
      body.autoApprove === "true" ||
      body.auto_approve === undefined,
    max_feeds: Number.isFinite(Number(body.max_feeds))
      ? Number(body.max_feeds)
      : Number.isFinite(Number(body.maxFeeds))
        ? Number(body.maxFeeds)
        : undefined,
    max_episodes_per_feed: Number.isFinite(Number(body.max_episodes_per_feed))
      ? Number(body.max_episodes_per_feed)
      : Number.isFinite(Number(body.maxEpisodesPerFeed))
        ? Number(body.maxEpisodesPerFeed)
        : undefined,
    feed_timeout_ms: Number.isFinite(Number(body.feed_timeout_ms))
      ? Number(body.feed_timeout_ms)
      : Number.isFinite(Number(body.feedTimeoutMs))
        ? Number(body.feedTimeoutMs)
        : undefined,
    categories: parseCategories(body.categories),
    dry_run:
      body.dry_run === true ||
      body.dry_run === "true" ||
      body.dryRun === true ||
      body.dryRun === "true",
  };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    catalog: describeMaturePodcastSeedCatalog(),
  });
}

export async function POST(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const result = await ingestMaturePodcastSeedCatalog(parseOptions(body));
    return NextResponse.json({
      ...result,
      catalog: describeMaturePodcastSeedCatalog(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mature podcast seed ingest failed.";
    return jsonError(message, 500);
  }
}
