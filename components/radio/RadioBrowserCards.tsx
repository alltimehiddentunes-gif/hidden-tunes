import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";

import HTImage from "../HTImage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
import type { RadioCategory } from "../../constants/radioCategories";
import type { RadioStationListItem } from "../../types/radio";
import { getUserFacingRadioSubtitle } from "../../services/ui/displayMetadata";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { isMatureContentItem } from "../../types/matureContent";
import MatureContentBadge from "../mature/MatureContentBadge";
import FavoriteButton from "../FavoriteButton";
import { buildRadioStationFavoriteItem } from "../../services/favorites/favoriteItemBuilders";

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

type RadioEmotionalWorldCardProps = {
  category: RadioCategory;
  stationCount?: number;
  onPress: () => void;
};

export const RadioEmotionalWorldCard = memo(function RadioEmotionalWorldCard({
  category,
  stationCount,
  onPress,
}: RadioEmotionalWorldCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.worldCard} onPress={onPress}>
      <LinearGradient colors={category.gradient} style={styles.worldGradient}>
        <View style={styles.worldIconWrap}>
          <Ionicons name={category.icon} size={20} color={COLORS.primary} />
        </View>
        <Text numberOfLines={1} style={styles.worldTitle}>
          {category.title}
        </Text>
        <Text numberOfLines={2} style={styles.worldSubtitle}>
          {category.subtitle}
        </Text>
        {typeof stationCount === "number" && stationCount > 0 ? (
          <Text style={styles.worldMeta}>{stationCount} live picks</Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
});

type RadioStationCardProps = {
  item: RadioStationListItem;
  onPress: () => void;
  variant?: "list" | "premium";
};

const RadioStationArt = memo(function RadioStationArt({
  artworkUrl,
  item,
  size = 44,
}: {
  artworkUrl?: string;
  item: RadioStationListItem;
  size?: number;
}) {
  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(item) || includeMatureInApi;
  const radius = size >= 56 ? 16 : 12;

  if (!artworkUrl || !showMatureArt) {
    return (
      <View style={[styles.stationArtFallback, { width: size, height: size, borderRadius: radius }]}>
        <Ionicons name="radio-outline" size={size >= 56 ? 24 : 18} color={COLORS.textMuted} />
      </View>
    );
  }

  return (
    <HTImage
      uri={artworkUrl}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: "rgba(255,255,255,0.06)" }}
      contentFit="cover"
      prefetch={false}
    />
  );
});

function StationMetaChips({ item }: { item: RadioStationListItem }) {
  const chips = [item.country, item.language, item.genre, item.qualityLabel].filter(Boolean);
  if (!chips.length) return null;

  return (
    <View style={styles.chipRow}>
      {chips.slice(0, 3).map((chip, index) => (
        <View key={`${item.id}-${chip}-${index}`} style={styles.chip}>
          <Text numberOfLines={1} style={styles.chipText}>
            {chip}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const RadioStationCard = memo(function RadioStationCard({
  item,
  onPress,
  variant = "list",
}: RadioStationCardProps) {
  const isPremium = variant === "premium";
  const artSize = isPremium ? 64 : 44;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.stationRow, isPremium && styles.stationRowPremium]}
      onPress={onPress}
    >
      <RadioStationArt artworkUrl={item.artworkUrl} item={item} size={artSize} />

      <View style={styles.stationCopy}>
        <View style={styles.stationTitleRow}>
          <Text numberOfLines={1} style={[styles.stationTitle, isPremium && styles.stationTitlePremium]}>
            {item.title}
          </Text>
          <MatureContentBadge item={item} />
        </View>
        {item.subtitle ? (
          <Text numberOfLines={1} style={styles.stationSubtitle}>
            {getUserFacingRadioSubtitle(item)}
          </Text>
        ) : null}
        {isPremium ? <StationMetaChips item={item} /> : null}
      </View>

      <FavoriteButton item={buildRadioStationFavoriteItem(item)} size={18} />
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

export const RadioStationRailCard = memo(function RadioStationRailCard({
  item,
  onPress,
}: RadioStationCardProps) {
  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(item) || includeMatureInApi;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.railCard} onPress={onPress}>
      <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} style={styles.railGradient}>
        {item.artworkUrl && showMatureArt ? (
          <Image
            source={{ uri: item.artworkUrl, width: 148, height: 96 }}
            style={styles.railArt}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            priority="low"
          />
        ) : (
          <View style={styles.railArtFallback}>
            <Ionicons name="radio-outline" size={28} color={COLORS.primaryGlow} />
          </View>
        )}
        <Text numberOfLines={2} style={styles.railTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.railSubtitle}>
          {item.country || item.genre || "Live Radio"}
        </Text>
        {item.qualityLabel ? (
          <Text numberOfLines={1} style={styles.railQuality}>
            {item.qualityLabel}
          </Text>
        ) : null}
      </LinearGradient>
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
  worldCard: {
    width: 168,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  worldGradient: {
    minHeight: 148,
    padding: 14,
    justifyContent: "flex-end",
  },
  worldIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    marginBottom: 10,
  },
  worldTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  worldSubtitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  worldMeta: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
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
  stationRowPremium: {
    paddingVertical: 14,
    borderColor: "rgba(168,85,247,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stationArtFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stationCopy: {
    flex: 1,
    gap: 4,
  },
  stationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stationTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
  },
  stationTitlePremium: {
    fontSize: 16,
  },
  stationSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.22)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "800",
  },
  railCard: {
    width: 132,
    marginRight: 12,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  railGradient: {
    padding: 10,
    minHeight: 176,
  },
  railArt: {
    width: "100%",
    height: 92,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  railArtFallback: {
    width: "100%",
    height: 92,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  railTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    minHeight: 34,
  },
  railSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  railQuality: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
  },
});
