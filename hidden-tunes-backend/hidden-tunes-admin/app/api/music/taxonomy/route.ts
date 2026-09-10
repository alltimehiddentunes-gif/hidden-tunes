import { NextRequest, NextResponse } from "next/server";

import { isMusicTaxonomyType, MusicTaxonomyType } from "@/lib/musicTaxonomy";
import {
  isMissingMusicTaxonomySchemaError,
  listPublicMusicTaxonomyTerms,
} from "@/lib/musicTaxonomyRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const typeValue = String(params.get("type") || "").trim();
  const taxonomyType = isMusicTaxonomyType(typeValue)
    ? (typeValue as MusicTaxonomyType)
    : undefined;

  try {
    const terms = await listPublicMusicTaxonomyTerms({
      query: String(params.get("q") || "").trim().slice(0, 80) || undefined,
      taxonomyType,
      parentId:
        params.get("parentId") === "root"
          ? null
          : String(params.get("parentId") || "").trim() || undefined,
    });
    return NextResponse.json({ success: true, terms });
  } catch (error) {
    const missing = isMissingMusicTaxonomySchemaError(error);
    return NextResponse.json(
      {
        success: false,
        error: "Music taxonomy is not available.",
        ...(missing
          ? { migration: "20260909120000_music_taxonomy_foundation.sql" }
          : {}),
      },
      { status: missing ? 503 : 500 }
    );
  }
}
