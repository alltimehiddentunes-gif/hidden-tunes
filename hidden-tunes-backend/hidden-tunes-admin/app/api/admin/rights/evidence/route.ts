import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const EVIDENCE_TYPES = new Set([
  "provider_agreement", "license", "ownership_certificate", "commercial_terms",
  "subscription_evidence", "authorization_email", "public_domain", "other",
]);

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_evidence")
    .select("id,evidence_type,provider_id,license_id,content_type,content_id,sha256,effective_at,expires_at,territories,platforms,verification_status,created_at")
    .order("created_at", { ascending: false }).limit(250);
  if (result.error) return rightsJsonError("Unable to list evidence.", 500, result.error.message);
  return NextResponse.json({ success: true, evidence: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    const evidenceType = String(body.evidenceType ?? "");
    const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : null;
    if (!EVIDENCE_TYPES.has(evidenceType) || (sha256 && !/^[0-9a-f]{64}$/.test(sha256))) throw new Error("Invalid evidence metadata.");
    const result = await getSupabaseAdmin().from("rights_evidence").insert({
      evidence_type: evidenceType,
      provider_id: typeof body.providerId === "string" ? body.providerId : null,
      license_id: typeof body.licenseId === "string" ? body.licenseId : null,
      content_type: typeof body.contentType === "string" ? body.contentType : null,
      content_id: typeof body.contentId === "string" ? body.contentId : null,
      private_object_key: typeof body.privateObjectKey === "string" ? body.privateObjectKey : null,
      sha256,
      effective_at: typeof body.effectiveAt === "string" ? body.effectiveAt : null,
      expires_at: typeof body.expiresAt === "string" ? body.expiresAt : null,
      territories: Array.isArray(body.territories) ? body.territories.map(String) : [],
      platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : [],
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
      created_by: permission.user.id,
    }).select("id,evidence_type,verification_status,sha256,created_at").single();
    if (result.error) return rightsJsonError("Unable to create evidence record.", 500, result.error.message);
    return NextResponse.json({ success: true, evidence: result.data }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid evidence request.", 400, error instanceof Error ? error.message : String(error));
  }
}
