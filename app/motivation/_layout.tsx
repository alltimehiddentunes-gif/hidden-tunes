import { Stack } from "expo-router";

import {
  MotivationPlaybackBinding,
  MotivationProgressPersistence,
} from "@/hooks/useMotivationPlayback";

export default function MotivationLayout() {
  return (
    <>
      <MotivationPlaybackBinding />
      <MotivationProgressPersistence />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
