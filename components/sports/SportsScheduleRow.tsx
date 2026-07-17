import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { buildMatchAccessibilityLabel } from "@/lib/sports/ui/buildAccessibilityLabel";
import { formatFinishedTime, formatKickoff } from "@/lib/sports/ui/formatKickoff";
import { formatMatchTitle, formatScore } from "@/lib/sports/ui/formatScore";
import { formatMatchMinute, normalizeStatusCode } from "@/lib/sports/ui/formatStatus";
import type { SportsMatchCard } from "@/types/sports";

import SportsStatusBadge from "./SportsStatusBadge";

type SportsScheduleRowProps = {
  card: SportsMatchCard;
  nowMs?: number;
  onPress?: (card: SportsMatchCard) => void;
};

function SportsScheduleRow({ card, nowMs, onPress }: SportsScheduleRowProps) {
  const clockMs = typeof nowMs === "number" ? nowMs : 0;
  const handlePress = useCallback(() => {
    onPress?.(card);
  }, [onPress, card]);

  const title = formatMatchTitle(card);
  const score = formatScore(card);
  const minute = formatMatchMinute(card);
  const statusCode = normalizeStatusCode(card.status?.code);
  const isLive = card.status?.live === true || statusCode === "live";
  const kickoff = formatKickoff(card.timing?.startsAt, clockMs);
  const finishedTime = formatFinishedTime(card.timing?.endsAt, card.timing?.startsAt);
  const accessibilityLabel = buildMatchAccessibilityLabel(card);
  const competitionLabel = card.competition?.shortName || card.competition?.name || null;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.time} numberOfLines={1}>
        {isLive ? minute || "LIVE" : kickoff || finishedTime}
      </Text>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {competitionLabel ? (
          <Text style={styles.meta} numberOfLines={1}>
            {competitionLabel}
          </Text>
        ) : null}
      </View>

      {score ? <Text style={styles.score}>{score}</Text> : null}

      <SportsStatusBadge code={card.status?.code} label={card.status?.label} size="sm" />

      <Ionicons name="chevron-forward" size={16} color={SPORTS_COLORS.textDim} />
    </Pressable>
  );
}

export default memo(SportsScheduleRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  time: {
    width: 52,
    color: SPORTS_COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: "800",
  },

  copy: {
    flex: 1,
  },

  title: {
    color: SPORTS_COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },

  meta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 2,
  },

  score: {
    color: SPORTS_COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
