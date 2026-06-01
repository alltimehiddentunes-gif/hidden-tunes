import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePathname } from "expo-router";

import { useEmotionalFlowActive } from "../state/useEmotionalQueueSnapshot";

function EmotionalFlowIndicator() {
  const pathname = usePathname();
  const isActive = useEmotionalFlowActive();
  const onPlayerScreen = pathname.includes("player");

  if (!onPlayerScreen || !isActive) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text style={styles.label}>Emotional Flow</Text>
    </View>
  );
}

export default memo(EmotionalFlowIndicator);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 52,
    alignSelf: "center",
    zIndex: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    opacity: 0.55,
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
});
