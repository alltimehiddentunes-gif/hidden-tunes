/**
 * Sports player route — authoritative Sports playback owner.
 * Latest fixture tap wins via monotonic generation + AbortController.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SportsEmptyState, SportsPlayerShell } from "../../../components/sports";
import {
  claimExclusivePlayback,
  registerPlaybackOwnerAdapter,
  releasePlaybackOwner,
} from "../../../services/playback/PlaybackHandoffCoordinator";
import {
  registerSportsSessionController,
} from "../../../services/playback/sportsSessionController";
import {
  fetchSportsFixtureDetail,
  recordSportsWatchHistory,
  resolveSportsFixturePlaySession,
  upsertSportsContinueWatching,
} from "../../../services/sports";
import {
  isSportsResolveAbortError,
  shouldCommitSportsResolve,
} from "../../../services/sports/sportsPlaybackResolver";
import {
  openSportsPlayer,
  setSportsPlayerRouteActive,
} from "../../../lib/sports/ui/availability";
import { formatMatchTitle } from "../../../lib/sports/ui/formatScore";
import type {
  SportsFixtureDetail,
  SportsMatchCard,
  SportsPlaybackSession,
} from "../../../types/sports";

import {
  SPORTS_COLORS,
  SportsDisabledState,
  SportsScreenHeader,
  navigateSportsBack,
  useSportsFullUiGate,
  useSportsNowClock,
} from "../_shared";

export default function SportsPlayerScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ fixtureId?: string }>();
  const fixtureId = String(params.fixtureId || "").trim();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixture, setFixture] = useState<SportsFixtureDetail | null>(null);
  const [session, setSession] = useState<SportsPlaybackSession | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const activeFixtureRef = useRef(fixtureId);
  const mountedRef = useRef(true);
  const sessionActiveRef = useRef(false);
  const claimGenerationRef = useRef<number | null>(null);

  activeFixtureRef.current = fixtureId;

  const stopSportsOwner = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionActiveRef.current = false;
    setSession(null);
    releasePlaybackOwner("sports", claimGenerationRef.current ?? undefined);
    claimGenerationRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setSportsPlayerRouteActive(true);
    registerSportsSessionController({
      stopSession: stopSportsOwner,
      isSessionActive: () => sessionActiveRef.current,
    });
    const unregisterAdapter = registerPlaybackOwnerAdapter({
      id: "sports",
      stopImmediately: () => {
        stopSportsOwner();
      },
      isActive: () => sessionActiveRef.current,
    });
    return () => {
      mountedRef.current = false;
      setSportsPlayerRouteActive(false);
      unregisterAdapter();
      registerSportsSessionController(null);
      stopSportsOwner();
    };
  }, [stopSportsOwner]);

  const resolve = useCallback(
    async (requestedFixtureId: string) => {
      const id = String(requestedFixtureId || "").trim();
      if (!id) return;

      const generation = generationRef.current + 1;
      generationRef.current = generation;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const hadSession = sessionActiveRef.current;
      setSwitching(hadSession);
      setLoading(true);
      setError(null);
      // Keep prior fixture chrome while switching; clear only the playable session.
      sessionActiveRef.current = false;
      setSession(null);
      if (!hadSession) {
        setFixture((prev) => (prev?.id === id ? prev : null));
      }

      const canCommit = () =>
        shouldCommitSportsResolve({
          generation,
          currentGeneration: generationRef.current,
          fixtureId: id,
          activeFixtureId: activeFixtureRef.current,
          aborted: controller.signal.aborted,
          mounted: mountedRef.current,
        });

      try {
        const claim = await claimExclusivePlayback({
          owner: "sports",
          contentKind: "sports",
          mediaKey: id,
        });
        if (!canCommit() || !claim.isCurrent()) return;
        claimGenerationRef.current = claim.generation;

        const [detail, playSession] = await Promise.all([
          fetchSportsFixtureDetail(id, {
            signal: controller.signal,
            country: "ZZ",
            platform: Platform.OS,
          }),
          resolveSportsFixturePlaySession({
            fixtureId: id,
            platform: Platform.OS,
            country: "ZZ",
            signal: controller.signal,
          }),
        ]);

        if (!canCommit() || !claim.isCurrent()) return;

        if (detail.fixture) setFixture(detail.fixture);
        setSession(playSession);
        sessionActiveRef.current = playSession.status === "ready";

        if (playSession.status === "unavailable") {
          setError(playSession.message || "This match is currently unavailable.");
          return;
        }

        if (playSession.status === "ready") {
          const summaryTitle = detail.fixture
            ? formatMatchTitle(detail.fixture)
            : playSession.title || "Match";
          await recordSportsWatchHistory({
            id,
            kind: "broadcast",
            title: summaryTitle,
            positionMs: 0,
          });
          if (!canCommit()) return;
          await upsertSportsContinueWatching({
            id,
            kind: "broadcast",
            title: summaryTitle,
            positionMs: 0,
          });
        }
      } catch (err) {
        if (!canCommit()) return;
        if (isSportsResolveAbortError(err) || controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "This match could not be loaded right now."
        );
      } finally {
        if (canCommit()) {
          setLoading(false);
          setSwitching(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!gate.allowed || !fixtureId) return;
    void resolve(fixtureId);
    return () => {
      // Abort only this fixture's in-flight work when fixtureId changes or unmounts.
      abortRef.current?.abort();
    };
  }, [gate.allowed, fixtureId, resolve]);

  const onSelectRelated = useCallback((card: SportsMatchCard) => {
    if (!card?.id || card.id === activeFixtureRef.current) return;
    openSportsPlayer(card.id);
  }, []);

  const leavePlayer = useCallback(() => {
    stopSportsOwner();
    setFixture(null);
    setError(null);
    setLoading(false);
    setSwitching(false);
    navigateSportsBack();
  }, [stopSportsOwner]);

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
        <SportsScreenHeader title="Match" onBack={leavePlayer} />
        <SportsEmptyState
          title="Match not found"
          message="This Sports player link is missing a fixture."
          ctaLabel="Back to Sports"
          onCta={() => router.replace("/sports" as never)}
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
        loading={loading || switching}
        errorMessage={error}
        relatedFixtures={fixture?.relatedFixtures}
        nowMs={nowMs}
        onBack={leavePlayer}
        onClose={leavePlayer}
        onRetry={() => {
          void resolve(fixtureId);
        }}
        onSelectRelated={onSelectRelated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPORTS_COLORS.navy },
});
