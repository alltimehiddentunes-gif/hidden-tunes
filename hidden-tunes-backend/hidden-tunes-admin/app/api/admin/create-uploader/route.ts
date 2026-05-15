import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  createSupabaseUploaderAuthUser,
  isAllowedUploaderRole,
  normalizeUploaderEmail,
} from "@/lib/createUploader";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";
import { createUploaderProfile } from "@/lib/uploaderProfilesAdmin";

type CreateUploaderRequest = {
  email?: string;
  role?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

export async function POST(request: NextRequest) {
  try {
    const adminConfig = getSupabaseAdminConfig();

    if (adminConfig.missingVariables.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Supabase admin environment variables.",
          missingVariables: adminConfig.missingVariables,
        },
        { status: 500 }
      );
    }

    const supabaseServerAdmin = getSupabaseAdmin();
    const authConfig = getSupabaseAuthConfig();

    if (authConfig.missingVariables.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Supabase auth environment variables.",
          missingVariables: authConfig.missingVariables,
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      authConfig.supabaseUrl,
      authConfig.supabaseAnonKey
    );

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized uploader session.",
          details: authError?.message || null,
        },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseServerAdmin
      .from("uploader_profiles")
      .select("id, email, role, status")
      .eq("id", user.id)
      .maybeSingle();

    console.log("CREATE UPLOADER OWNER PROFILE", {
      userId: user.id,
      profile,
      profileError,
      supabaseUrl: authConfig.supabaseUrl,
    });

    if (profileError || !profile) {
      return NextResponse.json(
        {
          success: false,
          error: `Uploader profile not found for auth user ${user.id}.`,
          details: profileError?.message || null,
          checkedProjectUrl: authConfig.supabaseUrl,
        },
        { status: 403 }
      );
    }

    if (profile.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Uploader account is not active." },
        { status: 403 }
      );
    }

    if (profile.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Only owners can create uploaders." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateUploaderRequest;

    const email = normalizeUploaderEmail(String(body.email || ""));
    const role = String(body.role || "").trim();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Uploader email is required." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid uploader email." },
        { status: 400 }
      );
    }

    if (!isAllowedUploaderRole(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid uploader role." },
        { status: 400 }
      );
    }

    const authResult = await createSupabaseUploaderAuthUser({ email, role });

    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 400 }
      );
    }

    const profileResult = await createUploaderProfile({
      userId: authResult.userId,
      email: authResult.email,
      role: authResult.role,
    });

    if (!profileResult.success) {
      return NextResponse.json(
        { success: false, error: profileResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "supabase-invite-and-profile-created",
      message: "Uploader invite email sent and uploader profile created.",
      uploader: {
        userId: authResult.userId,
        email: authResult.email,
        role: authResult.role,
        profile: profileResult.profile,
      },
    });
  } catch (error) {
    console.error("CREATE UPLOADER API ERROR", error);

    return NextResponse.json(
      { success: false, error: "Failed to create uploader." },
      { status: 500 }
    );
  }
}
