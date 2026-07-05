import { NextRequest, NextResponse } from "next/server";

import {
  describePodcastSeedCatalog,
  ingestPodcastSeedCatalog,
  type PodcastSeedIngestOptions,
} from "@/lib/podcastSeedIngest";
import type { PodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_CATEGORIES = new Set<PodcastSeedCategorySlug>([
  "health",
  "technology",
  "business",
  "education",
  "science",
  "history",
  "news",
  "comedy",
  "faith",
  "music",
  "society-culture",
  "true-crime",
  "sports",
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

function parseCategories(value: unknown): PodcastSeedCategorySlug[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const categories = value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is PodcastSeedCategorySlug =>
      ALLOWED_CATEGORIES.has(entry as PodcastSeedCategorySlug)
    );

  return categories.length > 0 ? categories : undefined;
}

function parseOptions(body: Record<string, unknown>): PodcastSeedIngestOptions {
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
    catalog: describePodcastSeedCatalog(),
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
    const result = await ingestPodcastSeedCatalog(parseOptions(body));
    return NextResponse.json({
      ...result,
      catalog: describePodcastSeedCatalog(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Podcast seed ingest failed.";
    return jsonError(message, 500);
  }
}
