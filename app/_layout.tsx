import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { memo, useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import RemoteMediaControlsBridge from "../components/RemoteMediaControlsBridge";
import { isHiddenAudioPocRoute } from "../constants/playbackConfig";
import { PlayerProvider } from "../context/PlayerContext";
import { TvPlaybackProvider } from "../context/TvPlaybackContext";
import LocalizationProvider from "../localization/LocalizationProvider";
import { markAppMounted } from "../utils/startupDiagnostics";
import { startRuntimeInstrumentation } from "../utils/runtimeInstrumentation";

// Keep the native splash visible until LocalizationProvider finishes bootstrap
// and hides it. Prevents a frame of raw translation keys on Home.
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
const MemoizedTvPlaybackProvider = memo(TvPlaybackProvider);

function RootStack({ memoizedScreenOptions }: { memoizedScreenOptions: typeof screenOptions }) {
  return (
    <Stack screenOptions={memoizedScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="downloads" />
      <Stack.Screen name="lyrics" />
      <Stack.Screen name="queue" />
      <Stack.Screen
        name="tv-player"
        options={{
          // Persistent TvPlayerHost paints the player; avoid Stack black flash
          // and blank shell animation during PiP restore / singleton reopen.
          animation: "none",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </Stack>
  );
}

function RootLayout() {
  const pathname = usePathname();
  const skipLegacyPlayback = isHiddenAudioPocRoute(pathname);
  const memoizedScreenOptions = useMemo(() => screenOptions, []);

  useEffect(() => {
    markAppMounted("root_layout");
    if (__DEV__) {
      startRuntimeInstrumentation();
    }
  }, []);

  const stack = <RootStack memoizedScreenOptions={memoizedScreenOptions} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LocalizationProvider>
        {skipLegacyPlayback ? (
          stack
        ) : (
          <MemoizedPlayerProvider>
            <MemoizedTvPlaybackProvider>
              <RemoteMediaControlsBridge />
              {stack}
            </MemoizedTvPlaybackProvider>
          </MemoizedPlayerProvider>
        )}
      </LocalizationProvider>
    </GestureHandlerRootView>
  );
}

export default memo(RootLayout);
