import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyNormalizedGenreToSongInsert,
  normalizeIncomingGenrePayload,
} from "@/lib/uploadGenreTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMOTIONAL_FIELD_ALIASES = {
  energy: ["energy"],
  tempo_bpm: ["tempoBpm", "tempo_bpm"],
  atmosphere: ["atmosphere"],
  emotion: ["emotion"],
  texture: ["texture"],
  time_of_day: ["timeOfDay", "time_of_day"],
  vocal_feel: ["vocalFeel", "vocal_feel"],
  instrumentation: ["instrumentation"],
  analysis_status: ["analysisStatus", "analysis_status"],
  analysis_source: ["analysisSource", "analysis_source"],
} as const;

const TRACK_SELECT =
  "id,title,genre,mood,energy,tempo_bpm,atmosphere,emotion,texture,time_of_day,vocal_feel,instrumentation,analysis_status,analysis_source";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function stringOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildEmotionalMetadata(track: Record<string, unknown>) {
  return {
    energy: numberOrNull(track.energy),
    tempoBpm: numberOrNull(track.tempo_bpm),
    atmosphere: stringOrNull(track.atmosphere),
    emotion: stringOrNull(track.emotion),
    texture: stringOrNull(track.texture),
    timeOfDay: stringOrNull(track.time_of_day),
    vocalFeel: stringOrNull(track.vocal_feel),
    instrumentation: stringOrNull(track.instrumentation),
    analysisStatus: stringOrNull(track.analysis_status),
    analysisSource: stringOrNull(track.analysis_source),
  };
}

function hasBodyField(body: Record<string, unknown>, keys: readonly string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function pickBodyField(body: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }

  return undefined;
}

function parseOptionalEnergy(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing energy value." };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return {
      ok: false,
      error: "Energy must be a whole number between 0 and 100.",
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalTempoBpm(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing tempo value." };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: "Tempo must be a positive whole number (BPM).",
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalText(
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing text value." };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  const text = String(value).trim();
  return { ok: true, value: text || null };
}

function buildEmotionalMetadataPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if (hasBodyField(body, EMOTIONAL_FIELD_ALIASES.energy)) {
    const parsed = parseOptionalEnergy(
      pickBodyField(body, EMOTIONAL_FIELD_ALIASES.energy)
    );
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch.energy = parsed.value;
  }

  if (hasBodyField(body, EMOTIONAL_FIELD_ALIASES.tempo_bpm)) {
    const parsed = parseOptionalTempoBpm(
      pickBodyField(body, EMOTIONAL_FIELD_ALIASES.tempo_bpm)
    );
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch.tempo_bpm = parsed.value;
  }

  const textFields = [
    "atmosphere",
    "emotion",
    "texture",
    "time_of_day",
    "vocal_feel",
    "instrumentation",
    "analysis_status",
    "analysis_source",
  ] as const;

  for (const field of textFields) {
    if (!hasBodyField(body, EMOTIONAL_FIELD_ALIASES[field])) continue;

    const parsed = parseOptionalText(pickBodyField(body, EMOTIONAL_FIELD_ALIASES[field]));
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch[field] = parsed.value;
  }

  return { ok: true as const, patch };
}

type RouteContext = {
  params: Promise<{
    id: string;
    trackId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id, trackId } = await context.params;
    const releaseId = String(id || "").trim();
    const songId = String(trackId || "").trim();
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!releaseId || !songId) {
      return NextResponse.json(
        { success: false, error: "Missing release or track id." },
        { status: 400 }
      );
    }

    const normalizedGenre = normalizeIncomingGenrePayload({
      ...body,
      genre:
        body.legacyGenreOverride ||
        body.genre ||
        body.defaultGenre,
    });

    const emotionalResult = buildEmotionalMetadataPatch(body);

    if (!emotionalResult.ok) {
      return NextResponse.json(
        { success: false, error: emotionalResult.error },
        { status: 400 }
      );
    }

    const { data: existingTrack, error: trackError } = await supabaseAdmin
      .from("songs")
      .select("id, album_id, title, genre")
      .eq("id", songId)
      .eq("album_id", releaseId)
      .maybeSingle();

    if (trackError) throw trackError;

    if (!existingTrack) {
      return NextResponse.json(
        { success: false, error: "Track not found for this release." },
        { status: 404 }
      );
    }

    const patch = {
      ...applyNormalizedGenreToSongInsert({}, normalizedGenre),
      ...emotionalResult.patch,
    };

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from("songs")
      .update(patch)
      .eq("id", songId)
      .eq("album_id", releaseId)
      .select(TRACK_SELECT)
      .single();

    if (updateError) throw updateError;

    const emotionalMetadata = buildEmotionalMetadata(
      updatedTrack as Record<string, unknown>
    );

    return NextResponse.json({
      success: true,
      message: `"${existingTrack.title}" genre updated to ${normalizedGenre.genre}.`,
      track: {
        id: updatedTrack.id,
        title: updatedTrack.title,
        genre: updatedTrack.genre || normalizedGenre.genre,
        mood: updatedTrack.mood || null,
        emotionalMetadata,
      },
      genre: {
        mainGenreId: normalizedGenre.mainGenreId,
        subgenreId: normalizedGenre.subgenreId,
        genre: normalizedGenre.genre,
        mainGenre: normalizedGenre.mainGenre,
        subGenre: normalizedGenre.subGenre,
        genreSlug: normalizedGenre.genreSlug,
      },
      emotionalMetadata,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to update track metadata."),
      },
      { status: 500 }
    );
  }
}
