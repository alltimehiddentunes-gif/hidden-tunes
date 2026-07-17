import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "@/components/HTImage";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  fetchMotivationHome,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import { listContinueMotivationEntries } from "@/services/motivationProgress";
import { listMotivationRecentlyPlayed } from "@/services/motivationRecentlyPlayed";
import type { MotivationCategory, MotivationItem } from "@/types/motivation";
import {
  formatMotivationCountLabel,
  isSpeakerEntityKind,
  type MotivationEntity,
} from "@/utils/motivationEntity";
import {
  collectEntitiesFromGroups,
  groupMotivationItemsIntoPrograms,
  rankMotivationSearchResults,
  stashMotivationGroupedProgram,
  type MotivationGroupedProgram,
} from "@/utils/motivationGrouping";
import {
  extractMotivationProgramTitle,
  sanitizeMotivationTitle,
} from "@/utils/motivationPresentation";
import { playMotivationProgramItem } from "@/utils/MotivationPlaybackController";

const SEARCH_DEBOUNCE_MS = 350;
const HOME_CACHE_TTL_MS = 120_000;
const LIMITS = {
  continue: 6,
  featured: 8,
  categories: 8,
  speakers: 6,
  organizations: 4,
  recent: 8,
  /** Max raw items processed from home lanes (not full catalog). */
  primaryLaneItems: 16,
  secondaryLaneItems: 12,
  searchPage: 20,
} as const;

const CATEGORY_PRIORITY = [
  "daily-motivation",
  "business-motivation",
  "study-motivation",
  "faith-purpose",
  "leadership",
  "confidence",
  "success",
  "mindset",
  "career",
  "health-fitness",
  "discipline",
  "personal-growth",
];

type HomeCache = {
  at: number;
  categories: MotivationCategory[];
  programGroups: MotivationGroupedProgram[];
  secondaryGroups: MotivationGroupedProgram[];
};

let homeCache: HomeCache | null = null;
let homeInFlight: Promise<HomeCache> | null = null;

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

function sortCategories(categories: MotivationCategory[]) {
  return [...categories]
    .filter((category) => (category.item_count || 0) > 0)
    .sort((a, b) => {
      const ai = CATEGORY_PRIORITY.indexOf(a.slug);
      const bi = CATEGORY_PRIORITY.indexOf(b.slug);
      const ap = ai === -1 ? 999 : ai;
      const bp = bi === -1 ? 999 : bi;
      if (ap !== bp) return ap - bp;
      return (b.item_count || 0) - (a.item_count || 0);
    });
}

function normalizeHomeCategories(raw: MotivationCategory[]) {
  return sortCategories(
    (raw || []).map((category) => ({
      id: String(category.id || category.slug || ""),
      slug: String(category.slug || ""),
      name: String(category.name || category.title || category.slug || "Motivation"),
      item_count: Number(category.item_count || 0),
    }))
  );
}

function dedupeItems(items: MotivationItem[]) {
  const seen = new Set<string>();
  const next: MotivationItem[] = [];
  for (const item of items) {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(item);
  }
  return next;
}

/** Bounded 2-column grid — no nested FlatList (avoids virtualization heat). */
const BoundedTwoColGrid = memo(function BoundedTwoColGrid({
  children,
}: {
  children: ReactNode[];
}) {
  const rows: ReactNode[][] = [];
  for (let i = 0; i < children.length; i += 2) {
    rows.push(children.slice(i, i + 2));
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.gridRow}>
          {row.map((cell, cellIndex) => (
            <View key={`cell-${rowIndex}-${cellIndex}`} style={styles.gridCell}>
              {cell}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.gridCell} /> : null}
        </View>
      ))}
    </View>
  );
});

const SectionHeader = memo(function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll ? (
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const ProgramCard = memo(function ProgramCard({
  group,
  onOpen,
  onPlay,
  playing,
}: {
  group: MotivationGroupedProgram;
  onOpen: () => void;
  onPlay: () => void;
  playing?: boolean;
}) {
  const credit = group.creditName || "Hidden Tunes Motivationals";
  const meta = [
    formatMotivationCountLabel(group.episodeCount, "episodes"),
    group.program.category_slug?.replace(/-/g, " "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={onOpen}>
        <HTImage
          uri={group.program.artwork_url || undefined}
          style={styles.cardArt}
          contentFit="cover"
          maxDecodeWidth={220}
          maxDecodeHeight={220}
        />
        <Text style={styles.cardTitle} numberOfLines={2}>
          {group.program.title}
        </Text>
        <Text style={styles.cardCredit} numberOfLines={1}>
          {credit}
        </Text>
        {meta ? (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.playChip}
        onPress={onPlay}
        disabled={playing}
        accessibilityRole="button"
        accessibilityLabel={`Play ${group.program.title}`}
      >
        {playing ? (
          <ActivityIndicator size="small" color="#00130D" />
        ) : (
          <>
            <Ionicons name="play" size={14} color="#00130D" />
            <Text style={styles.playChipText}>Play</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});

const EntityCard = memo(function EntityCard({
  entity,
  onPress,
}: {
  entity: MotivationEntity;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.entityCard} activeOpacity={0.88} onPress={onPress}>
      <HTImage
        uri={entity.artwork || undefined}
        style={styles.entityArt}
        contentFit="cover"
        maxDecodeWidth={200}
        maxDecodeHeight={140}
      />
      <Text style={styles.entityName} numberOfLines={2}>
        {entity.displayName}
      </Text>
      <Text style={styles.entityMeta} numberOfLines={1}>
        {formatMotivationCountLabel(entity.episodeCount, "episodes")}
      </Text>
    </TouchableOpacity>
  );
});

const CategoryCard = memo(function CategoryCard({
  category,
  onPress,
}: {
  category: MotivationCategory;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.categoryCard} activeOpacity={0.88} onPress={onPress}>
      <Text style={styles.categoryTitle} numberOfLines={2}>
        {category.name}
      </Text>
      <Text style={styles.categoryMeta}>
        {formatMotivationCountLabel(category.item_count, "episodes")}
      </Text>
    </TouchableOpacity>
  );
});

const SkeletonCards = memo(function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <BoundedTwoColGrid>
      {Array.from({ length: count }, (_, index) => (
        <View key={`sk-${index}`} style={styles.skeletonCard} />
      ))}
    </BoundedTwoColGrid>
  );
});

type SearchHit =
  | { type: "Episode"; item: MotivationItem; group: MotivationGroupedProgram; key: string }
  | { type: "Program"; group: MotivationGroupedProgram; key: string }
  | { type: "Speaker" | "Organization"; entity: MotivationEntity; key: string }
  | { type: "Category"; category: MotivationCategory; key: string };

export default function MotivationHomeScreen() {
  const mountedRef = useMountedRef();
  const insets = useSafeAreaInsets();
  const abortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playGuardRef = useRef<string | null>(null);
  const secondaryTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [primaryLoading, setPrimaryLoading] = useState(!homeCache);
  const [secondaryReady, setSecondaryReady] = useState(Boolean(homeCache));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MotivationCategory[]>(
    homeCache?.categories || []
  );
  const [programGroups, setProgramGroups] = useState<MotivationGroupedProgram[]>(
    homeCache?.programGroups || []
  );
  const [secondaryGroups, setSecondaryGroups] = useState<MotivationGroupedProgram[]>(
    homeCache?.secondaryGroups || []
  );
  const [continueItems, setContinueItems] = useState<
    Awaited<ReturnType<typeof listContinueMotivationEntries>>
  >([]);
  const [recentItems, setRecentItems] = useState<
    Awaited<ReturnType<typeof listMotivationRecentlyPlayed>>
  >([]);
  const [playingProgramId, setPlayingProgramId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const openProgramGroup = useCallback((group: MotivationGroupedProgram) => {
    stashMotivationGroupedProgram(group);
    router.push(`/motivation/program/${encodeURIComponent(group.id)}` as never);
  }, []);

  const playProgram = useCallback(async (group: MotivationGroupedProgram) => {
    const startId = group.items[0]?.id;
    if (!startId) return;
    if (playGuardRef.current === group.id) return;
    playGuardRef.current = group.id;
    setPlayingProgramId(group.id);
    setPlayError(null);
    try {
      stashMotivationGroupedProgram(group);
      // Cap metadata queue — resolve only the active item on demand.
      const startIndex = Math.max(
        0,
        group.items.findIndex((item) => item.id === startId)
      );
      const queueWindow = group.items.slice(startIndex, startIndex + 24);
      await playMotivationProgramItem({
        program: group.program,
        items: queueWindow,
        startItemId: startId,
        contextType: queueWindow.length > 1 ? "program" : "standalone",
        contextSlug: group.program.category_slug || undefined,
        page: 1,
        hasMore: group.items.length > queueWindow.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't start playback.";
      setPlayError(message);
    } finally {
      if (playGuardRef.current === group.id) playGuardRef.current = null;
      setPlayingProgramId(null);
    }
  }, []);

  const scheduleSecondary = useCallback(() => {
    secondaryTaskRef.current?.cancel();
    const task = InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) setSecondaryReady(true);
    });
    secondaryTaskRef.current = task;
  }, [mountedRef]);

  const applyHomeCache = useCallback(
    (payload: HomeCache, opts?: { schedule?: boolean }) => {
      if (!mountedRef.current) return;
      setCategories(payload.categories);
      setProgramGroups(payload.programGroups);
      setSecondaryGroups(payload.secondaryGroups);
      setPrimaryLoading(false);
      if (opts?.schedule) scheduleSecondary();
      else setSecondaryReady(true);
    },
    [mountedRef, scheduleSecondary]
  );

  const hydrateFromHome = useCallback(
    async (signal?: AbortSignal, force = false) => {
      const now = Date.now();
      if (!force && homeCache && now - homeCache.at < HOME_CACHE_TTL_MS) {
        applyHomeCache(homeCache, { schedule: true });
        return homeCache;
      }

      if (!force && homeInFlight) {
        const cached = await homeInFlight;
        if (!signal?.aborted) applyHomeCache(cached, { schedule: true });
        return cached;
      }

      const task = (async (): Promise<HomeCache> => {
        const home = await fetchMotivationHome(signal);
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const primaryItems = dedupeItems([
          ...(home.popular || []).slice(0, 12),
          ...(home.recommended || []).slice(0, 8),
        ]).slice(0, LIMITS.primaryLaneItems);

        const secondaryItems = dedupeItems([
          ...(home.new_releases || []).slice(0, 12),
          ...(home.featured_items || []).slice(0, 8),
        ]).slice(0, LIMITS.secondaryLaneItems);

        const primaryGroups = groupMotivationItemsIntoPrograms(primaryItems).slice(
          0,
          LIMITS.featured
        );
        const secondaryGroupsNext = groupMotivationItemsIntoPrograms(secondaryItems).slice(
          0,
          LIMITS.recent
        );

        const payload: HomeCache = {
          at: Date.now(),
          categories: normalizeHomeCategories(home.categories || []),
          programGroups: primaryGroups,
          secondaryGroups: secondaryGroupsNext,
        };
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        homeCache = payload;
        return payload;
      })();

      homeInFlight = task.finally(() => {
        homeInFlight = null;
      });

      const payload = await task;
      if (!signal?.aborted) applyHomeCache(payload, { schedule: true });
      return payload;
    },
    [applyHomeCache]
  );

  const loadLocal = useCallback(async () => {
    const [continueRows, recentRows] = await Promise.all([
      listContinueMotivationEntries(LIMITS.continue),
      listMotivationRecentlyPlayed(LIMITS.recent),
    ]);
    if (!mountedRef.current) return;
    setContinueItems(continueRows);
    setRecentItems(recentRows);
  }, [mountedRef]);

  const loadHome = useCallback(
    async (force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      if (force) {
        setSecondaryReady(false);
        if (!homeCache) setPrimaryLoading(true);
      } else if (!homeCache) {
        setPrimaryLoading(true);
      }

      // Local storage must not wait on the slow home API.
      void loadLocal();

      try {
        await hydrateFromHome(controller.signal, force);
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted || isAbortError(err)) return;
        if (!homeCache) setError("Couldn't load Motivationals. Pull to retry.");
        setPrimaryLoading(false);
      } finally {
        if (mountedRef.current && !controller.signal.aborted) {
          setRefreshing(false);
        }
      }
    },
    [hydrateFromHome, loadLocal, mountedRef]
  );

  useEffect(() => {
    void loadHome(false);
    return () => {
      abortRef.current?.abort();
      searchAbortRef.current?.abort();
      secondaryTaskRef.current?.cancel();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // Mount-once: in-flight dedupe + AbortController handle revisits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entitySourceGroups = useMemo(
    () => [...programGroups, ...(secondaryReady ? secondaryGroups : [])],
    [programGroups, secondaryGroups, secondaryReady]
  );

  const entities = useMemo(
    () =>
      collectEntitiesFromGroups(entitySourceGroups, {
        speakersLimit: LIMITS.speakers,
        organizationsLimit: LIMITS.organizations,
        minEpisodesForSpeaker: 2,
        maxItemsPerEntity: 12,
      }),
    [entitySourceGroups]
  );

  const featuredPrograms = useMemo(
    () => programGroups.slice(0, LIMITS.featured),
    [programGroups]
  );
  const recentPrograms = useMemo(() => {
    if (!secondaryReady) return [];
    const fromRecent = groupMotivationItemsIntoPrograms(
      recentItems.map((entry) => entry.item).slice(0, LIMITS.recent),
      { excludeMisplacedAudiobooks: false }
    );
    if (fromRecent.length) return fromRecent.slice(0, LIMITS.recent);
    return secondaryGroups.slice(0, LIMITS.recent);
  }, [recentItems, secondaryGroups, secondaryReady]);

  const categoryPreview = useMemo(
    () => categories.slice(0, LIMITS.categories),
    [categories]
  );

  const runSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 2) {
        setSearchHits([]);
        setSearchError(null);
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
          page: 1,
          limit: LIMITS.searchPage,
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        const ranked = rankMotivationSearchResults(result.items, q).slice(0, LIMITS.searchPage);
        const grouped = groupMotivationItemsIntoPrograms(ranked, {
          excludeMisplacedAudiobooks: false,
        });
        const entityMatches = [
          ...entities.allSpeakers,
          ...entities.allOrganizations,
        ].filter((entity) => entity.displayName.toLowerCase().includes(q.toLowerCase()));
        const categoryMatches = categories.filter((category) =>
          category.name.toLowerCase().includes(q.toLowerCase())
        );

        const episodeHits: SearchHit[] = ranked.slice(0, 8).map((item) => {
          const group =
            groupMotivationItemsIntoPrograms([item], {
              excludeMisplacedAudiobooks: false,
            })[0] ||
            ({
              id: item.id,
              program: {
                id: item.id,
                slug: item.id,
                title: extractMotivationProgramTitle(item.title),
                artwork_url: item.artwork,
                category_slug: item.category_slug,
              },
              items: [item],
              volumes: [],
              speakerName: item.speaker_name || null,
              creditName: item.speaker_name || item.channel_name || null,
              creditKind: "unknown",
              episodeCount: 1,
              isSynthetic: true,
            } satisfies MotivationGroupedProgram);
          return {
            type: "Episode" as const,
            item,
            group,
            key: `episode:${item.id}`,
          };
        });

        const hits: SearchHit[] = [
          ...grouped.slice(0, 8).map((group) => ({
            type: "Program" as const,
            group,
            key: `program:${group.id}`,
          })),
          ...entityMatches.slice(0, 6).map((entity) => ({
            type: (isSpeakerEntityKind(entity.kind) ? "Speaker" : "Organization") as
              | "Speaker"
              | "Organization",
            entity,
            key: `entity:${entity.id}`,
          })),
          ...categoryMatches.slice(0, 4).map((category) => ({
            type: "Category" as const,
            category,
            key: `category:${category.slug}`,
          })),
          ...episodeHits,
        ];
        setSearchHits(hits);
      } catch (err) {
        if (!mountedRef.current || isAbortError(err)) return;
        setSearchError("Search failed. Try again.");
        setSearchHits([]);
      } finally {
        if (mountedRef.current && !controller.signal.aborted) setSearchLoading(false);
      }
    },
    [categories, entities.allOrganizations, entities.allSpeakers, mountedRef]
  );

  const onChangeSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!value.trim()) {
        searchAbortRef.current?.abort();
        setSearchHits([]);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      searchTimerRef.current = setTimeout(() => void runSearch(value), SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  const isSearching = searchQuery.trim().length >= 2;
  const bottomPad = 140 + Math.max(insets.bottom, 8);

  const sections = useMemo(() => {
    if (isSearching) return [{ key: "search" }];
    const keys = [{ key: "continue" }, { key: "featured" }, { key: "categories" }];
    if (secondaryReady) {
      keys.push({ key: "speakers" }, { key: "organizations" }, { key: "recent" });
    }
    return keys;
  }, [isSearching, secondaryReady]);

  const renderSection = useCallback(
    ({ item }: { item: { key: string } }) => {
      const key = item.key;

      if (key === "search") {
        return (
          <View style={styles.section}>
            {searchLoading && !searchHits.length ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : null}
            {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
            {!searchLoading && !searchHits.length && !searchError ? (
              <Text style={styles.emptyText}>No matches for “{searchQuery.trim()}”.</Text>
            ) : null}
            {searchHits.map((hit) => {
              if (hit.type === "Program") {
                return (
                  <TouchableOpacity
                    key={hit.key}
                    style={styles.listRow}
                    onPress={() => openProgramGroup(hit.group)}
                  >
                    <Text style={styles.hitType}>Program</Text>
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {hit.group.program.title}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {hit.group.creditName || "Hidden Tunes Motivationals"}
                    </Text>
                  </TouchableOpacity>
                );
              }
              if (hit.type === "Episode") {
                return (
                  <TouchableOpacity
                    key={hit.key}
                    style={styles.listRow}
                    onPress={() => void playProgram(hit.group)}
                  >
                    <Text style={styles.hitType}>Episode</Text>
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {sanitizeMotivationTitle(hit.item.title)}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {[
                        extractMotivationProgramTitle(hit.item.title),
                        hit.item.speaker_name || hit.item.channel_name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </TouchableOpacity>
                );
              }
              if (hit.type === "Category") {
                return (
                  <TouchableOpacity
                    key={hit.key}
                    style={styles.listRow}
                    onPress={() =>
                      router.push(
                        `/motivation/category/${encodeURIComponent(hit.category.slug)}` as never
                      )
                    }
                  >
                    <Text style={styles.hitType}>Category</Text>
                    <Text style={styles.listTitle}>{hit.category.name}</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={hit.key}
                  style={styles.listRow}
                  onPress={() =>
                    router.push(
                      (isSpeakerEntityKind(hit.entity.kind)
                        ? `/motivation/speaker/${encodeURIComponent(hit.entity.id)}`
                        : `/motivation/organization/${encodeURIComponent(hit.entity.id)}`) as never
                    )
                  }
                >
                  <Text style={styles.hitType}>{hit.type}</Text>
                  <Text style={styles.listTitle}>{hit.entity.displayName}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      }

      if (key === "continue") {
        if (!continueItems.length) return null;
        return (
          <View style={styles.section}>
            <SectionHeader title="Continue Listening" />
            {continueItems.slice(0, LIMITS.continue).map((entry) => (
              <TouchableOpacity
                key={entry.itemId}
                style={styles.listRow}
                onPress={() =>
                  router.push(
                    `/motivation/program/${encodeURIComponent(entry.programId || entry.itemId)}` as never
                  )
                }
              >
                <HTImage
                  uri={entry.programArtwork || undefined}
                  style={styles.listArt}
                  contentFit="cover"
                  maxDecodeWidth={96}
                  maxDecodeHeight={96}
                />
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle} numberOfLines={2}>
                    {sanitizeMotivationTitle(entry.itemTitle || entry.programTitle || "Motivation")}
                  </Text>
                  <Text style={styles.listMeta} numberOfLines={1}>
                    {entry.programTitle || "Continue"}
                  </Text>
                </View>
                <Ionicons name="play-circle-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            ))}
          </View>
        );
      }

      if (key === "featured") {
        if (!featuredPrograms.length) {
          return primaryLoading ? (
            <View style={styles.section}>
              <SectionHeader title="Popular Programs" />
              <SkeletonCards count={4} />
            </View>
          ) : null;
        }
        return (
          <View style={styles.section}>
            <SectionHeader title="Popular Programs" />
            <BoundedTwoColGrid>
              {featuredPrograms.map((group) => (
                <ProgramCard
                  key={group.id}
                  group={group}
                  onOpen={() => openProgramGroup(group)}
                  onPlay={() => void playProgram(group)}
                  playing={playingProgramId === group.id}
                />
              ))}
            </BoundedTwoColGrid>
          </View>
        );
      }

      if (key === "categories") {
        if (!categoryPreview.length) {
          return primaryLoading ? (
            <View style={styles.section}>
              <SectionHeader title="Categories" />
              <SkeletonCards count={4} />
            </View>
          ) : null;
        }
        return (
          <View style={styles.section}>
            <SectionHeader title="Categories" />
            <BoundedTwoColGrid>
              {categoryPreview.map((category) => (
                <CategoryCard
                  key={category.slug}
                  category={category}
                  onPress={() =>
                    router.push(`/motivation/category/${encodeURIComponent(category.slug)}` as never)
                  }
                />
              ))}
            </BoundedTwoColGrid>
          </View>
        );
      }

      if (key === "speakers") {
        if (!entities.speakers.length) return null;
        return (
          <View style={styles.section}>
            <SectionHeader
              title="Speakers"
              onSeeAll={() => router.push("/motivation/speakers" as never)}
            />
            <BoundedTwoColGrid>
              {entities.speakers.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  onPress={() =>
                    router.push(`/motivation/speaker/${encodeURIComponent(entity.id)}` as never)
                  }
                />
              ))}
            </BoundedTwoColGrid>
          </View>
        );
      }

      if (key === "organizations") {
        if (!entities.organizations.length) return null;
        return (
          <View style={styles.section}>
            <SectionHeader
              title="Organizations & Publishers"
              onSeeAll={() => router.push("/motivation/organizations" as never)}
            />
            <BoundedTwoColGrid>
              {entities.organizations.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  onPress={() =>
                    router.push(
                      `/motivation/organization/${encodeURIComponent(entity.id)}` as never
                    )
                  }
                />
              ))}
            </BoundedTwoColGrid>
          </View>
        );
      }

      if (!recentPrograms.length) return null;
      return (
        <View style={styles.section}>
          <SectionHeader title="Recently Added" />
          <BoundedTwoColGrid>
            {recentPrograms.map((group) => (
              <ProgramCard
                key={group.id}
                group={group}
                onOpen={() => openProgramGroup(group)}
                onPlay={() => void playProgram(group)}
                playing={playingProgramId === group.id}
              />
            ))}
          </BoundedTwoColGrid>
        </View>
      );
    },
    [
      categoryPreview,
      continueItems,
      entities.organizations,
      entities.speakers,
      featuredPrograms,
      openProgramGroup,
      playProgram,
      playingProgramId,
      primaryLoading,
      recentPrograms,
      searchError,
      searchHits,
      searchLoading,
      searchQuery,
    ]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderSection}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={4}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            isSearching ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadHome(true);
                }}
                tintColor={COLORS.primary}
              />
            )
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBackToMore}
                accessibilityRole="button"
                accessibilityLabel="Back to More"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.heroEyebrow}>Hidden Tunes</Text>
              <Text style={styles.heroTitle}>Motivationals</Text>
              <Text style={styles.heroSubtitle}>
                Programs, speakers, and guided talks — curated for listening.
              </Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={onChangeSearch}
                  placeholder="Search programs, speakers and episodes"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => onChangeSearch("")}>
                    <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {playError ? <Text style={styles.playError}>{playError}</Text> : null}
              {error ? (
                <TouchableOpacity
                  style={styles.errorBanner}
                  onPress={() => {
                    setRefreshing(true);
                    void loadHome(true);
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
  content: { paddingHorizontal: 16 },
  hero: { paddingTop: 56, paddingBottom: 8 },
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
  section: { marginTop: 22 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  seeAll: { color: COLORS.primary, fontSize: 13, fontWeight: "800" },
  grid: { gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  gridCell: { flex: 1, minWidth: 0 },
  skeletonCard: {
    flex: 1,
    minHeight: 160,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
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
  cardCredit: { color: COLORS.text, fontSize: 12, fontWeight: "600", marginTop: 4 },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  playChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  playChipText: { color: "#00130D", fontWeight: "900", fontSize: 12 },
  entityCard: {
    flex: 1,
    minHeight: 148,
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  entityArt: { width: "100%", aspectRatio: 1.4, borderRadius: 12, marginBottom: 8 },
  entityName: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  entityMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
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
  categoryTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  categoryMeta: { color: COLORS.textMuted, marginTop: 8, fontSize: 12 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  listArt: { width: 48, height: 48, borderRadius: 10 },
  listCopy: { flex: 1 },
  listTitle: { color: COLORS.text, fontWeight: "800", fontSize: 14, flex: 1 },
  listMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  hitType: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    position: "absolute",
    top: 8,
    right: 12,
  },
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 24 },
  errorBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,80,80,0.12)",
  },
  errorText: { color: "#FFB4B4", fontSize: 13 },
  retryText: { color: COLORS.primary, fontWeight: "800", marginTop: 6 },
  playError: { color: "#FFB4B4", marginTop: 10, fontSize: 13 },
});
