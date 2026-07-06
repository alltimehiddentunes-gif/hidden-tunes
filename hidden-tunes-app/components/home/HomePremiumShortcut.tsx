import { memo, useCallback, useRef, type ComponentProps } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../../constants/theme";

const { width } = Dimensions.get("window");

export const HOME_SHORTCUT_CARD_WIDTH_QUARTER = (width - 64) / 4;
export const HOME_SHORTCUT_CARD_WIDTH_HALF = (width - 52) / 2;

export type HomePremiumShortcutProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  color: string;
  onPress: () => void;
  layout?: "half" | "quarter";
};

export const HomePremiumShortcut = memo(function HomePremiumShortcut({
  icon,
  title,
  color,
  onPress,
  layout = "quarter",
}: HomePremiumShortcutProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cardWidth =
    layout === "half"
      ? HOME_SHORTCUT_CARD_WIDTH_HALF
      : HOME_SHORTCUT_CARD_WIDTH_QUARTER;

  const pressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const pressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.card, { width: cardWidth }]}
        activeOpacity={0.88}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.iconCircle, { borderColor: color }]}>
          <Ionicons name={icon} size={23} color={color} />
        </View>

        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    height: 88,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 22,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
});
