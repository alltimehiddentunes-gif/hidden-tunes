import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "../../../components/HTImage";
import { PodcastCategoryCard, PodcastShowCard } from "../../../components/podcast/PodcastCards";
import PodcastEmptyCategoryState from "../../../components/podcast/PodcastEmptyCategoryState";
import PodcastSearchBar from "../../../components/podcast/PodcastSearchBar";
import PodcastSearchResults from "../../../components/podcast/PodcastSearchResults";
import {
  getPodcastCategory,
  PODCAST_ROOT_SECTIONS,
  resolvePodcastCategoryId,
  type PodcastCategoryDef,
} from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import {
  fetchPodcastEpisodePlay,
  fetchPodcastEpisodesByCategory,
  getBackendPodcastCategoryLabel,
  PODCAST_CATALOG_PAGE_LIMIT,
  resolveBackendPodcastCategorySlug,
  type PodcastCatalogEpisodeMetadata,
} from "../../../services/podcastCatalogApi";
import {
  getNonEmptyPodcastChildCategories,
  getPodcastShowsByCategory,
} from "../../../services/podcastService";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { usePodcastLocalSearch } from "../../../hooks/usePodcastLocalSearch";
import type { PodcastEpisode } from "../../../types/podcast";
import {
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

const playEpisodeTapGuard = createTapGuardState();

function metadataToQueueEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  showTitle: string,
  audioUrl = ""
): PodcastEpisode {
  return {
    id: metadata.id,
    showId: metadata.showId,
    showTitle,
    title: metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl,
    durationSeconds: metadata.durationSeconds,
    publishedAt: metadata.publishedAt,
    language: "unknown",
    categories: [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

function CategoryPodcastHeader({
  title,
  subtitle,
  kicker = "PODCASTS",
  children,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerKicker}>{kicker}</Text>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function formatEpisodeDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return undefined;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function catalogEpisodeToPodcastEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  play: NonNullable<Awaited<ReturnType<typeof fetchPodcastEpisodePlay>>["play"]>,
  showTitle: string
): PodcastEpisode {
  return {
    id: play.id,
    showId: play.showId || metadata.showId,
    showTitle,
    title: play.title || metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: play.audioUrl,
    durationSeconds: play.durationSeconds ?? metadata.durationSeconds,
    publishedAt: play.publishedAt ?? metadata.publishedAt,
    language: "unknown",
    categories: [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

type MetadataEpisodeRowProps = {
  episode: PodcastCatalogEpisodeMetadata;
  index: number;
  onPress: () => void;
  playing?: boolean;
};

const MetadataEpisodeRow = memo(function MetadataEpisodeRow({
  episode,
  index,
  onPress,
  playing,
}: MetadataEpisodeRowProps) {
  const durationLabel = formatDuration(episode.durationSeconds);
  const dateLabel = formatEpisodeDate(episode.publishedAt);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.episodeRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play episode ${index + 1}, ${episode.title}`}
    >
      {episode.artworkUrl ? (
        <HTImage uri={episode.artworkUrl} style={styles.episodeArt} contentFit="cover" />
      ) : (
        <View style={styles.episodeArtFallback}>
          <Ionicons name="play-outline" size={20} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.episodeCopy}>
        <Text numberOfLines={2} style={styles.episodeTitle}>
          {episode.title}
        </Text>
        <View style={styles.metaRow}>
          {durationLabel ? <Text style={styles.metaText}>{durationLabel}</Text> : null}
          {dateLabel ? <Text style={styles.metaText}>{dateLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.playCircle}>
        {playing ? (
          <ActivityIndicator size="small" color={COLORS.text} />
        ) : (
          <Ionicons name="play" size={14} color={COLORS.text} />
        )}
      </View>
    </TouchableOpacity>
  );
});

function resolveRouteCategoryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export default function PodcastCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawCategoryId = resolveRouteCategoryParam(params.id);
  const backendSlug = useMemo(
    () => resolveBackendPodcastCategorySlug(rawCategoryId),
    [rawCategoryId]
  );
  const categoryId = backendSlug ? rawCategoryId : resolvePodcastCategoryId(rawCategoryId);
  const category = useMemo(() => getPodcastCategory(categoryId), [categoryId]);
  const parentSection = useMemo(
    () => PODCAST_ROOT_SECTIONS.find((section) => section.id === categoryId),
    [categoryId]
  );
  const usesBackendEpisodes = Boolean(backendSlug);

  const { playPodcastEpisodeFromShow } = usePlaybackRouter();
  const { runWithMaturePodcastConsent } = useMaturePodcastGate();

  const [matureEnabled, setMatureEnabled] = useState(shouldIncludeMaturePodcasts());
  const matureOnly = Boolean(category?.matureOnly || parentSection?.matureOnly);
  const searchCategoryIds = useMemo(() => {
    if (parentSection?.children?.length) {
      return getNonEmptyPodcastChildCategories(parentSection.id, matureEnabled).map(
        (child) => child.id
      );
    }
    return [categoryId];
  }, [categoryId, matureEnabled, parentSection]);
  const { query, setQuery, results, hasQuery } = usePodcastLocalSearch({
    matureOnly,
    categoryIds: searchCategoryIds,
  });

  const [episodes, setEpisodes] = useState<PodcastCatalogEpisodeMetadata[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(usesBackendEpisodes);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playingEpisodeId, setPlayingEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      setMatureEnabled(shouldIncludeMaturePodcasts());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const nonEmptyChildren = useMemo(() => {
    if (!parentSection) return [];
    return getNonEmptyPodcastChildCategories(parentSection.id, matureEnabled);
  }, [matureEnabled, parentSection]);

  const shows = useMemo(() => {
    if (usesBackendEpisodes) return [];
    if (parentSection?.children?.length) {
      return nonEmptyChildren.flatMap((child) =>
        getPodcastShowsByCategory(child.id, matureEnabled)
      );
    }
    return getPodcastShowsByCategory(categoryId, matureEnabled);
  }, [categoryId, matureEnabled, nonEmptyChildren, parentSection, usesBackendEpisodes]);

  const loadEpisodes = useCallback(
    async (nextPage = 1, mode: "replace" | "append" = "replace") => {
      if (!backendSlug) return;

      try {
        setLoadError(null);
        const response = await fetchPodcastEpisodesByCategory(
          backendSlug,
          nextPage,
          PODCAST_CATALOG_PAGE_LIMIT
        );

        if (!response.success) {
          setLoadError(response.error || "Podcasts could not be loaded right now.");
          if (mode === "replace") setEpisodes([]);
          setHasMore(false);
          return;
        }

        setEpisodes((current) =>
          mode === "append" ? [...current, ...response.episodes] : response.episodes
        );
        setPage(response.pagination.page);
        setHasMore(response.pagination.hasMore);
      } catch {
        setLoadError("Podcasts could not be loaded right now.");
        if (mode === "replace") setEpisodes([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [backendSlug]
  );

  useEffect(() => {
    if (!backendSlug) return;
    setLoading(true);
    setEpisodes([]);
    setPage(1);
    setHasMore(false);
    void loadEpisodes(1, "replace");
  }, [backendSlug, loadEpisodes]);

  useEffect(() => {
    if (category?.matureOnly && !shouldIncludeMaturePodcasts()) {
      router.replace("/podcasts/mature" as any);
    }
  }, [category]);

  const openShow = useCallback((showId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: showId } });
  }, []);

  const playEpisode = useCallback(
    async (metadata: PodcastCatalogEpisodeMetadata) => {
      if (shouldIgnoreDuplicateTap(playEpisodeTapGuard, `podcast-play:${metadata.id}`)) return;
      setPlayingEpisodeId(metadata.id);
      try {
        const resolved = await fetchPodcastEpisodePlay(metadata.id);
        if (!resolved.success || !resolved.play?.audioUrl) {
          Alert.alert("Unavailable", resolved.error || "This episode is unavailable.");
          return;
        }

        const categoryLabel = getBackendPodcastCategoryLabel(backendSlug!);
        const playable = catalogEpisodeToPodcastEpisode(
          metadata,
          resolved.play,
          categoryLabel
        );

        const showId = String(playable.showId || metadata.showId || "").trim();
        const sameShow = episodes
          .filter((entry) => String(entry.showId || "").trim() === showId)
          .map((entry) =>
            entry.id === metadata.id
              ? playable
              : metadataToQueueEpisode(entry, categoryLabel)
          );
        const categoryOthers = episodes
          .filter((entry) => String(entry.showId || "").trim() !== showId)
          .map((entry) => metadataToQueueEpisode(entry, categoryLabel));

        await runWithMaturePodcastConsent(playable, () =>
          playPodcastEpisodeFromShow(
            playable,
            sameShow.length ? sameShow : [playable],
            undefined,
            {
              categoryEpisodes: categoryOthers,
              categoryId: backendSlug,
              creatorId: playable.publisher,
            }
          ).then((result) => {
            if (!result.ok) {
              Alert.alert("Unavailable", result.error || "This episode is unavailable.");
            }
          })
        );
      } finally {
        setPlayingEpisodeId(null);
      }
    },
    [backendSlug, episodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent]
  );

  const onRefresh = useCallback(() => {
    if (!backendSlug) return;
    setRefreshing(true);
    void loadEpisodes(1, "replace");
  }, [backendSlug, loadEpisodes]);

  const loadMore = useCallback(() => {
    if (!backendSlug || loadingMore || !hasMore) return;
    setLoadingMore(true);
    void loadEpisodes(page + 1, "append");
  }, [backendSlug, hasMore, loadEpisodes, loadingMore, page]);

  if (!category && !parentSection && !backendSlug) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <CategoryPodcastHeader title="Podcasts" subtitle="Category not found" kicker="PODCASTS" />
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Category not found</Text>
        </View>
      </LinearGradient>
    );
  }

  const title = backendSlug
    ? getBackendPodcastCategoryLabel(backendSlug)
    : parentSection?.title || category?.title || "Podcasts";
  const description = parentSection?.description || category?.description || "";
  const isEmpty = usesBackendEpisodes ? !loading && episodes.length === 0 : shows.length === 0;

  if (usesBackendEpisodes) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <CategoryPodcastHeader
          title={title}
          subtitle={description || "Playable Hidden Tunes podcast episodes"}
          kicker="PODCASTS"
        />

        {loading && episodes.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.stateText}>Loading episodes...</Text>
          </View>
        ) : loadError && episodes.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                void loadEpisodes(1, "replace");
              }}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListHeaderComponent={
              episodes.length > 0 ? (
                <Text style={styles.sectionTitle}>
                  {episodes.length} episode{episodes.length === 1 ? "" : "s"} loaded
                </Text>
              ) : null
            }
            renderItem={({ item, index }) => (
              <MetadataEpisodeRow
                episode={item}
                index={index}
                playing={playingEpisodeId === item.id}
                onPress={() => {
                  void playEpisode(item);
                }}
              />
            )}
            ListEmptyComponent={
              isEmpty ? (
                <PodcastEmptyCategoryState onBrowseAll={() => router.replace("/podcasts" as any)} />
              ) : null
            }
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (
                    <Text style={styles.loadMoreText}>Load more</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            removeClippedSubviews
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
          />
        )}
      </LinearGradient>
    );
  }

  const listData = hasQuery ? [] : shows;
  const renderShow = useCallback(
    ({ item }: { item: (typeof shows)[number] }) => (
      <PodcastShowCard show={item} onPress={() => openShow(item.id)} />
    ),
    [openShow]
  );
  const renderHeader = useCallback(
    () => (
      <>
        <PodcastSearchResults results={results} hasQuery={hasQuery} onOpenShow={openShow} />

        {!hasQuery && parentSection && nonEmptyChildren.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>
            <View style={styles.chipWrap}>
              {nonEmptyChildren.map((child: PodcastCategoryDef) => (
                <PodcastCategoryCard
                  key={child.id}
                  category={child}
                  onPress={() =>
                    safeRouterPush({
                      pathname: "/podcasts/category/[id]",
                      params: { id: child.id },
                    })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {!hasQuery && shows.length > 0 ? (
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Shows</Text>
          </View>
        ) : null}
      </>
    ),
    [hasQuery, nonEmptyChildren, openShow, parentSection, results, shows.length]
  );
  const renderEmpty = useCallback(
    () =>
      !hasQuery && isEmpty ? (
        <PodcastEmptyCategoryState onBrowseAll={() => router.replace("/podcasts" as any)} />
      ) : null,
    [hasQuery, isEmpty]
  );

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <CategoryPodcastHeader title={title} subtitle={description} kicker="PODCASTS">
        <PodcastSearchBar value={query} onChangeText={setQuery} />
      </CategoryPodcastHeader>

      <FlatList
        data={listData}
        renderItem={renderShow}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  backButton: {
    padding: 4,
    marginTop: 8,
  },
  headerCopy: {
    flex: 1,
  },
  headerKicker: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 12 },
  section: { gap: 8 },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sectionTitleWrap: { marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginBottom: 8 },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fallbackText: { color: COLORS.textMuted },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  stateText: { color: COLORS.textMuted },
  stateTitle: { color: COLORS.text, textAlign: "center", fontWeight: "700" },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  retryText: { color: COLORS.text, fontWeight: "700" },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  episodeArt: { width: 56, height: 56, borderRadius: 12 },
  episodeArtFallback: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeCopy: { flex: 1, gap: 4 },
  episodeTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaText: { color: COLORS.textMuted, fontSize: 12 },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.28)",
  },
  loadMoreButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  loadMoreText: { color: COLORS.primaryGlow, fontWeight: "700" },
});
