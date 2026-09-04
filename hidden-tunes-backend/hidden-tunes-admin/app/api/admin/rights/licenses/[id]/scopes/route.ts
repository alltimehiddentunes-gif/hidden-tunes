import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("rights_license_scopes").select("*").eq("license_id", id).order("created_at");
  if (result.error) return rightsJsonError("Unable to list license scopes.", 500, result.error.message);
  return NextResponse.json({ success: true, scopes: result.data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    const result = await getSupabaseAdmin().from("rights_license_scopes").insert({
      license_id: id,
      content_types: list(body.contentTypes), provider_ids: list(body.providerIds),
      uploader_ids: list(body.uploaderIds), source_keys: list(body.sourceKeys),
      import_batches: list(body.importBatches), owner_or_networks: list(body.ownerOrNetworks),
      territories: list(body.territories), worldwide: body.worldwide === true,
      platforms: list(body.platforms), content_date_from: body.contentDateFrom ?? null,
      content_date_to: body.contentDateTo ?? null, permits_streaming: body.permitsStreaming !== false,
      permits_download: body.permitsDownload === true, permits_embed: body.permitsEmbed === true,
      permits_relay: body.permitsRelay === true, permits_proxy: body.permitsProxy === true,
      permits_rehosting: body.permitsRehosting === true,
      permits_commercial_use: body.permitsCommercialUse === true, created_by: permission.user.id,
    }).select("*").single();
    if (result.error) return rightsJsonError("Unable to create license scope.", 500, result.error.message);
    return NextResponse.json({ success: true, scope: result.data }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid license scope.", 400, error instanceof Error ? error.message : String(error));
  }
}

