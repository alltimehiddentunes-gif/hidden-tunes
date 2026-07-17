import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

type SportsEmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string | null;
  ctaLabel?: string;
  onCta?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SportsEmptyState({
  icon = "calendar-outline",
  title,
  message,
  ctaLabel,
  onCta,
  compact = false,
  style,
}: SportsEmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={compact ? 20 : 26} color={SPORTS_COLORS.textDim} />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, compact && styles.messageCompact]} numberOfLines={3}>
          {message}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          style={[styles.ctaButton, compact && styles.ctaButtonCompact]}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(SportsEmptyState);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },

  containerCompact: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 6,
  },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    marginBottom: 4,
  },

  title: {
    color: SPORTS_COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  titleCompact: {
    fontSize: 12.5,
  },

  message: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 17,
  },

  messageCompact: {
    fontSize: 11,
  },

  ctaButton: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    backgroundColor: SPORTS_COLORS.amber,
  },

  ctaButtonCompact: {
    minHeight: 34,
    paddingHorizontal: 14,
  },

  ctaText: {
    color: "#0A0A0A",
    fontSize: 12.5,
    fontWeight: "900",
  },
});
