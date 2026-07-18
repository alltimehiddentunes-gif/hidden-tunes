import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

import SportsBackButton from "./SportsBackButton";

type SportsHeaderProps = {
  onBackPress?: () => void;
  onSearchPress?: () => void;
  onFollowingPress?: () => void;
  followingBadgeCount?: number;
  style?: StyleProp<ViewStyle>;
};

function SportsHeader({
  onBackPress,
  onSearchPress,
  onFollowingPress,
  followingBadgeCount,
  style,
}: SportsHeaderProps) {
  const showFollowingBadge = typeof followingBadgeCount === "number" && followingBadgeCount > 0;

  return (
    <View style={[styles.container, style]} testID="sports-screen-header">
      {onBackPress ? <SportsBackButton onPress={onBackPress} /> : null}

      <View style={styles.copy}>
        <Text style={styles.title}>Sports</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Live matches, competitions, highlights and replays
        </Text>
      </View>

      <View style={styles.actions}>
        {onFollowingPress ? (
          <Pressable
            onPress={onFollowingPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="Following"
            hitSlop={4}
          >
            <Ionicons name="heart-outline" size={19} color={SPORTS_COLORS.text} />
            {showFollowingBadge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {followingBadgeCount! > 99 ? "99+" : followingBadgeCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {onSearchPress ? (
          <Pressable
            onPress={onSearchPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="Search sports"
            hitSlop={4}
          >
            <Ionicons name="search" size={19} color={SPORTS_COLORS.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default memo(SportsHeader);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },

  copy: {
    flex: 1,
  },

  title: {
    color: SPORTS_COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  subtitle: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 4,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },

  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.amber,
  },

  badgeText: {
    color: "#0A0A0A",
    fontSize: 9,
    fontWeight: "900",
  },
});
