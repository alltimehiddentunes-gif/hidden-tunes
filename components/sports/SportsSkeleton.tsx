import { memo, type ReactElement } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

/**
 * Static, non-animated placeholder blocks. Intentionally no shimmer / loop
 * animation per design guidance — these render once and stay still.
 */
function Block({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.block, style]} />;
}

export const SportsHeroSkeleton = memo(function SportsHeroSkeleton() {
  return (
    <View style={styles.hero}>
      <View style={styles.heroContent}>
        <Block style={styles.heroBadge} />
        <View style={styles.heroMatchupRow}>
          <Block style={styles.heroLogo} />
          <Block style={styles.heroVs} />
          <Block style={styles.heroLogo} />
        </View>
        <Block style={styles.heroTitle} />
        <Block style={styles.heroSubtitle} />
        <View style={styles.heroActionsRow}>
          <Block style={styles.heroButtonWide} />
          <Block style={styles.heroButton} />
        </View>
      </View>
    </View>
  );
});

export const SportsMatchCardSkeleton = memo(function SportsMatchCardSkeleton({
  width = 172,
}: {
  width?: number;
}) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.cardHeaderRow}>
        <Block style={styles.cardBadge} />
        <Block style={styles.cardIcon} />
      </View>
      <View style={styles.cardRow}>
        <Block style={styles.cardAvatar} />
        <Block style={styles.cardLine} />
      </View>
      <View style={styles.cardRow}>
        <Block style={styles.cardAvatar} />
        <Block style={styles.cardLine} />
      </View>
      <Block style={styles.cardMeta} />
    </View>
  );
});

export const SportsScheduleRowSkeleton = memo(function SportsScheduleRowSkeleton() {
  return (
    <View style={styles.scheduleRow}>
      <Block style={styles.scheduleTime} />
      <View style={styles.scheduleMiddle}>
        <Block style={styles.scheduleLine} />
        <Block style={[styles.scheduleLine, styles.scheduleLineShort]} />
      </View>
      <Block style={styles.scheduleAction} />
    </View>
  );
});

export const SportsCompetitionCardSkeleton = memo(function SportsCompetitionCardSkeleton() {
  return (
    <View style={styles.competitionCard}>
      <View style={styles.competitionTopRow}>
        <Block style={styles.competitionLogo} />
        <View style={styles.competitionCopy}>
          <Block style={styles.competitionName} />
          <Block style={styles.competitionMeta} />
        </View>
      </View>
      <Block style={styles.competitionFooter} />
    </View>
  );
});

export const SportsWorldCardSkeleton = memo(function SportsWorldCardSkeleton() {
  return (
    <View style={styles.worldCard}>
      <Block style={styles.worldIcon} />
      <Block style={styles.worldName} />
    </View>
  );
});

export const SportsVideoCardSkeleton = memo(function SportsVideoCardSkeleton({
  width = 200,
}: {
  width?: number;
}) {
  return (
    <View style={[styles.videoCard, { width }]}>
      <Block style={styles.videoThumb} />
      <Block style={styles.videoTitle} />
      <Block style={styles.videoMeta} />
    </View>
  );
});

type SportsSkeletonRowProps = {
  render: () => ReactElement;
  count?: number;
  gap?: number;
};

export const SportsSkeletonRow = memo(function SportsSkeletonRow({
  render,
  count = 4,
  gap = 12,
}: SportsSkeletonRowProps) {
  return (
    <View style={[styles.row, { gap, paddingHorizontal: 18 }]}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index}>{render()}</View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderRadius: 8,
  },

  row: {
    flexDirection: "row",
  },

  // Hero
  hero: {
    width: "100%",
    aspectRatio: 16 / 11,
    borderRadius: 20,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    overflow: "hidden",
  },

  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
    gap: 12,
  },

  heroBadge: {
    width: 84,
    height: 20,
    borderRadius: 8,
  },

  heroMatchupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  heroLogo: {
    flex: 1,
    height: 48,
    borderRadius: 10,
  },

  heroVs: {
    width: 26,
    height: 14,
    borderRadius: 4,
  },

  heroTitle: {
    width: "70%",
    height: 22,
    borderRadius: 6,
  },

  heroSubtitle: {
    width: "45%",
    height: 14,
    borderRadius: 5,
  },

  heroActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },

  heroButtonWide: {
    width: 130,
    height: 44,
    borderRadius: 12,
  },

  heroButton: {
    width: 110,
    height: 44,
    borderRadius: 12,
  },

  // Match card
  card: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    gap: 10,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cardBadge: {
    width: 64,
    height: 18,
    borderRadius: 6,
  },

  cardIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },

  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  cardAvatar: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },

  cardLine: {
    flex: 1,
    height: 12,
    borderRadius: 4,
  },

  cardMeta: {
    width: "60%",
    height: 10,
    borderRadius: 4,
    marginTop: 2,
  },

  // Schedule row
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  scheduleTime: {
    width: 46,
    height: 14,
    borderRadius: 5,
  },

  scheduleMiddle: {
    flex: 1,
    gap: 6,
  },

  scheduleLine: {
    width: "80%",
    height: 12,
    borderRadius: 4,
  },

  scheduleLineShort: {
    width: "50%",
  },

  scheduleAction: {
    width: 60,
    height: 30,
    borderRadius: 8,
  },

  // Competition card
  competitionCard: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    gap: 12,
  },

  competitionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  competitionLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },

  competitionCopy: {
    flex: 1,
    gap: 6,
  },

  competitionName: {
    width: "70%",
    height: 13,
    borderRadius: 4,
  },

  competitionMeta: {
    width: "45%",
    height: 10,
    borderRadius: 4,
  },

  competitionFooter: {
    width: "100%",
    height: 22,
    borderRadius: 6,
  },

  // World / sport card
  worldCard: {
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

  worldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },

  worldName: {
    flex: 1,
    height: 13,
    borderRadius: 4,
  },

  // Video card
  videoCard: {
    marginRight: 12,
    gap: 10,
  },

  videoThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 16,
  },

  videoTitle: {
    width: "90%",
    height: 13,
    borderRadius: 4,
  },

  videoMeta: {
    width: "55%",
    height: 10,
    borderRadius: 4,
  },
});
