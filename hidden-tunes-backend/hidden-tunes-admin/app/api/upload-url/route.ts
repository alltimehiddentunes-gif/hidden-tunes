import { NextRequest, NextResponse } from "next/server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getR2Client, getR2Config } from "@/lib/r2";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

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

export async function POST(req: NextRequest) {
  try {
    const permission = await requireUploadPermission(req);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = await req.json();

    const fileName = cleanFileName(body.fileName);
    const fileType = String(body.fileType || "").trim();
    const folder = cleanFolder(body.folder || "songs");

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "Missing fileName or fileType" },
        { status: 400 }
      );
    }

    const r2Config = getR2Config();

    if (r2Config.missingVariables.length > 0) {
      return NextResponse.json(
        {
          error: "Missing R2 environment variables",
          missingVariables: r2Config.missingVariables,
        },
        { status: 500 }
      );
    }

    const key = `${folder}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: 60 * 10,
    });

    return NextResponse.json({
      success: true,
      signedUrl,
      key,
      publicUrl: `${r2Config.publicBaseUrl.replace(/\/+$/, "")}/${key}`,
    });
  } catch (error) {
    console.error("Upload URL generation failed:", error);

    return NextResponse.json(
      { error: "Upload URL generation failed" },
      { status: 500 }
    );
  }
}
