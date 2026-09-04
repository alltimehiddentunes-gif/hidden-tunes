import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_licenses").select("*").order("created_at", { ascending: false }).limit(250);
  if (result.error) return rightsJsonError("Unable to list licenses.", 500, result.error.message);
  return NextResponse.json({ success: true, licenses: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 240) throw new Error("License name required.");
    const result = await getSupabaseAdmin().from("rights_licenses").insert({
      name,
      provider_id: typeof body.providerId === "string" ? body.providerId : null,
      rights_holder: typeof body.rightsHolder === "string" ? body.rightsHolder.trim() || null : null,
      status: "draft",
      effective_at: typeof body.effectiveAt === "string" ? body.effectiveAt : null,
      expires_at: typeof body.expiresAt === "string" ? body.expiresAt : null,
      permits_streaming: body.permitsStreaming === true,
      permits_download: body.permitsDownload === true,
      permits_commercial_use: body.permitsCommercialUse === true,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 4000) : null,
      created_by: permission.user.id,
    }).select("*").single();
    if (result.error) return rightsJsonError("Unable to create license.", 500, result.error.message);
    return NextResponse.json({ success: true, license: result.data }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid license request.", 400, error instanceof Error ? error.message : String(error));
  }
}

