import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerProvider } from "../context/PlayerContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PlayerProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: {
              backgroundColor: "#000",
            },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="downloads" />
          <Stack.Screen name="lyrics" />
          <Stack.Screen name="queue" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </PlayerProvider>
    </GestureHandlerRootView>
  );
}