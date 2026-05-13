import { Stack } from "expo-router";
import { memo, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerProvider } from "../context/PlayerContext";

const screenOptions = {
  headerShown: false,
  contentStyle: {
    backgroundColor: "#000",
  },
};

const MemoizedPlayerProvider = memo(PlayerProvider);

function RootLayout() {
  const memoizedScreenOptions = useMemo(() => screenOptions, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MemoizedPlayerProvider>
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