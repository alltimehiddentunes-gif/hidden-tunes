/**
 * Sports search — debounced, grouped results, recent searches.
 * After the first successful paint, new queries never show a full-screen
 * spinner — only a small inline indicator next to the search field.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsBackButton,
  SportsCompetitionShelf,
  SportsEmptyState,
  SportsErrorState,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsSection,
  SportsVideoCard,
  SportsWorldGrid,
} from "../../components/sports";
import {
  getSportsRecentSearches,
  pushSportsRecentSearch,
  searchSportsCatalog,
} from "../../services/sports";
import type {
  SportsCompetitionCard,
  SportsMatchCard as SportsMatchCardType,
  SportsSearchGroup,
  SportsVideoCard as SportsVideoCardType,
  SportsWorldCard,
} from "../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsDisabledState, navigateSportsBack, useSportsFullUiGate, useSportsNowClock } from "./_shared";

const DEBOUNCE_MS = 350;

export default function SportsSearchScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ q?: string; country?: string }>();
  const nowMs = useSportsNowClock();

  const [queryInput, setQueryInput] = useState(String(params.q || params.country || ""));
  const [activeQuery, setActiveQuery] = useState("");
  const [groups, setGroups] = useState<SportsSearchGroup[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navGuardRef = useRef(createTapGuardState());

  useEffect(() => {
    if (!gate.allowed) return;
    void getSportsRecentSearches().then(setRecent);
  }, [gate.allowed]);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const trimmed = q.trim();
    if (!trimmed) {
      setGroups([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await searchSportsCatalog(trimmed, {
        signal: controller.signal,
        country: "ZZ",
        platform: Platform.OS,
      });
      if (controller.signal.aborted) return;

      if (!res.enabled) {
        setGroups([]);
        setError("Sports is unavailable right now.");
        return;
      }
      setGroups(res.groups || []);
      setHasSearchedOnce(true);
      void pushSportsRecentSearch(trimmed).then(setRecent);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Search could not be completed right now.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!gate.allowed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setActiveQuery(queryInput);
      void runSearch(queryInput);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryInput, gate.allowed, runSearch]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const onPressRecent = useCallback((q: string) => {
    setQueryInput(q);
  }, []);

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
  const onPressSport = useCallback((s: SportsWorldCard) => {
    router.push(`/sports/sport/${encodeURIComponent(s.slug)}` as any);
  }, []);
  const onPressVideo = useCallback((v: SportsVideoCardType) => {
    if (v.fixtureId) router.push(`/sports/fixture/${encodeURIComponent(v.fixtureId)}` as any);
  }, []);

  const trimmedQuery = queryInput.trim();
  const showRecent = !trimmedQuery && recent.length > 0;
  const showEmptyResults =
    !loading && trimmedQuery.length > 0 && !groups.length && !error && hasSearchedOnce;
  const showInlineSpinner = loading && hasSearchedOnce;
  const showFullSpinner = loading && !hasSearchedOnce;

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

      <View style={styles.searchBarRow}>
        <SportsBackButton onPress={navigateSportsBack} />
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={SPORTS_COLORS.textDim} />
          <TextInput
            value={queryInput}
            onChangeText={setQueryInput}
            placeholder="Search teams, leagues, sports…"
            placeholderTextColor={SPORTS_COLORS.textDim}
            style={styles.searchInput}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {showInlineSpinner ? (
            <ActivityIndicator size="small" color={SPORTS_COLORS.amber} />
          ) : queryInput ? (
            <Pressable onPress={() => setQueryInput("")} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={SPORTS_COLORS.textDim} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showFullSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator color={SPORTS_COLORS.amber} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {error ? <SportsErrorState compact message={error} onRetry={() => runSearch(activeQuery)} /> : null}

          {showRecent ? (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recent searches</Text>
              <View style={styles.recentWrap}>
                {recent.map((q) => (
                  <Pressable key={q} style={styles.recentChip} onPress={() => onPressRecent(q)}>
                    <Ionicons name="time-outline" size={13} color={SPORTS_COLORS.textDim} />
                    <Text style={styles.recentChipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {!trimmedQuery && !showRecent ? (
            <SportsEmptyState
              icon="search-outline"
              title="Search Sports"
              message="Find live matches, teams, leagues, and sports."
            />
          ) : null}

          {showEmptyResults ? (
            <SportsEmptyState
              icon="search-outline"
              title="No results"
              message={`Nothing matched "${trimmedQuery}". Try a different spelling.`}
            />
          ) : null}

          {groups.map((group) => (
            <SportsSection key={group.type} title={group.title}>
              {group.type === "fixtures" ? (
                <View style={styles.fixturesList}>
                  {(group.items as SportsMatchCardType[]).map((card) => (
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
              ) : group.type === "competitions" ? (
                <SportsCompetitionShelf
                  competitions={group.items as SportsCompetitionCard[]}
                  onPress={onPressCompetition}
                />
              ) : group.type === "sports" ? (
                <SportsWorldGrid sports={group.items as SportsWorldCard[]} onPress={onPressSport} />
              ) : (
                <SportsHorizontalShelf>
                  {(group.items as SportsVideoCardType[]).map((v) => (
                    <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                  ))}
                </SportsHorizontalShelf>
              )}
            </SportsSection>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },
  searchInput: { flex: 1, color: SPORTS_COLORS.text, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  recentSection: { marginBottom: 22 },
  recentTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  recentWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 18 },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },
  recentChipText: { color: SPORTS_COLORS.textMuted, fontSize: 12 },
  fixturesList: { paddingHorizontal: 18, gap: 10 },
});
