import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

import { canUploadMusic } from "@/lib/adminPermissions";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export type UploadPermissionProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
};

type UploadPermissionSuccess = {
  user: User;
  profile: UploadPermissionProfile;
  errorResponse: null;
};

type UploadPermissionFailure = {
  user: null;
  profile: null;
  errorResponse: NextResponse;
};

function getSupabaseAuthConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  const missingVariables = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    supabaseUrl,
    supabaseAnonKey,
    missingVariables,
  };
}

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

export async function requireUploadPermission(
  request: NextRequest
): Promise<UploadPermissionSuccess | UploadPermissionFailure> {
  const adminConfig = getSupabaseAdminConfig();

  if (adminConfig.missingVariables.length > 0) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Missing Supabase admin environment variables.",
        500,
        adminConfig.missingVariables
      ),
    };
  }

  const authConfig = getSupabaseAuthConfig();

  if (authConfig.missingVariables.length > 0) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Missing Supabase auth environment variables.",
        500,
        authConfig.missingVariables
      ),
    };
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError("Missing authorization token.", 401),
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const supabase = createClient(
    authConfig.supabaseUrl,
    authConfig.supabaseAnonKey
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Unauthorized uploader session.",
        401,
        authError?.message || null
      ),
    };
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("uploader_profiles")
    .select("id, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Uploader profile not found for this account.",
        403,
        profileError?.message || null
      ),
    };
  }

  if (profile.status !== "active") {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError("Uploader account is not active.", 403),
    };
  }

  if (!canUploadMusic(profile.role)) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError("This role cannot upload music.", 403),
    };
  }

  return {
    user,
    profile: profile as UploadPermissionProfile,
    errorResponse: null,
  };
}
