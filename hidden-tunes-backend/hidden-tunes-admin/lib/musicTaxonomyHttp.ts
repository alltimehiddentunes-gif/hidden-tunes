import { NextResponse } from "next/server";

import {
  isMissingMusicTaxonomySchemaError,
  musicTaxonomyErrorResponseMessage,
} from "@/lib/musicTaxonomyRepository";
import { MusicTaxonomyValidationError } from "@/lib/musicTaxonomy";

export function musicTaxonomyErrorResponse(
  error: unknown,
  fallback: string
) {
  const status =
    error instanceof MusicTaxonomyValidationError
      ? 400
      : isMissingMusicTaxonomySchemaError(error)
        ? 503
        : 500;
  const message =
    error instanceof MusicTaxonomyValidationError || process.env.NODE_ENV !== "production"
      ? musicTaxonomyErrorResponseMessage(error)
      : fallback;

  return NextResponse.json(
    {
      success: false,
      error: message || fallback,
      ...(status === 503
        ? { migration: "20260909120000_music_taxonomy_foundation.sql" }
        : {}),
    },
    { status }
  );
}
