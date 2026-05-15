import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  fetchChannelVideosPage,
  fetchRelatedYouTubeVideosPage,
  searchYouTubeMusicPage,
  type YouTubeVideo,
} from "@/services/youtube";
import { FALLBACK_ARTWORK } from "@/utils/artwork";

type TVMode = "channel" | "search";

function getVideoId(item: YouTubeVideo) {
  return String(item.videoId || item.id || "").replace("youtube-", "").trim();
}

function getCover(item: YouTubeVideo) {
  return item.thumbnail || item.artwork || item.cover || FALLBACK_ARTWORK;
}

function mergeVideos(current: YouTubeVideo[], incoming: YouTubeVideo[]) {
  const seen = new Set(current.map((item) => getVideoId(item)).filter(Boolean));
  const merged = [...current];

  incoming.forEach((item) => {
    const videoId = getVideoId(item);

    if (!videoId || seen.has(videoId)) return;

    seen.add(videoId);
    merged.push(item);
  });

  return merged;
}

const TVSkeleton = memo(function TVSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((item) => (
        <View key={`tv-skeleton-${item}`} style={styles.skeletonCard}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );
});

const TVVideoCard = memo(function TVVideoCard({
  item,
  pressed,
  onPress,
}: {
  item: YouTubeVideo;
  pressed: boolean;
  onPress: (item: YouTubeVideo) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.videoCard, pressed && styles.videoCardPressed]}
      onPress={() => onPress(item)}
    >
      <View style={styles.thumbnailBox}>
        <Image source={{ uri: getCover(item) }} style={styles.thumbnail} />

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.86)"]}
          style={styles.thumbnailShade}
        />

        <View style={styles.playOverlay}>
          {pressed ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="play" size={28} color="#fff" />
          )}
        </View>

        <View style={styles.badge}>
          <Ionicons name="tv" size={13} color="#fff" />
          <Text style={styles.badgeText}>HIDDEN TUNES TV</Text>
        </View>
      </View>

      <View style={styles.videoInfo}>
        <Text numberOfLines={2} style={styles.videoTitle}>
          {item.title || "Hidden Tunes TV"}
        </Text>

        <Text numberOfLines={1} style={styles.channel}>
          {item.channelTitle || item.artist || "Hidden Tunes"}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function HiddenTunesTVScreen() {
  const listRef = useRef<FlatList<YouTubeVideo>>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef(0);

  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [pressedVideoId, setPressedVideoId] = useState<string | null>(null);
  const [mode, setMode] = useState<TVMode>("channel");
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [relatedPageToken, setRelatedPageToken] = useState<string | undefined>();
  const [relatedSeedId, setRelatedSeedId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const titleCopy = useMemo(() => {
    if (mode === "search" && query.trim()) return `Search: ${query.trim()}`;
    return "Official Hidden Tunes channel";
  }, [mode, query]);

  const statusCopy = useMemo(() => {
    if (loadingRelated) return "Finding related embedded videos...";
    if (videos.length > 0) {
      return `${videos.length} videos ready for embedded playback`;
    }

    return "Videos will appear here";
  }, [loadingRelated, videos.length]);

  const loadRelatedVideos = useCallback(
    async (
      seedVideoId: string,
      pageToken = "",
      append = true,
      requestId = activeRequestRef.current
    ) => {
      if (!seedVideoId) return;

      try {
        setLoadingRelated(true);

        const page = await fetchRelatedYouTubeVideosPage(seedVideoId, pageToken);

        if (page.error) {
          console.log("Hidden Tunes TV related videos warning:", page.error);
        }

        if (activeRequestRef.current !== requestId) return;

        if (page.videos.length > 0) {
          setVideos((current) =>
            append ? mergeVideos(current, page.videos) : page.videos
          );
        }

        setRelatedPageToken(page.nextPageToken);
      } finally {
        setLoadingRelated(false);
      }
    },
    []
  );

  const loadChannelVideos = useCallback(async (showLoader = true) => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    try {
      if (showLoader) setLoading(true);
      setErrorMessage("");
      setMode("channel");
      setNextPageToken(undefined);
      setRelatedPageToken(undefined);
      setRelatedSeedId("");

      const page = await fetchChannelVideosPage();

      if (activeRequestRef.current !== requestId) return;

      setVideos(page.videos);
      setNextPageToken(page.nextPageToken);

      if (page.error) {
        setErrorMessage(page.error);
      }

      const firstVideoId = getVideoId(page.videos[0]);
      setRelatedSeedId(firstVideoId);

      listRef.current?.scrollToOffset({ offset: 0, animated: false });

      if (firstVideoId) {
        await loadRelatedVideos(firstVideoId, "", true, requestId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Hidden Tunes TV failed to load.";

      console.log("Hidden Tunes TV channel load error:", message);
      setErrorMessage(message);
      setVideos([]);
    } finally {
      if (activeRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
        setSearching(false);
      }
    }
  }, [loadRelatedVideos]);

  const runSearch = useCallback(
    async (text: string) => {
      const safeText = text.trim();

      if (!safeText) {
        await loadChannelVideos(false);
        return;
      }

      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      try {
        setSearching(true);
        setErrorMessage("");
        setMode("search");
        setNextPageToken(undefined);
        setRelatedPageToken(undefined);
        setRelatedSeedId("");

        const page = await searchYouTubeMusicPage(safeText);

        if (activeRequestRef.current !== requestId) return;

        setVideos(page.videos);
        setNextPageToken(page.nextPageToken);

        if (page.error) {
          setErrorMessage(page.error);
        }

        const firstVideoId = getVideoId(page.videos[0]);
        setRelatedSeedId(firstVideoId);

        listRef.current?.scrollToOffset({ offset: 0, animated: false });

        if (firstVideoId) {
          await loadRelatedVideos(firstVideoId, "", true, requestId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Hidden Tunes TV search failed.";

        console.log("Hidden Tunes TV search error:", message);
        setErrorMessage(message);
        setVideos([]);
      } finally {
        if (activeRequestRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
          setSearching(false);
        }
      }
    },
    [loadChannelVideos, loadRelatedVideos]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore) return;

    const pageToken = nextPageToken || relatedPageToken || "";

    if (!pageToken) return;

    try {
      setLoadingMore(true);
      setErrorMessage("");

      const page =
        nextPageToken && mode === "search"
          ? await searchYouTubeMusicPage(query, nextPageToken)
          : nextPageToken
          ? await fetchChannelVideosPage(nextPageToken)
          : await fetchRelatedYouTubeVideosPage(relatedSeedId, relatedPageToken);

      setVideos((current) => mergeVideos(current, page.videos));

      if (nextPageToken) {
        setNextPageToken(page.nextPageToken);
      } else {
        setRelatedPageToken(page.nextPageToken);
      }

      if (page.error) {
        setErrorMessage(page.error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Hidden Tunes TV could not load more.";

      console.log("Hidden Tunes TV load more error:", message);
      setErrorMessage(message);
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    mode,
    nextPageToken,
    query,
    relatedPageToken,
    relatedSeedId,
  ]);

  const debouncedSearch = useCallback(
    (text: string) => {
      setQuery(text);

      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      searchTimerRef.current = setTimeout(() => {
        runSearch(text);
      }, 420);
    },
    [runSearch]
  );

  const openVideo = useCallback(
    (item: YouTubeVideo) => {
      const videoId = getVideoId(item);

      if (!videoId) {
        console.log("Missing Hidden Tunes TV videoId:", item);
        return;
      }

      setPressedVideoId(videoId);

      const queue = videos
        .map((video) => {
          const id = getVideoId(video);

          return {
            id,
            videoId: id,
            title: video.title || "Hidden Tunes TV",
            artist: video.artist || video.channelTitle || "Hidden Tunes TV",
            channelTitle: video.channelTitle || video.artist || "Hidden Tunes TV",
            thumbnail: getCover(video),
          };
        })
        .filter((video) => video.videoId.length === 11);

      const startIndex = Math.max(
        0,
        queue.findIndex((video) => video.videoId === videoId)
      );

      router.push({
        pathname: "/youtube-player",
        params: {
          id: videoId,
          videoId,
          title: item.title || "Hidden Tunes TV",
          artist: item.artist || item.channelTitle || "Hidden Tunes TV",
          channelTitle: item.channelTitle || item.artist || "Hidden Tunes TV",
          thumbnail: getCover(item),
          startIndex: String(startIndex),
          queue: JSON.stringify(queue),
        },
      } as any);

      setTimeout(() => setPressedVideoId(null), 800);
    },
    [videos]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    if (mode === "search" && query.trim()) {
      await runSearch(query);
      return;
    }

    await loadChannelVideos(false);
  }, [loadChannelVideos, mode, query, runSearch]);

  const renderVideo = useCallback(
    ({ item }: { item: YouTubeVideo }) => (
      <TVVideoCard
        item={item}
        pressed={pressedVideoId === getVideoId(item)}
        onPress={openVideo}
      />
    ),
    [openVideo, pressedVideoId]
  );

  const footer = useMemo(() => {
    const canLoadMore = Boolean(nextPageToken || relatedPageToken);

    if (!canLoadMore && !loadingRelated) return <View style={{ height: 12 }} />;

    return (
      <View style={styles.footer}>
        {loadingRelated && (
          <View style={styles.relatedPill}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.relatedText}>Adding related discovery...</Text>
          </View>
        )}

        {canLoadMore && (
          <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.loadMoreButton, loadingMore && styles.disabledButton]}
            onPress={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="add" size={18} color="#000" />
            )}

            <Text style={styles.loadMoreText}>
              {loadingMore ? "Loading More" : "Load More Videos"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loadMore, loadingMore, loadingRelated, nextPageToken, relatedPageToken]);

  useEffect(() => {
    loadChannelVideos(true);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [loadChannelVideos]);

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>LEGAL VIDEO DISCOVERY</Text>
          <Text style={styles.title}>Hidden Tunes TV</Text>
          <Text style={styles.subtitle}>
            Official channel first. Broad YouTube discovery when you search.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => loadChannelVideos(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={COLORS.cyan} />

        <TextInput
          value={query}
          onChangeText={debouncedSearch}
          placeholder="Search videos, artists, genres or music..."
          placeholderTextColor={COLORS.textDim}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
          onSubmitEditing={() => runSearch(query)}
        />

        {searching ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : query.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setQuery("");
              loadChannelVideos(false);
            }}
          >
            <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="logo-youtube" size={20} color="#ff0033" />
        )}
      </View>

      {errorMessage.length > 0 && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={COLORS.primary} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {loading ? (
        <TVSkeleton />
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(item, index) =>
            `${getVideoId(item) || "hidden-tv"}-${index}`
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={renderVideo}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={80}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              tintColor={COLORS.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          ListHeaderComponent={
            <View style={styles.feedHeader}>
              <Text style={styles.feedTitle}>{titleCopy}</Text>
              <Text style={styles.feedSub}>{statusCopy}</Text>
            </View>
          }
          ListFooterComponent={footer}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="tv-outline" size={46} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No TV videos found</Text>
              <Text style={styles.emptyText}>
                Try another search, check the YouTube API key/quota, or pull down
                to reload the official channel.
              </Text>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    fontWeight: "700",
  },

  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  searchBox: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 17,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    color: COLORS.text,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "800",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "rgba(255,0,51,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,0,51,0.26)",
  },

  errorText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },

  list: {
    paddingBottom: 170,
  },

  feedHeader: {
    marginBottom: 14,
  },

  feedTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  feedSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  videoCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 28,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  videoCardPressed: {
    borderColor: "rgba(255,0,51,0.72)",
    transform: [{ scale: 0.99 }],
  },

  thumbnailBox: {
    width: "100%",
    height: 194,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#111",
  },

  thumbnail: {
    width: "100%",
    height: "100%",
  },

  thumbnailShade: {
    ...StyleSheet.absoluteFillObject,
  },

  playOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 62,
    height: 62,
    borderRadius: 31,
    marginLeft: -31,
    marginTop: -31,
    backgroundColor: "rgba(255,0,51,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 6,
  },

  videoInfo: {
    paddingTop: 14,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },

  videoTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
  },

  channel: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    fontWeight: "700",
  },

  footer: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 18,
  },

  relatedPill: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  relatedText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  loadMoreButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
  },

  disabledButton: {
    opacity: 0.7,
  },

  loadMoreText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },

  skeletonWrap: {
    paddingTop: 6,
  },

  skeletonCard: {
    borderRadius: 28,
    padding: 12,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  skeletonImage: {
    height: 194,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.09)",
  },

  skeletonLineWide: {
    width: "78%",
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginTop: 15,
  },

  skeletonLine: {
    width: "46%",
    height: 11,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 10,
  },

  emptyBox: {
    marginTop: 70,
    alignItems: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    color: COLORS.text,
    marginTop: 14,
    fontSize: 20,
    fontWeight: "900",
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
});
