import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../constants/theme";

type PlayingIndicatorProps = {
  active?: boolean;
  isPlaying?: boolean;
  size?: "small" | "medium" | "large";
};

const ICON_SIZES = {
  small: 14,
  medium: 18,
  large: 22,
} as const;

function PlayingIndicator({
  active = true,
  isPlaying = true,
  size = "small",
}: PlayingIndicatorProps) {
  if (!active) return null;

  return (
    <View style={styles.shell}>
      <Ionicons
        name={isPlaying ? "volume-high" : "pause"}
        size={ICON_SIZES[size]}
        color={COLORS.primary}
      />
    </View>
  );
}

export default memo(PlayingIndicator);

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
  },
});
