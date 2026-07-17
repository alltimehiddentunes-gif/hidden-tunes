import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { router } from "expo-router";

import HTImage from "@/components/HTImage";
import { PremiumContentGrid } from "@/components/catalog/PremiumContentGrid";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  fetchMotivationCategories,
  fetchMotivationHome,
  formatMotivationDuration,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import { listContinueMotivationEntries } from "@/services/motivationProgress";
import { listMotivationRecentlyPlayed } from "@/services/motivationRecentlyPlayed";
import type { MotivationCategory, MotivationItem } from "@/types/motivation";
import {
  collectSpeakersFromGroups,
  groupMotivationItemsIntoPrograms,
  rankMotivationSearchResults,
  stashMotivationGroupedProgram,
  type MotivationGroupedProgram,
} from "@/utils/motivationGrouping";
import { sanitizeMotivationTitle } from "@/utils/motivationPresentation";

const SEARCH_DEBOUNCE_MS = 350;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function goBackToMore() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/library" as never);
}

const BackToMoreButton = memo(function BackToMoreButton() {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={goBackToMore}
      accessibilityRole="button"
      accessibilityLabel="Back to More"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={24} color={COLORS.text} />
    </TouchableOpacity>
  );
});

const ProgramCard = memo(function ProgramCard({
  group,
  onPress,
}: {
  group: MotivationGroupedProgram;
  onPress: () => void;
}) {
  const meta = [
    group.speakerName,
    group.episodeCount > 1 ? `${group.episodeCount} episodes` : "1 episode",
    group.program.category_slug?.replace(/-/g, " "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
      <HTImage
        uri={group.program.artwork_url || undefined}
        style={styles.cardArt}
        contentFit="cover"
      />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {group.program.title}
      </Text>
      {meta ? (
        <Text style={styles.cardMeta} numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const SearchResultRow = memo(function SearchResultRow({
  item,
  onPress,
}: {
  item: MotivationItem;
  onPress: () => void;
}) {
  const programTitle = item.title.includes("—")
    ? item.title.split(/\s+[—–-]\s+/)[0]
    : item.title;
  return (
    <TouchableOpacity style={styles.listRow} activeOpacity={0.88} onPress={onPress}>
      <HTImage uri={item.artwork || undefined} style={styles.listArt} contentFit="cover" />
      <View style={styles.listCopy}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {sanitizeMotivationTitle(item.title)}
        </Text>
        <Text style={styles.listMeta} numberOfLines={1}>
          {[programTitle, item.speaker_name || item.channel_name, formatMotivationDuration(item.duration_seconds)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

const ContinueRow = memo(function ContinueRow({
  title,
  subtitle,
  artwork,
  onPress,
}: {
  title: string;
  subtitle?: string;
  artwork?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.listRow} activeOpacity={0.88} onPress={onPress}>
      <HTImage uri={artwork || undefined} style={styles.listArt} contentFit="cover" />
      <View style={styles.listCopy}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="play-circle-outline" size={24} color={COLORS.primary} />
    </TouchableOpacity>
  );
});

export default function MotivationHomeScreen() {
  const mountedRef = useMountedRef();
  const abortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MotivationCategory[]>([]);
  const [programGroups, setProgramGroups] = useState<MotivationGroupedProgram[]>([]);
  const [continueItems, setContinueItems] = useState<
    Awaited<ReturnType<typeof listContinueMotivationEntries>>
  >([]);
  const [recentItems, setRecentItems] = useState<
    Awaited<ReturnType<typeof listMotivationRecentlyPlayed>>
  >([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MotivationItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);

  const openProgramGroup = useCallback((group: MotivationGroupedProgram) => {
    stashMotivationGroupedProgram(group);
    router.push(`/motivation/program/${encodeURIComponent(group.id)}` as never);
  }, []);

  const openSearchItem = useCallback((item: MotivationItem) => {
    const groups = groupMotivationItemsIntoPrograms([item], {
      excludeMisplacedAudiobooks: false,
    });
    const group = groups[0];
    if (group) {
      openProgramGroup(group);
      return;
    }
    router.push(`/motivation/program/${encodeURIComponent(item.id)}` as never);
  }, [openProgramGroup]);

  const loadHome = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const [homeResult, categoriesResult, continueResult, recentResult] = await Promise.allSettled([
        fetchMotivationHome(controller.signal),
        fetchMotivationCategories(controller.signal),
        listContinueMotivationEntries(10),
        listMotivationRecentlyPlayed(10),
      ]);

      if (!mountedRef.current || controller.signal.aborted) return;

      const laneItems: MotivationItem[] = [];
      if (homeResult.status === "fulfilled") {
        const home = homeResult.value;
        laneItems.push(
          ...(home.featured_items || []),
          ...(home.recommended || []),
          ...(home.popular || []),
          ...(home.new_releases || [])
        );
      }
      if (categoriesResult.status === "fulfilled") {
        setCategories(
          categoriesResult.value.filter((category) => (category.item_count || 0) > 0)
        );
      }
      if (continueResult.status === "fulfilled") setContinueItems(continueResult.value);
      if (recentResult.status === "fulfilled") setRecentItems(recentResult.value);

      setProgramGroups(groupMotivationItemsIntoPrograms(laneItems));

      const homeFailed = homeResult.status === "rejected" && !isAbortError(homeResult.reason);
      const categoriesFailed =
        categoriesResult.status === "rejected" && !isAbortError(categoriesResult.reason);
      if (homeFailed && categoriesFailed) {
        setError("Couldn't load Motivationals. Pull to retry.");
      }
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || isAbortError(err)) return;
      setError("Couldn't load Motivationals. Pull to retry.");
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [mountedRef]);

  useEffect(() => {
    void loadHome();
    return () => {
      abortRef.current?.abort();
      searchAbortRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [loadHome]);

  const runSearch = useCallback(async (query: string, page = 1, append = false) => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchHasMore(false);
      setSearchLoading(false);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setSearchError(null);

    try {
      const result = await searchMotivationItems(q, {
        page,
        limit: 40,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      const ranked = rankMotivationSearchResults(result.items, q);
      setSearchResults((current) => (append ? [...current, ...ranked] : ranked));
      setSearchPage(page);
      const pagination = result.pagination as { hasMore?: boolean } | undefined;
      setSearchHasMore(Boolean(pagination?.hasMore));
    } catch (err) {
      if (!mountedRef.current || isAbortError(err)) return;
      setSearchError("Search failed. Try again.");
      if (!append) setSearchResults([]);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setSearchLoading(false);
    }
  }, [mountedRef]);

  const onChangeSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!value.trim()) {
        searchAbortRef.current?.abort();
        setSearchResults([]);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        void runSearch(value, 1, false);
      }, SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  const speakers = useMemo(
    () => collectSpeakersFromGroups(programGroups, 16),
    [programGroups]
  );

  const popularPrograms = useMemo(() => programGroups.slice(0, 24), [programGroups]);
  const newPrograms = useMemo(() => {
    const seen = new Set(popularPrograms.map((g) => g.id));
    return programGroups.filter((g) => !seen.has(g.id)).slice(0, 12);
  }, [popularPrograms, programGroups]);

  const isSearching = searchQuery.trim().length >= 2;

  const sections = useMemo(() => {
    if (isSearching) return [{ key: "search" }];
    return [
      { key: "continue" },
      { key: "recent" },
      { key: "popular" },
      { key: "speakers" },
      { key: "new" },
      { key: "categories" },
    ];
  }, [isSearching]);

  const renderSection = useCallback(
    (key: string) => {
      if (key === "search") {
        return (
          <View style={styles.section}>
            {searchLoading && !searchResults.length ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
            ) : null}
            {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
            {!searchLoading && !searchResults.length && !searchError ? (
              <Text style={styles.emptyText}>No matches for “{searchQuery.trim()}”.</Text>
            ) : null}
            {searchResults.map((item) => (
              <SearchResultRow
                key={item.id}
                item={item}
                onPress={() => openSearchItem(item)}
              />
            ))}
            {searchHasMore ? (
              <TouchableOpacity
                style={styles.loadMore}
                onPress={() => void runSearch(searchQuery, searchPage + 1, true)}
              >
                <Text style={styles.loadMoreText}>
                  {searchLoading ? "Loading…" : "Load more"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      }

      if (key === "continue") {
        if (!continueItems.length) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Continue Listening</Text>
            {continueItems.map((entry) => (
              <ContinueRow
                key={entry.itemId}
                title={sanitizeMotivationTitle(entry.itemTitle || entry.programTitle || "Motivation")}
                subtitle={entry.programTitle || undefined}
                artwork={entry.programArtwork}
                onPress={() =>
                  router.push(
                    `/motivation/program/${encodeURIComponent(entry.programId || entry.itemId)}` as never
                  )
                }
              />
            ))}
          </View>
        );
      }

      if (key === "recent") {
        if (!recentItems.length) return null;
        const recentGroups = groupMotivationItemsIntoPrograms(
          recentItems.map((entry) => entry.item),
          { excludeMisplacedAudiobooks: false }
        );
        if (!recentGroups.length) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Played</Text>
            <PremiumContentGrid
              data={recentGroups}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ProgramCard group={item} onPress={() => openProgramGroup(item)} />
              )}
            />
          </View>
        );
      }

      if (key === "popular") {
        if (!popularPrograms.length) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Programs</Text>
            <PremiumContentGrid
              data={popularPrograms}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ProgramCard group={item} onPress={() => openProgramGroup(item)} />
              )}
            />
          </View>
        );
      }

      if (key === "speakers") {
        if (!speakers.length) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Speakers</Text>
            <View style={styles.speakerWrap}>
              {speakers.map((speaker) => (
                <TouchableOpacity
                  key={speaker.name}
                  style={styles.speakerChip}
                  onPress={() => onChangeSearch(speaker.name)}
                >
                  <Text style={styles.speakerName} numberOfLines={1}>
                    {speaker.name}
                  </Text>
                  <Text style={styles.speakerMeta}>{speaker.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }

      if (key === "new") {
        if (!newPrograms.length) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>New & Noteworthy</Text>
            <PremiumContentGrid
              data={newPrograms}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ProgramCard group={item} onPress={() => openProgramGroup(item)} />
              )}
            />
          </View>
        );
      }

      if (!categories.length) return null;
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <PremiumContentGrid
            data={categories}
            keyExtractor={(item) => item.slug}
            renderItem={({ item }: { item: MotivationCategory }) => (
              <TouchableOpacity
                style={styles.categoryCard}
                activeOpacity={0.88}
                onPress={() =>
                  router.push(`/motivation/category/${encodeURIComponent(item.slug)}` as never)
                }
              >
                <Text style={styles.categoryTitle}>{item.name}</Text>
                <Text style={styles.categoryMeta}>
                  {item.item_count ? `${item.item_count.toLocaleString()} items` : "Browse"}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    },
    [
      categories,
      continueItems,
      newPrograms,
      onChangeSearch,
      openProgramGroup,
      openSearchItem,
      popularPrograms,
      recentItems,
      runSearch,
      searchError,
      searchHasMore,
      searchLoading,
      searchPage,
      searchQuery,
      searchResults,
      speakers,
    ]
  );

  if (loading) {
    return (
      <AppShell>
        <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
          <View style={styles.loadingHeader}>
            <BackToMoreButton />
          </View>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        </LinearGradient>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => renderSection(item.key)}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            isSearching ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadHome();
                }}
                tintColor={COLORS.primary}
              />
            )
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <BackToMoreButton />
              <Text style={styles.heroEyebrow}>Hidden Tunes</Text>
              <Text style={styles.heroTitle}>Motivationals</Text>
              <Text style={styles.heroSubtitle}>
                Programs, speakers, and guided talks — organized for listening.
              </Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={onChangeSearch}
                  placeholder="Search motivationals, speakers and programs"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {searchQuery ? (
                  <TouchableOpacity
                    onPress={() => onChangeSearch("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {error ? (
                <TouchableOpacity
                  style={styles.errorBanner}
                  onPress={() => {
                    setRefreshing(true);
                    void loadHome();
                  }}
                >
                  <Text style={styles.errorText}>{error}</Text>
                  <Text style={styles.retryText}>Tap to retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 120, paddingHorizontal: 16 },
  loadingHeader: { paddingTop: 56, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 56, paddingBottom: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  heroEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heroTitle: { color: COLORS.text, fontSize: 32, fontWeight: "900", marginTop: 8 },
  heroSubtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  searchWrap: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, padding: 0 },
  errorBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(251,146,60,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.35)",
  },
  errorText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  retryText: { color: COLORS.primary, fontSize: 13, fontWeight: "800", marginTop: 6 },
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 28 },
  section: { marginTop: 24 },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900", marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardArt: { width: "100%", aspectRatio: 1, borderRadius: 14, marginBottom: 10 },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  categoryCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
  },
  categoryTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  categoryMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 6 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  listArt: { width: 54, height: 54, borderRadius: 14 },
  listCopy: { flex: 1 },
  listTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  listMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  speakerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  speakerChip: {
    maxWidth: "48%",
    flexGrow: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  speakerName: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  speakerMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  loadMore: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  loadMoreText: { color: COLORS.primary, fontWeight: "800" },
});
