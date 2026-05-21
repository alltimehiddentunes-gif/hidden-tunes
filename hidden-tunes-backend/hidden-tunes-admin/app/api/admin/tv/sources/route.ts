import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_SCAN_FREQUENCIES,
  TV_SOURCE_SELECT,
  TV_SOURCE_TYPES,
  TvSourceRow,
  cleanText,
  isAllowedValue,
} from "@/lib/tvCatalog";

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

function normalizeSourcePayload(body: Record<string, unknown>, partial = false) {
  const payload: Record<string, unknown> = {};

  if (!partial || body.source_type !== undefined) {
    const sourceType = cleanText(body.source_type, 40);
    if (!sourceType || !isAllowedValue(sourceType, TV_SOURCE_TYPES)) {
      throw new Error("Invalid source_type.");
    }
    payload.source_type = sourceType;
  }

  if (!partial || body.source_url !== undefined) {
    const sourceUrl = cleanText(body.source_url, 2000);
    if (!sourceUrl) {
      throw new Error("source_url is required.");
    }
    payload.source_url = sourceUrl;
  }

  if (!partial || body.source_id !== undefined) {
    payload.source_id = cleanText(body.source_id, 200);
  }

  if (!partial || body.title !== undefined) {
    payload.title = cleanText(body.title, 300);
  }

  if (!partial || body.default_category !== undefined) {
    payload.default_category = cleanText(body.default_category, 120);
  }

  if (!partial || body.default_genre !== undefined) {
    payload.default_genre = cleanText(body.default_genre, 120);
  }

  if (!partial || body.default_mood !== undefined) {
    payload.default_mood = cleanText(body.default_mood, 120);
  }

  if (!partial || body.scan_frequency !== undefined) {
    const scanFrequency = cleanText(body.scan_frequency, 20) || "weekly";
    if (!isAllowedValue(scanFrequency, TV_SCAN_FREQUENCIES)) {
      throw new Error("Invalid scan_frequency.");
    }
    payload.scan_frequency = scanFrequency;
  }

  if (!partial || body.auto_approve !== undefined) {
    payload.auto_approve = Boolean(body.auto_approve);
  }

  if (!partial || body.is_active !== undefined) {
    payload.is_active = body.is_active !== false;
  }

  return payload;
}

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const activeOnly = request.nextUrl.searchParams.get("active") === "true";

  let query = supabaseAdmin
    .from("tv_sources")
    .select(TV_SOURCE_SELECT)
    .order("created_at", { ascending: false });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return jsonError("Failed to load TV sources.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    sources: (data || []) as TvSourceRow[],
  });
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

  let payload: Record<string, unknown>;

  try {
    payload = normalizeSourcePayload(body, false);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid source payload.",
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from("tv_sources")
    .insert(payload)
    .select(TV_SOURCE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("A source with this type and URL already exists.", 409);
    }

    return jsonError("Failed to create TV source.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    source: data as TvSourceRow,
  });
}

export async function PATCH(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const sourceId = cleanText(body.id, 80);

  if (!sourceId) {
    return jsonError("Source id is required.", 400);
  }

  let payload: Record<string, unknown>;

  try {
    payload = normalizeSourcePayload(body, true);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid source payload.",
      400
    );
  }

  if (Object.keys(payload).length === 0) {
    return jsonError("No fields provided to update.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tv_sources")
    .update(payload)
    .eq("id", sourceId)
    .select(TV_SOURCE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("A source with this type and URL already exists.", 409);
    }

    return jsonError("Failed to update TV source.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    source: data as TvSourceRow,
  });
}

export async function DELETE(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const sourceId =
    cleanText(request.nextUrl.searchParams.get("id"), 80) ||
    cleanText((await request.json().catch(() => ({})) as Record<string, unknown>)
      .id,
      80);

  if (!sourceId) {
    return jsonError("Source id is required.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tv_sources")
    .update({ is_active: false })
    .eq("id", sourceId)
    .select(TV_SOURCE_SELECT)
    .single();

  if (error) {
    return jsonError("Failed to deactivate TV source.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    source: data as TvSourceRow,
    message: "Source deactivated safely. Existing metadata rows are preserved.",
  });
}
