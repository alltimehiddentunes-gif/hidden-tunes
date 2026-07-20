import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { formatFinishedTime, formatKickoff } from "@/lib/sports/ui/formatKickoff";
import { formatMatchTitle, formatScore, participantBySide } from "@/lib/sports/ui/formatScore";
import { formatMatchMinute } from "@/lib/sports/ui/formatStatus";
import { boundSectionItems } from "@/lib/sports/ui/homeSections";
import { isSportsTestPlayerEnabled } from "@/constants/sportsFlags";
import { needsSportsCountdownClock } from "@/lib/sports/ui/availability";
import type {
  SportsMatchCard as SportsMatchCardType,
  SportsPlaybackSession,
} from "@/types/sports";

import SportsBackButton from "./SportsBackButton";
import SportsHorizontalShelf from "./SportsHorizontalShelf";
import SportsMatchCard from "./SportsMatchCard";
import SportsStatusBadge from "./SportsStatusBadge";

type SportsPlayerShellProps = {
  fixture: SportsMatchCardType | null | undefined;
  session?: SportsPlaybackSession | null;
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
  session,
  onRetry,
}: {
  loading: boolean;
  errorMessage: string | null | undefined;
  session: SportsPlaybackSession | null | undefined;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.surfaceCenter}>
        <ActivityIndicator color={SPORTS_COLORS.amber} size="large" />
        <Text style={styles.surfaceText}>Resolving playback...</Text>
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

  if (!session || session.status === "unavailable") {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="tv-outline" size={36} color={SPORTS_COLORS.textDim} />
        <Text style={styles.surfaceTitle}>Playback unavailable</Text>
        <Text style={styles.surfaceText}>
          {session?.status === "unavailable"
            ? session.message || "This match does not have a playable stream right now."
            : "This match does not have a live stream right now."}
        </Text>
      </View>
    );
  }

  if (session.status === "subscription_required") {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="lock-closed-outline" size={36} color={SPORTS_COLORS.amber} />
        <Text style={styles.surfaceTitle}>Subscription required</Text>
        <Text style={styles.surfaceText}>
          Watch through {session.providerLabel}. Hidden Tunes does not unlock paid streams.
        </Text>
        {session.officialUrl ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void Linking.openURL(session.officialUrl!)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${session.providerLabel}`}
          >
            <Ionicons name="open-outline" size={14} color={SPORTS_COLORS.text} />
            <Text style={styles.retryButtonText}>Open official provider</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (session.status === "external") {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="open-outline" size={36} color={SPORTS_COLORS.plum} />
        <Text style={styles.surfaceTitle}>Watch on Official Provider</Text>
        <Text style={styles.surfaceText}>
          This event streams on {session.providerLabel}. It is not available as an in-app Hidden
          Tunes stream.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => void Linking.openURL(session.officialUrl)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${session.providerLabel}`}
        >
          <Ionicons name="open-outline" size={14} color={SPORTS_COLORS.text} />
          <Text style={styles.retryButtonText}>Open official provider</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready
  const embedUrl = session.embedUrl?.trim() || "";
  if (embedUrl && embedUrl !== "about:blank") {
    return (
      <WebView
        key={embedUrl}
        source={{ uri: embedUrl }}
        style={styles.webView}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
      />
    );
  }

  if (session.fixtureHtml && isSportsTestPlayerEnabled()) {
    return (
      <WebView
        source={{ html: session.fixtureHtml }}
        style={styles.webView}
        originWhitelist={["*"]}
        javaScriptEnabled={false}
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  if (session.manifestUrl) {
    return (
      <View style={styles.surfaceCenter}>
        <Ionicons name="play-circle-outline" size={36} color={SPORTS_COLORS.amber} />
        <Text style={styles.surfaceTitle}>Match ready to play</Text>
        <Text style={styles.surfaceText}>
          Authorized stream session prepared. Native Sports player wiring arrives with provider
          integration.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.surfaceCenter}>
      <Ionicons name="alert-circle-outline" size={36} color={SPORTS_COLORS.textMuted} />
      <Text style={styles.surfaceTitle}>Playback failed</Text>
      <Text style={styles.surfaceText}>
        No valid embed or stream was returned for this match.
      </Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SportsPlayerShell({
  fixture,
  session,
  loading = false,
  errorMessage,
  relatedFixtures,
  nowMs,
  onClose,
  onBack,
  onRetry,
  onSelectRelated,
}: SportsPlayerShellProps) {
  const clockMs = typeof nowMs === "number" ? nowMs : 0;
  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const related = useMemo(
    () => boundSectionItems(relatedFixtures, 6),
    [relatedFixtures]
  );

  const title = fixture ? formatMatchTitle(fixture) : "Match";
  const home = fixture ? participantBySide(fixture.participants, "home") : undefined;
  const away = fixture ? participantBySide(fixture.participants, "away") : undefined;
  const score = fixture ? formatScore(fixture) : null;
  const minute = fixture ? formatMatchMinute(fixture) : null;
  const kickoff = fixture ? formatKickoff(fixture.timing?.startsAt, clockMs) : "";
  const finishedTime = fixture
    ? formatFinishedTime(fixture.timing?.endsAt, fixture.timing?.startsAt)
    : "";
  const competitionLabel = fixture?.competition?.name || fixture?.sport?.name || null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        {onBack ? (
          <SportsBackButton onPress={handleBack} />
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {onClose ? (
          <TouchableOpacity
            onPress={handleClose}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close player"
          >
            <Ionicons name="close" size={22} color={SPORTS_COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <View style={styles.playerFrame}>
        <PlayerSurface
          loading={loading}
          errorMessage={errorMessage}
          session={session}
          onRetry={onRetry}
        />
      </View>

      {fixture ? (
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <SportsStatusBadge code={fixture.status?.code} label={fixture.status?.label} />
            {minute ? <Text style={styles.minute}>{minute}</Text> : null}
          </View>
          {competitionLabel ? (
            <Text style={styles.competition} numberOfLines={1}>
              {competitionLabel}
            </Text>
          ) : null}
          <Text style={styles.summaryTitle} numberOfLines={2}>
            {title}
          </Text>
          {score ? <Text style={styles.score}>{score}</Text> : null}
          {!score && (kickoff || finishedTime) ? (
            <Text style={styles.meta}>{kickoff || finishedTime}</Text>
          ) : null}
          {home?.name && away?.name ? (
            <Text style={styles.meta} numberOfLines={1}>
              {home.name} vs {away.name}
            </Text>
          ) : null}
        </View>
      ) : null}

      {related.length > 0 ? (
        <View style={styles.related}>
          <Text style={styles.relatedTitle}>Related fixtures</Text>
          <SportsHorizontalShelf>
            {related.map((card) => (
              <SportsMatchCard
                key={card.id}
                card={card}
                variant="compact"
                nowMs={needsSportsCountdownClock(card) ? clockMs : undefined}
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
  root: { flex: 1, backgroundColor: SPORTS_COLORS.navy },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    color: SPORTS_COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  playerFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  webView: { flex: 1, backgroundColor: "#000" },
  surfaceCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: "#050B14",
  },
  surfaceTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  surfaceText: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: SPORTS_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  retryButtonText: {
    color: SPORTS_COLORS.text,
    fontWeight: "700",
    fontSize: 13,
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 4,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  minute: { color: SPORTS_COLORS.amber, fontWeight: "800", fontSize: 12 },
  competition: { color: SPORTS_COLORS.textDim, fontSize: 12, marginTop: 4 },
  summaryTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  score: {
    color: SPORTS_COLORS.amber,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
  },
  meta: { color: SPORTS_COLORS.textMuted, fontSize: 13 },
  related: { marginTop: 18 },
  relatedTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
});

