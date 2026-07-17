/**
 * Saved — saved matches, watch later, reminders, and favorites.
 * All data is local (AsyncStorage via services/sports/sportsPreferences).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SportsEmptyState, SportsErrorState } from "../../components/sports";
import {
  clearSportsReminder,
  getSportsFavorites,
  getSportsReminders,
  getSportsWatchLater,
  removeSportsFavorite,
  removeSportsWatchLater,
} from "../../services/sports";
import { formatKickoff } from "../../lib/sports/ui/formatKickoff";
import type { SportsFavorite, SportsReminder } from "../../types/sports";

import {
  CenterSpinner,
  RemovableRow,
  SPORTS_COLORS,
  SportsDisabledState,
  SportsScreenHeader,
  useSportsFullUiGate,
  useSportsNowClock,
} from "./_shared";

function routeForFavorite(item: SportsFavorite): string | null {
  if (item.kind === "fixture") return `/sports/fixture/${encodeURIComponent(item.id)}`;
  if (item.kind === "competition") return `/sports/competition/${encodeURIComponent(item.id)}`;
  return null;
}

export default function SportsSavedScreen() {
  const gate = useSportsFullUiGate();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMatches, setSavedMatches] = useState<SportsFavorite[]>([]);
  const [favorites, setFavorites] = useState<SportsFavorite[]>([]);
  const [watchLater, setWatchLater] = useState<SportsFavorite[]>([]);
  const [reminders, setReminders] = useState<SportsReminder[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [allFavorites, watchLaterList, reminderList] = await Promise.all([
        getSportsFavorites(),
        getSportsWatchLater(),
        getSportsReminders(),
      ]);
      setSavedMatches(allFavorites.filter((f) => f.kind === "fixture"));
      setFavorites(allFavorites.filter((f) => f.kind !== "fixture"));
      setWatchLater(watchLaterList);
      setReminders(reminderList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved items could not be loaded right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    const controller = abortRef.current;
    return () => controller?.abort();
  }, [gate.allowed, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const onPressItem = useCallback((item: SportsFavorite) => {
    const route = routeForFavorite(item);
    if (route) router.push(route as any);
  }, []);

  const onRemoveFavorite = useCallback(async (item: SportsFavorite) => {
    await removeSportsFavorite(item.kind, item.id);
    setSavedMatches((prev) => prev.filter((f) => !(f.kind === item.kind && f.id === item.id)));
    setFavorites((prev) => prev.filter((f) => !(f.kind === item.kind && f.id === item.id)));
  }, []);

  const onRemoveWatchLater = useCallback(async (item: SportsFavorite) => {
    await removeSportsWatchLater(item.kind, item.id);
    setWatchLater((prev) => prev.filter((f) => !(f.kind === item.kind && f.id === item.id)));
  }, []);

  const onRemoveReminder = useCallback(async (item: SportsReminder) => {
    await clearSportsReminder(item.fixtureId);
    setReminders((prev) => prev.filter((r) => r.fixtureId !== item.fixtureId));
  }, []);

  const isEmpty = useMemo(
    () => !savedMatches.length && !favorites.length && !watchLater.length && !reminders.length,
    [savedMatches, favorites, watchLater, reminders]
  );

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
      <SportsScreenHeader title="Saved" />

      {loading ? (
        <CenterSpinner label="Loading saved items…" />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SPORTS_COLORS.amber} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? <SportsErrorState message={error} onRetry={load} /> : null}

          {isEmpty && !error ? (
            <SportsEmptyState
              icon="bookmark-outline"
              title="Nothing saved yet"
              message="Save matches, set reminders, or add to watch later from any fixture."
            />
          ) : (
            <>
              <SavedList
                title="Saved matches"
                items={savedMatches}
                onPressItem={onPressItem}
                onRemove={onRemoveFavorite}
              />
              <SavedList
                title="Watch later"
                items={watchLater}
                onPressItem={onPressItem}
                onRemove={onRemoveWatchLater}
              />
              {reminders.length ? (
                <View style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>Reminders</Text>
                  </View>
                  {reminders.map((r) => (
                    <RemovableRow
                      key={r.fixtureId}
                      title={r.title}
                      subtitle={r.startsAt ? formatKickoff(r.startsAt, nowMs) : null}
                      onPress={() => router.push(`/sports/fixture/${encodeURIComponent(r.fixtureId)}` as any)}
                      onRemove={() => onRemoveReminder(r)}
                    />
                  ))}
                </View>
              ) : null}
              <SavedList
                title="Favorites"
                items={favorites}
                onPressItem={onPressItem}
                onRemove={onRemoveFavorite}
              />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SavedList({
  title,
  items,
  onPressItem,
  onRemove,
}: {
  title: string;
  items: SportsFavorite[];
  onPressItem: (item: SportsFavorite) => void;
  onRemove: (item: SportsFavorite) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {items.map((item) => (
        <RemovableRow
          key={`${item.kind}:${item.id}`}
          title={item.title}
          subtitle={item.kind}
          onPress={() => onPressItem(item)}
          onRemove={() => onRemove(item)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
  group: { marginBottom: 22 },
  groupHeader: { paddingHorizontal: 18, marginBottom: 8 },
  groupTitle: { color: SPORTS_COLORS.text, fontSize: 15, fontWeight: "900" },
});
