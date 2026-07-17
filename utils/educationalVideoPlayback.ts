import { router } from "expo-router";

import type { HiddenTunesLectureItem } from "@/services/lecturesCatalogApi";
import type { EducationalProgram, EducationalSession } from "@/types/education";

export function openEducationalProgramDetail(item: HiddenTunesLectureItem | EducationalProgram) {
  // Prefer stable catalog id (UUID) so /api/lectures/items/[id] resolves.
  const id = String(item.id || item.slug || "").trim();
  router.push(`/lectures/${encodeURIComponent(id)}` as never);
}

/**
 * Legacy entry point retained so accidental callers cannot open Hidden Tunes TV.
 * Progressive lecture MP3/MP4 must use EducationalPlaybackController + shared audio.
 */
export async function openEducationalVideoSession(
  _program: EducationalProgram,
  _session: EducationalSession
): Promise<never> {
  throw new Error(
    "This lecture must use shared educational audio playback and cannot open Hidden Tunes TV."
  );
}
