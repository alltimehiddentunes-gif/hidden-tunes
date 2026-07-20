import { memo, useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { buildMatchAccessibilityLabel } from "@/lib/sports/ui/buildAccessibilityLabel";
import { formatCountdown, formatFinishedTime, formatKickoff } from "@/lib/sports/ui/formatKickoff";
import {
  formatMatchTitle,
  formatScore,
  participantBySide,
  participantInitials,
} from "@/lib/sports/ui/formatScore";
import {
  formatMatchMinute,
  getSportsWatchAction,
  normalizeStatusCode,
} from "@/lib/sports/ui/formatStatus";
import type { SportsMatchCard as SportsMatchCardType, SportsMatchParticipant } from "@/types/sports";

import SportsStatusBadge from "./SportsStatusBadge";

export type SportsMatchCardVariant =
  | "shelf"
  | "featured"
  | "schedule"
  | "search"
  | "finished"
  | "compact";

export type SportsMatchCardProps = {
  card: SportsMatchCardType;
  variant?: SportsMatchCardVariant;
  nowMs?: number;
  reminded?: boolean;
  favorited?: boolean;
  onPress?: (card: SportsMatchCardType) => void;
  onWatch?: (card: SportsMatchCardType) => void;
  onRemind?: (card: SportsMatchCardType) => void;
  onSave?: (card: SportsMatchCardType) => void;
  style?: StyleProp<ViewStyle>;
};

function ParticipantBadge({
  participant,
  size,
}: {
  participant: SportsMatchParticipant | undefined;
  size: number;
}) {
  if (participant?.logoUrl) {
    return (
      <Image
        source={{ uri: participant.logoUrl }}
        style={{ width: size, height: size, borderRadius: size / 4 }}
        contentFit="contain"
        transition={0}
        recyclingKey={participant.id}
        cachePolicy="memory-disk"
        priority="low"
      />
    );
  }
  return (
    <View
      style={[
        styles.initialsBadge,
        { width: size, height: size, borderRadius: size / 4 },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: size * 0.32 }]}>
        {participantInitials(participant?.name)}
      </Text>
    </View>
  );
}

function ParticipantRow({
  participant,
  score,
  emphasize,
  logoSize = 22,
}: {
  participant: SportsMatchParticipant | undefined;
  score: string | number | null | undefined;
  emphasize: boolean;
  logoSize?: number;
}) {
  return (
    <View style={styles.participantRow}>
      <ParticipantBadge participant={participant} size={logoSize} />
      <Text
        style={[styles.participantName, emphasize && styles.participantNameWinner]}
        numberOfLines={1}
      >
        {participant?.name || "TBD"}
      </Text>
      {score != null && String(score).length > 0 ? (
        <Text
          style={[styles.participantScore, emphasize && styles.participantScoreWinner]}
        >
          {score}
        </Text>
      ) : null}
    </View>
  );
}

function SportsMatchCard({
  card,
  variant = "shelf",
  nowMs,
  reminded = false,
  favorited = false,
  onPress,
  onWatch,
  onRemind,
  onSave,
  style,
}: SportsMatchCardProps) {
  const clockMs = typeof nowMs === "number" ? nowMs : 0;
  const home = participantBySide(card.participants, "home");
  const away = participantBySide(card.participants, "away");
  const title = formatMatchTitle(card);
  const score = formatScore(card);
  const minute = formatMatchMinute(card);
  const statusCode = normalizeStatusCode(card.status?.code);
  const isLive = card.status?.live === true || statusCode === "live";
  const kickoff = formatKickoff(card.timing?.startsAt, clockMs);
  const countdown =
    typeof nowMs === "number" ? formatCountdown(card.timing?.startsAt, clockMs) : null;
  const finishedTime = formatFinishedTime(card.timing?.endsAt, card.timing?.startsAt);
  const accessibilityLabel = buildMatchAccessibilityLabel(card);

  const action = getSportsWatchAction(card);
  const actionLabel = action.label;
  const showWatchButton =
    (action.kind === "watch_live" ||
      action.kind === "replay" ||
      action.kind === "highlights" ||
      action.kind === "watch_external" ||
      action.kind === "subscription") &&
    !!onWatch;
  const showRemindButton = action.kind === "remind" && !!onRemind;

  const handlePress = useCallback(() => {
    onPress?.(card);
  }, [onPress, card]);

  const handleWatch = useCallback(() => {
    onWatch?.(card);
  }, [onWatch, card]);

  const handleRemind = useCallback(() => {
    onRemind?.(card);
  }, [onRemind, card]);

  const handleSave = useCallback(() => {
    onSave?.(card);
  }, [onSave, card]);

  const competitionLabel = card.competition?.shortName || card.competition?.name || null;
  const sportLabel = card.sport?.name || null;
  const metaLine = [competitionLabel, sportLabel && !competitionLabel ? sportLabel : null]
    .filter(Boolean)
    .join(" · ");

  const artworkUrl = card.artwork?.posterUrl || card.artwork?.thumbnailUrl || null;

  const saveButton = onSave ? (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        handleSave();
      }}
      hitSlop={10}
      style={styles.saveButton}
      accessibilityRole="button"
      accessibilityLabel={favorited ? "Remove from saved matches" : "Save match"}
    >
      <Ionicons
        name={favorited ? "bookmark" : "bookmark-outline"}
        size={16}
        color={favorited ? SPORTS_COLORS.amber : SPORTS_COLORS.textMuted}
      />
    </Pressable>
  ) : null;

  const actionButton = showWatchButton ? (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        handleWatch();
      }}
      style={[styles.actionButton, styles.watchButton]}
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${title}`}
    >
      <Ionicons
        name={
          action.kind === "replay"
            ? "play-skip-back"
            : action.kind === "highlights"
              ? "flash"
              : "play"
        }
        size={13}
        color="#0A0A0A"
      />
      <Text style={styles.watchButtonText}>{actionLabel}</Text>
    </Pressable>
  ) : showRemindButton ? (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        handleRemind();
      }}
      style={[styles.actionButton, reminded ? styles.remindButtonActive : styles.remindButton]}
      accessibilityRole="button"
      accessibilityLabel={reminded ? `Reminder set for ${title}` : `Remind me for ${title}`}
    >
      <Ionicons
        name={reminded ? "notifications" : "notifications-outline"}
        size={13}
        color={reminded ? SPORTS_COLORS.navy : SPORTS_COLORS.text}
      />
      <Text style={[styles.remindButtonText, reminded && styles.remindButtonTextActive]}>
        {reminded ? "Reminder set" : "Remind me"}
      </Text>
    </Pressable>
  ) : null;

  if (variant === "compact") {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.compactRow, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.compactBadges}>
          <ParticipantBadge participant={home} size={18} />
          <ParticipantBadge participant={away} size={18} />
        </View>
        <View style={styles.compactCopy}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.compactMeta} numberOfLines={1}>
            {isLive ? minute || "Live" : score || kickoff || countdown || finishedTime || ""}
          </Text>
        </View>
        {score ? <Text style={styles.compactScore}>{score}</Text> : null}
        <SportsStatusBadge code={card.status?.code} label={card.status?.label} size="sm" />
      </Pressable>
    );
  }

  if (variant === "schedule" || variant === "search") {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.rowCard, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.rowTimeCol}>
          <Text style={styles.rowTime} numberOfLines={1}>
            {isLive ? minute || "LIVE" : kickoff || finishedTime}
          </Text>
          <SportsStatusBadge code={card.status?.code} label={card.status?.label} size="sm" />
        </View>

        <View style={styles.rowMiddleCol}>
          <ParticipantRow
            participant={home}
            score={home?.score}
            emphasize={!!home?.winner}
          />
          <ParticipantRow
            participant={away}
            score={away?.score}
            emphasize={!!away?.winner}
          />
          {variant === "search" && metaLine ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {metaLine}
            </Text>
          ) : null}
          {countdown ? (
            <Text style={styles.rowCountdown} numberOfLines={1}>
              {countdown}
            </Text>
          ) : null}
        </View>

        <View style={styles.rowActionCol}>
          {actionButton}
          {saveButton}
        </View>
      </Pressable>
    );
  }

  if (variant === "finished") {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.card, styles.cardShelf, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.finishedHeader}>
          <SportsStatusBadge code={card.status?.code} label={card.status?.label} size="sm" />
          {saveButton}
        </View>
        <View style={styles.finishedBody}>
          <ParticipantRow participant={home} score={home?.score} emphasize={!!home?.winner} />
          <ParticipantRow participant={away} score={away?.score} emphasize={!!away?.winner} />
        </View>
        <Text style={styles.finishedMeta} numberOfLines={1}>
          {[metaLine, finishedTime].filter(Boolean).join(" · ")}
        </Text>
        {actionButton ? <View style={styles.finishedActionRow}>{actionButton}</View> : null}
      </Pressable>
    );
  }

  if (variant === "featured") {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.card, styles.cardFeatured, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.featuredArtworkWrap}>
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={styles.featuredArtwork}
              contentFit="cover"
              transition={120}
              recyclingKey={card.id}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.featuredArtwork, styles.artworkFallback]}>
              <Ionicons name="football-outline" size={28} color={SPORTS_COLORS.textDim} />
            </View>
          )}
          <View style={styles.featuredOverlay} />
          <View style={styles.featuredTopRow}>
            <SportsStatusBadge code={card.status?.code} label={card.status?.label} minute={minute} />
            {saveButton}
          </View>
          {competitionLabel ? (
            <Text style={styles.featuredCompetition} numberOfLines={1}>
              {competitionLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.featuredBody}>
          <ParticipantRow participant={home} score={home?.score} emphasize={!!home?.winner} logoSize={26} />
          <ParticipantRow participant={away} score={away?.score} emphasize={!!away?.winner} logoSize={26} />
          <Text style={styles.featuredKickoff} numberOfLines={1}>
            {isLive ? "In progress" : countdown || kickoff}
          </Text>
        </View>
        {actionButton ? <View style={styles.featuredActionRow}>{actionButton}</View> : null}
      </Pressable>
    );
  }

  // default: shelf
  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, styles.cardShelf, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.shelfHeader}>
        <SportsStatusBadge code={card.status?.code} label={card.status?.label} minute={minute} size="sm" />
        {saveButton}
      </View>
      <View style={styles.shelfBody}>
        <ParticipantRow participant={home} score={home?.score} emphasize={!!home?.winner} />
        <ParticipantRow participant={away} score={away?.score} emphasize={!!away?.winner} />
      </View>
      <Text style={styles.shelfMeta} numberOfLines={1}>
        {metaLine || (isLive ? "Live now" : countdown || kickoff || finishedTime)}
      </Text>
      {actionButton ? <View style={styles.shelfActionRow}>{actionButton}</View> : null}
    </Pressable>
  );
}

function areEqual(prev: SportsMatchCardProps, next: SportsMatchCardProps) {
  const prevClock = typeof prev.nowMs === "number";
  const nextClock = typeof next.nowMs === "number";
  const clockEqual =
    !prevClock && !nextClock
      ? true
      : prevClock && nextClock
        ? Math.floor((prev.nowMs as number) / 30000) ===
          Math.floor((next.nowMs as number) / 30000)
        : false;
  return (
    prev.card === next.card &&
    prev.variant === next.variant &&
    prev.reminded === next.reminded &&
    prev.favorited === next.favorited &&
    clockEqual &&
    prev.onPress === next.onPress &&
    prev.onWatch === next.onWatch &&
    prev.onRemind === next.onRemind &&
    prev.onSave === next.onSave
  );
}

export default memo(SportsMatchCard, areEqual);

const CARD_WIDTH = 172;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    overflow: "hidden",
  },

  cardShelf: {
    width: CARD_WIDTH,
    padding: 12,
  },

  cardFeatured: {
    width: CARD_WIDTH + 68,
  },

  shelfHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  shelfBody: {
    gap: 8,
  },

  shelfMeta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 10,
  },

  shelfActionRow: {
    marginTop: 10,
  },

  finishedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  finishedBody: {
    gap: 8,
  },

  finishedMeta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 10,
  },

  finishedActionRow: {
    marginTop: 10,
  },

  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  initialsBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  initialsText: {
    color: SPORTS_COLORS.textMuted,
    fontWeight: "800",
  },

  participantName: {
    flex: 1,
    color: SPORTS_COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  participantNameWinner: {
    color: SPORTS_COLORS.text,
    fontWeight: "900",
  },

  participantScore: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 14,
    fontWeight: "800",
    minWidth: 18,
    textAlign: "right",
  },

  participantScoreWinner: {
    color: SPORTS_COLORS.text,
  },

  saveButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
  },

  watchButton: {
    backgroundColor: SPORTS_COLORS.amber,
  },

  watchButtonText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "900",
  },

  remindButton: {
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.borderStrong,
  },

  remindButtonActive: {
    backgroundColor: SPORTS_COLORS.plum,
  },

  remindButtonText: {
    color: SPORTS_COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },

  remindButtonTextActive: {
    color: "#fff",
  },

  // Compact row
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  compactBadges: {
    flexDirection: "row",
  },

  compactCopy: {
    flex: 1,
  },

  compactTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 12.5,
    fontWeight: "800",
  },

  compactMeta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 2,
  },

  compactScore: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  // Row (schedule / search)
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  rowTimeCol: {
    width: 78,
    gap: 6,
  },

  rowTime: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  rowMiddleCol: {
    flex: 1,
    gap: 6,
  },

  rowMeta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 2,
  },

  rowCountdown: {
    color: SPORTS_COLORS.amber,
    fontSize: 10.5,
    fontWeight: "800",
    marginTop: 2,
  },

  rowActionCol: {
    alignItems: "flex-end",
    gap: 8,
  },

  // Featured
  featuredArtworkWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },

  featuredArtwork: {
    width: "100%",
    height: "100%",
  },

  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },

  featuredOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(7,16,24,0.28)",
  },

  featuredTopRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  featuredCompetition: {
    position: "absolute",
    left: 12,
    bottom: 10,
    right: 12,
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },

  featuredBody: {
    padding: 14,
    gap: 9,
  },

  featuredKickoff: {
    color: SPORTS_COLORS.textDim,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  featuredActionRow: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
