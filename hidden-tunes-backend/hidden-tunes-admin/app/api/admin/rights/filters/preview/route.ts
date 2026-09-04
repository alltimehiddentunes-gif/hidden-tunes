import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { countRightsCatalog, queryRightsCatalog } from "@/lib/rights/catalogQuery";
import { createFilterSnapshot } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    const client = getSupabaseAdmin();
    const counted = await countRightsCatalog(client, body.filter);
    if (counted.error) return rightsJsonError("Unable to count filtered records.", 500, counted.error.message);
    const [sample, watermark, revision] = await Promise.all([
      queryRightsCatalog({ client, filter: counted.normalizedFilter, limit: 25, count: null }),
      client.from("rights_catalog_items").select("indexed_at").order("indexed_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("rights_policies").select("version").order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (sample.error || watermark.error || revision.error) {
      return rightsJsonError("Unable to prepare filter snapshot.", 500,
        sample.error?.message ?? watermark.error?.message ?? revision.error?.message);
    }
    const snapshot = createFilterSnapshot(counted.normalizedFilter, {
      actorId: permission.user.id,
      exactCount: counted.count ?? 0,
      catalogWatermark: watermark.data?.indexed_at ?? new Date(0).toISOString(),
      policyRevision: revision.data?.version ?? 0,
    });
    const inserted = await client.from("rights_filter_snapshots").insert(snapshot).select("*").single();
    if (inserted.error) return rightsJsonError("Unable to persist filter snapshot.", 500, inserted.error.message);
    return NextResponse.json({
      success: true,
      snapshot: inserted.data,
      matching: counted.count ?? 0,
      sample: sample.data ?? [],
    }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid filter preview.", 400, error instanceof Error ? error.message : String(error));
  }
}

