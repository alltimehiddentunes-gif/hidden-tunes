import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
import type { RadioCategory } from "../../constants/radioCategories";
import type { RadioStationListItem } from "../../types/radio";
import { getUserFacingRadioSubtitle } from "../../services/ui/displayMetadata";

type RadioCategoryCardProps = {
  category: RadioCategory;
  onPress: () => void;
};

export const RadioCategoryCard = memo(function RadioCategoryCard({
  category,
  onPress,
}: RadioCategoryCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.card} onPress={onPress}>
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
      </LinearGradient>
    </TouchableOpacity>
  );
});

type RadioStationCardProps = {
  item: RadioStationListItem;
  onPress: () => void;
};

const RadioStationArt = memo(function RadioStationArt({
  artworkUrl,
}: {
  artworkUrl?: string;
}) {
  if (!artworkUrl) {
    return (
      <View style={styles.stationArtFallback}>
        <Ionicons name="radio-outline" size={18} color={COLORS.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: artworkUrl }}
      style={styles.stationArt}
      contentFit="cover"
      recyclingKey={artworkUrl}
      transition={0}
      cachePolicy="memory-disk"
      priority="low"
    />
  );
});

export const RadioStationCard = memo(function RadioStationCard({
  item,
  onPress,
}: RadioStationCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.stationRow} onPress={onPress}>
      <RadioStationArt artworkUrl={item.artworkUrl} />

      <View style={styles.stationCopy}>
        <Text numberOfLines={1} style={styles.stationTitle}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text numberOfLines={1} style={styles.stationSubtitle}>
            {getUserFacingRadioSubtitle(item)}
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
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  stationArt: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stationArtFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
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
