import { Stack } from "expo-router";

import { useMotivationPlaybackBinding } from "@/hooks/useMotivationPlayback";

export default function MotivationLayout() {
  useMotivationPlaybackBinding();
  return <Stack screenOptions={{ headerShown: false }} />;
}
