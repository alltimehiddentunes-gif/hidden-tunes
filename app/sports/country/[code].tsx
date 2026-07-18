/**
 * Country hub — fixtures and competitions for a canonical country code.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet } from "react-native";
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
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [country, setCountry] = useState<SportsCountryCard | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    if (!countryCode) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const res = await fetchSportsCountryHub(countryCode, {
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
      setCountry(res.country || null);
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
  }, [countryCode]);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const onPressMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
    router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
  }, []);
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
        <SportsScreenHeader title="Country" />
        <SportsEmptyState title="Sports isn't available yet" message={gate.reason} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader title={country?.name || countryCode || "Country"} />

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? <SportsErrorState message={error} onRetry={load} /> : null}
          {!sections.length && !error ? (
            <SportsEmptyState
              title="No current events for this country."
              message="There are no fixtures or competitions for this country right now."
            />
          ) : (
            sections.map((section) => {
              if (section.type === "competitions") {
                return (
                  <SportsSection key={section.id} title={section.title}>
                    <SportsCompetitionShelf
                      sectionId={section.id}
                      competitions={section.items as SportsCompetitionCard[]}
                      onPress={onPressCompetition}
                    />
                  </SportsSection>
                );
              }
              return (
                <SportsSection key={section.id} title={section.title}>
                  <SportsHorizontalShelf columns={1}>
                    {(section.items as SportsMatchCardType[]).map((card) => (
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
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
});
