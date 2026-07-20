/**
 * Sport hub — live / later today / upcoming / finished / competitions for one sport.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsCompetitionShelf,
  SportsEmptyState,
  SportsErrorState,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsMatchCardSkeleton,
  SportsSection,
  SportsSkeletonRow,
} from "../../../components/sports";
import { fetchSportsSportHub } from "../../../services/sports";
import { normalizeSportsSlug } from "../../../lib/sports/normalizeSportsSlug";
import {
  getSportsWatchAction,
  needsSportsCountdownClock,
  openSportsPlayerIfPlayable,
  shouldOpenSportsPlayer,
} from "../../../lib/sports/ui/availability";
import { boundSectionItems, sectionItemLimit } from "../../../lib/sports/ui/homeSections";
import type {
  SportsCompetitionCard,
  SportsHomeSection,
  SportsMatchCard as SportsMatchCardType,
  SportsWorldCard,
} from "../../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsScreenHeader, useSportsFullUiGate, useSportsNowClock } from "../_shared";

export default function SportHubScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ sportSlug?: string }>();
  const sportSlug = normalizeSportsSlug(String(params.sportSlug || ""));
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sport, setSport] = useState<SportsWorldCard | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    if (!sportSlug) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const res = await fetchSportsSportHub(sportSlug, {
        signal: controller.signal,
        country: "ZZ",
        platform: Platform.OS,
      });
      if (controller.signal.aborted) return;

      if (!res.enabled) {
        setSections([]);
        setError("Sports preview is unavailable.");
        return;
      }
      setSport(res.sport || null);
      setSections((res.sections || []).filter((s) => (s.items?.length || 0) > 0));
    } catch {
      if (!controller.signal.aborted) {
        setError("Sports could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sportSlug]);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

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
  const onPressCompetition = useCallback((c: SportsCompetitionCard) => {
    router.push(`/sports/competition/${encodeURIComponent(c.id)}` as any);
  }, []);

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsScreenHeader title="Sport" />
        <SportsEmptyState title="Sports isn't available yet" message={gate.reason} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader
        title={sport?.name || sportSlug.replace(/-/g, " ") || "Sport"}
        subtitle={
          sport?.liveCount
            ? `${sport.liveCount} live now`
            : sport?.upcomingCount
              ? `${sport.upcomingCount} upcoming`
              : undefined
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
          data={sections}
          keyExtractor={(section) => section.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={error ? <SportsErrorState message={error} onRetry={load} /> : null}
          ListEmptyComponent={
            !error ? (
              <SportsEmptyState
                title="No current events for this sport."
                message="There are no live, upcoming, or recent fixtures for this sport right now."
              />
            ) : null
          }
          renderItem={({ item: section }) =>
            renderSportHubSection(section, { nowMs, onPressMatch, onWatchMatch, onPressCompetition })
          }
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

function renderSportHubSection(
  section: SportsHomeSection,
  handlers: {
    nowMs: number;
    onPressMatch: (c: SportsMatchCardType) => void;
    onWatchMatch: (c: SportsMatchCardType) => void;
    onPressCompetition: (c: SportsCompetitionCard) => void;
  }
) {
  const limit = sectionItemLimit(section.id);

  if (section.type === "competitions") {
    return (
      <SportsSection title={section.title} subtitle={section.subtitle}>
        <SportsCompetitionShelf
          sectionId={section.id}
          competitions={boundSectionItems(
            section.items as SportsCompetitionCard[],
            limit
          )}
          limit={limit}
          onPress={handlers.onPressCompetition}
        />
      </SportsSection>
    );
  }

  const variant = section.id === "recently_finished" ? "finished" : "shelf";
  const items = boundSectionItems(section.items as SportsMatchCardType[], limit);
  return (
    <SportsSection title={section.title} subtitle={section.subtitle}>
      <SportsHorizontalShelf columns={1} maxItems={limit}>
        {items.map((card) => (
          <SportsMatchCard
            key={card.id}
            card={card}
            variant={variant as "finished" | "shelf"}
            nowMs={needsSportsCountdownClock(card) ? handlers.nowMs : undefined}
            onPress={handlers.onPressMatch}
            onWatch={handlers.onWatchMatch}
          />
        ))}
      </SportsHorizontalShelf>
    </SportsSection>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
});
