import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { SportsWorldCard as SportsWorldCardType } from "@/types/sports";

const SPORT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  football: "football-outline",
  basketball: "basketball-outline",
  tennis: "tennisball-outline",
  cricket: "baseball-outline",
  rugby: "american-football-outline",
  baseball: "baseball-outline",
  "ice-hockey": "snow-outline",
  volleyball: "basketball-outline",
  handball: "hand-left-outline",
  badminton: "tennisball-outline",
  "table-tennis": "tennisball-outline",
  golf: "golf-outline",
  motorsport: "car-sport-outline",
  cycling: "bicycle-outline",
  athletics: "walk-outline",
  swimming: "water-outline",
  boxing: "fitness-outline",
  mma: "fitness-outline",
  wrestling: "body-outline",
  esports: "game-controller-outline",
  olympics: "medal-outline",
  "winter-sports": "snow-outline",
};

type SportsWorldCardProps = {
  sport: SportsWorldCardType;
  onPress?: (sport: SportsWorldCardType) => void;
  style?: StyleProp<ViewStyle>;
};

function SportsWorldCard({ sport, onPress, style }: SportsWorldCardProps) {
  const handlePress = useCallback(() => {
    onPress?.(sport);
  }, [onPress, sport]);

  const icon = SPORT_ICONS[sport.slug] || "trophy-outline";
  const hasLive = !!sport.liveCount && sport.liveCount > 0;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={sport.name}
    >
      {sport.artworkUrl ? (
        <Image
          source={{ uri: sport.artworkUrl }}
          style={styles.artwork}
          contentFit="cover"
          transition={0}
          recyclingKey={sport.id}
          cachePolicy="memory-disk"
          priority="low"
        />
      ) : (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={SPORTS_COLORS.amber} />
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {sport.name}
      </Text>
      {hasLive ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{sport.liveCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default memo(SportsWorldCard);

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

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.amberSoft,
  },

  name: {
    flex: 1,
    color: SPORTS_COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
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
