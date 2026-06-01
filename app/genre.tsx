import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayerActions } from "../context/PlayerContext";
import GenreTrackRow from "../components/catalog/GenreTrackRow";
import HTImage from "../components/HTImage";

import {
  ensureCatalogViewPersistenceHydrated,
  getInstantCatalogView,
  loadCatalogView,
} from "../services/unifiedCatalog";
import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import { getArtworkUri, resolveEntityArtwork } from "../utils/artwork";
import {
  getCanonicalGenreTitle,
  resolveCatalogEmptyState,
  type CatalogResolverType,
} from "../utils/catalogResolver";
import {
  shouldReplaceCatalogResults,
  shouldResetCatalogFallbackGate,
} from "../utils/catalogEmptyStateTiming";
import {
  logApiRefresh,
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  logTapToPlay,
  startPerformanceTimer,
} from "../utils/performanceLogs";
import {
  recordScreenOpen,
  useRenderCountProbe,
} from "../utils/performanceVerification";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
  getNestedSongListLayout,
  LIST_ITEM_HEIGHTS,
  markFastScrolling,
} from "../utils/performanceMode";
import {
  logAudioPreloadTargetSelected,
  pickFirstPlayableTrack,
} from "../utils/audioPreloadTargeting";
import { scheduleDebouncedAudioPreload } from "../utils/audioPreloadScheduler";

type AlbumPreview = {
  id: string;
  album: string;
  artist: string;
  thumbnail: string;
  query: string;
  songs: HiddenTunesNormalizedSong[];
};

function getArtwork(song: any) {
  return getArtworkUri(song);
}

function cleanGenreQuery(value: string) {
  return String(value || "")
    .replace(/\s+music$/i, "")
    .replace(/\s+songs$/i, "")
    .trim();
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getArtwork(song);
  const streamUrl = String(song?.streamUrl || song?.url || song?.audioUrl || "");

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || song?.user?.name || "Hidden Tunes"),
    album: song?.album || "Singles",
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: String(song?.url || streamUrl),
    streamUrl,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  } as HiddenTunesNormalizedSong;
}

function dedupeSongs(songs: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = String(song.id || song.streamUrl || song.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(song.streamUrl || song.url);
  });
}

export default function GenreScreen() {
  const params = useLocalSearchParams();
  const { playSong, preloadIdlePlayableTrack } = usePlayerActions();
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const loadedCatalogKeyRef = useRef<string | null>(null);

  const rawTitle = String(params.title || "Genre");
  const rawQuery = String(params.query || rawTitle || "music");
  const query = cleanGenreQuery(rawQuery);
  const genreId = String(params.id || "");
  const catalogType = String(params.type || "genre") as CatalogResolverType;
  const title = getCanonicalGenreTitle(rawTitle) || rawTitle;

  useRenderCountProbe("GenreScreen");

  const trackKeyExtractor = useMemo(
    () => createStableKeyExtractor("genre-track"),
    []
  );

  const catalogOptions = useMemo(
    () => ({
      type: catalogType,
      id: genreId,
      title,
      query,
    }),
    [catalogType, genreId, query, title]
  );

  const catalogCacheKey = useMemo(
    () => `${catalogType}:${genreId}:${title}:${query}`,
    [catalogType, genreId, query, title]
  );

  const instantView = useMemo(
    () => getInstantCatalogView(catalogOptions),
    [catalogOptions]
  );

  const [cloudTracks, setCloudTracks] = useState<HiddenTunesNormalizedSong[]>(
    () => (instantView?.songs || []).map(safeSong)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(() => !(instantView?.songs.length || 0));
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(instantView?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(
    Boolean(instantView?.songs.length)
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(cloudTracks.length),
    [cloudTracks.length]
  );

  const trackListLayout = useMemo(
    () => getNestedSongListLayout(LIST_ITEM_HEIGHTS.catalogSongRow),
    []
  );

  const emptyState = useMemo(
    () =>
      resolveCatalogEmptyState({
        hasCheckedFallbacks,
        isLoading: loading,
        isRefreshing: refreshing,
        resolvedCount: cloudTracks.length,
      }),
    [cloudTracks.length, hasCheckedFallbacks, loading, refreshing]
  );

  const genreAudioPreloadTarget = useMemo(() => {
    const first = pickFirstPlayableTrack(cloudTracks);
    return first ? { song: first, tier: "genre_first" as const } : null;
  }, [cloudTracks]);

  const loadGenreTracks = useCallback(
    async (forceRefresh = false) => {
      const refreshStart = startPerformanceTimer();

      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else if (!cloudTracks.length) {
          setLoading(true);
        }

        if (shouldResetCatalogFallbackGate(cloudTracks.length)) {
          setHasCheckedFallbacks(false);
        }

        const result = await loadCatalogView({
          ...catalogOptions,
          page: 1,
          forceRefresh,
        });

        const nextTracks = result.songs.map(safeSong);
        if (
          shouldReplaceCatalogResults(nextTracks, cloudTracks.length, {
            allowClearStale: forceRefresh,
          })
        ) {
          setCloudTracks(nextTracks);
        }
        setPage(1);
        setHasMore(result.hasMore);

        if (result.showedCached) {
          logCacheResult("genre", true, {
            label: title,
            count: result.songs.length,
            cacheKey: result.target.cacheKey,
          });
          logScreenReady("genre", screenStartedAt, {
            cache: "hit",
            count: result.songs.length,
          });
          recordScreenOpen("genre", {
            openMs: Date.now() - screenStartedAt,
            firstContentMs: Date.now() - screenStartedAt,
          });
          logPerformanceSummary("genre", {
            cache: "hit",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: result.songs.length,
          });
        } else {
          logCacheResult("genre", false, { label: title });
          logScreenReady("genre", screenStartedAt, {
            cache: "miss",
            count: result.songs.length,
          });
          logPerformanceSummary("genre", {
            cache: "miss",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: result.songs.length,
            emptyStateReason: result.emptyStateReason,
          });
        }

        logApiRefresh("genre", refreshStart, {
          label: title,
          count: result.songs.length,
          fallbackUsed: result.fallbackUsed,
          cacheKey: result.target.cacheKey,
        });
      } catch (error) {
        if (__DEV__) {
          console.log("Genre load error:", error);
        }
      } finally {
        setHasCheckedFallbacks(true);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [catalogOptions, cloudTracks.length, screenStartedAt, title]
  );

  const loadGenreTracksRef = useRef(loadGenreTracks);
  loadGenreTracksRef.current = loadGenreTracks;

  const loadMoreTracks = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);

      const nextPage = page + 1;
      const result = await loadCatalogView({
        ...catalogOptions,
        page: nextPage,
      });

      const nextTracks = dedupeSongs([
        ...cloudTracks,
        ...result.songs.map(safeSong),
      ]);

      setCloudTracks(nextTracks);
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (error) {
      if (__DEV__) {
        console.log("Genre load more error:", error);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [catalogOptions, cloudTracks, hasMore, loadingMore, page]);

  useEffect(() => {
    if (loadedCatalogKeyRef.current === catalogCacheKey) return;

    let cancelled = false;
    loadedCatalogKeyRef.current = catalogCacheKey;

    void (async () => {
      await ensureCatalogViewPersistenceHydrated();
      if (cancelled) return;

      const hydratedInstant = getInstantCatalogView(catalogOptions);
      if (hydratedInstant?.songs.length) {
        setCloudTracks(hydratedInstant.songs.map(safeSong));
        setHasMore(hydratedInstant.hasMore);
        setLoading(false);
        setHasCheckedFallbacks(true);
      }

      await loadGenreTracksRef.current(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [catalogCacheKey, catalogOptions]);

  useEffect(() => {
    if (loading || !hasCheckedFallbacks || !genreAudioPreloadTarget?.song?.id) {
      return undefined;
    }

    const target = genreAudioPreloadTarget;

    return scheduleDebouncedAudioPreload(
      `genre:${catalogCacheKey}:${target.song.id}`,
      () => {
        logAudioPreloadTargetSelected("genre", {
          song: target.song,
          tier: target.tier,
        });
        void preloadIdlePlayableTrack(target.song, { source: "genre:first" });
      },
      { delayMs: 550 }
    );
  }, [
    catalogCacheKey,
    genreAudioPreloadTarget,
    hasCheckedFallbacks,
    loading,
    preloadIdlePlayableTrack,
  ]);

  const albums: AlbumPreview[] = useMemo(() => {
    const grouped = new Map<string, HiddenTunesNormalizedSong[]>();

    cloudTracks.forEach((song) => {
      const albumKey = String(song.albumId || song.album || `${song.artist}-singles`);
      const current = grouped.get(albumKey) || [];
      current.push(song);
      grouped.set(albumKey, current);
    });

    return Array.from(grouped.entries())
      .slice(0, 8)
      .map(([albumKey, songs]) => {
        const lead = songs[0];
        return {
          id: albumKey,
          album: lead.album || `${lead.artist} Essentials`,
          artist: lead.artist || "Hidden Tunes",
          thumbnail: resolveEntityArtwork(lead, songs),
          query: `${lead.album || lead.artist} songs`,
          songs,
        };
      });
  }, [cloudTracks]);

  const playQueue = useMemo(
    () => dedupeSongs(cloudTracks.map(safeSong)),
    [cloudTracks]
  );

  const openCloudTrack = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const tapStartedAt = startPerformanceTimer();
        const normalized = safeSong(song);
        const startIndex = playQueue.findIndex((item) => item.id === normalized.id);

        void playSong(
          normalized as any,
          playQueue as any,
          startIndex >= 0 ? startIndex : 0
        ).finally(() => {
          logTapToPlay("genre", tapStartedAt, { id: normalized.id });
        });

        requestAnimationFrame(() => {
          router.push("/music-feed" as any);
        });
      } catch (error) {
        if (__DEV__) {
          console.log("Open genre cloud song error:", error);
        }
      }
    },
    [playQueue, playSong]
  );

  const openCloudTrackRef = useRef(openCloudTrack);
  openCloudTrackRef.current = openCloudTrack;

  const renderGenreTrackItem = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <GenreTrackRow
        item={item}
        onPress={(track) => openCloudTrackRef.current(track)}
      />
    ),
    []
  );

  function openAlbum(album: AlbumPreview) {
    router.push({
      pathname: "/album",
      params: {
        album: album.album,
        artist: album.artist,
        thumbnail: album.thumbnail,
        query: album.query,
      },
    } as any);
  }

  function openRadio() {
    router.push({
      pathname: "/radio",
      params: {
        title: `${title} Radio`,
        query,
      },
    } as any);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>
            {catalogType === "mood" ? "MOOD" : "GENRE"}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            A room built around this feeling
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadGenreTracksRef.current(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading && !cloudTracks.length ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Opening the {title} room...</Text>
        </View>
      ) : (
        <FlatList
          data={cloudTracks}
          keyExtractor={trackKeyExtractor}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={listPerformance.initialNumToRender}
          maxToRenderPerBatch={listPerformance.maxToRenderPerBatch}
          windowSize={listPerformance.windowSize}
          updateCellsBatchingPeriod={listPerformance.updateCellsBatchingPeriod}
          getItemLayout={cloudTracks.length > 0 ? trackListLayout : undefined}
          removeClippedSubviews
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          onEndReached={loadMoreTracks}
          onEndReachedThreshold={0.45}
          ListHeaderComponent={
            <>
              <View style={styles.radioCard}>
                <View style={styles.radioIcon}>
                  <Ionicons name="radio" size={28} color={COLORS.primary} />
                </View>

                <View style={styles.radioInfo}>
                  <Text style={styles.radioTitle}>{title} Listening Room</Text>
                  <Text style={styles.radioSubtitle} numberOfLines={1}>
                    Keep the {title} feeling moving
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.radioButton}
                  onPress={openRadio}
                >
                  <Ionicons name="play" size={17} color="#000" />
                  <Text style={styles.radioButtonText}>Start</Text>
                </TouchableOpacity>
              </View>

              {albums.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Releases In This Mood</Text>
                    <Text style={styles.sectionSub}>
                      Albums and projects connected to this vibe
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumRow}
                  >
                    {albums.map((album) => (
                      <TouchableOpacity
                        key={album.id}
                        activeOpacity={0.86}
                        style={styles.albumCard}
                        onPress={() => openAlbum(album)}
                      >
                        <HTImage
                          source={album.thumbnail}
                          candidates={album.songs}
                          style={styles.albumCover}
                        />

                        <Text style={styles.albumTitle} numberOfLines={2}>
                          {album.album}
                        </Text>

                        <Text style={styles.albumArtist} numberOfLines={1}>
                          {album.artist}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Songs In This Room</Text>
                <Text style={styles.sectionSub}>
                  {cloudTracks.length > 0
                    ? `${cloudTracks.length} tracks carrying the ${title} feeling`
                    : `Tracks carrying the ${title} feeling`}
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            emptyState.showEmpty ? (
              <View style={styles.empty}>
                <Ionicons
                  name="musical-notes-outline"
                  size={58}
                  color={COLORS.textMuted}
                />
                <Text style={styles.emptyTitle}>This room is still warming up</Text>
                <Text style={styles.emptyText}>
                  Pull refresh or try another mood — matching songs may still be loading in the background.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Loading more tracks...</Text>
              </View>
            ) : null
          }
          renderItem={renderGenreTrackItem}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
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
    marginTop: 2,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 18,
  },
  radioIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,0,51,0.12)",
  },
  radioInfo: { flex: 1 },
  radioTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  radioSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  radioButtonText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 12,
  },
  albumSection: { marginBottom: 10 },
  sectionHeader: { marginBottom: 12, marginTop: 4 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  albumRow: { gap: 12, paddingBottom: 8 },
  albumCard: {
    width: 132,
  },
  albumCover: {
    width: 132,
    height: 132,
    borderRadius: 18,
    marginBottom: 8,
  },
  albumTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  albumArtist: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  loadMoreFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  loadMoreText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});
