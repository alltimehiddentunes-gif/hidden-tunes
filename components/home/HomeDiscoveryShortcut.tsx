import { memo, type ComponentProps } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../../constants/theme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 52) / 2;

export type HomeDiscoveryShortcutProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  color: string;
  onPress: () => void;
};

export const HomeDiscoveryShortcut = memo(function HomeDiscoveryShortcut({
  icon,
  title,
  color,
  onPress,
}: HomeDiscoveryShortcutProps) {
  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_WIDTH }]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <View style={[styles.iconCircle, { borderColor: color }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </TouchableOpacity>
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
