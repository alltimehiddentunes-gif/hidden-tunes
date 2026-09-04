import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { canExecuteRights, canReadRights, canReviewRights } from "@/lib/adminPermissions";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export type RightsPermission = "read" | "review" | "execute" | "rollback";
type Profile = { id: string; email: string | null; role: string | null; status: string | null };

function failure(error: string, status: number, details?: unknown) {
  return { user: null, profile: null, errorResponse: NextResponse.json({ success: false, error, details: details ?? null }, { status }) } as const;
}

export async function requireRightsPermission(request: NextRequest, permission: RightsPermission = "read"): Promise<
  | { user: User; profile: Profile; errorResponse: null }
  | { user: null; profile: null; errorResponse: NextResponse }
> {
  const adminConfig = getSupabaseAdminConfig();
  if (adminConfig.missingVariables.length) return failure("Missing Supabase admin environment variables.", 500, adminConfig.missingVariables);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!supabaseUrl || !anonKey) return failure("Missing Supabase auth environment variables.", 500);
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return failure("Missing authorization token.", 401);
  const token = authHeader.slice("Bearer ".length).trim();
  const auth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticated = await auth.auth.getUser(token);
  if (authenticated.error || !authenticated.data.user) return failure("Unauthorized admin session.", 401, authenticated.error?.message);
  const profileResult = await getSupabaseAdmin().from("uploader_profiles").select("id,email,role,status")
    .eq("id", authenticated.data.user.id).maybeSingle();
  if (profileResult.error || !profileResult.data) return failure("Admin profile not found.", 403, profileResult.error?.message);
  const profile = profileResult.data as Profile;
  if (profile.status !== "active") return failure("Admin account is not active.", 403);
  const allowed = permission === "read" ? canReadRights(profile.role)
    : permission === "review" ? canReviewRights(profile.role)
      : canExecuteRights(profile.role);
  if (!allowed) return failure("Insufficient rights-management permission.", 403);
  return { user: authenticated.data.user, profile, errorResponse: null };
}
