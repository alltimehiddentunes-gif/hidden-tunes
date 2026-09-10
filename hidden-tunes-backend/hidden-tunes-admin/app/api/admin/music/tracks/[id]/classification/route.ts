import { NextRequest, NextResponse } from "next/server";

import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import {
  loadMusicTrackClassification,
  persistMusicTrackClassification,
} from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const FORBIDDEN_KEYS = new Set([
  "source",
  "sourceKey",
  "source_name",
  "source_type",
  "source_key",
  "sourceLabel",
  "source_label",
  "musicSource",
  "musicSourceExplicit",
  "isExplicit",
  "rights",
  "license",
  "availability",
  "audioUrl",
  "audioKey",
  "storage",
]);

export async function GET(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const classification = await loadMusicTrackClassification(String(id || "").trim());
    if (!classification) return NextResponse.json({ success: false, error: "Track not found." }, { status: 404 });
    return NextResponse.json({ success: true, classification });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to load track classification.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const trackId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const forbidden = Object.keys(body).filter((key) => FORBIDDEN_KEYS.has(key));
    if (forbidden.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This endpoint edits taxonomy and audio-analysis metadata only.",
          forbiddenFields: forbidden,
        },
        { status: 400 }
      );
    }
    if (body.taxonomy === undefined && body.musicTaxonomy === undefined) {
      return NextResponse.json(
        { success: false, error: "taxonomy is required." },
        { status: 400 }
      );
    }

    const existing = await loadMusicTrackClassification(trackId);
    if (!existing) return NextResponse.json({ success: false, error: "Track not found." }, { status: 404 });

    await persistMusicTrackClassification({
      trackId,
      taxonomyInput: body.taxonomy ?? body.musicTaxonomy,
      featuresInput: body.features,
      actorId: permission.profile.id,
    });
    const classification = await loadMusicTrackClassification(trackId);
    return NextResponse.json({ success: true, classification });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to save track classification.");
  }
}
