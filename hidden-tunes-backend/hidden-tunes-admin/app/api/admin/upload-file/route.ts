import { NextRequest, NextResponse } from "next/server";

import { uploadToR2 } from "@/lib/r2";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SERVER_UPLOAD_BYTES = 250 * 1024 * 1024;

function cleanFileName(fileName: string) {
  return String(fileName || "upload")
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanFolder(folder: string) {
  const safe = String(folder || "songs")
    .trim()
    .replace(/[^\w\-\/]+/g, "-")
    .replace(/^\/+|\/+$/g, "");

  return safe || "songs";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const permission = await requireUploadPermission(req);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = cleanFolder(String(formData.get("folder") || "songs"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing upload file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SERVER_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error:
            "File is too large for the server fallback upload. Check the R2 CORS policy so direct uploads can complete.",
        },
        { status: 413 }
      );
    }

    const fileName = cleanFileName(file.name);
    const key = `${folder}/${Date.now()}-${fileName}`;
    const body = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToR2({
      key,
      body,
      contentType: file.type || "application/octet-stream",
    });

    return NextResponse.json({
      success: true,
      key,
      publicUrl,
    });
  } catch (error: unknown) {
    console.error("Admin server upload failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Server upload failed."),
      },
      { status: 500 }
    );
  }
}
