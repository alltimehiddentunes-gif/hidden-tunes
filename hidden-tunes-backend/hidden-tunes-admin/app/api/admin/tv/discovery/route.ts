import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_SOURCE_SELECT, cleanText } from "@/lib/tvCatalog";
import {
  TvDiscoveryPlanRow,
  buildDiscoverySourcePlaceholder,
  generateTvDiscoveryPlan,
  parseDiscoverySeedList,
} from "@/lib/tvDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SEEDS = 500;
const MAX_CREATE_SOURCES = 200;

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

function parseTargetResults(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(500, Math.floor(parsed));
}

function normalizePlanRow(value: unknown): TvDiscoveryPlanRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const seed = cleanText(row.seed, 200);
  const generatedQuery = cleanText(row.generated_query, 500);
  const queryType = cleanText(row.query_type, 80);
  const id = cleanText(row.id, 200);

  if (!seed || !generatedQuery || !queryType || !id) return null;

  return {
    id,
    seed,
    query_type: queryType as TvDiscoveryPlanRow["query_type"],
    query_type_label: cleanText(row.query_type_label, 120) || queryType,
    generated_query: generatedQuery,
    suggested_category: cleanText(row.suggested_category, 120),
    suggested_genre: cleanText(row.suggested_genre, 120),
    suggested_mood: cleanText(row.suggested_mood, 120),
    suggested_format: cleanText(row.suggested_format, 120),
    target_results: parseTargetResults(row.target_results),
  };
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

  const action = cleanText(body.action, 40) || "generate";

  if (action === "create_sources") {
    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    const rows = rawRows
      .map((entry) => normalizePlanRow(entry))
      .filter((entry): entry is TvDiscoveryPlanRow => entry !== null)
      .slice(0, MAX_CREATE_SOURCES);

    if (rows.length === 0) {
      return jsonError("At least one discovery plan row is required.", 400);
    }

    const autoApprove = Boolean(body.autoApprove ?? body.auto_approve);

    const payloads = rows.map((row) => {
      const placeholder = buildDiscoverySourcePlaceholder(row, autoApprove);
      return {
        source_type: placeholder.source_type,
        source_url: placeholder.source_url,
        source_id: placeholder.source_id,
        title: placeholder.title,
        default_category: placeholder.default_category,
        default_genre: placeholder.default_genre,
        default_mood: placeholder.default_mood,
        scan_frequency: placeholder.scan_frequency,
        auto_approve: placeholder.auto_approve,
        is_active: placeholder.is_active,
      };
    });

    const { data, error } = await supabaseAdmin
      .from("tv_sources")
      .upsert(payloads, { onConflict: "source_type,source_url" })
      .select(TV_SOURCE_SELECT);

    if (error) {
      return jsonError("Failed to create TV source placeholders.", 500, error.message);
    }

    return NextResponse.json({
      success: true,
      action: "create_sources",
      created_count: (data || []).length,
      requested_count: rows.length,
      sources: data || [],
      message:
        "Manual TV source placeholders created. Paste discovered video URLs/IDs into each source bulk importer on TV Sources.",
      queries: rows.map((row) => ({
        source_title: buildDiscoverySourcePlaceholder(row).title,
        discovery_query: row.generated_query,
        placeholder_url: buildDiscoverySourcePlaceholder(row).source_url,
      })),
    });
  }

  const seedsInput =
    typeof body.seeds === "string"
      ? body.seeds
      : Array.isArray(body.seedList)
        ? (body.seedList as unknown[]).map((entry) => String(entry || "")).join("\n")
        : "";

  const seeds = parseDiscoverySeedList(seedsInput, MAX_SEEDS);

  if (seeds.length === 0) {
    return jsonError("Paste at least one discovery seed.", 400);
  }

  const targetResultsPerQuery = parseTargetResults(
    body.maxResultsPerQuery ?? body.targetResultsPerQuery ?? body.target_results
  );

  const defaults = {
    default_category: cleanText(body.defaultCategory ?? body.default_category, 120),
    default_genre: cleanText(body.defaultGenre ?? body.default_genre, 120),
    default_mood: cleanText(body.defaultMood ?? body.default_mood, 120),
  };

  const plan = generateTvDiscoveryPlan(seeds, targetResultsPerQuery, defaults);

  return NextResponse.json({
    success: true,
    action: "generate",
    plan: plan.rows,
    summary: plan.summary,
    calculator: {
      formula: "seeds × query types × target results",
      expression: `${plan.summary.seed_count} × ${plan.summary.query_type_count} × ${plan.summary.target_results_per_query}`,
      estimated_catalog_records: plan.summary.estimated_catalog_records,
    },
    note: "Metadata-only discovery plan. No YouTube search API calls were made.",
  });
}
