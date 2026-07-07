import { memo, type ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../../constants/theme";

type HomeDiscoveryChipProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
};

export const HomeDiscoveryChip = memo(function HomeDiscoveryChip({
  icon,
  title,
  subtitle,
  color,
  onPress,
}: HomeDiscoveryChipProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.chip} onPress={onPress}>
      <View style={[styles.iconWrap, { borderColor: color }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  chip: {
    width: 148,
    minHeight: 108,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginRight: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 15,
  },
});
