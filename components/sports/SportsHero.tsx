import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { buildMatchAccessibilityLabel } from "@/lib/sports/ui/buildAccessibilityLabel";
import { formatCountdown, formatKickoff } from "@/lib/sports/ui/formatKickoff";
import {
  formatMatchTitle,
  participantBySide,
  participantInitials,
} from "@/lib/sports/ui/formatScore";
import {
  canShowWatchAction,
  formatMatchMinute,
  primaryActionLabel,
} from "@/lib/sports/ui/formatStatus";
import type { SportsMatchCard, SportsMatchParticipant } from "@/types/sports";

import SportsStatusBadge from "./SportsStatusBadge";

type SportsHeroProps = {
  card: SportsMatchCard | null | undefined;
  nowMs?: number;
  reminded?: boolean;
  onPress?: (card: SportsMatchCard) => void;
  onWatch?: (card: SportsMatchCard) => void;
  onRemind?: (card: SportsMatchCard) => void;
};

function HeroParticipant({
  participant,
  align,
}: {
  participant: SportsMatchParticipant | undefined;
  align: "left" | "right";
}) {
  return (
    <View style={[styles.heroParticipant, align === "right" && styles.heroParticipantRight]}>
      {participant?.logoUrl ? (
        <Image
          source={{ uri: participant.logoUrl }}
          style={styles.heroLogo}
          contentFit="contain"
          transition={0}
          recyclingKey={participant.id}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.heroLogoFallback}>
          <Text style={styles.heroLogoFallbackText}>
            {participantInitials(participant?.name)}
          </Text>
        </View>
      )}
      <Text style={styles.heroParticipantName} numberOfLines={2}>
        {participant?.name || "TBD"}
      </Text>
      {participant?.score != null && String(participant.score).length > 0 ? (
        <Text style={styles.heroScore}>{participant.score}</Text>
      ) : null}
    </View>
  );
}

function SportsHero({
  card,
  nowMs,
  reminded = false,
  onPress,
  onWatch,
  onRemind,
}: SportsHeroProps) {
  const clockMs = typeof nowMs === "number" ? nowMs : 0;
  const handlePress = useCallback(() => {
    if (card) onPress?.(card);
  }, [onPress, card]);

  const handleWatch = useCallback(() => {
    if (card) onWatch?.(card);
  }, [onWatch, card]);

  const handleRemind = useCallback(() => {
    if (card) onRemind?.(card);
  }, [onRemind, card]);

  if (!card) return null;

  const home = participantBySide(card.participants, "home");
  const away = participantBySide(card.participants, "away");
  const title = formatMatchTitle(card);
  const minute = formatMatchMinute(card);
  const kickoff = formatKickoff(card.timing?.startsAt, clockMs);
  const countdown = formatCountdown(card.timing?.startsAt, clockMs);
  const accessibilityLabel = buildMatchAccessibilityLabel(card);
  const artworkUrl = card.artwork?.posterUrl || card.artwork?.thumbnailUrl || null;

  const actionLabel = primaryActionLabel(card);
  const isRemindAction = actionLabel === "Remind me";
  const showWatch = !isRemindAction && actionLabel && canShowWatchAction(card) && !!onWatch;
  const showRemind = isRemindAction && !!onRemind;

  const competitionLabel = card.competition?.name || card.sport?.name || null;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.hero}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {artworkUrl ? (
        <Image
          source={{ uri: artworkUrl }}
          style={styles.heroArtwork}
          contentFit="cover"
          transition={150}
          recyclingKey={card.id}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.heroArtwork, styles.heroArtworkFallback]} />
      )}

      <LinearGradient
        colors={["rgba(7,16,24,0.15)", "rgba(7,16,24,0.55)", "rgba(7,16,24,0.94)"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.heroContent}>
        <View style={styles.heroTopRow}>
          <SportsStatusBadge code={card.status?.code} label={card.status?.label} minute={minute} />
          {competitionLabel ? (
            <Text style={styles.heroCompetition} numberOfLines={1}>
              {competitionLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.heroMatchup}>
          <HeroParticipant participant={home} align="left" />
          <Text style={styles.heroVs}>VS</Text>
          <HeroParticipant participant={away} align="right" />
        </View>

        <Text style={styles.heroTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.heroTiming} numberOfLines={1}>
          {card.status?.live ? "In progress" : countdown || kickoff}
        </Text>

        <View style={styles.heroActions}>
          {showWatch ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                handleWatch();
              }}
              style={styles.heroWatchButton}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} ${title}`}
            >
              <Ionicons name="play" size={16} color="#0A0A0A" />
              <Text style={styles.heroWatchButtonText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          {showRemind ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                handleRemind();
              }}
              style={[
                styles.heroRemindButton,
                reminded && styles.heroRemindButtonActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={reminded ? `Reminder set for ${title}` : `Remind me for ${title}`}
            >
              <Ionicons
                name={reminded ? "notifications" : "notifications-outline"}
                size={16}
                color={reminded ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
              />
              <Text
                style={[
                  styles.heroRemindButtonText,
                  reminded && styles.heroRemindButtonTextActive,
                ]}
              >
                {reminded ? "Reminder set" : "Remind me"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default memo(SportsHero);

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    aspectRatio: 16 / 11,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  heroArtwork: {
    ...StyleSheet.absoluteFill,
  },

  heroArtworkFallback: {
    backgroundColor: SPORTS_COLORS.surfaceRaised,
  },

  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },

  heroCompetition: {
    flex: 1,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "800",
  },

  heroMatchup: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  heroParticipant: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },

  heroParticipantRight: {},

  heroLogo: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },

  heroLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  heroLogoFallbackText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },

  heroParticipantName: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "800",
    textAlign: "center",
  },

  heroScore: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },

  heroVs: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "900",
    marginHorizontal: 6,
  },

  heroTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "900",
  },

  heroTiming: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 4,
  },

  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  heroWatchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 20,
    backgroundColor: SPORTS_COLORS.amber,
  },

  heroWatchButtonText: {
    color: "#0A0A0A",
    fontSize: 14,
    fontWeight: "900",
  },

  heroRemindButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  heroRemindButtonActive: {
    backgroundColor: SPORTS_COLORS.plum,
    borderColor: SPORTS_COLORS.plum,
  },

  heroRemindButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  heroRemindButtonTextActive: {
    color: "#fff",
  },
});
