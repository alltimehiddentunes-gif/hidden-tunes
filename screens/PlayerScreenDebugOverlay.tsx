import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalEngineDebugOverlay from "../components/EmotionalEngineDebugOverlay";
import { useEmotionalDebugMode } from "../state/useEmotionalDebugMode";

function PlayerScreenDebugOverlay() {
  const pathname = usePathname();
  const debugEnabled = useEmotionalDebugMode();
  const onPlayerScreen = pathname.includes("player");

  if (!debugEnabled || !onPlayerScreen) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <EmotionalEngineDebugOverlay style={styles.debugPanel} />
    </View>
  );
}

export default memo(PlayerScreenDebugOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 24,
  },
  debugPanel: {
    left: 8,
    right: 8,
    bottom: 130,
  },
});
