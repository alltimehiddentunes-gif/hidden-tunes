import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalEngineDashboard from "../components/EmotionalEngineDashboard";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { getQueueEngineDashboardPosition } from "../utils/emotionalFlowHintLayout";

function QueueScreenEngineDashboard() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const onQueueScreen = pathname.includes("queue");

  if (!onQueueScreen || !settings.emotionalFlowEnabled) {
    return null;
  }

  const position = getQueueEngineDashboardPosition();

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <EmotionalEngineDashboard
        style={[
          styles.dashboard,
          {
            top: position.top,
            left: position.left,
            right: position.right,
          },
        ]}
      />
    </View>
  );
}

export default memo(QueueScreenEngineDashboard);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  dashboard: {
    position: "absolute",
    alignItems: "flex-end",
  },
});
