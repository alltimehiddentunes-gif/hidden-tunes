/**
 * Sports player route — resolves playback exactly once per fixture on mount.
 * Uses resolveSportsFixturePlayback directly (fixture → watch-options →
 * broadcast) rather than SportsPlaybackContext, since this route owns a
 * single, short-lived playback session and does not need cross-screen state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SportsEmptyState, SportsPlayerShell } from "../../../components/sports";
import {
  fetchSportsFixtureDetail,
  recordSportsWatchHistory,
  resolveSportsFixturePlayback,
  upsertSportsContinueWatching,
} from "../../../services/sports";
import { formatMatchTitle } from "../../../lib/sports/ui/formatScore";
import type { SportsFixtureDetail, SportsMatchCard, SportsPlaybackResult } from "../../../types/sports";

import { SPORTS_COLORS, SportsDisabledState, useSportsFullUiGate, useSportsNowClock } from "../_shared";

export default function SportsPlayerScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ fixtureId?: string }>();
  const fixtureId = String(params.fixtureId || "").trim();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixture, setFixture] = useState<SportsFixtureDetail | null>(null);
  const [playback, setPlayback] = useState<SportsPlaybackResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const resolvedOnceRef = useRef(false);

  const resolve = useCallback(async () => {
    if (!fixtureId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setPlayback(null);

    try {
      const [detail, resolved] = await Promise.all([
        fetchSportsFixtureDetail(fixtureId, {
          signal: controller.signal,
          country: "ZZ",
          platform: Platform.OS,
        }),
        resolveSportsFixturePlayback({
          fixtureId,
          platform: Platform.OS,
          country: "ZZ",
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;

      if (detail.fixture) {
        setFixture(detail.fixture);
      }

      if (!resolved.success || !resolved.playback) {
        setError(resolved.error || "This match is currently unavailable.");
        return;
      }
      setPlayback(resolved.playback);

      const summaryTitle = detail.fixture ? formatMatchTitle(detail.fixture) : resolved.title || "Match";
      await recordSportsWatchHistory({
        id: fixtureId,
        kind: "broadcast",
        title: summaryTitle,
        positionMs: 0,
      });
      await upsertSportsContinueWatching({
        id: fixtureId,
        kind: "broadcast",
        title: summaryTitle,
        positionMs: 0,
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "This match could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    if (!gate.allowed || !fixtureId) return;
    if (resolvedOnceRef.current) return;
    resolvedOnceRef.current = true;
    void resolve();
    return () => abortRef.current?.abort();
  }, [gate.allowed, fixtureId, resolve]);

  const onClose = useCallback(() => {
    router.back();
  }, []);

  const onRetry = useCallback(() => {
    void resolve();
  }, [resolve]);

  const onSelectRelated = useCallback((card: SportsMatchCard) => {
    router.replace(`/sports/player/${encodeURIComponent(card.id)}` as any);
  }, []);

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsDisabledState message={gate.reason} />
      </SafeAreaView>
    );
  }

  if (!fixtureId) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsEmptyState title="Match not found" message="No fixture was specified." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsPlayerShell
        fixture={fixture}
        playback={playback}
        loading={loading}
        errorMessage={error}
        relatedFixtures={fixture?.relatedFixtures}
        nowMs={nowMs}
        onClose={onClose}
        onRetry={onRetry}
        onSelectRelated={onSelectRelated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.navy },
});
