import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PROVIDER_TYPES = new Set(["music", "radio", "tv", "podcast", "audiobook", "archive", "direct", "other"]);

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_providers").select("*").order("name").limit(500);
  if (result.error) return rightsJsonError("Unable to list rights providers.", 500, result.error.message);
  return NextResponse.json({ success: true, providers: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const providerType = typeof body.providerType === "string" ? body.providerType : "other";
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !name || name.length > 160 || !PROVIDER_TYPES.has(providerType)) {
      throw new Error("Invalid provider metadata.");
    }
    const result = await getSupabaseAdmin().from("rights_providers").insert({
      slug, name, provider_type: providerType,
      external_account_id: typeof body.externalAccountId === "string" ? body.externalAccountId.trim() || null : null,
      owner_name: typeof body.ownerName === "string" ? body.ownerName.trim() || null : null,
      created_by: permission.user.id,
    }).select("*").single();
    if (result.error) return rightsJsonError("Unable to create rights provider.", 500, result.error.message);
    return NextResponse.json({ success: true, provider: result.data }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid provider request.", 400, error instanceof Error ? error.message : String(error));
  }
}

