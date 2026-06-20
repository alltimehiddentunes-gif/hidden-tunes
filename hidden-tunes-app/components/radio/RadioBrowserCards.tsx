import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import HTImage from "../HTImage";
import { COLORS } from "../../constants/theme";
import type { LaunchRadioCategory } from "../../utils/launchRadioCategories";

type RadioCategoryCardProps = {
  category: LaunchRadioCategory;
  stationCount?: number;
  onPress: () => void;
};

export const RadioCategoryCard = memo(function RadioCategoryCard({
  category,
  stationCount,
  onPress,
}: RadioCategoryCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.card}
      onPress={onPress}
    >
      <LinearGradient colors={category.gradient} style={styles.gradient}>
        <View style={styles.iconWrap}>
          <Ionicons name={category.icon} size={22} color={COLORS.primary} />
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {category.title}
        </Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {category.subtitle}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {typeof stationCount === "number" && stationCount > 0
            ? `${stationCount} Hidden Tunes stations`
            : "Hidden Tunes stations"}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

type RadioStationCardProps = {
  name: string;
  subtitle?: string;
  favicon?: string;
  onPress: () => void;
};

export const RadioStationCard = memo(function RadioStationCard({
  name,
  subtitle,
  favicon,
  onPress,
}: RadioStationCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.stationRow} onPress={onPress}>
      {favicon ? (
        <HTImage uri={favicon} style={styles.stationArt} />
      ) : (
        <View style={styles.stationArtFallback}>
          <Ionicons name="radio-outline" size={22} color={COLORS.textMuted} />
        </View>
      )}

      <View style={styles.stationCopy}>
        <Text numberOfLines={1} style={styles.stationTitle}>
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.stationSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gradient: {
    minHeight: 156,
    padding: 14,
    justifyContent: "flex-end",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    fontWeight: "600",
  },
  meta: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 10,
  },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  stationArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  stationArtFallback: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stationCopy: {
    flex: 1,
    gap: 2,
  },
  stationTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  stationSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
