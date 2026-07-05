import { NextRequest, NextResponse } from "next/server";

import {
  AUDIOBOOK_SEED_CATEGORIES,
  describeAudiobookSeedCatalog,
  ingestAudiobookSeedCatalog,
  type AudiobookSeedCategorySlug,
  type AudiobookSeedIngestOptions,
} from "@/lib/audiobookSeedIngest";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_CATEGORIES = new Set<AudiobookSeedCategorySlug>(
  AUDIOBOOK_SEED_CATEGORIES
);

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

function parseCategories(value: unknown): AudiobookSeedCategorySlug[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const categories = value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is AudiobookSeedCategorySlug =>
      ALLOWED_CATEGORIES.has(entry as AudiobookSeedCategorySlug)
    );

  return categories.length > 0 ? categories : undefined;
}

function parseOptions(body: Record<string, unknown>): AudiobookSeedIngestOptions {
  return {
    limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
    offset: Number.isFinite(Number(body.offset)) ? Number(body.offset) : undefined,
    timeout_ms: Number.isFinite(Number(body.timeout_ms))
      ? Number(body.timeout_ms)
      : Number.isFinite(Number(body.timeoutMs))
        ? Number(body.timeoutMs)
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
    catalog: describeAudiobookSeedCatalog(),
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
    const result = await ingestAudiobookSeedCatalog(parseOptions(body));
    return NextResponse.json({
      ...result,
      catalog: describeAudiobookSeedCatalog(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audiobook seed ingest failed.";
    return jsonError(message, 500);
  }
}
