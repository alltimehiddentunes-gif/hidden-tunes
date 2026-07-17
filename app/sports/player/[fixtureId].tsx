/**
 * Sports player route — resolves playback exactly once per fixture on mount.
 * One tap → one resolver request → one player mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SportsEmptyState, SportsPlayerShell } from "../../../components/sports";
import {
  fetchSportsFixtureDetail,
  recordSportsWatchHistory,
  resolveSportsFixturePlaySession,
  upsertSportsContinueWatching,
} from "../../../services/sports";
import { formatMatchTitle } from "../../../lib/sports/ui/formatScore";
import type {
  SportsFixtureDetail,
  SportsMatchCard,
  SportsPlaybackSession,
} from "../../../types/sports";

import {
  SPORTS_COLORS,
  SportsDisabledState,
  useSportsFullUiGate,
  useSportsNowClock,
} from "../_shared";

export default function SportsPlayerScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ fixtureId?: string }>();
  const fixtureId = String(params.fixtureId || "").trim();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixture, setFixture] = useState<SportsFixtureDetail | null>(null);
  const [session, setSession] = useState<SportsPlaybackSession | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const resolvedOnceRef = useRef(false);
  const resolvingRef = useRef(false);

  const resolve = useCallback(async () => {
    if (!fixtureId || resolvingRef.current) return;
    resolvingRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setSession(null);

    try {
      const [detail, playSession] = await Promise.all([
        fetchSportsFixtureDetail(fixtureId, {
          signal: controller.signal,
          country: "ZZ",
          platform: Platform.OS,
        }),
        resolveSportsFixturePlaySession({
          fixtureId,
          platform: Platform.OS,
          country: "ZZ",
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;

      if (detail.fixture) setFixture(detail.fixture);
      setSession(playSession);

      if (playSession.status === "unavailable") {
        setError(playSession.message || "This match is currently unavailable.");
        return;
      }

      if (playSession.status === "ready") {
        const summaryTitle =
          detail.fixture ? formatMatchTitle(detail.fixture) : playSession.title || "Match";
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
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error ? err.message : "This match could not be loaded right now."
        );
      }
    } finally {
      resolvingRef.current = false;
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

  const onSelectRelated = useCallback((card: SportsMatchCard) => {
    router.replace(`/sports/player/${encodeURIComponent(card.id)}` as never);
  }, []);

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsDisabledState message={gate.reason} />
      </SafeAreaView>
    );
  }

  if (!fixtureId) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsEmptyState
          title="Match not found"
          message="This Sports player link is missing a fixture."
          actionLabel="Back to Sports"
          onAction={() => router.replace("/sports" as never)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsPlayerShell
        fixture={fixture}
        session={session}
        loading={loading}
        errorMessage={error}
        relatedFixtures={fixture?.relatedFixtures}
        nowMs={nowMs}
        onBack={() => router.back()}
        onClose={() => router.back()}
        onRetry={() => {
          resolvedOnceRef.current = false;
          void resolve();
        }}
        onSelectRelated={onSelectRelated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPORTS_COLORS.navy },
});
