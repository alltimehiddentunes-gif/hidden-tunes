/**
 * Following — sports, competitions, teams, athletes the user follows,
 * plus live/upcoming matches drawn from those follows. Unfollow inline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SportsEmptyState, SportsErrorState, SportsMatchCard, SportsSection } from "../../components/sports";
import { fetchSportsHome, getSportsFollows, unfollowSportsEntity } from "../../services/sports";
import type { SportsFollowEntity, SportsMatchCard as SportsMatchCardType } from "../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../utils/tapPressGuard";

import {
  CenterSpinner,
  RemovableRow,
  SPORTS_COLORS,
  SportsDisabledState,
  SportsScreenHeader,
  useSportsFullUiGate,
  useSportsNowClock,
} from "./_shared";

const TYPE_LABELS: Record<SportsFollowEntity["type"], string> = {
  sport: "Sports",
  competition: "Competitions",
  team: "Teams",
  athlete: "Athletes",
};

export default function SportsFollowingScreen() {
  const gate = useSportsFullUiGate();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [follows, setFollows] = useState<SportsFollowEntity[]>([]);
  const [matches, setMatches] = useState<SportsMatchCardType[]>([]);
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const [followList, home] = await Promise.all([
        getSportsFollows(),
        fetchSportsHome({ signal: controller.signal, country: "ZZ", platform: Platform.OS }),
      ]);
      if (controller.signal.aborted) return;

      setFollows(followList);

      if (!home.enabled || !Array.isArray(home.sections)) {
        setMatches([]);
        return;
      }

      const sportSlugs = new Set(
        followList.filter((f) => f.type === "sport").map((f) => f.id)
      );
      const competitionIds = new Set(
        followList.filter((f) => f.type === "competition").map((f) => f.id)
      );
      const participantIds = new Set(
        followList.filter((f) => f.type === "team" || f.type === "athlete").map((f) => f.id)
      );

      const seen = new Set<string>();
      const candidates: SportsMatchCardType[] = [];
      for (const section of home.sections) {
        if (!["live_now", "starting_soon", "todays_schedule"].includes(section.id)) continue;
        for (const raw of section.items) {
          const card = raw as SportsMatchCardType;
          if (!card?.id || seen.has(card.id)) continue;
          const matchesFollow =
            (card.sport?.slug && sportSlugs.has(card.sport.slug)) ||
            (card.competition?.id && competitionIds.has(card.competition.id)) ||
            (card.participants || []).some((p) => participantIds.has(p.id));
          if (matchesFollow) {
            seen.add(card.id);
            candidates.push(card);
          }
        }
      }
      setMatches(candidates);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Following could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const onUnfollow = useCallback(
    async (entity: SportsFollowEntity) => {
      setUnfollowingId(entity.id);
      try {
        await unfollowSportsEntity(entity.type, entity.id);
        setFollows((prev) => prev.filter((f) => !(f.type === entity.type && f.id === entity.id)));
      } finally {
        setUnfollowingId(null);
      }
    },
    []
  );

  const onPressEntity = useCallback((entity: SportsFollowEntity) => {
    if (entity.type === "sport" && entity.sportSlug) {
      router.push(`/sports/sport/${encodeURIComponent(entity.sportSlug)}` as any);
      return;
    }
    if (entity.type === "competition") {
      router.push(`/sports/competition/${encodeURIComponent(entity.id)}` as any);
      return;
    }
    router.push(`/sports/search?q=${encodeURIComponent(entity.name)}` as any);
  }, []);

  const onPressMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
    router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
  }, []);
  const onWatchMatch = useCallback((card: SportsMatchCardType) => {
    if (shouldIgnoreDuplicateTap(navGuardRef.current, `watch:${card.id}`)) return;
    router.push(`/sports/player/${encodeURIComponent(card.id)}` as any);
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<SportsFollowEntity["type"], SportsFollowEntity[]> = {
      sport: [],
      competition: [],
      team: [],
      athlete: [],
    };
    for (const f of follows) groups[f.type].push(f);
    return groups;
  }, [follows]);

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsDisabledState message={gate.reason} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader title="Following" />

      {loading ? (
        <CenterSpinner label="Loading your follows…" />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? <SportsErrorState message={error} onRetry={load} /> : null}

          {!follows.length ? (
            <SportsEmptyState
              icon="heart-outline"
              title="Nothing followed yet"
              message="Follow sports, competitions, teams, or athletes to see them here."
            />
          ) : (
            <>
              {matches.length ? (
                <SportsSection title="Live & upcoming" subtitle="From your follows">
                  <View style={styles.matchList}>
                    {matches.map((card) => (
                      <SportsMatchCard
                        key={card.id}
                        card={card}
                        variant="search"
                        nowMs={nowMs}
                        onPress={onPressMatch}
                        onWatch={onWatchMatch}
                      />
                    ))}
                  </View>
                </SportsSection>
              ) : null}

              {(Object.keys(grouped) as SportsFollowEntity["type"][]).map((type) =>
                grouped[type].length ? (
                  <View key={type} style={styles.followGroup}>
                    <View style={styles.followGroupHeader}>
                      <Text style={styles.followGroupTitle}>{TYPE_LABELS[type]}</Text>
                    </View>
                    {grouped[type].map((entity) => (
                      <RemovableRow
                        key={`${entity.type}:${entity.id}`}
                        title={entity.name}
                        subtitle={entity.subtitle}
                        onPress={() => onPressEntity(entity)}
                        onRemove={() => onUnfollow(entity)}
                        removeDisabled={unfollowingId === entity.id}
                      />
                    ))}
                  </View>
                ) : null
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
  matchList: { paddingHorizontal: 18, gap: 10 },
  followGroup: { marginBottom: 22 },
  followGroupHeader: { paddingHorizontal: 18, marginBottom: 8 },
  followGroupTitle: { color: SPORTS_COLORS.text, fontSize: 15, fontWeight: "900" },
});
