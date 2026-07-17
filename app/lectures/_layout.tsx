import { Stack } from "expo-router";

import { useEducationalPlaybackBinding } from "@/hooks/useEducationalPlayback";

/**
 * Bind PlayerContext playSong into EducationalPlaybackController for the
 * entire Lectures stack. Without this, playSessionFromProgram always fails
 * with "Educational session unavailable."
 */
export default function LecturesLayout() {
  useEducationalPlaybackBinding();
  return <Stack screenOptions={{ headerShown: false }} />;
}
