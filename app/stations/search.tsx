import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { RadioStationCard } from "../../components/radio/RadioBrowserCards";
import MediaSearchEmptyState from "../../components/discovery/MediaSearchEmptyState";
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useLazyRadioStationList } from "../../hooks/useLazyRadioStationList";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { loadRadioSearchPage } from "../../services/radio/radioBrowserApi";
import { normalizeRadioSearchCacheKey } from "../../services/radio/radioCache";
import { normalizeRadioStation } from "../../services/radio/radioNormalizer";
import { buildRadioSessionFromListItems } from "../../services/radio/buildRadioPlaybackSession";
import { resolveRadioStationStreamUrl } from "../../services/radio/radioCatalogApi";
import { isCatalogAbortError } from "../../services/catalogJsonFetch";
import type { RadioStationListItem } from "../../types/radio";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { dedupeStationsById } from "../../utils/dedupeStationsById";
import { useDebouncedSearchQuery } from "../../utils/useDebouncedValue";
import { RADIO_SEARCH_DEBOUNCE_MS } from "../../utils/searchPerformance";

const STATION_UNAVAILABLE_MESSAGE = "Station is temporarily unavailable";

export default function RadioSearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const initialQuery = String(params.q || "").trim();
  const { playRadioStation } = usePlaybackRouter();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const { includeMatureInApi } = useMatureContentSettings();
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedSearchQuery(query, RADIO_SEARCH_DEBOUNCE_MS);
  const cacheKey = useMemo(
    () => normalizeRadioSearchCacheKey(debouncedQuery),
    [debouncedQuery]
  );
  const playInFlightRef = useRef<string | null>(null);
  const playGenerationRef = useRef(0);
  const [pendingStationId, setPendingStationId] = useState<string | null>(null);

  const loadPage = useCallback(
    (offset: number, options: { append: boolean; forceRefresh: boolean }) =>
      loadRadioSearchPage(debouncedQuery, {
        offset,
        append: options.append,
        forceRefresh: options.forceRefresh,
      }),
    [debouncedQuery]
  );

  const {
    listItems,
    loading,
    refreshing,
    loadingMore,
    hasLoadedOnce,
    onRefresh,
    loadMore,
    resolveStation,
    upsertStation,
    listCountLabel,
  } = useLazyRadioStationList({
    cacheKey,
    requestKey: `search:${cacheKey || "idle"}`,
    enabled: Boolean(cacheKey),
    loadPage,
  });

  // Avoid recreating play handlers on every pagination append (mass row re-render).
  const listItemsRef = useRef(listItems);
  listItemsRef.current = listItems;
  const resolveStationRef = useRef(resolveStation);
  resolveStationRef.current = resolveStation;
  const upsertStationRef = useRef(upsertStation);
  upsertStationRef.current = upsertStation;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const debouncedQueryRef = useRef(debouncedQuery);
  debouncedQueryRef.current = debouncedQuery;

  const playStation = useCallback(
    async (item: RadioStationListItem) => {
      const stationId = String(item.id || "").trim();
      if (!stationId) return;

      // Same station while resolving: ignore. Different station: latest wins.
      if (playInFlightRef.current === stationId) return;

      const generation = ++playGenerationRef.current;
      playInFlightRef.current = stationId;
      setPendingStationId(stationId);

      try {
        const station = resolveStationRef.current(stationId);
        if (!station) {
          if (generation === playGenerationRef.current) {
            Alert.alert("Unavailable", STATION_UNAVAILABLE_MESSAGE);
          }
          return;
        }

        let streamUrl = "";
        try {
          streamUrl = (await resolveRadioStationStreamUrl(station)) || "";
        } catch (error) {
          if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
            return;
          }
          streamUrl = "";
        }

        if (generation !== playGenerationRef.current) return;

        if (!streamUrl) {
          Alert.alert("Unavailable", STATION_UNAVAILABLE_MESSAGE);
          return;
        }

        const playableStation = { ...station, streamUrl };
        upsertStationRef.current(playableStation);

        // Bound session window so tap does not remap thousands of rows on the JS thread.
        const allItems = listItemsRef.current;
        const focus = allItems.findIndex((entry) => entry.id === stationId);
        const windowStart = focus >= 0 ? Math.max(0, focus - 40) : 0;
        const sessionItems =
          focus >= 0 ? allItems.slice(windowStart, focus + 41) : allItems.slice(0, 81);

        const session = buildRadioSessionFromListItems(
          sessionItems,
          (id) => {
            if (id === playableStation.id) return playableStation;
            return resolveStationRef.current(id);
          },
          {
            startStationId: playableStation.id,
            label: debouncedQueryRef.current
              ? `Search: ${debouncedQueryRef.current}`
              : "Radio Search",
            cacheKey: cacheKeyRef.current,
            searchQuery: debouncedQueryRef.current,
          }
        );

        if (generation !== playGenerationRef.current) return;

        const result = await playRadioStation(
          normalizeRadioStation(playableStation),
          session
        );

        if (generation !== playGenerationRef.current) return;

        if (!result.ok) {
          Alert.alert(
            "Unavailable",
            result.error || STATION_UNAVAILABLE_MESSAGE
          );
        }
      } finally {
        if (generation === playGenerationRef.current) {
          playInFlightRef.current = null;
          setPendingStationId(null);
        }
      }
    },
    [playRadioStation]
  );

  const handleStationPress = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void playStation(item);
      });
    },
    [playStation, runWithMatureConsent]
  );

  // Hook already dedupes on commit; keep a cheap memoized safety guard only.
  const flatListData = useMemo(
    () => dedupeStationsById(listItems),
    [listItems]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(flatListData.length),
    [flatListData.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("radio-search-station"),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: RadioStationListItem }) => (
      <RadioStationCard
        item={item}
        variant="premium"
        pending={pendingStationId === item.id}
        onPress={() => handleStationPress(item)}
      />
    ),
    [handleStationPress, pendingStationId]
  );

  const listHeader = useMemo(
    () =>
      listCountLabel ? (
        <Text style={styles.sectionTitle}>{listCountLabel}</Text>
      ) : null,
    [listCountLabel]
  );

  const showPrompt = !debouncedQuery;
  const showEmpty =
    Boolean(debouncedQuery) &&
    hasLoadedOnce &&
    !loading &&
    !refreshing &&
    listItems.length === 0;

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES RADIO</Text>
          <Text style={styles.title}>Search Stations</Text>
          <Text style={styles.subtitle}>Find live stations by name, country, genre, or mood</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search live stations"
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {showPrompt ? (
        <MediaSearchEmptyState
          kind="radio"
          query=""
          includeMature={includeMatureInApi}
          onSuggestionPress={setQuery}
        />
      ) : loading && listItems.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.radioStationsLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={flatListData}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReachedThreshold={0.35}
          onEndReached={loadMore}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerSpinner}
                color={COLORS.primary}
              />
            ) : null
          }
          ListEmptyComponent={
            showEmpty ? (
              <MediaSearchEmptyState
                kind="radio"
                query={debouncedQuery}
                includeMature={includeMatureInApi}
                onSuggestionPress={setQuery}
              />
            ) : null
          }
          renderItem={renderItem}
          {...listPerformance}
          removeClippedSubviews
        />
      )}

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  searchBar: {
    marginHorizontal: 20,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  promptTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  promptText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  footerSpinner: {
    marginVertical: 16,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
});
