import { Stack } from "expo-router";

import {
  EducationalPlaybackBinding,
  EducationalProgressPersistence,
} from "@/hooks/useEducationalPlayback";

/**
 * Bind PlayerContext playSong into EducationalPlaybackController for the
 * entire Lectures stack. Without this, playSessionFromProgram always fails
 * with "Educational session unavailable."
 *
 * Progress persistence is a sibling host so browse screens do not re-render
 * on every playback-position tick.
 */
export default function LecturesLayout() {
  return (
    <>
      <EducationalPlaybackBinding />
      <EducationalProgressPersistence />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
