import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalEngineDashboard from "../components/EmotionalEngineDashboard";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { getPlayerEngineDashboardPosition } from "../utils/emotionalFlowHintLayout";

function PlayerScreenEngineDashboard() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const onPlayerScreen = pathname.includes("player");

  if (!onPlayerScreen || !settings.emotionalFlowEnabled) {
    return null;
  }

  const position = getPlayerEngineDashboardPosition();

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

export default memo(PlayerScreenEngineDashboard);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 12,
  },
  dashboard: {
    position: "absolute",
    alignItems: "flex-end",
  },
});
