import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateUploaderRequest = {
  email?: string;
  role?: string;
};

const ALLOWED_ROLES = ["owner", "upload_manager"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing authorization token.",
        },
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
        },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("uploader_profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploader profile not found.",
        },
        { status: 403 }
      );
    }

    if (profile.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error: "Uploader account is not active.",
        },
        { status: 403 }
      );
    }

    if (profile.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners can access uploader creation.",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateUploaderRequest;

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const role = String(body.role || "").trim();

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploader email is required.",
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid uploader email.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid uploader role.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "secure-mock-preview",
      message:
        "Secure owner validation passed. No uploader was created.",
      preview: {
        email,
        role,
      },
    });
  } catch (error) {
    console.error("CREATE UPLOADER API ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process uploader request.",
      },
      { status: 500 }
    );
  }
}