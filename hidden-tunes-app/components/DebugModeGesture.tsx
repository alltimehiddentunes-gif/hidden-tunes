import { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { toggleDebugMode } from "../state/emotionalDebugMode";

const TRIPLE_TAP_WINDOW_MS = 650;
const CORNER_SIZE = 72;

function DebugModeGesture() {
  const tapTimestampsRef = useRef<number[]>([]);

  const handleCornerPress = useCallback(() => {
    const now = Date.now();
    tapTimestampsRef.current = tapTimestampsRef.current.filter(
      (timestamp) => now - timestamp <= TRIPLE_TAP_WINDOW_MS
    );
    tapTimestampsRef.current.push(now);

    if (tapTimestampsRef.current.length >= 3) {
      tapTimestampsRef.current = [];
      toggleDebugMode();
    }
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        pointerEvents="auto"
        onPress={handleCornerPress}
        style={styles.cornerHitArea}
        accessibilityLabel="Emotional engine debug toggle"
        accessibilityRole="button"
      />
    </View>
  );
}

export default memo(DebugModeGesture);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  cornerHitArea: {
    position: "absolute",
    top: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    backgroundColor: "transparent",
  },
});
