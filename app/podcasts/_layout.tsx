import { Stack } from "expo-router";

import { usePodcastPlaybackBinding } from "@/hooks/usePodcastPlaybackBinding";

export default function PodcastsLayout() {
  usePodcastPlaybackBinding();
  return <Stack screenOptions={{ headerShown: false }} />;
}
