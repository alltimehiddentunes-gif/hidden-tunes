/**
 * Country hub — fixtures and competitions for a canonical country code.
 * FlatList-owned vertical list (no ScrollView + full .map tree).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
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
import { fetchSportsCountryHub } from "../../../services/sports";
import { normalizeSportsCountryCode } from "../../../lib/sports/normalizeSportsSlug";
import {
  getSportsWatchAction,
  needsSportsCountdownClock,
  openSportsPlayer,
  openSportsPlayerIfPlayable,
  shouldOpenSportsPlayer,
} from "../../../lib/sports/ui/availability";
import { boundSectionItems, sectionItemLimit } from "../../../lib/sports/ui/homeSections";
import type {
  SportsCompetitionCard,
  SportsCountryCard,
  SportsHomeSection,
  SportsMatchCard as SportsMatchCardType,
} from "../../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsScreenHeader, useSportsFullUiGate, useSportsNowClock } from "../_shared";

export default function CountryHubScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ code?: string }>();
  const countryCode = normalizeSportsCountryCode(String(params.code || ""));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [country, setCountry] = useState<SportsCountryCard | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  const countdownNeeded = useMemo(() => {
    for (const section of sections) {
      if (section.type !== "fixtures" && section.type !== "live") continue;
      for (const item of section.items || []) {
        if (needsSportsCountdownClock(item as SportsMatchCardType)) return true;
      }
    }
    return false;
  }, [sections]);
  const nowMs = useSportsNowClock(countdownNeeded ? 30_000 : 0);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!countryCode) return;
    const background = opts?.background === true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!background) setError(null);

    try {
      const res = await fetchSportsCountryHub(countryCode, {
        signal: controller.signal,
        country: "ZZ",
        platform: Platform.OS,
      });
      if (controller.signal.aborted) return;

      if (!res.enabled) {
        if (!background) {
          setSections([]);
          setError("Sports preview is unavailable.");
        }
        return;
      }
      setCountry(res.country || null);
      setSections((res.sections || []).filter((s) => (s.items?.length || 0) > 0));
    } catch {
      if (!controller.signal.aborted && !background) {
        setError("Sports could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [countryCode]);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ background: true });
  }, [load]);

  const onPressMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
    router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
  }, []);
  const onWatchMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `watch:${card.id}`)) return;
    const action = getSportsWatchAction(card);
    if (action.kind === "watch_external" || action.kind === "subscription") {
      openSportsPlayer(card.id);
      return;
    }
    if (!shouldOpenSportsPlayer(card)) return;
    openSportsPlayerIfPlayable(card);
  }, []);
  const onPressCompetition = useCallback((c: SportsCompetitionCard) => {
    router.push(`/sports/competition/${encodeURIComponent(c.id)}` as any);
  }, []);

  const renderSection = useCallback(
    ({ item: section }: { item: SportsHomeSection }) => {
      const itemLimit = sectionItemLimit(section.id);
      if (section.type === "competitions") {
        return (
          <SportsSection title={section.title}>
            <SportsCompetitionShelf
              sectionId={section.id}
              competitions={boundSectionItems(
                section.items as SportsCompetitionCard[],
                itemLimit
              )}
              onPress={onPressCompetition}
            />
          </SportsSection>
        );
      }
      return (
        <SportsSection title={section.title}>
          <SportsHorizontalShelf columns="auto" maxItems={itemLimit}>
            {boundSectionItems(section.items as SportsMatchCardType[], itemLimit).map(
              (card) => (
                <SportsMatchCard
                  key={card.id}
                  card={card}
                  nowMs={needsSportsCountdownClock(card) ? nowMs : undefined}
                  onPress={onPressMatch}
                  onWatch={onWatchMatch}
                />
              )
            )}
          </SportsHorizontalShelf>
        </SportsSection>
      );
    },
    [nowMs, onPressCompetition, onPressMatch, onWatchMatch]
  );

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsScreenHeader title="Country" />
        <SportsEmptyState title="Sports isn't available yet" message={gate.reason} />
      </SafeAreaView>
    );
  }

  const showFullSkeleton = loading && !sections.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader title={country?.name || countryCode || "Country"} />

      {showFullSkeleton ? (
        <View style={{ paddingTop: 8, paddingBottom: 40 }}>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(section) => section.id}
          renderItem={renderSection}
          ListHeaderComponent={
            error ? <SportsErrorState message={error} onRetry={load} /> : null
          }
          ListEmptyComponent={
            !error ? (
              <SportsEmptyState
                title="No verified fixtures are available right now."
                message="There are no verified fixtures or competitions for this country right now."
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={SPORTS_COLORS.amber}
            />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
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
