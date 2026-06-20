import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { memo, useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import RemoteMediaControlsBridge from "../components/RemoteMediaControlsBridge";
import { PlayerProvider } from "../context/PlayerContext";
import { preloadOnboardingStatus } from "../services/onboardingPreferences";
import { hydrateHiddenTunesCatalogCache } from "../services/hiddenTunesApi";
import { markAppMounted } from "../utils/startupDiagnostics";
import { scheduleStartupTask } from "../utils/startupScheduler";
import { startRuntimeInstrumentation } from "../utils/runtimeInstrumentation";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash may already be hidden on fast reload — safe to ignore.
});

const screenOptions = {
  headerShown: false,
  contentStyle: {
    backgroundColor: "#000",
  },
};

const MemoizedPlayerProvider = memo(PlayerProvider);

function RootLayout() {
  const memoizedScreenOptions = useMemo(() => screenOptions, []);

  useEffect(() => {
    markAppMounted("root_layout");
    startRuntimeInstrumentation();

    void preloadOnboardingStatus();

    scheduleStartupTask("afterPaint", "startup_catalog_memory_hydrate", async () => {
      await hydrateHiddenTunesCatalogCache();
    });

    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Non-fatal — app content is already mounting.
      }
    };

    void hideSplash();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MemoizedPlayerProvider>
        <RemoteMediaControlsBridge />
        <Stack screenOptions={memoizedScreenOptions}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="downloads" />
          <Stack.Screen name="lyrics" />
          <Stack.Screen name="queue" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </MemoizedPlayerProvider>
    </GestureHandlerRootView>
  );
}

export default memo(RootLayout);
