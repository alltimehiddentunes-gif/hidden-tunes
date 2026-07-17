/**
 * Competition hub — fixtures, highlights, replays + follow.
 * No standings table: there is no standings API in this phase.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsEmptyState,
  SportsErrorState,
  SportsFollowButton,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsMatchCardSkeleton,
  SportsSection,
  SportsSkeletonRow,
  SportsVideoCard,
} from "../../../components/sports";
import {
  fetchSportsCompetitionDetail,
  followSportsEntity,
  isSportsFollowed,
  unfollowSportsEntity,
} from "../../../services/sports";
import type {
  SportsCompetitionCard,
  SportsMatchCard as SportsMatchCardType,
  SportsVideoCard as SportsVideoCardType,
} from "../../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsScreenHeader, useSportsFullUiGate, useSportsNowClock } from "../_shared";

export default function CompetitionHubScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ competitionId?: string }>();
  const competitionId = String(params.competitionId || "").trim();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [competition, setCompetition] = useState<SportsCompetitionCard | null>(null);
  const [fixtures, setFixtures] = useState<SportsMatchCardType[]>([]);
  const [highlights, setHighlights] = useState<SportsVideoCardType[]>([]);
  const [replays, setReplays] = useState<SportsVideoCardType[]>([]);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    if (!competitionId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const [res, isFollowed] = await Promise.all([
        fetchSportsCompetitionDetail(competitionId, {
          signal: controller.signal,
          country: "ZZ",
          platform: Platform.OS,
        }),
        isSportsFollowed("competition", competitionId),
      ]);
      if (controller.signal.aborted) return;

      if (!res.enabled) {
        setError("Sports is unavailable right now.");
        return;
      }
      if (!res.competition) {
        setError("This competition was not found.");
        return;
      }
      setCompetition(res.competition);
      setFixtures(res.fixtures || []);
      setHighlights(res.highlights || []);
      setReplays(res.replays || []);
      setFollowed(isFollowed);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "This competition could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [competitionId]);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const toggleFollow = useCallback(async () => {
    if (!competition || followBusy) return;
    setFollowBusy(true);
    try {
      if (followed) {
        await unfollowSportsEntity("competition", competition.id);
        setFollowed(false);
      } else {
        await followSportsEntity({
          id: competition.id,
          type: "competition",
          name: competition.name,
          subtitle: competition.sportName || competition.countryName || null,
          artworkUrl: competition.logoUrl || null,
          sportSlug: competition.sportSlug || null,
        });
        setFollowed(true);
      }
    } finally {
      setFollowBusy(false);
    }
  }, [competition, followed, followBusy]);

  const onPressMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
    router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
  }, []);
  const onWatchMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `watch:${card.id}`)) return;
    router.push(`/sports/player/${encodeURIComponent(card.id)}` as any);
  }, []);
  const onPressVideo = useCallback((v: SportsVideoCardType) => {
    if (v.fixtureId) router.push(`/sports/fixture/${encodeURIComponent(v.fixtureId)}` as any);
  }, []);

  const live = useMemo(() => fixtures.filter((f) => f.status?.live), [fixtures]);
  const upcoming = useMemo(
    () => fixtures.filter((f) => !f.status?.live && !f.status?.finished),
    [fixtures]
  );
  const finished = useMemo(() => fixtures.filter((f) => f.status?.finished), [fixtures]);
  const hasAnyContent = !!(live.length || upcoming.length || finished.length || highlights.length || replays.length);

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsScreenHeader title="Competition" />
        <SportsEmptyState title="Sports isn't available yet" message={gate.reason} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader
        title={competition?.name || "Competition"}
        subtitle={competition?.countryName || competition?.sportName || undefined}
        right={
          competition ? (
            <SportsFollowButton followed={followed} onToggle={toggleFollow} size="sm" />
          ) : undefined
        }
      />

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
          <View style={{ marginBottom: 20 }}>
            <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
          </View>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? <SportsErrorState message={error} onRetry={load} /> : null}

          {!hasAnyContent && !error ? (
            <SportsEmptyState
              title="No matches yet"
              message="This competition doesn't have any fixtures, highlights, or replays right now."
            />
          ) : (
            <>
              {live.length ? (
                <SportsSection title="Live Now">
                  <SportsHorizontalShelf>
                    {live.map((card) => (
                      <SportsMatchCard
                        key={card.id}
                        card={card}
                        nowMs={nowMs}
                        onPress={onPressMatch}
                        onWatch={onWatchMatch}
                      />
                    ))}
                  </SportsHorizontalShelf>
                </SportsSection>
              ) : null}

              {upcoming.length ? (
                <SportsSection title="Upcoming">
                  <SportsHorizontalShelf>
                    {upcoming.map((card) => (
                      <SportsMatchCard
                        key={card.id}
                        card={card}
                        nowMs={nowMs}
                        onPress={onPressMatch}
                        onWatch={onWatchMatch}
                      />
                    ))}
                  </SportsHorizontalShelf>
                </SportsSection>
              ) : null}

              {finished.length ? (
                <SportsSection title="Recently Finished">
                  <SportsHorizontalShelf>
                    {finished.map((card) => (
                      <SportsMatchCard
                        key={card.id}
                        card={card}
                        variant="finished"
                        nowMs={nowMs}
                        onPress={onPressMatch}
                        onWatch={onWatchMatch}
                      />
                    ))}
                  </SportsHorizontalShelf>
                </SportsSection>
              ) : null}

              {highlights.length ? (
                <SportsSection title="Highlights">
                  <SportsHorizontalShelf>
                    {highlights.map((v) => (
                      <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                    ))}
                  </SportsHorizontalShelf>
                </SportsSection>
              ) : null}

              {replays.length ? (
                <SportsSection title="Replays">
                  <SportsHorizontalShelf>
                    {replays.map((v) => (
                      <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                    ))}
                  </SportsHorizontalShelf>
                </SportsSection>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
});
