import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

type SportsReminderButtonProps = {
  reminded: boolean;
  onToggle: () => void;
  label?: string;
  remindedLabel?: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SportsReminderButton({
  reminded,
  onToggle,
  label = "Remind me",
  remindedLabel = "Reminder set",
  size = "md",
  iconOnly = false,
  style,
}: SportsReminderButtonProps) {
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
          reminded && styles.iconButtonActive,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={reminded ? remindedLabel : label}
      >
        <Ionicons
          name={reminded ? "notifications" : "notifications-outline"}
          size={small ? 14 : 16}
          color={reminded ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
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
        reminded && styles.buttonActive,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={reminded ? remindedLabel : label}
    >
      <Ionicons
        name={reminded ? "notifications" : "notifications-outline"}
        size={small ? 13 : 15}
        color={reminded ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
      />
      <Text style={[styles.text, small && styles.textSmall, reminded && styles.textActive]}>
        {reminded ? remindedLabel : label}
      </Text>
    </Pressable>
  );
}

export default memo(SportsReminderButton);

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
    backgroundColor: SPORTS_COLORS.plum,
    borderColor: SPORTS_COLORS.plum,
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
    color: "#fff",
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
    backgroundColor: SPORTS_COLORS.plum,
    borderColor: SPORTS_COLORS.plum,
  },
});
