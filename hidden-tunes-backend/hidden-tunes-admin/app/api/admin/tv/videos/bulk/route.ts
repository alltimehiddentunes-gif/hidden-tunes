import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_VIDEO_SELECT, cleanText } from "@/lib/tvCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BULK_IDS = 100;

const BULK_ACTIONS = [
  "approve",
  "reject",
  "deactivate",
  "mark_playable",
  "mark_blocked",
  "feature",
  "unfeature",
] as const;

type BulkAction = (typeof BULK_ACTIONS)[number];

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

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const entry of value) {
    const id = cleanText(entry, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_BULK_IDS) break;
  }

  return ids;
}

function buildBulkUpdatePayload(action: BulkAction) {
  switch (action) {
    case "approve":
      return {
        status: "approved",
        is_active: true,
      };
    case "reject":
      return {
        status: "rejected",
        is_active: false,
      };
    case "deactivate":
      return {
        status: "inactive",
        is_active: false,
      };
    case "mark_playable":
      return {
        playback_status: "playable",
      };
    case "mark_blocked":
      return {
        playback_status: "blocked",
        status: "blocked",
        is_active: false,
      };
    case "feature":
      return {
        is_featured: true,
      };
    case "unfeature":
      return {
        is_featured: false,
      };
    default:
      return null;
  }
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

  const action = cleanText(body.action, 40) as BulkAction | null;
  const ids = parseIds(body.ids);

  if (!action || !BULK_ACTIONS.includes(action)) {
    return jsonError("Invalid bulk action.", 400);
  }

  if (ids.length === 0) {
    return jsonError("At least one video id is required.", 400);
  }

  const payload = buildBulkUpdatePayload(action);

  if (!payload) {
    return jsonError("Unsupported bulk action.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .update(payload)
    .in("id", ids)
    .select(TV_VIDEO_SELECT);

  if (error) {
    return jsonError("Bulk TV video update failed.", 500, error.message);
  }

  const updated = data || [];

  return NextResponse.json({
    success: true,
    action,
    requested_count: ids.length,
    updated_count: updated.length,
    videos: updated,
  });
}
