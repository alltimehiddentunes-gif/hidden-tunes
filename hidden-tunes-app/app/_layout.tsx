import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { memo, useEffect, useMemo } from "react";
import { AppState } from "react-native"; // TEMP_PLAYBACK_DIAGNOSTICS
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerProvider } from "../context/PlayerContext";
import {
  logPlaybackDiagnostic,
  logPlaybackDiagnosticChurnWarning,
} from "../services/playbackDiagnostics"; // TEMP_PLAYBACK_DIAGNOSTICS
import { markAppMounted } from "../utils/startupDiagnostics";
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
    // TEMP_PLAYBACK_DIAGNOSTICS
    void logPlaybackDiagnostic("startup_instrumentation_start", {
      source: "root_layout",
    });
    startRuntimeInstrumentation();
    // TEMP_PLAYBACK_DIAGNOSTICS
    void logPlaybackDiagnostic("startup_instrumentation_end", {
      source: "root_layout",
    });

    // TEMP_PLAYBACK_DIAGNOSTICS
    let previousState = AppState.currentState;
    // TEMP_PLAYBACK_DIAGNOSTICS
    void logPlaybackDiagnostic("app_state_listener_mounted", {
      currentState: AppState.currentState,
    });
    // TEMP_PLAYBACK_DIAGNOSTICS
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      // TEMP_PLAYBACK_DIAGNOSTICS
      logPlaybackDiagnosticChurnWarning("app_state_changes", {
        previousState,
        nextState,
      });
      void logPlaybackDiagnostic("app_state_change", {
        previousState,
        nextState,
      });
      previousState = nextState;
    });

    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Non-fatal — app content is already mounting.
      }
    };

    void hideSplash();

    return () => {
      // TEMP_PLAYBACK_DIAGNOSTICS
      appStateSubscription.remove();
    };
  }, []);

  const stack = (
    <Stack screenOptions={memoizedScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="downloads" />
      <Stack.Screen name="lyrics" />
      <Stack.Screen name="queue" />
      <Stack.Screen name="hidden-audio-test" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MemoizedPlayerProvider>
        {stack}
      </MemoizedPlayerProvider>
    </GestureHandlerRootView>
  );
}

export default memo(RootLayout);
