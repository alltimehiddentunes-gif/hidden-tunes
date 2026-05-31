import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  HIDDEN_AUDIO_POC_ROUTE,
  isHiddenAudioEnabledOnIOS,
} from "../constants/playbackConfig";
import { COLORS } from "../constants/theme";
import {
  hiddenAudioBridge,
  isHiddenAudioNativeEngineAvailable,
} from "../src/hidden-audio/hiddenAudioBridge";

const TEST_STREAM_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

export default function HiddenAudioTestScreen() {
  const router = useRouter();
  const nativeAvailable = isHiddenAudioNativeEngineAvailable();
  const flagEnabled = isHiddenAudioEnabledOnIOS();
  const [status, setStatus] = useState("Idle — no native calls yet.");

  const runNativeCall = useCallback(
    async (label: string, action: () => Promise<void>) => {
      try {
        await action();
        setStatus(`${label}: succeeded`);
      } catch (error) {
        const message = String((error as Error)?.message || error);
        console.log(`[hidden-audio-test] ${label} failed:`, error);
        setStatus(`${label}: failed — ${message}`);
      }
    },
    []
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hidden Audio iOS Engine POC</Text>

      <Text style={styles.label}>Route</Text>
      <Text style={styles.value}>{HIDDEN_AUDIO_POC_ROUTE}</Text>

      <Text style={styles.label}>Platform</Text>
      <Text style={styles.value}>{Platform.OS}</Text>

      <Text style={styles.label}>Native module</Text>
      <Text style={styles.value}>
        {nativeAvailable ? "Available" : "Not available in this build"}
      </Text>

      <Text style={styles.label}>PlayerContext flag</Text>
      <Text style={styles.value}>
        {flagEnabled
          ? "USE_NATIVE_HIDDEN_AUDIO_ON_IOS = true"
          : "USE_NATIVE_HIDDEN_AUDIO_ON_IOS = false (expo-av default)"}
      </Text>

      <Text style={styles.label}>Status</Text>
      <Text style={styles.value}>{status}</Text>

      <Text style={styles.note}>
        Direct native bridge calls below. Production playback uses PlayerContext
        only when USE_NATIVE_HIDDEN_AUDIO_ON_IOS is enabled on iOS.
      </Text>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          void runNativeCall("load", () => hiddenAudioBridge.load(TEST_STREAM_URL));
        }}
      >
        <Text style={styles.buttonText}>Load test stream</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          void runNativeCall("play", () => hiddenAudioBridge.play());
        }}
      >
        <Text style={styles.buttonText}>Play</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          void runNativeCall("pause", () => hiddenAudioBridge.pause());
        }}
      >
        <Text style={styles.buttonText}>Pause</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => {
          void runNativeCall("stop", () => hiddenAudioBridge.stop());
        }}
      >
        <Text style={styles.buttonText}>Stop</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.replace("/(tabs)")}
      >
        <Text style={styles.secondaryButtonText}>Back to app</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
  },
  title: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 28,
  },
  label: {
    color: "#888888",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  value: {
    color: "#ffffff",
    fontSize: 16,
    marginBottom: 20,
  },
  note: {
    color: "#aaaaaa",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  secondaryButton: {
    borderColor: "#444444",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    textAlign: "center",
  },
});
