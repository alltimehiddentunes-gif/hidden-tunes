import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, GRADIENTS, SHADOWS } from "../constants/theme";
import HTImage from "./HTImage";
import { FALLBACK_ARTWORK } from "../utils/artwork";

export type PremiumEmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  artworkSource?: any;
};

function PremiumEmptyState({
  icon = "sparkles-outline",
  title,
  message,
  actionLabel,
  onAction,
  artworkSource,
}: PremiumEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={GRADIENTS.cardElevated} style={styles.card}>
        <View style={styles.artFrame}>
          <HTImage
            source={artworkSource}
            fallback={FALLBACK_ARTWORK}
            style={styles.art}
            contentFit="cover"
            contentPosition="center"
          />
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(0,0,0,0.35)"]}
            style={styles.artScrim}
          />
          <View pointerEvents="none" style={styles.iconBadge}>
            <Ionicons name={icon} size={22} color={COLORS.primaryGlow} />
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {actionLabel && onAction ? (
          <TouchableOpacity activeOpacity={0.88} style={styles.action} onPress={onAction}>
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={16} color="#000" />
          </TouchableOpacity>
        ) : null}
      </LinearGradient>
    </View>
  );
}

export default memo(PremiumEmptyState);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 4,
    marginVertical: 8,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...SHADOWS.card,
  },
  artFrame: {
    width: 82,
    height: 82,
    borderRadius: 21,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  art: {
    width: "100%",
    height: "100%",
  },
  artScrim: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  iconBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  action: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  actionText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
