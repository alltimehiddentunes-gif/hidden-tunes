import { NextRequest, NextResponse } from "next/server";

type CreateUploaderRequest = {
  email?: string;
  role?: string;
};

const ALLOWED_ROLES = ["owner", "upload_manager"];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  try {
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
      mode: "mock-preview",
      message:
        "Validated backend boundary only. No uploader was created.",
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