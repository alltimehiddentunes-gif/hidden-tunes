import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

type SportsBackButtonProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Shared Sports back control — same size/hit area on every Sports subpage.
 */
function SportsBackButton({
  onPress,
  style,
  accessibilityLabel = "Go back",
  testID = "sports-back-button",
}: SportsBackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, style]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Ionicons name="chevron-back" size={22} color={SPORTS_COLORS.text} />
    </Pressable>
  );
}

export default memo(SportsBackButton);

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },
});
