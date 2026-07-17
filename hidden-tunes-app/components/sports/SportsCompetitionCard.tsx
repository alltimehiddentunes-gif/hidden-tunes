import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { SportsCompetitionCard as SportsCompetitionCardType } from "@/types/sports";

import SportsFollowButton from "./SportsFollowButton";

type SportsCompetitionCardProps = {
  competition: SportsCompetitionCardType;
  onPress?: (competition: SportsCompetitionCardType) => void;
  onToggleFollow?: (competition: SportsCompetitionCardType) => void;
  style?: StyleProp<ViewStyle>;
};

function SportsCompetitionCard({
  competition,
  onPress,
  onToggleFollow,
  style,
}: SportsCompetitionCardProps) {
  const handlePress = useCallback(() => {
    onPress?.(competition);
  }, [onPress, competition]);

  const handleToggleFollow = useCallback(() => {
    onToggleFollow?.(competition);
  }, [onToggleFollow, competition]);

  const metaLine = [competition.sportName, competition.countryName].filter(Boolean).join(" · ");
  const hasLive = !!competition.liveCount && competition.liveCount > 0;
  const hasUpcoming = !!competition.upcomingCount && competition.upcomingCount > 0;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={`${competition.name}${metaLine ? `, ${metaLine}` : ""}`}
    >
      <View style={styles.topRow}>
        {competition.logoUrl ? (
          <Image
            source={{ uri: competition.logoUrl }}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            recyclingKey={competition.id}
            cachePolicy="memory-disk"
            priority="low"
          />
        ) : (
          <View style={styles.logoFallback}>
            <Ionicons name="trophy-outline" size={22} color={SPORTS_COLORS.textDim} />
          </View>
        )}
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {competition.shortName || competition.name}
          </Text>
          {metaLine ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaLine}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.countsRow}>
          {hasLive ? (
            <View style={styles.countBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.countTextLive}>{competition.liveCount} live</Text>
            </View>
          ) : null}
          {hasUpcoming ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{competition.upcomingCount} upcoming</Text>
            </View>
          ) : null}
          {!hasLive && !hasUpcoming ? (
            <Text style={styles.countTextIdle}>No fixtures scheduled</Text>
          ) : null}
        </View>

        {onToggleFollow ? (
          <SportsFollowButton
            followed={!!competition.followed}
            onToggle={handleToggleFollow}
            size="sm"
            iconOnly
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export default memo(SportsCompetitionCard);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    gap: 12,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },

  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },

  copy: {
    flex: 1,
  },

  name: {
    color: SPORTS_COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  meta: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 3,
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  countsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SPORTS_COLORS.live,
  },

  countTextLive: {
    color: SPORTS_COLORS.live,
    fontSize: 10.5,
    fontWeight: "800",
  },

  countText: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: "700",
  },

  countTextIdle: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "600",
  },
});
