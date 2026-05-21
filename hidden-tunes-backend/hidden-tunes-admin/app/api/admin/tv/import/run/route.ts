import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TvSourceRow, cleanText } from "@/lib/tvCatalog";
import { runTvSourceImport } from "@/lib/tvImportRunner";

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

async function failJob(
  jobId: string,
  sourceId: string | null,
  message: string,
  counts: {
    total_found: number;
    total_imported: number;
    total_skipped: number;
  }
) {
  await supabaseAdmin
    .from("tv_import_jobs")
    .update({
      status: "failed",
      error_message: message.slice(0, 4000),
      total_found: counts.total_found,
      total_imported: counts.total_imported,
      total_skipped: counts.total_skipped,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (sourceId) {
    await supabaseAdmin
      .from("tv_sources")
      .update({ last_scanned_at: new Date().toISOString() })
      .eq("id", sourceId);
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

  const sourceId = cleanText(body.sourceId, 80) || cleanText(body.source_id, 80);
  const manualVideoList =
    typeof body.manualVideoList === "string"
      ? body.manualVideoList
      : typeof body.optionalManualVideoList === "string"
        ? body.optionalManualVideoList
        : "";

  if (!sourceId) {
    return jsonError("sourceId is required.", 400);
  }

  const { data: sourceData, error: sourceError } = await supabaseAdmin
    .from("tv_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError) {
    return jsonError("Failed to load TV source.", 500, sourceError.message);
  }

  if (!sourceData) {
    return jsonError("TV source not found.", 404);
  }

  const source = sourceData as TvSourceRow;

  if (!source.is_active) {
    return jsonError("Cannot import from an inactive source.", 400);
  }

  const startedAt = new Date().toISOString();

  const { data: jobData, error: jobError } = await supabaseAdmin
    .from("tv_import_jobs")
    .insert({
      source_id: source.id,
      status: "running",
      started_at: startedAt,
    })
    .select("id, source_id, status, total_found, total_imported, total_skipped, created_at")
    .single();

  if (jobError || !jobData) {
    return jsonError("Failed to create import job.", 500, jobError?.message || null);
  }

  const jobId = String(jobData.id);

  try {
    const importResult = await runTvSourceImport(source, manualVideoList);

    if (!importResult.ok) {
      await failJob(jobId, source.id, importResult.error, {
        total_found: 0,
        total_imported: 0,
        total_skipped: 0,
      });

      return jsonError(importResult.error, 400, {
        invalid_line_count: importResult.invalid_line_count || 0,
      });
    }

    const { result } = importResult;
    const completedAt = new Date().toISOString();

    await supabaseAdmin
      .from("tv_import_jobs")
      .update({
        status: "completed",
        total_found: result.total_found,
        total_imported: result.total_imported,
        total_skipped: result.total_skipped,
        error_message: result.error_message,
        completed_at: completedAt,
      })
      .eq("id", jobId);

    await supabaseAdmin
      .from("tv_sources")
      .update({ last_scanned_at: completedAt })
      .eq("id", source.id);

    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        source_id: source.id,
        status: "completed",
        total_found: result.total_found,
        total_imported: result.total_imported,
        total_skipped: result.total_skipped,
        failed_count: result.failed_video_ids.length,
        invalid_line_count: result.invalid_line_count,
        started_at: startedAt,
        completed_at: completedAt,
        error_message: result.error_message,
      },
      failed_video_ids: result.failed_video_ids,
      message: result.message,
      note: result.note,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TV import failed unexpectedly.";

    await failJob(jobId, source.id, message, {
      total_found: 0,
      total_imported: 0,
      total_skipped: 0,
    });

    return jsonError("TV import failed.", 500, message);
  }
}
