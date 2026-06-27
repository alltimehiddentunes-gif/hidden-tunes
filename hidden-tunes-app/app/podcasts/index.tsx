import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import {
  PodcastCategoryCard,
  PodcastShowCard,
} from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { isMaturePodcastsEnabled } from "../../services/maturePodcastPreferences";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { LAUNCH_PODCAST_CATEGORIES } from "../../utils/launchPodcastCategories";
import { searchLocalPodcastDiscovery } from "../../utils/podcastLocalSearch";
import { PODCAST_SEARCH_DEBOUNCE_MS } from "../../utils/podcastPerformanceLimits";
import {
  openPodcastCategory,
  openPodcastShow,
} from "../../utils/podcastNavigation";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import { useMountedRef } from "../../utils/useMountedRef";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function PodcastDiscoveryHomeScreen() {
  const params = useLocalSearchParams<{ q?: string; query?: string }>();
  const initialQuery = String(params.q || params.query || "").trim();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<HiddenTunesPodcastShow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchChecked, setSearchChecked] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [matureEnabled, setMatureEnabled] = useState(false);
  const searchRequestRef = useRef(0);
  const mountedRef = useMountedRef();

  const isSearching = searchQuery.trim().length > 0;

  const openCategory = useCallback((categoryId: string) => {
    openPodcastCategory(categoryId);
  }, []);

  const openShow = useCallback((show: HiddenTunesPodcastShow) => {
    openPodcastShow(show);
  }, []);

  const categories = useMemo(() => LAUNCH_PODCAST_CATEGORIES, []);

  useEffect(() => {
    void isMaturePodcastsEnabled()
      .then((enabled) => {
        if (!mountedRef.current) return;
        setMatureEnabled(enabled);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setMatureEnabled(false);
      });
  }, [mountedRef]);

  useEffect(() => {
    const clean = searchQuery.trim();
    if (!clean) {
      setSearchResults([]);
      setSearchChecked(false);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(false);
    const requestId = ++searchRequestRef.current;
    const timer = setTimeout(() => {
      try {
        const results = searchLocalPodcastDiscovery(clean, matureEnabled);
        if (!mountedRef.current || requestId !== searchRequestRef.current) return;
        setSearchResults(results);
      } catch {
        if (!mountedRef.current || requestId !== searchRequestRef.current) return;
        setSearchResults([]);
        setSearchError(true);
      } finally {
        if (!mountedRef.current || requestId !== searchRequestRef.current) return;
        setSearchLoading(false);
        setSearchChecked(true);
      }
    }, PODCAST_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [matureEnabled, mountedRef, searchQuery]);

  useEffect(() => {
    if (!initialQuery) return;
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  const searchKeyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-search"),
    []
  );

  const searchPerformance = useMemo(
    () => getListPerformanceSettings(searchResults.length),
    [searchResults.length]
  );

  const renderSearchRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <PodcastShowCard
        show={item}
        subtitle={podcastShowSubtitle(item)}
        onPress={() => openShow(item)}
      />
    ),
    [openShow]
  );

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
          <Text style={styles.kicker}>HIDDEN TUNES PODCASTS</Text>
          <Text style={styles.title}>Browse Shows</Text>
          <Text style={styles.subtitle}>
            Curated podcast rooms from Hidden Tunes
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search Hidden Tunes Podcasts..."
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isSearching ? (
        searchLoading && searchResults.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={searchKeyExtractor}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <Text style={styles.sectionTitle}>
                {searchResults.length > 0
                  ? `${searchResults.length} Hidden Tunes shows`
                  : "Hidden Tunes shows"}
              </Text>
            }
            ListEmptyComponent={
              searchError ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>Podcasts could not be loaded right now.</Text>
                  <Text style={styles.emptyText}>Try again.</Text>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    style={styles.retryButton}
                    onPress={() => setSearchQuery((value) => value.trim())}
                  >
                    <Text style={styles.retryButtonText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : searchChecked ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="mic-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Hidden Tunes shows matched</Text>
                <Text style={styles.emptyText}>{TESTER_COPY.podcastDiscoveryEmpty}</Text>
                </View>
              ) : null
            }
            renderItem={renderSearchRow}
            {...searchPerformance}
            removeClippedSubviews
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.matureEntry}
            onPress={() => router.push("/podcasts/mature" as any)}
          >
            <View style={styles.matureEntryIcon}>
              <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.matureEntryCopy}>
              <Text style={styles.matureEntryTitle}>Mature Podcasts 18+</Text>
              <Text style={styles.matureEntrySubtitle}>
                Explicit relationship, comedy, and education rooms
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          <View style={styles.grid}>
            {categories.map((category) => (
              <PodcastCategoryCard
                key={category.id}
                category={category}
                onPress={() => openCategory(category.id)}
              />
            ))}
          </View>
        </ScrollView>
      )}
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
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 12,
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
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  matureEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
    marginBottom: 14,
  },
  matureEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  matureEntryCopy: {
    flex: 1,
    gap: 2,
  },
  matureEntryTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  matureEntrySubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
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
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
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
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
