import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

type UpdateUploaderStatusRequest = {
  uploaderId?: string;
  status?: string;
};

type UploaderStatus = "active" | "disabled";

const ALLOWED_UPLOADER_STATUSES: UploaderStatus[] = ["active", "disabled"];

function isAllowedUploaderStatus(value: string): value is UploaderStatus {
  return ALLOWED_UPLOADER_STATUSES.includes(value as UploaderStatus);
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

    const { data: requesterProfile, error: requesterProfileError } =
      await supabaseServerAdmin
        .from("uploader_profiles")
        .select("id, email, role, status")
        .eq("id", user.id)
        .maybeSingle();

    if (requesterProfileError || !requesterProfile) {
      return NextResponse.json(
        {
          success: false,
          error: `Uploader profile not found for auth user ${user.id}.`,
          details: requesterProfileError?.message || null,
          checkedProjectUrl: authConfig.supabaseUrl,
        },
        { status: 403 }
      );
    }

    if (requesterProfile.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Uploader account is not active." },
        { status: 403 }
      );
    }

    if (requesterProfile.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Only owners can update uploader status." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpdateUploaderStatusRequest;

    const uploaderId = String(body.uploaderId || "").trim();
    const status = String(body.status || "").trim();

    if (!uploaderId) {
      return NextResponse.json(
        { success: false, error: "Uploader id is required." },
        { status: 400 }
      );
    }

    if (!isAllowedUploaderStatus(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid uploader status." },
        { status: 400 }
      );
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseServerAdmin
        .from("uploader_profiles")
        .select("id, email, role, status")
        .eq("id", uploaderId)
        .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploader profile not found.",
          details: targetProfileError?.message || null,
        },
        { status: 404 }
      );
    }

    if (status === "disabled" && targetProfile.role === "owner") {
      return NextResponse.json(
        { success: false, error: "Owner accounts cannot be disabled." },
        { status: 400 }
      );
    }

    const { data: updatedProfile, error: updateError } =
      await supabaseServerAdmin
        .from("uploader_profiles")
        .update({ status })
        .eq("id", uploaderId)
        .select("id, email, role, status")
        .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Uploader status updated.",
      uploader: updatedProfile,
    });
  } catch (error) {
    console.error("UPDATE UPLOADER STATUS API ERROR", error);

    return NextResponse.json(
      { success: false, error: "Failed to update uploader status." },
      { status: 500 }
    );
  }
}
