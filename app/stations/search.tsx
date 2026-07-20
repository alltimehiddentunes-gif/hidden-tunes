import { useCallback, useMemo, useState } from "react";
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
import type { RadioStationListItem } from "../../types/radio";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { dedupeStationsById } from "../../utils/dedupeStationsById";
import { useDebouncedSearchQuery } from "../../utils/useDebouncedValue";
import { RADIO_SEARCH_DEBOUNCE_MS } from "../../utils/searchPerformance";

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
    listCountLabel,
  } = useLazyRadioStationList({
    cacheKey,
    requestKey: `search:${cacheKey || "idle"}`,
    enabled: Boolean(cacheKey),
    loadPage,
  });

  const playStation = useCallback(
    async (item: RadioStationListItem) => {
      const station = resolveStation(item.id);
      if (!station) {
        Alert.alert("Unavailable", "This station is unavailable right now.");
        return;
      }

      const session = buildRadioSessionFromListItems(listItems, resolveStation, {
        startStationId: station.id,
        label: debouncedQuery ? `Search: ${debouncedQuery}` : "Radio Search",
        cacheKey,
        searchQuery: debouncedQuery,
      });

      const result = await playRadioStation(normalizeRadioStation(station), session);

      if (!result.ok) {
        Alert.alert(
          "Unavailable",
          result.error || "This station is unavailable right now."
        );
      }
    },
    [cacheKey, debouncedQuery, listItems, playRadioStation, resolveStation]
  );

  const handleStationPress = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void playStation(item);
      });
    },
    [playStation, runWithMatureConsent]
  );

  // Final FlatList guard: exact-ID dedupe only (never index-padded keys).
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
        onPress={() => handleStationPress(item)}
      />
    ),
    [handleStationPress]
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
          ListHeaderComponent={
            listCountLabel ? (
              <Text style={styles.sectionTitle}>{listCountLabel}</Text>
            ) : null
          }
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
