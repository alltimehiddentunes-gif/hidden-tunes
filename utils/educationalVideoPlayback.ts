import { router } from "expo-router";

import {
  fetchEducationalSessionPlayback,
  type HiddenTunesLectureItem,
} from "@/services/lecturesCatalogApi";
import type { EducationalProgram, EducationalSession } from "@/types/education";
import {
  isEducationalAudioPlayback,
  isEducationalVideoPlayback,
} from "@/utils/educationalPlaybackAdapter";
import { recordEducationalRecentlyPlayed } from "@/services/educationalRecentlyPlayed";

export function openEducationalProgramDetail(item: HiddenTunesLectureItem | EducationalProgram) {
  const slug = String(item.slug || item.id || "").trim();
  router.push(`/lectures/${encodeURIComponent(slug)}` as never);
}

export async function openEducationalVideoSession(
  program: EducationalProgram,
  session: EducationalSession
) {
  const resolved = await fetchEducationalSessionPlayback(program.id, session.id);
  if (isEducationalAudioPlayback(resolved.mediaType, resolved.playableUrl)) {
    throw new Error("This lesson should use audio playback.");
  }
  if (!isEducationalVideoPlayback(resolved.mediaType, resolved.playableUrl)) {
    throw new Error("Educational playback is unavailable.");
  }

  void recordEducationalRecentlyPlayed({
    programId: program.id,
    programTitle: program.title,
    programArtwork: program.artworkUrl || null,
    educatorName: program.educatorName || null,
    sessionId: session.id,
    sessionTitle: session.title,
  });

  router.push({
    pathname: "/tv-player",
    params: {
      id: session.id,
      name: session.title,
      streamUrl: resolved.playableUrl,
      logoUrl: session.artworkUrl || program.artworkUrl || "",
      sourceLabel: program.educatorName || program.institutionName || "Lectures & Learning",
      streamType: "mp4",
    },
  });
}
