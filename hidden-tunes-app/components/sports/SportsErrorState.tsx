import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

type SportsErrorStateProps = {
  title?: string;
  message?: string | null;
  retryLabel?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SportsErrorState({
  title = "Something went wrong",
  message = "This could not be loaded right now.",
  retryLabel = "Try again",
  onRetry,
  compact = false,
  style,
}: SportsErrorStateProps) {
  return (
    <View
      style={[styles.container, compact && styles.containerCompact, style]}
      accessibilityRole="alert"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={compact ? 20 : 26} color={SPORTS_COLORS.danger} />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, compact && styles.messageCompact]} numberOfLines={2}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, compact && styles.retryButtonCompact]}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Ionicons name="refresh" size={14} color={SPORTS_COLORS.text} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(SportsErrorState);

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
    backgroundColor: "rgba(255,107,107,0.12)",
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

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.borderStrong,
  },

  retryButtonCompact: {
    minHeight: 34,
    paddingHorizontal: 12,
  },

  retryText: {
    color: SPORTS_COLORS.text,
    fontSize: 12.5,
    fontWeight: "800",
  },
});
