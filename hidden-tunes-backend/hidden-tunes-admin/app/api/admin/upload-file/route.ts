import { NextRequest, NextResponse } from "next/server";

import { getR2Config, uploadToR2 } from "@/lib/r2";
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

function cleanObjectKey(key: string) {
  const safe = String(key || "")
    .trim()
    .replace(/[^\w.\-\/]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return safe;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(req: NextRequest) {
  const uploadDebug: {
    key?: string;
    bucket?: string;
    contentType?: string;
    folder?: string;
    fileName?: string;
    size?: number;
  } = {};

  try {
    const permission = await requireUploadPermission(req);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = cleanFolder(String(formData.get("folder") || "songs"));
    const requestedKey = cleanObjectKey(String(formData.get("key") || ""));

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
    const key =
      requestedKey && requestedKey.startsWith(`${folder}/`)
        ? requestedKey
        : `${folder}/${Date.now()}-${fileName}`;
    const body = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const r2Config = getR2Config();
    uploadDebug.key = key;
    uploadDebug.bucket = r2Config.bucketName;
    uploadDebug.contentType = contentType;
    uploadDebug.folder = folder;
    uploadDebug.fileName = fileName;
    uploadDebug.size = file.size;

    console.info("Admin server fallback R2 upload starting", {
      ...uploadDebug,
      usingRequestedKey: Boolean(requestedKey && requestedKey === key),
    });

    const publicUrl = await uploadToR2({
      key,
      body,
      contentType,
    });

    console.info("Admin server fallback R2 upload succeeded", {
      key,
      bucket: r2Config.bucketName,
      contentType,
      publicUrl,
    });

    return NextResponse.json({
      success: true,
      key,
      bucket: r2Config.bucketName,
      contentType,
      publicUrl,
    });
  } catch (error: unknown) {
    console.error("Admin server fallback R2 upload failed:", {
      ...uploadDebug,
      error: getErrorMessage(error, "Server upload failed."),
    });

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Server upload failed."),
      },
      { status: 500 }
    );
  }
}
