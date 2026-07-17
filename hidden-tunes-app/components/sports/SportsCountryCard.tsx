import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Image } from "expo-image";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { SportsCountryCard as SportsCountryCardType } from "@/types/sports";

function countryCodeToFlagEmoji(code: string | null | undefined): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized.length !== 2 || !/^[A-Z]{2}$/.test(normalized)) return "\u{1F3F3}\u{FE0F}";
  const points = normalized.split("").map((letter) => 127397 + letter.charCodeAt(0));
  return String.fromCodePoint(...points);
}

type SportsCountryCardProps = {
  country: SportsCountryCardType;
  onPress?: (country: SportsCountryCardType) => void;
  style?: StyleProp<ViewStyle>;
};

function SportsCountryCard({ country, onPress, style }: SportsCountryCardProps) {
  const handlePress = useCallback(() => {
    onPress?.(country);
  }, [onPress, country]);

  const hasLive = !!country.liveCount && country.liveCount > 0;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={country.name}
    >
      {country.artworkUrl ? (
        <Image
          source={{ uri: country.artworkUrl }}
          style={styles.artwork}
          contentFit="cover"
          transition={0}
          recyclingKey={country.code}
          cachePolicy="memory-disk"
          priority="low"
        />
      ) : (
        <Text style={styles.flag}>{countryCodeToFlagEmoji(country.code)}</Text>
      )}
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {country.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {country.competitionCount != null
            ? `${country.competitionCount} competition${country.competitionCount === 1 ? "" : "s"}`
            : "Competitions"}
        </Text>
      </View>
      {hasLive ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{country.liveCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default memo(SportsCountryCard);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  artwork: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },

  flag: {
    fontSize: 26,
    width: 36,
    textAlign: "center",
  },

  copy: {
    flex: 1,
  },

  name: {
    color: SPORTS_COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },

  meta: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: SPORTS_COLORS.liveSoft,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SPORTS_COLORS.live,
  },

  liveText: {
    color: SPORTS_COLORS.live,
    fontSize: 10.5,
    fontWeight: "800",
  },
});
