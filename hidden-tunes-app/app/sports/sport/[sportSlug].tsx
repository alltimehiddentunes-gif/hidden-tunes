/**
 * Sport hub — live/soon/competitions/schedule for a single sport.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsCompetitionShelf,
  SportsEmptyState,
  SportsErrorState,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsMatchCardSkeleton,
  SportsScheduleSection,
  SportsSection,
  SportsSkeletonRow,
} from "../../../components/sports";
import { fetchSportsSportHub } from "../../../services/sports";
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
  const sportSlug = String(params.sportSlug || "").trim();
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
        setError("Sports is unavailable right now.");
        return;
      }
      setSport(res.sport || null);
      setSections((res.sections || []).filter((s) => (s.items?.length || 0) > 0));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "This sport could not be loaded right now.");
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

  const onPressMatch = useCallback(
    (card: SportsMatchCardType) => {
      if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
      router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
    },
    []
  );
  const onWatchMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `watch:${card.id}`)) return;
    router.push(`/sports/player/${encodeURIComponent(card.id)}` as any);
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

          {!sections.length && !error ? (
            <SportsEmptyState
              title="Nothing here yet"
              message="No live matches, fixtures, or competitions for this sport right now."
            />
          ) : (
            sections.map((section) =>
              renderSportHubSection(section, { nowMs, onPressMatch, onWatchMatch, onPressCompetition })
            )
          )}
        </ScrollView>
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
  if (section.id === "todays_schedule") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle}>
        <SportsScheduleSection
          matches={section.items as SportsMatchCardType[]}
          nowMs={handlers.nowMs}
          rowVariant="compact"
          onPressMatch={handlers.onPressMatch}
        />
      </SportsSection>
    );
  }

  if (section.type === "competitions") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle}>
        <SportsCompetitionShelf
          sectionId={section.id}
          competitions={section.items as SportsCompetitionCard[]}
          onPress={handlers.onPressCompetition}
        />
      </SportsSection>
    );
  }

  return (
    <SportsSection key={section.id} title={section.title} subtitle={section.subtitle}>
      <SportsHorizontalShelf>
        {(section.items as SportsMatchCardType[]).map((card) => (
          <SportsMatchCard
            key={card.id}
            card={card}
            nowMs={handlers.nowMs}
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
