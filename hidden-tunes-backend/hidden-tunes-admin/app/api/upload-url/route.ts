import { NextRequest, NextResponse } from "next/server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2 } from "@/lib/r2";

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

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_BASE_URL) {
      return NextResponse.json(
        { error: "Missing R2 environment variables" },
        { status: 500 }
      );
    }

    const key = `${folder}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(r2, command, {
      expiresIn: 60 * 10,
    });

    return NextResponse.json({
      success: true,
      signedUrl,
      key,
      publicUrl: `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`,
    });
  } catch (error) {
    console.error("Upload URL generation failed:", error);

    return NextResponse.json(
      { error: "Upload URL generation failed" },
      { status: 500 }
    );
  }
}