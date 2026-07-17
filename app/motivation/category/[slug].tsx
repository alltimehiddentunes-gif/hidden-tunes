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
  MOTIVATION_DEFAULT_PAGE_LIMIT,
  fetchMotivationCategoryPage,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import type { MotivationItem } from "@/types/motivation";
import { formatMotivationCountLabel } from "@/utils/motivationEntity";
import {
  groupMotivationItemsForCategoryBrowse,
  mergeMotivationProgramGroups,
  stashMotivationGroupedProgram,
  type MotivationGroupedProgram,
} from "@/utils/motivationGrouping";

const SEARCH_DEBOUNCE_MS = 350;
/** One bounded page — API max is 40 episode rows per request. */
const PAGE_LIMIT = MOTIVATION_DEFAULT_PAGE_LIMIT;
const CATEGORY_CACHE_TTL_MS = 90_000;

type CategoryProgramCard = {
  id: string;
  title: string;
  credit: string;
  episodeCount: number;
  artworkUrl: string | null;
};

type CategoryCacheEntry = {
  at: number;
  title: string;
  groups: MotivationGroupedProgram[];
  cards: CategoryProgramCard[];
  page: number;
  hasMore: boolean;
  query: string;
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
  return `${slug}::${query.trim().toLowerCase()}`;
}

function toProgramCards(groups: MotivationGroupedProgram[]): CategoryProgramCard[] {
  return groups.map((group) => ({
    id: group.id,
    title: group.program.title,
    credit: group.creditName || group.speakerName || "Hidden Tunes Motivationals",
    episodeCount: group.episodeCount,
    artworkUrl: group.program.artwork_url || null,
  }));
}

function groupBrowsePage(items: MotivationItem[]) {
  return groupMotivationItemsForCategoryBrowse(items);
}

const ProgramCard = memo(function ProgramCard({
  card,
  onPress,
}: {
  card: CategoryProgramCard;
  onPress: (id: string) => void;
}) {
  const meta = [
    card.credit,
    formatMotivationCountLabel(card.episodeCount, "episodes"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => onPress(card.id)}
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
  const groupsRef = useRef<MotivationGroupedProgram[]>([]);
  const cardsRef = useRef<CategoryProgramCard[]>([]);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const titleRef = useRef("");
  const queryRef = useRef("");

  const initialCache = cleanSlug
    ? categoryUiCache.get(cacheKey(cleanSlug, ""))
    : undefined;
  const cacheFresh =
    Boolean(initialCache) && Date.now() - (initialCache?.at || 0) < CATEGORY_CACHE_TTL_MS;

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

  if (cacheFresh && initialCache && groupsRef.current.length === 0) {
    groupsRef.current = initialCache.groups;
    cardsRef.current = initialCache.cards;
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
      groups: MotivationGroupedProgram[];
      cards: CategoryProgramCard[];
      page: number;
      hasMore: boolean;
      query: string;
      title: string;
    }) => {
      if (!cleanSlug) return;
      categoryUiCache.set(cacheKey(cleanSlug, next.query), {
        at: Date.now(),
        title: next.title,
        groups: next.groups,
        cards: next.cards,
        page: next.page,
        hasMore: next.hasMore,
        query: next.query,
      });
    },
    [cleanSlug]
  );

  const applyGroups = useCallback(
    (
      nextGroups: MotivationGroupedProgram[],
      nextPage: number,
      nextHasMore: boolean,
      nextQuery: string,
      nextTitle: string
    ) => {
      const nextCards = toProgramCards(nextGroups);
      groupsRef.current = nextGroups;
      cardsRef.current = nextCards;
      setCards(nextCards);
      setPage(nextPage);
      setHasMore(nextHasMore);
      persistCache({
        groups: nextGroups,
        cards: nextCards,
        page: nextPage,
        hasMore: nextHasMore,
        query: nextQuery,
        title: nextTitle,
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
        const result = await fetchMotivationCategoryPage(cleanSlug, {
          page: nextPage,
          limit: PAGE_LIMIT,
          signal: controller.signal,
        });
        if (!mountedRef.current || token !== requestTokenRef.current || controller.signal.aborted) {
          return;
        }

        const nextTitle = titleFromSlug(cleanSlug);
        setTitle(nextTitle);
        const pageGroups = groupBrowsePage(result.items);
        const nextHasMore = Boolean(result.pagination?.hasMore);
        const merged =
          mode === "append"
            ? mergeMotivationProgramGroups(groupsRef.current, pageGroups, { resort: false })
            : pageGroups;
        applyGroups(merged, nextPage, nextHasMore, "", nextTitle);
      } catch (err) {
        if (!mountedRef.current || token !== requestTokenRef.current || isAbortError(err)) return;
        if (mode === "append") {
          lastAppendPageRef.current = 0;
        }
        if (mode === "replace") {
          setError("Couldn't load this category. Pull to retry.");
        }
      } finally {
        if (mountedRef.current && token === requestTokenRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
          loadingMoreLockRef.current = false;
        }
      }
    },
    [applyGroups, cleanSlug, mountedRef]
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

        const pageGroups = groupBrowsePage(result.items);
        const nextHasMore = Boolean(
          result.pagination && "hasMore" in result.pagination
            ? result.pagination.hasMore
            : result.items.length >= PAGE_LIMIT
        );
        const nextTitle = titleFromSlug(cleanSlug);
        const merged =
          mode === "append"
            ? mergeMotivationProgramGroups(groupsRef.current, pageGroups, { resort: false })
            : pageGroups;
        applyGroups(merged, nextPage, nextHasMore, trimmed, nextTitle);
      } catch (err) {
        if (!mountedRef.current || token !== requestTokenRef.current || isAbortError(err)) return;
        if (mode === "append") {
          lastAppendPageRef.current = 0;
        }
        if (mode === "replace") {
          setError("Search failed. Try again.");
          groupsRef.current = [];
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
    [applyGroups, cleanSlug, mountedRef]
  );

  // Mount / slug change: restore cache or fetch browse page once.
  useEffect(() => {
    if (!cleanSlug) return;
    skipEmptyBrowseRef.current = true;
    lastAppendPageRef.current = 0;

    for (const [key, entry] of categoryUiCache.entries()) {
      if (!key.startsWith(`${cleanSlug}::`)) continue;
      if (entry.query.trim().length >= 2 && Date.now() - entry.at < CATEGORY_CACHE_TTL_MS) {
        setQuery(entry.query);
        setDebouncedQuery(entry.query);
        setTitle(entry.title);
        groupsRef.current = entry.groups;
        setCards(entry.cards);
        setPage(entry.page);
        setHasMore(entry.hasMore);
        setLoading(false);
        return () => abortRef.current?.abort();
      }
    }

    const browseCached = categoryUiCache.get(cacheKey(cleanSlug, ""));
    if (
      browseCached &&
      Date.now() - browseCached.at < CATEGORY_CACHE_TTL_MS &&
      browseCached.cards.length
    ) {
      setTitle(browseCached.title);
      groupsRef.current = browseCached.groups;
      setCards(browseCached.cards);
      setPage(browseCached.page);
      setHasMore(browseCached.hasMore);
      setLoading(false);
      return () => abortRef.current?.abort();
    }

    void loadBrowsePage(1, "replace");
    return () => abortRef.current?.abort();
    // Intentionally once per slug.
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
      if (cached?.cards.length) {
        groupsRef.current = cached.groups;
        setCards(cached.cards);
        setPage(cached.page);
        setHasMore(cached.hasMore);
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
    (id: string) => {
      const group = groupsRef.current.find((entry) => entry.id === id);
      if (group) stashMotivationGroupedProgram(group);
      if (cleanSlug) {
        persistCache({
          groups: groupsRef.current,
          cards: cardsRef.current,
          page: pageRef.current,
          hasMore: hasMoreRef.current,
          query: queryRef.current.trim(),
          title: titleRef.current,
        });
      }
      router.push(`/motivation/program/${encodeURIComponent(id)}` as never);
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
