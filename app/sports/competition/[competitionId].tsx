/**
 * Competition hub — fixtures, highlights, replays + follow.
 * No standings table: there is no standings API in this phase.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
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
import {
  getSportsWatchAction,
  needsSportsCountdownClock,
  openSportsPlayerIfPlayable,
  shouldOpenSportsPlayer,
} from "../../../lib/sports/ui/availability";
import { boundSectionItems, SPORTS_SECTION_LIMITS } from "../../../lib/sports/ui/homeSections";
import type {
  SportsCompetitionCard,
  SportsMatchCard as SportsMatchCardType,
  SportsVideoCard as SportsVideoCardType,
} from "../../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsScreenHeader, useSportsFullUiGate, useSportsNowClock } from "../_shared";

type CompetitionListSection =
  | { id: string; kind: "fixtures"; title: string; variant: "shelf" | "finished"; items: SportsMatchCardType[] }
  | { id: string; kind: "videos"; title: string; items: SportsVideoCardType[] };

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
    const action = getSportsWatchAction(card);
    if (action.kind === "watch_external" || action.kind === "subscription") {
      router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
      return;
    }
    if (!shouldOpenSportsPlayer(card)) return;
    openSportsPlayerIfPlayable(card);
  }, []);
  const onPressVideo = useCallback((v: SportsVideoCardType) => {
    if (v.fixtureId) router.push(`/sports/fixture/${encodeURIComponent(v.fixtureId)}` as any);
  }, []);

  const live = useMemo(
    () => boundSectionItems(fixtures.filter((f) => f.status?.live), SPORTS_SECTION_LIMITS.horizontal),
    [fixtures]
  );
  const upcoming = useMemo(
    () =>
      boundSectionItems(
        fixtures.filter((f) => !f.status?.live && !f.status?.finished),
        SPORTS_SECTION_LIMITS.horizontal
      ),
    [fixtures]
  );
  const finished = useMemo(
    () => boundSectionItems(fixtures.filter((f) => f.status?.finished), SPORTS_SECTION_LIMITS.horizontal),
    [fixtures]
  );
  const highlightItems = useMemo(
    () => boundSectionItems(highlights, SPORTS_SECTION_LIMITS.horizontal),
    [highlights]
  );
  const replayItems = useMemo(
    () => boundSectionItems(replays, SPORTS_SECTION_LIMITS.horizontal),
    [replays]
  );
  const hasAnyContent = !!(
    live.length ||
    upcoming.length ||
    finished.length ||
    highlightItems.length ||
    replayItems.length
  );

  const listSections = useMemo(() => {
    const next: CompetitionListSection[] = [];
    if (live.length) {
      next.push({ id: "live", kind: "fixtures", title: "Live Now", variant: "shelf", items: live });
    }
    if (upcoming.length) {
      next.push({
        id: "upcoming",
        kind: "fixtures",
        title: "Upcoming",
        variant: "shelf",
        items: upcoming,
      });
    }
    if (finished.length) {
      next.push({
        id: "finished",
        kind: "fixtures",
        title: "Recently Finished",
        variant: "finished",
        items: finished,
      });
    }
    if (highlightItems.length) {
      next.push({ id: "highlights", kind: "videos", title: "Highlights", items: highlightItems });
    }
    if (replayItems.length) {
      next.push({ id: "replays", kind: "videos", title: "Replays", items: replayItems });
    }
    return next;
  }, [live, upcoming, finished, highlightItems, replayItems]);

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
        <View style={{ paddingTop: 8, paddingBottom: 40 }}>
          <View style={{ marginBottom: 20 }}>
            <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
          </View>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </View>
      ) : (
        <FlatList
          data={listSections}
          keyExtractor={(section) => section.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={error ? <SportsErrorState message={error} onRetry={load} /> : null}
          ListEmptyComponent={
            !hasAnyContent && !error ? (
              <SportsEmptyState
                title="No matches yet"
                message="This competition doesn't have any fixtures, highlights, or replays right now."
              />
            ) : null
          }
          renderItem={({ item: section }) => (
            <SportsSection title={section.title}>
              {section.kind === "fixtures" ? (
                <SportsHorizontalShelf maxItems={SPORTS_SECTION_LIMITS.horizontal}>
                  {section.items.map((card) => (
                    <SportsMatchCard
                      key={card.id}
                      card={card}
                      variant={section.variant}
                      nowMs={needsSportsCountdownClock(card) ? nowMs : undefined}
                      onPress={onPressMatch}
                      onWatch={onWatchMatch}
                    />
                  ))}
                </SportsHorizontalShelf>
              ) : (
                <SportsHorizontalShelf maxItems={SPORTS_SECTION_LIMITS.horizontal}>
                  {section.items.map((v) => (
                    <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                  ))}
                </SportsHorizontalShelf>
              )}
            </SportsSection>
          )}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === "android"}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
});
