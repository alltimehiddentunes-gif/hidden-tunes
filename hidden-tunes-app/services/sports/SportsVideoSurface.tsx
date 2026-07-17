/**
 * Placeholder Sports video surface.
 * Isolated from TV and music players. Not mounted in production navigation.
 */
import { View, Text, StyleSheet } from "react-native";

import type { SportsPlaybackResult } from "../../types/sports";

type Props = {
  playback: SportsPlaybackResult | null;
};

export default function SportsVideoSurface({ playback }: Props) {
  if (!playback) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>No Sports playback session</Text>
      </View>
    );
  }

  if (playback.mode === "external") {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>
          Watch on {playback.provider} (official external)
        </Text>
      </View>
    );
  }

  if (playback.mode === "embedded") {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>
          Official embedded player — {playback.provider}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.text}>Native Sports surface (feature-flagged)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  text: {
    color: "#ccc",
    fontSize: 14,
  },
});
