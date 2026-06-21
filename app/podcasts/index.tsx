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
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { searchPodcastShows } from "../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { getVisiblePodcastCategories } from "../../utils/launchPodcastCategories";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { filterVisiblePodcastShows } from "../../utils/maturePodcastVisibility";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import { readCachedPodcastSearch, hydrateCachedPodcastSearch } from "../../utils/podcastDiscoveryCache";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function PodcastDiscoveryHomeScreen() {
  const { includeMatureInApi } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const params = useLocalSearchParams<{ q?: string; query?: string }>();
  const initialQuery = String(params.q || params.query || "").trim();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<HiddenTunesPodcastShow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchChecked, setSearchChecked] = useState(false);
  const searchRequestRef = useRef(0);

  const isSearching = searchQuery.trim().length > 0;

  const openCategory = useCallback((categoryId: string) => {
    router.push({
      pathname: "/podcasts/[categoryId]",
      params: { categoryId },
    } as any);
  }, []);

  const openShow = useCallback(
    (show: HiddenTunesPodcastShow) => {
      runWithMatureConsent(show, () => {
        router.push({
          pathname: "/podcasts/show/[showId]",
          params: {
            showId: show.id,
            title: show.title,
            isMature: show.is_mature ? "1" : "0",
          },
        } as any);
      });
    },
    [runWithMatureConsent]
  );

  const categories = useMemo(
    () => getVisiblePodcastCategories(includeMatureInApi),
    [includeMatureInApi]
  );

  useEffect(() => {
    const clean = searchQuery.trim();
    if (!clean) {
      setSearchResults([]);
      setSearchChecked(false);
      setSearchLoading(false);
      return;
    }

    const cached = readCachedPodcastSearch(clean);
    if (cached?.length) {
      setSearchResults(filterVisiblePodcastShows(cached));
      setSearchChecked(true);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const requestId = ++searchRequestRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const storageHit = await hydrateCachedPodcastSearch(clean);
        if (requestId !== searchRequestRef.current) return;

        if (storageHit?.length) {
          setSearchResults(filterVisiblePodcastShows(storageHit));
          setSearchChecked(true);
          setSearchLoading(false);
          return;
        }

        try {
          const shows = await searchPodcastShows(clean);
          if (requestId !== searchRequestRef.current) return;
          setSearchResults(filterVisiblePodcastShows(shows));
        } finally {
          if (requestId !== searchRequestRef.current) return;
          setSearchLoading(false);
          setSearchChecked(true);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, includeMatureInApi]);

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
              searchChecked ? (
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
});
