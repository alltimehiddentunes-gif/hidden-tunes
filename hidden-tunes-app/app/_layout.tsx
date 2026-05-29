import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { memo, useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import RemoteMediaControlsBridge from "../components/RemoteMediaControlsBridge";
import { isHiddenAudioPocRoute } from "../constants/playbackConfig";
import { PlayerProvider } from "../context/PlayerContext";
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

function RootStack({ memoizedScreenOptions }: { memoizedScreenOptions: typeof screenOptions }) {
  return (
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
}

function RootLayout() {
  const pathname = usePathname();
  const skipLegacyPlayback = isHiddenAudioPocRoute(pathname);
  const memoizedScreenOptions = useMemo(() => screenOptions, []);

  useEffect(() => {
    markAppMounted("root_layout");
    startRuntimeInstrumentation();

    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Non-fatal — app content is already mounting.
      }
    };

    void hideSplash();
  }, []);

  const stack = <RootStack memoizedScreenOptions={memoizedScreenOptions} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {skipLegacyPlayback ? (
        stack
      ) : (
        <MemoizedPlayerProvider>
          <RemoteMediaControlsBridge />
          {stack}
        </MemoizedPlayerProvider>
      )}
    </GestureHandlerRootView>
  );
}

export default memo(RootLayout);
