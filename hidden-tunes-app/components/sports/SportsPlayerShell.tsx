import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { formatFinishedTime, formatKickoff } from "@/lib/sports/ui/formatKickoff";
import { formatMatchTitle, formatScore, participantBySide } from "@/lib/sports/ui/formatScore";
import { formatMatchMinute } from "@/lib/sports/ui/formatStatus";
import { boundSectionItems, stableSportsKey } from "@/lib/sports/ui/homeSections";
import type { SportsMatchCard as SportsMatchCardType, SportsPlaybackResult } from "@/types/sports";

import SportsHorizontalShelf from "./SportsHorizontalShelf";
import SportsMatchCard from "./SportsMatchCard";
import SportsStatusBadge from "./SportsStatusBadge";

type SportsPlayerShellProps = {
  fixture: SportsMatchCardType | null | undefined;
  playback?: SportsPlaybackResult | null;
  loading?: boolean;
  errorMessage?: string | null;
  relatedFixtures?: SportsMatchCardType[];
  nowMs?: number;
  onClose?: () => void;
  onBack?: () => void;
  onRetry?: () => void;
  onSelectRelated?: (fixture: SportsMatchCardType) => void;
};

function PlayerSurface({
  loading,
  errorMessage,
  playback,
  onRetry,
}: {
  loading: boolean;
  errorMessage: string | null | undefined;
  playback: SportsPlaybackResult | null | undefined;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.surfaceCenter}>
        <ActivityIndicator color={SPORTS_COLORS.amber} size="large" />
        <Text style={styles.surfaceText}>Loading match...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="alert-circle-outline" size={36} color={SPORTS_COLORS.textMuted} />
        <Text style={styles.surfaceTitle}>This match is currently unavailable</Text>
        <Text style={styles.surfaceText}>{errorMessage}</Text>
        {onRetry ? (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
            <Ionicons name="refresh" size={14} color={SPORTS_COLORS.text} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (!playback) {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="tv-outline" size={36} color={SPORTS_COLORS.textDim} />
        <Text style={styles.surfaceTitle}>Playback unavailable</Text>
        <Text style={styles.surfaceText}>This match does not have a live stream right now.</Text>
      </View>
    );
  }

  if (playback.mode === "embedded" && playback.embedUrl && playback.embedUrl !== "about:blank") {
    return (
      <WebView
        source={{ uri: playback.embedUrl }}
        style={styles.webView}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
      />
    );
  }

  if (playback.mode === "native") {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="play-circle-outline" size={36} color={SPORTS_COLORS.amber} />
        <Text style={styles.surfaceTitle}>Match ready to play</Text>
        <Text style={styles.surfaceText}>Native playback session prepared for this fixture.</Text>
      </View>
    );
  }

  return (
    <View style={styles.surfaceCenter}>
      <Ionicons name="open-outline" size={36} color={SPORTS_COLORS.plum} />
      <Text style={styles.surfaceTitle}>Match ready to play</Text>
      <Text style={styles.surfaceText}>This match streams through a partner app.</Text>
    </View>
  );
}

function SportsPlayerShell({
  fixture,
  playback,
  loading = false,
  errorMessage,
  relatedFixtures,
  nowMs = Date.now(),
  onClose,
  onBack,
  onRetry,
  onSelectRelated,
}: SportsPlayerShellProps) {
  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const related = useMemo(
    () => boundSectionItems(relatedFixtures, 16),
    [relatedFixtures]
  );

  const title = fixture ? formatMatchTitle(fixture) : "Match";
  const home = fixture ? participantBySide(fixture.participants, "home") : undefined;
  const away = fixture ? participantBySide(fixture.participants, "away") : undefined;
  const score = fixture ? formatScore(fixture) : null;
  const minute = fixture ? formatMatchMinute(fixture) : null;
  const kickoff = fixture ? formatKickoff(fixture.timing?.startsAt, nowMs) : "";
  const finishedTime = fixture ? formatFinishedTime(fixture.timing?.endsAt, fixture.timing?.startsAt) : "";
  const competitionLabel = fixture?.competition?.name || fixture?.sport?.name || null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={SPORTS_COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButtonSpacer} />
        )}
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {onClose ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={SPORTS_COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButtonSpacer} />
        )}
      </View>

      <View style={styles.playerShell}>
        <PlayerSurface loading={loading} errorMessage={errorMessage} playback={playback} onRetry={onRetry} />
      </View>

      {fixture ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <SportsStatusBadge
              code={fixture.status?.code}
              label={fixture.status?.label}
              minute={minute}
              size="sm"
            />
            {competitionLabel ? (
              <Text style={styles.summaryCompetition} numberOfLines={1}>
                {competitionLabel}
              </Text>
            ) : null}
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryName} numberOfLines={1}>
              {home?.name || "TBD"}
            </Text>
            <Text style={styles.summaryScore}>
              {score || (fixture.status?.live ? "vs" : kickoff || finishedTime || "vs")}
            </Text>
            <Text style={[styles.summaryName, styles.summaryNameRight]} numberOfLines={1}>
              {away?.name || "TBD"}
            </Text>
          </View>
        </View>
      ) : null}

      {related.length ? (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Related Fixtures</Text>
          <SportsHorizontalShelf>
            {related.map((relatedFixture, index) => (
              <SportsMatchCard
                key={stableSportsKey("related", relatedFixture, index)}
                card={relatedFixture}
                variant="shelf"
                nowMs={nowMs}
                onPress={onSelectRelated}
              />
            ))}
          </SportsHorizontalShelf>
        </View>
      ) : null}
    </View>
  );
}

export default memo(SportsPlayerShell);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPORTS_COLORS.background,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },

  iconButtonSpacer: {
    width: 40,
    height: 40,
  },

  topTitle: {
    flex: 1,
    color: SPORTS_COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },

  playerShell: {
    marginHorizontal: 14,
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  webView: {
    flex: 1,
    backgroundColor: "#000",
  },

  surfaceCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },

  surfaceTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  surfaceText: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 17,
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
    marginTop: 4,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.borderStrong,
  },

  retryButtonText: {
    color: SPORTS_COLORS.text,
    fontSize: 12.5,
    fontWeight: "800",
  },

  summaryCard: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    gap: 10,
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  summaryCompetition: {
    flex: 1,
    color: SPORTS_COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: "700",
  },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  summaryName: {
    flex: 1,
    color: SPORTS_COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },

  summaryNameRight: {
    textAlign: "right",
  },

  summaryScore: {
    color: SPORTS_COLORS.amber,
    fontSize: 14,
    fontWeight: "900",
  },

  relatedSection: {
    marginTop: 20,
    flex: 1,
  },

  relatedTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    paddingHorizontal: 18,
    marginBottom: 12,
  },
});
