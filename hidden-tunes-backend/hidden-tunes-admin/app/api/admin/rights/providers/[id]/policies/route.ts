import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("rights_policies").select("*")
    .eq("scope_type", "provider").eq("scope_value", id).order("version", { ascending: false });
  if (result.error) return rightsJsonError("Unable to list provider policies.", 500, result.error.message);
  return NextResponse.json({ success: true, policies: result.data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const status = String(body.rightsStatus ?? "");
    if (!["green", "amber", "red", "unknown"].includes(status)) throw new Error("Invalid rights status.");
    const client = getSupabaseAdmin();
    const latest = await client.from("rights_policies").select("version").eq("policy_key", `provider:${id}`).order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) return rightsJsonError("Unable to determine policy version.", 500, latest.error.message);
    const result = await client.from("rights_policies").insert({
      policy_key: `provider:${id}`,
      version: (latest.data?.version ?? 0) + 1,
      scope_type: "provider",
      scope_value: id,
      rights_status: status,
      platform_rules: body.platforms && typeof body.platforms === "object" ? body.platforms : {},
      territories: Array.isArray(body.territories) ? body.territories.map(String) : [],
      worldwide: body.worldwide === true,
      effective_at: typeof body.effectiveAt === "string" ? body.effectiveAt : null,
      expires_at: typeof body.expiresAt === "string" ? body.expiresAt : null,
      license_id: typeof body.licenseId === "string" ? body.licenseId : null,
      legal_block: body.legalBlock === true,
      active: false,
      created_by: permission.user.id,
    }).select("*").single();
    if (result.error) return rightsJsonError("Unable to create draft provider policy.", 500, result.error.message);
    return NextResponse.json({ success: true, policy: result.data, active: false }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid provider policy.", 400, error instanceof Error ? error.message : String(error));
  }
}

