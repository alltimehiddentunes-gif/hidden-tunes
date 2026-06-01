import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalIdentityHint from "../components/EmotionalIdentityHint";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { getPlayerIdentityHintPosition } from "../utils/emotionalFlowHintLayout";

function PlayerScreenIdentityHints() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const onPlayerScreen = pathname.includes("player");

  if (!onPlayerScreen || !settings.emotionalFlowEnabled) {
    return null;
  }

  const position = getPlayerIdentityHintPosition();

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

export default memo(PlayerScreenIdentityHints);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 13,
  },
  hint: {
    position: "absolute",
  },
});
