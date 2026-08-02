import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../../../components/HTImage";
import { PodcastEpisodeCard, PodcastShowCard } from "../../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../../components/podcast/MaturePodcastConsentModal";
import { PodcastReadMoreText } from "../../../components/podcast/PodcastReadMoreText";
import PodcastShowBackBar from "../../../components/podcast/PodcastShowBackBar";
import { FadeInView, ScalePressable } from "../../../components/podcast/PodcastShowAnimations";
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import {
  followPodcastShow,
  getFollowedPodcastShows,
  unfollowPodcastShow,
} from "../../../services/podcastLibrary";
import {
  fetchPodcastEpisodePlay,
  fetchPodcastEpisodesByShow,
  fetchPodcastShowById,
  isBackendPodcastShowId,
  PODCAST_CATALOG_PAGE_LIMIT,
  PODCAST_MATURE_CATEGORY_SLUG,
  type PodcastCatalogEpisodeMetadata,
} from "../../../services/podcastCatalogApi";
import {
  getPodcastEpisodes,
  getRelatedPodcastShows,
  PODCAST_SHOW_EPISODE_LIMIT,
  resolvePodcastShowById,
} from "../../../services/podcastService";
import type { PodcastEpisode, PodcastShow } from "../../../types/podcast";
import { cleanPodcastDescription } from "../../../utils/podcastDescription";
import {
  isPlayablePodcastAudioUrl,
  resolvePodcastArtworkUrl,
} from "../../../utils/podcastPlaybackAdapter";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

function shuffleEpisodes<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isEpisodePlayable(episode: PodcastEpisode) {
  return Boolean(episode.audioUrl?.trim() && isPlayablePodcastAudioUrl(episode.audioUrl));
}

function isMatureShowCategories(categories: string[] | undefined) {
  return (categories || []).some((entry) => {
    const value = String(entry || "").trim().toLowerCase();
    return value === PODCAST_MATURE_CATEGORY_SLUG || value.includes("adult") || value.includes("mature");
  });
}

function describeEpisodeLoadError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (!message || message === "Aborted" || lower.includes("abort")) return null;
  if (lower.includes("timeout") || lower.includes("timed out")) return "Request timed out";
  if (lower.includes("network") || lower.includes("connection") || lower.includes("offline")) {
    return "Connection unavailable";
  }
  if (lower.includes("unsupported")) return "Episode source unsupported";
  return message || fallback;
}

function dedupeCatalogEpisodes(
  existing: PodcastCatalogEpisodeMetadata[],
  incoming: PodcastCatalogEpisodeMetadata[]
) {
  const seen = new Set(existing.map((entry) => entry.id));
  const next = [...existing];
  for (const entry of incoming) {
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    next.push(entry);
  }
  return next;
}

const playEpisodeTapGuard = createTapGuardState();

function catalogEpisodeToDisplayEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  showTitle: string,
  mature: boolean,
  showArtworkUrl = ""
): PodcastEpisode {
  return {
    id: metadata.id,
    showId: metadata.showId,
    showTitle,
    title: metadata.title,
    description: metadata.description || "",
    artworkUrl: resolvePodcastArtworkUrl(metadata.artworkUrl, showArtworkUrl),
    audioUrl: "",
    durationSeconds: metadata.durationSeconds,
    publishedAt: metadata.publishedAt,
    language: "unknown",
    categories: mature ? [PODCAST_MATURE_CATEGORY_SLUG] : [],
    isExplicit: mature,
    matureLevel: mature ? "adult" : "safe",
    source: "podcast_rss",
  };
}

function catalogEpisodeToPlayableEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  play: NonNullable<Awaited<ReturnType<typeof fetchPodcastEpisodePlay>>["play"]>,
  showTitle: string,
  mature: boolean,
  showArtworkUrl = ""
): PodcastEpisode {
  return {
    id: play.id,
    showId: play.showId || metadata.showId,
    showTitle,
    title: play.title || metadata.title,
    description: metadata.description || "",
    artworkUrl: resolvePodcastArtworkUrl(metadata.artworkUrl, showArtworkUrl),
    audioUrl: play.audioUrl,
    durationSeconds: play.durationSeconds ?? metadata.durationSeconds,
    publishedAt: play.publishedAt ?? metadata.publishedAt,
    language: "unknown",
    categories: mature ? [PODCAST_MATURE_CATEGORY_SLUG] : [],
    isExplicit: mature,
    matureLevel: mature ? "adult" : "safe",
    source: "podcast_rss",
  };
}

export default function PodcastShowScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const showId = String(params.id || "").trim();
  const isBackendShow = isBackendPodcastShowId(showId);

  const { playPodcastEpisodeFromShow } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const staticShow = useMemo(
    () => (isBackendShow ? null : resolvePodcastShowById(showId)),
    [isBackendShow, showId]
  );
  const [show, setShow] = useState<PodcastShow | null>(staticShow);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [catalogEpisodes, setCatalogEpisodes] = useState<PodcastCatalogEpisodeMetadata[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [resolvingEpisodeId, setResolvingEpisodeId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const inflightPageRef = useRef<number | null>(null);
  const catalogCountRef = useRef(0);
  const showRef = useRef<PodcastShow | null>(staticShow);
  const rssEpisodeCountRef = useRef(0);

  useEffect(() => {
    catalogCountRef.current = catalogEpisodes.length;
    showRef.current = show;
    rssEpisodeCountRef.current = episodes.length;
  }, [catalogEpisodes.length, episodes.length, show]);

  const showIsMature = useMemo(
    () => Boolean(show && (show.matureLevel !== "safe" || isMatureShowCategories(show.categories))),
    [show]
  );

  const cleanedDescription = useMemo(
    () => cleanPodcastDescription(show?.description),
    [show?.description]
  );

  const playableEpisodes = useMemo(
    () => (isBackendShow ? [] : episodes.filter((episode) => isEpisodePlayable(episode))),
    [episodes, isBackendShow]
  );

  const latestEpisode = useMemo(() => {
    if (isBackendShow) {
      return catalogEpisodes[0]
        ? catalogEpisodeToDisplayEpisode(
            catalogEpisodes[0],
            show?.title || "Podcast",
            showIsMature,
            show?.artworkUrl
          )
        : null;
    }
    return playableEpisodes.length > 0 ? playableEpisodes[0] : null;
  }, [
    catalogEpisodes,
    isBackendShow,
    playableEpisodes,
    show?.artworkUrl,
    show?.title,
    showIsMature,
  ]);

  const relatedShows = useMemo(
    () => (show && !isBackendShow ? getRelatedPodcastShows(show, 5) : []),
    [isBackendShow, show]
  );

  const loadBackendShow = useCallback(
    async (nextPage = 1, mode: "replace" | "append" = "replace") => {
      if (!showId) return;
      if (inflightPageRef.current === nextPage) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inflightPageRef.current = nextPage;

      const hasExisting = catalogCountRef.current > 0 || Boolean(showRef.current);
      if (mode === "replace") {
        // Keep cached rows visible — full-screen loader only when nothing usable exists.
        if (!hasExisting) setEpisodesLoading(true);
        setEpisodesError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const includeMature = shouldIncludeMaturePodcasts();
        const showPromise =
          mode === "replace"
            ? fetchPodcastShowById(showId)
            : Promise.resolve({ success: true as const, show: null });
        const [showResult, episodeResult] = await Promise.all([
          showPromise,
          fetchPodcastEpisodesByShow(showId, nextPage, PODCAST_CATALOG_PAGE_LIMIT, {
            includeMature,
            signal: controller.signal,
          }),
        ]);

        if (!mountedRef.current || controller.signal.aborted) return;

        if (mode === "replace") {
          if (!showResult.success || !showResult.show) {
            if (!hasExisting) setShow(null);
            if (!hasExisting) setCatalogEpisodes([]);
            setEpisodesError("This feed could not be loaded");
            setHasMore(false);
            return;
          }

          const catalogShow = showResult.show;
          const mature = isMatureShowCategories(catalogShow.categories);
          setShow({
            id: catalogShow.id,
            title: catalogShow.title,
            publisher: catalogShow.publisher || catalogShow.hostName || catalogShow.title,
            description: catalogShow.description || "",
            artworkUrl: catalogShow.artworkUrl || "",
            feedUrl: "",
            language: "unknown",
            categories: catalogShow.categories,
            isExplicit: mature,
            matureLevel: mature ? "adult" : "safe",
            source: "rss",
          });
        }

        if (!episodeResult.success) {
          if (episodeResult.error === "Aborted") return;
          const mapped =
            describeEpisodeLoadError(episodeResult.error, "Episodes failed to load") ||
            "Episodes failed to load";
          setEpisodesError(mapped);
          if (mode === "replace" && !hasExisting) {
            setCatalogEpisodes([]);
            setHasMore(false);
          }
          return;
        }

        setCatalogEpisodes((current) =>
          mode === "append"
            ? dedupeCatalogEpisodes(current, episodeResult.episodes)
            : dedupeCatalogEpisodes([], episodeResult.episodes)
        );
        setPage(episodeResult.pagination.page);
        setHasMore(Boolean(episodeResult.pagination.hasMore));

        if (!episodeResult.episodes.length && mode === "replace") {
          setEpisodesError("No episodes published");
        } else {
          setEpisodesError(null);
        }
      } catch (error) {
        if (!mountedRef.current) return;
        if (error instanceof Error && error.name === "AbortError") return;
        const mapped =
          describeEpisodeLoadError(error, "Episodes failed to load") || "Episodes failed to load";
        setEpisodesError(mapped);
        if (mode === "replace" && !hasExisting) {
          setShow(null);
          setCatalogEpisodes([]);
        }
      } finally {
        if (inflightPageRef.current === nextPage) inflightPageRef.current = null;
        if (mountedRef.current) {
          setEpisodesLoading(false);
          setLoadingMore(false);
        }
        if (mode === "replace" && mountedRef.current) {
          const followed = await getFollowedPodcastShows();
          if (mountedRef.current) {
            setFollowing(followed.some((item) => item.id === showId));
          }
        }
      }
    },
    [showId]
  );

  const loadRssShow = useCallback(async () => {
    if (!showId) return;

    const resolved = resolvePodcastShowById(showId);
    if (!resolved) {
      setShow(null);
      setEpisodes([]);
      setEpisodesError("This feed could not be loaded");
      return;
    }

    if (resolved.matureLevel !== "safe" && !shouldIncludeMaturePodcasts()) {
      router.replace("/podcasts/mature" as any);
      return;
    }

    const hadEpisodes = rssEpisodeCountRef.current > 0;
    setShow(resolved);
    if (!hadEpisodes) setEpisodesLoading(true);
    setEpisodesError(null);

    try {
      const result = await getPodcastEpisodes(showId, {
        offset: 0,
        limit: PODCAST_SHOW_EPISODE_LIMIT,
        includeMature: shouldIncludeMaturePodcasts(),
      });

      if (!mountedRef.current) return;

      if (result.show) {
        setShow(result.show);
      }

      if (result.error === "mature_blocked") {
        router.replace("/podcasts/mature" as any);
        return;
      }

      setEpisodes(result.episodes);
      if (!result.episodes.length) {
        setEpisodesError("No episodes published");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setEpisodesError(
        describeEpisodeLoadError(error, "Episodes failed to load") || "Episodes failed to load"
      );
    } finally {
      if (mountedRef.current) {
        setEpisodesLoading(false);
        const followed = await getFollowedPodcastShows();
        if (resolved && mountedRef.current) {
          setFollowing(followed.some((item) => item.id === resolved.id));
        }
      }
    }
  }, [showId]);

  const loadEpisodes = useCallback(async () => {
    if (isBackendShow) {
      await loadBackendShow(1, "replace");
      return;
    }
    await loadRssShow();
  }, [isBackendShow, loadBackendShow, loadRssShow]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      inflightPageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEpisodes();
    }, 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
      inflightPageRef.current = null;
    };
  }, [loadEpisodes]);

  const loadMoreEpisodes = useCallback(() => {
    if (!isBackendShow || loadingMore || episodesLoading || !hasMore) return;
    void loadBackendShow(page + 1, "append");
  }, [episodesLoading, hasMore, isBackendShow, loadBackendShow, loadingMore, page]);

  const playResolvedEpisode = useCallback(
    async (metadata: PodcastCatalogEpisodeMetadata) => {
      if (!show) return;
      if (shouldIgnoreDuplicateTap(playEpisodeTapGuard, `podcast-play:${metadata.id}`)) return;

      setResolvingEpisodeId(metadata.id);
      try {
        const resolved = await fetchPodcastEpisodePlay(metadata.id, {
          includeMature: shouldIncludeMaturePodcasts(),
        });
        if (!resolved.success || !resolved.play?.audioUrl) {
          Alert.alert("Unavailable", resolved.error || "This episode is unavailable.");
          return;
        }

        const playable = catalogEpisodeToPlayableEpisode(
          metadata,
          resolved.play,
          show.title,
          showIsMature,
          show.artworkUrl
        );
        // Same-show queue: preserve catalog API order; only the selected row has audio yet.
        const showQueue = catalogEpisodes.map((entry) =>
          entry.id === metadata.id
            ? playable
            : catalogEpisodeToDisplayEpisode(
                entry,
                show.title,
                showIsMature,
                show.artworkUrl
              )
        );
        await runWithMaturePodcastConsent(playable, () =>
          playPodcastEpisodeFromShow(playable, showQueue.length ? showQueue : [playable], undefined, {
            creatorId: show.publisher,
            categoryId: show.categories?.[0],
            feedId: show.feedUrl || show.id,
          }).then((result) => {
            if (!result.ok) Alert.alert("Unavailable", result.error);
          })
        );
      } finally {
        setResolvingEpisodeId(null);
      }
    },
    [
      catalogEpisodes,
      playPodcastEpisodeFromShow,
      runWithMaturePodcastConsent,
      show,
      showIsMature,
    ]
  );

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      if (shouldIgnoreDuplicateTap(playEpisodeTapGuard, `podcast-play:${episode.id}`)) return;
      runWithMaturePodcastConsent(episode, () => {
        void playPodcastEpisodeFromShow(episode, episodes, undefined, {
          creatorId: show?.publisher,
          categoryId: show?.categories?.[0],
          feedId: show?.feedUrl || show?.id,
        }).then((result) => {
          if (!result.ok) Alert.alert("Unavailable", result.error);
        });
      });
    },
    [episodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent, show]
  );

  const playLatest = useCallback(() => {
    if (!latestEpisode) return;
    if (isBackendShow && catalogEpisodes[0]) {
      void playResolvedEpisode(catalogEpisodes[0]);
      return;
    }
    playEpisode(latestEpisode);
  }, [catalogEpisodes, isBackendShow, latestEpisode, playEpisode, playResolvedEpisode]);

  const shuffleEpisodesPlay = useCallback(() => {
    if (isBackendShow) {
      if (!catalogEpisodes.length) return;
      const pick = catalogEpisodes[Math.floor(Math.random() * catalogEpisodes.length)];
      void playResolvedEpisode(pick);
      return;
    }

    if (!playableEpisodes.length) return;
    const shuffled = shuffleEpisodes(playableEpisodes);
    const first = shuffled[0];
    runWithMaturePodcastConsent(first, () => {
      void playPodcastEpisodeFromShow(first, shuffled).then((result) => {
        if (!result.ok) Alert.alert("Unavailable", result.error);
      });
    });
  }, [
    catalogEpisodes,
    isBackendShow,
    playPodcastEpisodeFromShow,
    playResolvedEpisode,
    playableEpisodes,
    runWithMaturePodcastConsent,
  ]);

  const toggleFollow = useCallback(() => {
    if (!show) return;
    if (following) {
      void unfollowPodcastShow(show.id).then(() => setFollowing(false));
      return;
    }
    void followPodcastShow(show).then(() => setFollowing(true));
  }, [following, show]);

  const openRelatedShow = useCallback((relatedShowId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: relatedShowId } });
  }, []);

  const latestUnavailable =
    Boolean(show) && !isBackendShow && !episodesLoading && episodes.length > 0 && !latestEpisode;
  const displayEpisodes = useMemo(() => {
    if (!show) return [] as PodcastEpisode[];
    return isBackendShow
      ? catalogEpisodes.map((item) =>
          catalogEpisodeToDisplayEpisode(item, show.title, showIsMature, show.artworkUrl)
        )
      : episodes;
  }, [catalogEpisodes, episodes, isBackendShow, show, showIsMature]);
  const hasEpisodes = displayEpisodes.length > 0;
  // Avoid blanking the list while a background refresh runs.
  const listData = hasEpisodes ? displayEpisodes : [];

  const listHeader = useMemo(() => {
    if (!show) return null;
    return (
      <FadeInView style={styles.hero}>
        <View style={styles.artworkWrap}>
          {show.artworkUrl ? (
            <HTImage
              uri={show.artworkUrl}
              style={styles.artwork}
              contentFit="cover"
              maxDecodeWidth={416}
              maxDecodeHeight={416}
            />
          ) : (
            <View style={styles.artworkFallback}>
              <Ionicons name="mic-outline" size={40} color={COLORS.textMuted} />
            </View>
          )}
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {show.title}
        </Text>
        <Text style={styles.publisher}>{show.publisher}</Text>
        {show.isExplicit ? <Text style={styles.explicit}>EXPLICIT</Text> : null}

        <View style={styles.actionRow}>
          <ScalePressable
            onPress={toggleFollow}
            accessibilityLabel={following ? "Unfollow podcast show" : "Follow podcast show"}
            style={styles.followButton}
          >
            <Ionicons name={following ? "checkmark" : "add"} size={16} color={COLORS.text} />
            <Text style={styles.followText}>{following ? "Following" : "Follow show"}</Text>
          </ScalePressable>

          <ScalePressable
            onPress={playLatest}
            disabled={!latestEpisode}
            accessibilityLabel={
              latestEpisode ? "Play latest episode" : "Latest episode unavailable"
            }
            style={[styles.playLatestButton, !latestEpisode && styles.playLatestDisabled]}
          >
            <Ionicons name="play" size={16} color={COLORS.text} />
            <Text style={styles.playLatestText}>Play Latest</Text>
          </ScalePressable>
        </View>

        {latestUnavailable ? (
          <Text style={styles.latestUnavailable}>Latest episode unavailable</Text>
        ) : null}

        <ScalePressable
          onPress={shuffleEpisodesPlay}
          disabled={!hasEpisodes}
          accessibilityLabel="Shuffle loaded podcast episodes"
          style={[styles.shuffleButton, !hasEpisodes && styles.shuffleButtonDisabled]}
        >
          <Ionicons name="shuffle" size={16} color={COLORS.primaryGlow} />
          <Text style={styles.shuffleText}>Shuffle Episodes</Text>
        </ScalePressable>

        {cleanedDescription ? <PodcastReadMoreText text={cleanedDescription} /> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Episodes</Text>
          {episodesLoading && !hasEpisodes ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.loadingText}>Loading episodes...</Text>
            </View>
          ) : null}
          {!episodesLoading && episodesError ? (
            <View style={styles.errorPanel}>
              <Text style={styles.emptyText}>{episodesError}</Text>
              <ScalePressable
                onPress={() => {
                  void loadEpisodes();
                }}
                accessibilityLabel="Retry loading episodes"
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Retry</Text>
              </ScalePressable>
            </View>
          ) : null}
        </View>
      </FadeInView>
    );
  }, [
    cleanedDescription,
    episodesError,
    episodesLoading,
    following,
    hasEpisodes,
    latestEpisode,
    latestUnavailable,
    loadEpisodes,
    playLatest,
    show,
    shuffleEpisodesPlay,
    toggleFollow,
  ]);

  const listFooter = useMemo(() => {
    return (
      <View>
        {isBackendShow && loadingMore ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.loadingText}>Loading more episodes...</Text>
          </View>
        ) : null}
        {isBackendShow && hasMore && !loadingMore && hasEpisodes ? (
          <ScalePressable
            onPress={loadMoreEpisodes}
            accessibilityLabel="Load more episodes"
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Load more</Text>
          </ScalePressable>
        ) : null}
        {relatedShows.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related Podcasts</Text>
            {relatedShows.map((related) => (
              <PodcastShowCard
                key={`related-${related.id}`}
                show={related}
                onPress={() => openRelatedShow(related.id)}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }, [
    hasEpisodes,
    hasMore,
    isBackendShow,
    loadMoreEpisodes,
    loadingMore,
    openRelatedShow,
    relatedShows,
  ]);

  const renderEpisode = useCallback(
    ({ item, index }: { item: PodcastEpisode; index: number }) => (
      <PodcastEpisodeCard
        episode={item}
        index={index}
        browseOnly={isBackendShow}
        disabled={isBackendShow && resolvingEpisodeId === item.id}
        onPress={() => {
          if (isBackendShow) {
            void playResolvedEpisode(catalogEpisodes[index]);
            return;
          }
          playEpisode(item);
        }}
      />
    ),
    [
      catalogEpisodes,
      isBackendShow,
      playEpisode,
      playResolvedEpisode,
      resolvingEpisodeId,
    ]
  );

  if (!show) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastShowBackBar />
        <View style={styles.centerContent}>
          {episodesLoading ? (
            <ActivityIndicator color={COLORS.primary} size="large" />
          ) : (
            <View style={styles.errorPanel}>
              <Text style={styles.emptyText}>
                {episodesError || "This feed could not be loaded"}
              </Text>
              <ScalePressable
                onPress={() => {
                  void loadEpisodes();
                }}
                accessibilityLabel="Retry loading podcast show"
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Retry</Text>
              </ScalePressable>
            </View>
          )}
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastShowBackBar />

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisode}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        onEndReached={loadMoreEpisodes}
        onEndReachedThreshold={0.4}
      />

      <MaturePodcastConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  artworkWrap: {
    marginTop: 8,
    marginBottom: 12,
    shadowColor: "#A855F7",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  artwork: { width: 208, height: 208, borderRadius: 28 },
  artworkFallback: {
    width: 208,
    height: 208,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  publisher: {
    color: COLORS.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  explicit: { color: COLORS.danger, fontWeight: "800", fontSize: 11 },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  followText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  playLatestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.34)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.5)",
  },
  playLatestDisabled: {
    opacity: 0.45,
  },
  playLatestText: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  latestUnavailable: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shuffleButtonDisabled: {
    opacity: 0.4,
  },
  shuffleText: {
    color: COLORS.primaryGlow,
    fontWeight: "700",
    fontSize: 13,
  },
  section: { marginTop: 28, gap: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  errorPanel: { alignItems: "center", paddingVertical: 16, gap: 10 },
  emptyText: { color: COLORS.textMuted, textAlign: "center" },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
    alignSelf: "center",
  },
  retryText: { color: COLORS.text, fontWeight: "700", fontSize: 13 },
});
