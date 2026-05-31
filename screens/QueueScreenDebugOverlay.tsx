import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalEngineDebugOverlay from "../components/EmotionalEngineDebugOverlay";
import { useEmotionalDebugMode } from "../state/useEmotionalDebugMode";

function QueueScreenDebugOverlay() {
  const pathname = usePathname();
  const debugEnabled = useEmotionalDebugMode();
  const onQueueScreen = pathname.includes("queue");

  if (!debugEnabled || !onQueueScreen) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <EmotionalEngineDebugOverlay style={styles.debugPanel} />
    </View>
  );
}

export default memo(QueueScreenDebugOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  debugPanel: {
    left: 8,
    right: 8,
    bottom: 130,
  },
});
