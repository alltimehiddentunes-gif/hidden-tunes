import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalIdentityHint from "../components/EmotionalIdentityHint";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { getQueueIdentityHintPosition } from "../utils/emotionalFlowHintLayout";

function QueueScreenIdentityHints() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const onQueueScreen = pathname.includes("queue");

  if (!onQueueScreen || !settings.emotionalFlowEnabled) {
    return null;
  }

  const position = getQueueIdentityHintPosition();

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <EmotionalIdentityHint
        style={[
          styles.hint,
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

export default memo(QueueScreenIdentityHints);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 5,
  },
  hint: {
    position: "absolute",
  },
});
