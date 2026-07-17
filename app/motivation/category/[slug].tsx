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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "@/components/HTImage";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  MOTIVATION_CATEGORY_PROGRAM_PAGE_LIMIT,
  fetchMotivationCategoryPrograms,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import type { MotivationCategoryProgramSummary, MotivationItem } from "@/types/motivation";
import { formatMotivationCountLabel } from "@/utils/motivationEntity";
import {
  groupMotivationItemsForCategoryBrowse,
  mergeMotivationProgramGroups,
  stashMotivationGroupedProgram,
  type MotivationGroupedProgram,
} from "@/utils/motivationGrouping";

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_LIMIT = MOTIVATION_CATEGORY_PROGRAM_PAGE_LIMIT;
const CATEGORY_CACHE_TTL_MS = 90_000;
/** Bump when category cache card shape changes (programs-v1 vs legacy groups). */
const CATEGORY_CACHE_VERSION = "programs-v1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CategoryProgramCard = {
  id: string;
  title: string;
  credit: string;
  episodeCount: number;
  artworkUrl: string | null;
  routeId: string;
};

type CategoryCacheEntry = {
  version: string;
  at: number;
  title: string;
  cards: CategoryProgramCard[];
  page: number;
  hasMore: boolean;
  query: string;
  mode: "programs" | "legacy";
};

const categoryUiCache = new Map<string, CategoryCacheEntry>();

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function goBackWithinMotivation() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/motivation" as never);
}

function titleFromSlug(slug: string) {
  return slug.replace(/-/g, " ");
}

function cacheKey(slug: string, query: string) {
  return `${CATEGORY_CACHE_VERSION}::${slug}::${query.trim().toLowerCase()}`;
}

function summaryToCard(summary: MotivationCategoryProgramSummary): CategoryProgramCard {
  const routeId =
    (summary.program_id && UUID_RE.test(summary.program_id) && summary.program_id) ||
    summary.first_item_id;
  const id = summary.program_id || `item:${summary.first_item_id}`;
  return {
    id,
    title: summary.title,
    credit:
      summary.speaker ||
      summary.organization ||
      "Hidden Tunes Motivationals",
    episodeCount: summary.episode_count,
    artworkUrl: summary.artwork_url,
    routeId,
  };
}

function groupsToCards(groups: MotivationGroupedProgram[]): CategoryProgramCard[] {
  return groups.map((group) => ({
    id: group.id,
    title: group.program.title,
    credit: group.creditName || group.speakerName || "Hidden Tunes Motivationals",
    episodeCount: group.episodeCount,
    artworkUrl: group.program.artwork_url || null,
    routeId: group.id,
  }));
}

const ProgramCard = memo(function ProgramCard({
  card,
  onPress,
}: {
  card: CategoryProgramCard;
  onPress: (routeId: string) => void;
}) {
  const meta = [card.credit, formatMotivationCountLabel(card.episodeCount, "episodes")]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => onPress(card.routeId)}
    >
      <HTImage
        uri={card.artworkUrl || undefined}
        style={styles.cardArt}
        contentFit="cover"
        maxDecodeWidth={220}
        maxDecodeHeight={220}
      />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {card.title}
      </Text>
      {meta ? (
        <Text style={styles.cardMeta} numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const SkeletonGrid = memo(function SkeletonGrid() {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={`sk-${index}`} style={styles.skeletonCard} />
      ))}
    </View>
  );
});

export default function MotivationCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cleanSlug = String(slug || "").trim();
  const mountedRef = useMountedRef();
  const insets = useSafeAreaInsets();
  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingMoreLockRef = useRef(false);
  const requestTokenRef = useRef(0);
  const skipEmptyBrowseRef = useRef(true);
  const lastAppendPageRef = useRef(0);
  const legacyGroupsRef = useRef<MotivationGroupedProgram[]>([]);
  const cardsRef = useRef<CategoryProgramCard[]>([]);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const titleRef = useRef("");
  const queryRef = useRef("");
  const browseModeRef = useRef<"programs" | "legacy">("programs");

  const initialCache = cleanSlug ? categoryUiCache.get(cacheKey(cleanSlug, "")) : undefined;
  const cacheFresh =
    Boolean(initialCache) &&
    initialCache?.version === CATEGORY_CACHE_VERSION &&
    Date.now() - (initialCache?.at || 0) < CATEGORY_CACHE_TTL_MS;

  const [title, setTitle] = useState(
    initialCache?.title || titleFromSlug(cleanSlug) || "Motivation"
  );
  const [query, setQuery] = useState(initialCache?.query || "");
  const [debouncedQuery, setDebouncedQuery] = useState(initialCache?.query || "");
  const [cards, setCards] = useState<CategoryProgramCard[]>(
    cacheFresh ? initialCache!.cards : []
  );
  const [page, setPage] = useState(cacheFresh ? initialCache!.page : 1);
  const [hasMore, setHasMore] = useState(cacheFresh ? Boolean(initialCache!.hasMore) : false);
  const [loading, setLoading] = useState(!(cacheFresh && initialCache!.cards.length));
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cacheFresh && initialCache && cardsRef.current.length === 0) {
    cardsRef.current = initialCache.cards;
    browseModeRef.current = initialCache.mode;
  }

  titleRef.current = title;
  queryRef.current = query;
  pageRef.current = page;
  hasMoreRef.current = hasMore;
  cardsRef.current = cards;

  const isSearching = debouncedQuery.trim().length >= 2;
  const bottomPad = 120 + Math.max(insets.bottom, 8);

  const persistCache = useCallback(
    (next: {
      cards: CategoryProgramCard[];
      page: number;
      hasMore: boolean;
      query: string;
      title: string;
      mode: "programs" | "legacy";
    }) => {
      if (!cleanSlug) return;
      categoryUiCache.set(cacheKey(cleanSlug, next.query), {
        version: CATEGORY_CACHE_VERSION,
        at: Date.now(),
        title: next.title,
        cards: next.cards,
        page: next.page,
        hasMore: next.hasMore,
        query: next.query,
        mode: next.mode,
      });
    },
    [cleanSlug]
  );

  const applyCards = useCallback(
    (
      nextCards: CategoryProgramCard[],
      nextPage: number,
      nextHasMore: boolean,
      nextQuery: string,
      nextTitle: string,
      mode: "programs" | "legacy"
    ) => {
      cardsRef.current = nextCards;
      browseModeRef.current = mode;
      setCards(nextCards);
      setPage(nextPage);
      setHasMore(nextHasMore);
      persistCache({
        cards: nextCards,
        page: nextPage,
        hasMore: nextHasMore,
        query: nextQuery,
        title: nextTitle,
        mode,
      });
    },
    [persistCache]
  );

  const loadBrowsePage = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!cleanSlug) return;
      if (mode === "append") {
        if (loadingMoreLockRef.current) return;
        if (lastAppendPageRef.current === nextPage) return;
        lastAppendPageRef.current = nextPage;
        loadingMoreLockRef.current = true;
        setLoadingMore(true);
      } else {
        lastAppendPageRef.current = 0;
        setLoading((was) => was || cardsRef.current.length === 0);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const token = ++requestTokenRef.current;

      try {
        const result = await fetchMotivationCategoryPrograms(cleanSlug, {
          page: nextPage,
          limit: PAGE_LIMIT,
          signal: controller.signal,
        });
        if (!mountedRef.current || token !== requestTokenRef.current || controller.signal.aborted) {
          return;
        }

        const nextTitle = titleFromSlug(cleanSlug);
        setTitle(nextTitle);
        const nextHasMore = Boolean(result.pagination?.hasMore);

        if (result.mode === "programs") {
          const pageCards = result.items.map(summaryToCard);
          const merged =
            mode === "append" ? [...cardsRef.current, ...pageCards] : pageCards;
          // Deduplicate by id while preserving order.
          const seen = new Set<string>();
          const unique = merged.filter((card) => {
            if (seen.has(card.id)) return false;
            seen.add(card.id);
            return true;
          });
          applyCards(unique, nextPage, nextHasMore, "", nextTitle, "programs");
          return;
        }

        const pageGroups = groupMotivationItemsForCategoryBrowse(result.items as MotivationItem[]);
        const mergedGroups =
          mode === "append"
            ? mergeMotivationProgramGroups(legacyGroupsRef.current, pageGroups, {
                resort: false,
              })
            : pageGroups;
        legacyGroupsRef.current = mergedGroups;
        applyCards(
          groupsToCards(mergedGroups),
          nextPage,
          nextHasMore,
          "",
          nextTitle,
          "legacy"
        );
      } catch (err) {
        if (!mountedRef.current || token !== requestTokenRef.current || isAbortError(err)) return;
        if (mode === "append") lastAppendPageRef.current = 0;
        if (mode === "replace") setError("Couldn't load this category. Pull to retry.");
      } finally {
        if (mountedRef.current && token === requestTokenRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
          loadingMoreLockRef.current = false;
        }
      }
    },
    [applyCards, cleanSlug, mountedRef]
  );

  const loadSearchPage = useCallback(
    async (nextPage: number, mode: "replace" | "append", q: string) => {
      const trimmed = q.trim();
      if (!cleanSlug || trimmed.length < 2) return;
      if (mode === "append") {
        if (loadingMoreLockRef.current) return;
        if (lastAppendPageRef.current === nextPage) return;
        lastAppendPageRef.current = nextPage;
        loadingMoreLockRef.current = true;
        setLoadingMore(true);
      } else {
        lastAppendPageRef.current = 0;
        setSearchLoading(true);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const token = ++requestTokenRef.current;

      try {
        const result = await searchMotivationItems(trimmed, {
          page: nextPage,
          limit: PAGE_LIMIT,
          signal: controller.signal,
          categorySlug: cleanSlug,
        });
        if (!mountedRef.current || token !== requestTokenRef.current || controller.signal.aborted) {
          return;
        }

        const pageGroups = groupMotivationItemsForCategoryBrowse(result.items);
        const nextHasMore = Boolean(
          result.pagination && "hasMore" in result.pagination
            ? result.pagination.hasMore
            : result.items.length >= PAGE_LIMIT
        );
        const nextTitle = titleFromSlug(cleanSlug);
        const mergedGroups =
          mode === "append"
            ? mergeMotivationProgramGroups(legacyGroupsRef.current, pageGroups, {
                resort: false,
              })
            : pageGroups;
        legacyGroupsRef.current = mergedGroups;
        applyCards(
          groupsToCards(mergedGroups),
          nextPage,
          nextHasMore,
          trimmed,
          nextTitle,
          "legacy"
        );
      } catch (err) {
        if (!mountedRef.current || token !== requestTokenRef.current || isAbortError(err)) return;
        if (mode === "append") lastAppendPageRef.current = 0;
        if (mode === "replace") {
          setError("Search failed. Try again.");
          legacyGroupsRef.current = [];
          setCards([]);
        }
      } finally {
        if (mountedRef.current && token === requestTokenRef.current) {
          setSearchLoading(false);
          setLoadingMore(false);
          loadingMoreLockRef.current = false;
        }
      }
    },
    [applyCards, cleanSlug, mountedRef]
  );

  useEffect(() => {
    if (!cleanSlug) return;
    skipEmptyBrowseRef.current = true;
    lastAppendPageRef.current = 0;

    for (const [key, entry] of categoryUiCache.entries()) {
      if (!key.startsWith(`${CATEGORY_CACHE_VERSION}::${cleanSlug}::`)) continue;
      if (
        entry.version === CATEGORY_CACHE_VERSION &&
        entry.query.trim().length >= 2 &&
        Date.now() - entry.at < CATEGORY_CACHE_TTL_MS
      ) {
        setQuery(entry.query);
        setDebouncedQuery(entry.query);
        setTitle(entry.title);
        setCards(entry.cards);
        setPage(entry.page);
        setHasMore(entry.hasMore);
        browseModeRef.current = entry.mode;
        setLoading(false);
        return () => abortRef.current?.abort();
      }
    }

    const browseCached = categoryUiCache.get(cacheKey(cleanSlug, ""));
    if (
      browseCached &&
      browseCached.version === CATEGORY_CACHE_VERSION &&
      Date.now() - browseCached.at < CATEGORY_CACHE_TTL_MS &&
      browseCached.cards.length
    ) {
      setTitle(browseCached.title);
      setCards(browseCached.cards);
      setPage(browseCached.page);
      setHasMore(browseCached.hasMore);
      browseModeRef.current = browseCached.mode;
      setLoading(false);
      return () => abortRef.current?.abort();
    }

    void loadBrowsePage(1, "replace");
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanSlug]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      if (skipEmptyBrowseRef.current) {
        skipEmptyBrowseRef.current = false;
        return;
      }
      const cached = categoryUiCache.get(cacheKey(cleanSlug, ""));
      if (cached?.cards.length && cached.version === CATEGORY_CACHE_VERSION) {
        setCards(cached.cards);
        setPage(cached.page);
        setHasMore(cached.hasMore);
        browseModeRef.current = cached.mode;
        setError(null);
        setSearchLoading(false);
        return;
      }
      void loadBrowsePage(1, "replace");
      return;
    }
    void loadSearchPage(1, "replace", trimmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanSlug, debouncedQuery]);

  const openProgram = useCallback(
    (routeId: string) => {
      const group = legacyGroupsRef.current.find((entry) => entry.id === routeId);
      if (group) stashMotivationGroupedProgram(group);
      if (cleanSlug) {
        persistCache({
          cards: cardsRef.current,
          page: pageRef.current,
          hasMore: hasMoreRef.current,
          query: queryRef.current.trim(),
          title: titleRef.current,
          mode: browseModeRef.current,
        });
      }
      router.push(`/motivation/program/${encodeURIComponent(routeId)}` as never);
    },
    [cleanSlug, persistCache]
  );

  const onEndReached = useCallback(() => {
    if (loading || searchLoading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    if (lastAppendPageRef.current === nextPage) return;
    if (isSearching) {
      void loadSearchPage(nextPage, "append", debouncedQuery);
      return;
    }
    void loadBrowsePage(nextPage, "append");
  }, [
    debouncedQuery,
    hasMore,
    isSearching,
    loadBrowsePage,
    loadSearchPage,
    loading,
    loadingMore,
    page,
    searchLoading,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: CategoryProgramCard }) => (
      <ProgramCard card={item} onPress={openProgram} />
    ),
    [openProgram]
  );

  const keyExtractor = useCallback((item: CategoryProgramCard) => item.id, []);

  const listEmpty = useMemo(() => {
    if (loading || searchLoading) return <SkeletonGrid />;
    return (
      <Text style={styles.emptyText}>
        {isSearching
          ? `No matches for “${debouncedQuery.trim()}” in ${title}.`
          : error
            ? "Pull to retry."
            : "No programs in this category yet."}
      </Text>
    );
  }, [debouncedQuery, error, isSearching, loading, searchLoading, title]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View style={styles.shell}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBackWithinMotivation}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Programs and series in this category</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search within ${title}`}
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={`Search within ${title}`}
            />
            {query ? (
              <TouchableOpacity
                onPress={() => {
                  setQuery("");
                  setDebouncedQuery("");
                }}
                hitSlop={8}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ) : null}
            {searchLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          </View>
          {error ? (
            <TouchableOpacity
              style={styles.errorBanner}
              onPress={() => {
                if (isSearching) void loadSearchPage(1, "replace", debouncedQuery);
                else {
                  setRefreshing(true);
                  void loadBrowsePage(1, "replace");
                }
              }}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={cards}
          numColumns={2}
          key="motivation-category-programs"
          style={styles.list}
          columnWrapperStyle={styles.columnWrap}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          renderItem={renderItem}
          refreshControl={
            isSearching ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadBrowsePage(1, "replace");
                }}
                tintColor={COLORS.primary}
              />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={60}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />
            ) : (
              <View style={styles.footerSpacer} />
            )
          }
          ListEmptyComponent={listEmpty}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  shell: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  list: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 6 },
  columnWrap: { gap: 12, marginBottom: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", textTransform: "capitalize" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  searchWrap: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    minHeight: 48,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, padding: 0 },
  errorBanner: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(251,146,60,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.35)",
  },
  errorText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  retryText: { color: COLORS.primary, fontSize: 13, fontWeight: "800", marginTop: 6 },
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
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  footerLoader: { marginVertical: 18 },
  footerSpacer: { height: 8 },
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 40, paddingHorizontal: 16 },
  skeletonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 8,
  },
  skeletonCard: {
    width: "47%",
    flexGrow: 1,
    minHeight: 180,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
