import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

type SportsFollowButtonProps = {
  followed: boolean;
  onToggle: () => void;
  label?: string;
  followedLabel?: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SportsFollowButton({
  followed,
  onToggle,
  label = "Follow",
  followedLabel = "Following",
  size = "md",
  iconOnly = false,
  style,
}: SportsFollowButtonProps) {
  const small = size === "sm";

  const handlePress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      onToggle();
    },
    [onToggle]
  );

  if (iconOnly) {
    return (
      <Pressable
        onPress={handlePress}
        style={[
          styles.iconButton,
          small && styles.iconButtonSmall,
          followed && styles.iconButtonActive,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={followed ? `Unfollow, ${followedLabel}` : `Follow, ${label}`}
      >
        <Ionicons
          name={followed ? "checkmark" : "add"}
          size={small ? 14 : 16}
          color={followed ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.button,
        small && styles.buttonSmall,
        followed && styles.buttonActive,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={followed ? followedLabel : label}
    >
      <Ionicons
        name={followed ? "checkmark" : "add"}
        size={small ? 13 : 15}
        color={followed ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
      />
      <Text style={[styles.text, small && styles.textSmall, followed && styles.textActive]}>
        {followed ? followedLabel : label}
      </Text>
    </Pressable>
  );
}

export default memo(SportsFollowButton);

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.borderStrong,
  },

  buttonSmall: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
  },

  buttonActive: {
    backgroundColor: SPORTS_COLORS.amber,
    borderColor: SPORTS_COLORS.amber,
  },

  text: {
    color: SPORTS_COLORS.text,
    fontSize: 12.5,
    fontWeight: "800",
  },

  textSmall: {
    fontSize: 11,
  },

  textActive: {
    color: SPORTS_COLORS.navy,
  },

  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.borderStrong,
  },

  iconButtonSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },

  iconButtonActive: {
    backgroundColor: SPORTS_COLORS.amber,
    borderColor: SPORTS_COLORS.amber,
  },
});
