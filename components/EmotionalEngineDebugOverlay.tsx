import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { useEmotionalQueueSnapshot } from "../state/useEmotionalQueueSnapshot";
import {
  collectEmotionalEngineDebugSnapshot,
  formatEmotionalEngineDebugSnapshot,
} from "../utils/emotionalEngineDebugSnapshot";

type EmotionalEngineDebugOverlayProps = {
  style?: StyleProp<ViewStyle>;
};

function EmotionalEngineDebugOverlay({ style }: EmotionalEngineDebugOverlayProps) {
  const queueSnapshot = useEmotionalQueueSnapshot();

  const debugText = useMemo(() => {
    void queueSnapshot.emotionalQueue.length;
    void queueSnapshot.queueIndex;

    return formatEmotionalEngineDebugSnapshot(
      collectEmotionalEngineDebugSnapshot()
    );
  }, [queueSnapshot.emotionalQueue.length, queueSnapshot.queueIndex]);

  return (
    <ScrollView
      pointerEvents="none"
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text selectable style={styles.text}>
        {debugText}
      </Text>
    </ScrollView>
  );
}

export default memo(EmotionalEngineDebugOverlay);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 25,
    maxHeight: 240,
    opacity: 0.7,
  },
  content: {
    paddingBottom: 8,
  },
  text: {
    fontFamily: "monospace",
    fontSize: 9,
    lineHeight: 11,
    color: "rgba(255,255,255,0.92)",
  },
});
