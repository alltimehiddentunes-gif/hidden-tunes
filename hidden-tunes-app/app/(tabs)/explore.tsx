import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused, useScrollToTop } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import HTImage from "../../components/HTImage";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";

import {
  getTrendingYouTubeBackend,
  type BackendYouTubeTrack,
} from "../../services/youtubeBackend";

import {
  getHiddenTunesAlbums,
  getHiddenTunesArtists,
  getHiddenTunesCloudPlaylists,
  getHiddenTunesSongsPage,
  getHiddenTunesAlbumById,
  getHiddenTunesArtistById,
  getHiddenTunesCatalogSnapshot,
  hydrateHiddenTunesCatalogCache,
  refreshHiddenTunesSongs,
  extractHiddenTunesAlbums,
  extractHiddenTunesArtists,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesCloudPlaylist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { preloadImages } from "../../utils/imagePreloader";
import {
  buildListenerPreferenceMaps,
  rankAlbumsForListener,
  rankArtistsForListener,
  rankSongsForListener,
} from "../../services/listenerRanking";
import {
  buildBecauseYouListened,
  buildGenreSpotlights,
  buildMoodRooms,
} from "../../services/smartDiscovery";
import {
  logApiRefresh,
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  logTapToPlay,
  startPerformanceTimer,
} from "../../utils/performanceLogs";
import {
  markFirstApiRefreshComplete,
  markFirstCachedContentVisible,
} from "../../utils/startupDiagnostics";
import { scheduleStartupTask } from "../../utils/startupScheduler";
import {
  getHorizontalListPerformanceSettings,
  getListPerformanceSettings,
  markFastScrolling,
  scheduleNavigationPrewarm,
} from "../../utils/performanceMode";
import { trackRenderProbe } from "../../utils/renderDiagnostics";
import {
  openGenreCatalog,
  openMoodCatalog,
} from "../../utils/catalogNavigation";

const GENRE_PREVIEW_MS = 6800;

type GenreItem = {
  id: string;
  title: string;
  query?: string;
  emoji?: string;
};

const CARD_WIDTH = 150;
const CARD_GAP = 14;
const ARTIST_CARD_WIDTH = 142;
const EXPLORE_SKELETON_KEYS = ["one", "two", "three"];

function getSafeVideoId(track: BackendYouTubeTrack) {
  return String(track.videoId || track.id || "").replace("youtube-", "").trim();
}

function getSongArtwork(song: any) {
  return getArtworkUri(song, FALLBACK_ARTWORK);
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getSongArtwork(song);
  const streamUrl = String(
    song?.streamUrl ||
      song?.url ||
      song?.audioUrl ||
      song?.audio_url ||
      song?.previewUrl ||
      ""
  );

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || song?.user?.name || "Hidden Tunes"),
    album: song?.album || "Singles",
    artwork,
    cover: artwork,
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

const CloudSongCard = memo(function CloudSongCard({
  song,
  badge,
  onPress,
}: {
  song: HiddenTunesNormalizedSong;
  badge: "PLAY" | "RECENT" | "SMART";
  onPress: (song: HiddenTunesNormalizedSong, badge: "PLAY" | "RECENT" | "SMART") => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.cloudCard}
      onPress={() => onPress(song, badge)}
    >
      <HTImage source={song} style={styles.cloudCover} />

      <Text numberOfLines={1} style={styles.cloudTitle}>
        {song.title}
      </Text>

      <Text numberOfLines={1} style={styles.cloudArtist}>
        {song.artist}
      </Text>

      <View style={badge === "SMART" ? styles.smartBadge : styles.cloudBadge}>
        <Ionicons
          name={
            badge === "SMART"
              ? "sparkles"
              : badge === "RECENT"
              ? "time"
              : "cloud-done"
          }
          size={12}
          color="#000"
        />
        <Text style={styles.cloudBadgeText}>{badge}</Text>
      </View>

      {badge !== "SMART" && (
        <View style={styles.addButtonWrap}>
          <AddToPlaylistButton track={song as any} />
        </View>
      )}
    </TouchableOpacity>
  );
});

const YouTubeTrackCard = memo(function YouTubeTrackCard({
  item,
  index,
  onPress,
}: {
  item: BackendYouTubeTrack;
  index: number;
  onPress: (track: BackendYouTubeTrack) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.trackCard}
      onPress={() => onPress(item)}
    >
      <Text style={styles.rank}>{String(index + 2).padStart(2, "0")}</Text>

      <HTImage source={item} style={styles.cover} />

      <View style={styles.info}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.title}
        </Text>

        <Text style={styles.artist} numberOfLines={1}>
          {item.artist || item.channelTitle || "YouTube"}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="tv" size={13} color="#ff3b30" />
          <Text style={styles.metaText}>Hidden Tunes TV</Text>
        </View>
      </View>

      <View style={styles.playCircle}>
        <Ionicons name="play" size={16} color={COLORS.text} />
      </View>
    </TouchableOpacity>
  );
});

function ExploreSkeletonRail() {
  return (
    <View style={styles.skeletonPanel}>
      <View style={styles.skeletonTitleRow}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparing discovery...</Text>
      </View>

      <View style={styles.skeletonRail}>
        {EXPLORE_SKELETON_KEYS.map((item) => (
          <View key={`explore-skeleton-${item}`} style={styles.skeletonCard}>
            <View style={styles.skeletonArtwork} />
            <View style={styles.skeletonLineLarge} />
            <View style={styles.skeletonLineSmall} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const { playSong, toggleSmartAutoplay } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites, smartAutoplayEnabled } = usePlayerState();
  const isFocused = useIsFocused();

  const listRef = useRef<FlatList<BackendYouTubeTrack>>(null);
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const initialExploreLoadRef = useRef(false);

  const [tracks, setTracks] = useState<BackendYouTubeTrack[]>([]);
  const [cloudSongs, setCloudSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [albums, setAlbums] = useState<HiddenTunesAlbum[]>([]);
  const [artists, setArtists] = useState<HiddenTunesArtist[]>([]);
  const [playlists, setPlaylists] = useState<HiddenTunesCloudPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedDiscoveryFallbacks, setHasCheckedDiscoveryFallbacks] =
    useState(false);
  const [showHeavySections, setShowHeavySections] = useState(false);
  const [showTvSection, setShowTvSection] = useState(false);
  const [loadingTvSection, setLoadingTvSection] = useState(false);
  const [genrePreviewIndex, setGenrePreviewIndex] = useState(0);
  const [songPage, setSongPage] = useState(1);
  const [hasMoreSongs, setHasMoreSongs] = useState(true);
  const [loadingMoreSongs, setLoadingMoreSongs] = useState(false);

  useScrollToTop(listRef);
  useEffect(() => trackRenderProbe("ExploreScreen"), []);

  const listPerformance = useMemo(
    () => getListPerformanceSettings(Math.max(cloudSongs.length, tracks.length)),
    [cloudSongs.length, tracks.length]
  );
  const horizontalRailTuning = useMemo(
    () =>
      getHorizontalListPerformanceSettings(
        Math.max(albums.length, artists.length, playlists.length)
      ),
    [albums.length, artists.length, playlists.length]
  );

  const loadCatalogSecondarySections = useCallback(async (forceRefresh = false) => {
    try {
      const [albumResults, artistResults, playlistResults] = await Promise.allSettled([
        getHiddenTunesAlbums({ forceRefresh }),
        getHiddenTunesArtists({ forceRefresh }),
        getHiddenTunesCloudPlaylists(),
      ]);

      setAlbums(
        albumResults.status === "fulfilled" && Array.isArray(albumResults.value)
          ? albumResults.value
          : []
      );

      setArtists(
        artistResults.status === "fulfilled" && Array.isArray(artistResults.value)
          ? artistResults.value
          : []
      );

      setPlaylists(
        playlistResults.status === "fulfilled" && Array.isArray(playlistResults.value)
          ? playlistResults.value.slice(0, 8)
          : []
      );
    } catch (error) {
    } finally {
      setShowHeavySections(true);
    }
  }, []);

  const loadTvSection = useCallback(async () => {
    try {
      setLoadingTvSection(true);
      const youtubeResults = await getTrendingYouTubeBackend();

      setTracks(
        Array.isArray(youtubeResults) ? youtubeResults.slice(0, 10) : []
      );
    } catch (error) {
      setTracks([]);
    } finally {
      setLoadingTvSection(false);
      setShowTvSection(true);
    }
  }, []);

  const scheduleTvSectionLoad = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      void loadTvSection();
    });
  }, [loadTvSection]);

  const applyExploreSongs = useCallback((nextSongs: HiddenTunesNormalizedSong[]) => {
    setCloudSongs(nextSongs);
    setSongPage(1);
    setHasMoreSongs(nextSongs.length >= 24);
    setAlbums(extractHiddenTunesAlbums(nextSongs));
    setArtists(extractHiddenTunesArtists(nextSongs));

    scheduleStartupTask("background", "explore_primary_artwork_prefetch", () =>
      preloadImages(
        nextSongs
          .slice(0, 2)
          .flatMap((song) => [song.artwork, song.cover, song.thumbnail])
      )
    );
  }, []);

  const loadExplore = useCallback(
    async (showLoader = true, forceRefresh = false) => {
      try {
        let showedCachedCatalog = cloudSongs.length > 0;
        setHasCheckedDiscoveryFallbacks(false);

        if (!forceRefresh) {
          const memorySnapshot = getHiddenTunesCatalogSnapshot();
          if (memorySnapshot.length) {
            applyExploreSongs(
              dedupeSongs(memorySnapshot.slice(0, 24).map(safeSong))
            );
            setLoading(false);
            setRefreshing(false);
            showedCachedCatalog = true;
            markFirstCachedContentVisible("explore");
            logCacheResult("explore", true, {
              count: memorySnapshot.length,
              source: "memory",
            });
          }

          const cached = await hydrateHiddenTunesCatalogCache();

          if (cached.length) {
            applyExploreSongs(dedupeSongs(cached.slice(0, 24).map(safeSong)));
            setLoading(false);
            setRefreshing(false);
            showedCachedCatalog = true;
            markFirstCachedContentVisible("explore");
            logCacheResult("explore", true, { count: cached.length });
            logScreenReady("explore", screenStartedAt, {
              cache: "hit",
              count: cached.length,
            });
            logPerformanceSummary("explore", {
              cache: "hit",
              firstContentMs: Date.now() - screenStartedAt,
              itemCount: cached.length,
            });
          } else if (showLoader && !showedCachedCatalog) {
            setLoading(true);
            logCacheResult("explore", false);
          }
        } else if (showLoader) {
          setLoading(true);
        }

        const refreshExploreFromApi = async () => {
          const refreshStart = startPerformanceTimer();
          const songResults = forceRefresh
            ? await refreshHiddenTunesSongs()
            : (await getHiddenTunesSongsPage({ page: 1, limit: 24 })).songs;

          const nextSongs = Array.isArray(songResults)
            ? dedupeSongs(songResults.map(safeSong))
            : [];

          applyExploreSongs(nextSongs);
          const refreshMs = Date.now() - refreshStart;

          logApiRefresh("explore", refreshStart, {
            count: nextSongs.length,
            forceRefresh,
          });
          markFirstApiRefreshComplete("explore", refreshMs);
          logPerformanceSummary("explore", {
            cache: showedCachedCatalog ? "hit" : "miss",
            apiRefreshMs: refreshMs,
            itemCount: nextSongs.length,
            emptyStateReason: nextSongs.length
              ? "content_available"
              : "cache_api_and_fallback_empty",
          });

          if (!showedCachedCatalog) {
            logScreenReady("explore", screenStartedAt, {
              cache: "miss",
              count: nextSongs.length,
            });
          }

          setLoading(false);
          setRefreshing(false);

          InteractionManager.runAfterInteractions(() => {
            void loadCatalogSecondarySections(forceRefresh);
          });
          scheduleTvSectionLoad();
        };

        if (forceRefresh || !showedCachedCatalog) {
          await refreshExploreFromApi();
        } else {
          scheduleStartupTask(
            "afterInteraction",
            "explore_catalog_api_refresh",
            refreshExploreFromApi
          );
        }
      } catch {
        setLoading(false);
        setRefreshing(false);
        setHasCheckedDiscoveryFallbacks(true);
      } finally {
        setHasCheckedDiscoveryFallbacks(true);
      }
    },
    [
      applyExploreSongs,
      cloudSongs.length,
      loadCatalogSecondarySections,
      scheduleTvSectionLoad,
      screenStartedAt,
    ]
  );

  useEffect(() => {
    if (!isFocused) return;
    if (initialExploreLoadRef.current) return;

    initialExploreLoadRef.current = true;
    loadExplore(true, false);
  }, [isFocused, loadExplore]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setShowHeavySections(false);
    setShowTvSection(false);
    setTracks([]);
    await loadExplore(false, true);
  }, [loadExplore]);

  const loadMoreSongs = useCallback(async () => {
    if (loadingMoreSongs || !hasMoreSongs) return;

    try {
      setLoadingMoreSongs(true);

      const nextPage = songPage + 1;
      const page = await getHiddenTunesSongsPage({
        page: nextPage,
        limit: 30,
      });
      const nextSongs = dedupeSongs([
        ...cloudSongs,
        ...(page.songs || []).map(safeSong),
      ]);

      setCloudSongs(nextSongs);
      setSongPage(nextPage);
      setHasMoreSongs(page.hasMore);
      setAlbums(extractHiddenTunesAlbums(nextSongs));
      setArtists((current) => {
        const derived = extractHiddenTunesArtists(nextSongs);
        const seen = new Set<string>();
        return [...current, ...derived].filter((artist) => {
          const key = String(artist.id || artist.slug || artist.name).toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
    } catch (error) {
    } finally {
      setLoadingMoreSongs(false);
    }
  }, [cloudSongs, hasMoreSongs, loadingMoreSongs, songPage]);

  const featured = tracks[0];

  const listTracks = useMemo(() => tracks.slice(1, 7), [tracks]);

  const preferenceMaps = useMemo(
    () =>
      buildListenerPreferenceMaps(
        Array.isArray(recentlyPlayed) ? (recentlyPlayed as any) : [],
        Array.isArray(favorites) ? (favorites as any) : []
      ),
    [favorites, recentlyPlayed]
  );

  const rankedCloudSongs = useMemo(
    () => rankSongsForListener(cloudSongs, preferenceMaps),
    [cloudSongs, preferenceMaps]
  );

  const visibleCloudSongs = useMemo(() => rankedCloudSongs, [rankedCloudSongs]);

  const rankedAlbums = useMemo(
    () => rankAlbumsForListener(albums, preferenceMaps),
    [albums, preferenceMaps]
  );

  const rankedArtists = useMemo(
    () => rankArtistsForListener(artists, preferenceMaps),
    [artists, preferenceMaps]
  );

  const continueSongs = useMemo(() => {
    const mappedRecent = Array.isArray(recentlyPlayed)
      ? recentlyPlayed.map(safeSong)
      : [];

    return dedupeSongs([...mappedRecent, ...cloudSongs]).slice(0, 10);
  }, [recentlyPlayed, cloudSongs]);

  const smartPicks = useMemo(() => {
    if (!rankedCloudSongs.length) return [];

    return buildBecauseYouListened(
      rankedCloudSongs,
      Array.isArray(recentlyPlayed) ? recentlyPlayed : [],
      Array.isArray(favorites) ? favorites : [],
      10
    );
  }, [favorites, rankedCloudSongs, recentlyPlayed]);

  const moodRooms = useMemo(
    () => buildMoodRooms(cloudSongs, preferenceMaps, 6),
    [cloudSongs, preferenceMaps]
  );

  const genreWorlds = useMemo(
    () => buildGenreSpotlights(cloudSongs, preferenceMaps, 6),
    [cloudSongs, preferenceMaps]
  );

  const primaryMoodRoom = moodRooms[0];
  const primaryGenreWorld = genreWorlds[0];

  useEffect(() => {
    if (!cloudSongs.length && !albums.length && !artists.length) return;

    void preloadImages([
      ...continueSongs.slice(0, 4).flatMap((song) => [song.artwork, song.cover]),
      ...visibleCloudSongs
        .slice(0, 4)
        .flatMap((song) => [song.artwork, song.cover]),
      ...rankedAlbums.slice(0, 4).map((album) => album.artwork),
      ...rankedArtists.slice(0, 4).map((artist) => artist.artwork),
      ...genreWorlds
        .slice(0, 2)
        .flatMap((spotlight) =>
          spotlight.songs.slice(0, 2).flatMap((song) => [song.artwork, song.cover])
        ),
    ]);
  }, [
    albums.length,
    artists.length,
    cloudSongs.length,
    continueSongs,
    genreWorlds,
    rankedAlbums,
    rankedArtists,
    visibleCloudSongs,
  ]);

  useEffect(() => {
    if (!cloudSongs.length && !rankedAlbums.length && !rankedArtists.length) {
      return undefined;
    }

    return scheduleNavigationPrewarm([
      ...rankedArtists.slice(0, 2).map((artist) => () => {
        void getHiddenTunesArtistById(artist.id);
      }),
      ...rankedAlbums.slice(0, 2).map((album) => () => {
        void getHiddenTunesAlbumById(album.id);
      }),
    ]);
  }, [cloudSongs.length, rankedAlbums, rankedArtists]);

  useFocusEffect(
    useCallback(() => {
      if (genreWorlds.length === 0) return undefined;

      const timer = setInterval(() => {
        setGenrePreviewIndex((current) => current + 1);
      }, GENRE_PREVIEW_MS);

      return () => {
        clearInterval(timer);
      };
    }, [genreWorlds.length])
  );

  const openGenre = useCallback((genre: GenreItem) => {
    const title = String(genre.title || "").trim();

    if (!title) return;

    openGenreCatalog({
      id: genre.id || title,
      title,
      query: genre.query || title,
    });
  }, []);

  const openMood = useCallback((mood: string) => {
    openMoodCatalog(mood);
  }, []);

  const openYouTubeTrack = useCallback((track: BackendYouTubeTrack) => {
    const videoId = getSafeVideoId(track);
    if (!videoId) return;

    router.push({
      pathname: "/youtube-player",
      params: {
        id: videoId,
        videoId,
        title: track.title,
        artist: track.artist,
        channelTitle: track.channelTitle,
        thumbnail: track.thumbnail,
      },
    } as any);
  }, []);

  const openCloudSong = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const tapStartedAt = startPerformanceTimer();
        const normalized = safeSong(song);
        const baseQueue = dedupeSongs(cloudSongs.map(safeSong));
        const queueHasSong = baseQueue.some((item) => item.id === normalized.id);
        const queue = queueHasSong
          ? baseQueue
          : dedupeSongs([normalized, ...baseQueue]);

        const startIndex = Math.max(
          0,
          queue.findIndex((item) => item.id === normalized.id)
        );

        await playSong(normalized as any, queue as any, startIndex);
        logTapToPlay("explore", tapStartedAt, { id: normalized.id });
        router.push("/player" as any);
      } catch (error) {
      }
    },
    [cloudSongs, playSong]
  );

  const openSmartPick = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const tapStartedAt = startPerformanceTimer();
        const smartQueue = dedupeSongs(
          (smartPicks.length > 0 ? smartPicks : cloudSongs).map(safeSong)
        );

        const normalized = safeSong(song);

        const startIndex = Math.max(
          0,
          smartQueue.findIndex((item) => item.id === normalized.id)
        );

        await playSong(normalized as any, smartQueue as any, startIndex);
        logTapToPlay("explore", tapStartedAt, { id: normalized.id, smart: true });
        router.push("/player" as any);
      } catch (error) {
      }
    },
    [cloudSongs, playSong, smartPicks]
  );

  const resumeCurrentSong = useCallback(async () => {
    if (!currentSong) return;

    try {
      const tapStartedAt = startPerformanceTimer();
      const normalized = safeSong(currentSong);
      const queue = dedupeSongs(cloudSongs.map(safeSong));

      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.id === normalized.id)
      );

      await playSong(normalized as any, queue as any, startIndex);
      logTapToPlay("explore", tapStartedAt, { id: normalized.id, resume: true });
      router.push("/player" as any);
    } catch (error) {
      router.push("/player" as any);
    }
  }, [cloudSongs, currentSong, playSong]);

  const handleCloudCardPress = useCallback(
    (song: HiddenTunesNormalizedSong, badge: "PLAY" | "RECENT" | "SMART") => {
      if (badge === "SMART") {
        openSmartPick(song);
      } else {
        openCloudSong(song);
      }
    },
    [openCloudSong, openSmartPick]
  );

  const renderSmartPick = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="SMART" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderRecentSong = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="RECENT" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderCloudSong = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="PLAY" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderYouTubeTrack = useCallback(
    ({ item, index }: { item: BackendYouTubeTrack; index: number }) => (
      <YouTubeTrackCard item={item} index={index} onPress={openYouTubeTrack} />
    ),
    [openYouTubeTrack]
  );

  const getCloudItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_WIDTH + CARD_GAP,
      offset: (CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    []
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        ref={listRef}
        data={showTvSection ? listTracks : []}
        keyExtractor={(item, index) => `${item.videoId || item.id || "track"}-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            tintColor={COLORS.primary}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        removeClippedSubviews
        initialNumToRender={listPerformance.initialNumToRender}
        maxToRenderPerBatch={listPerformance.maxToRenderPerBatch}
        windowSize={listPerformance.windowSize}
        updateCellsBatchingPeriod={listPerformance.updateCellsBatchingPeriod}
        onScrollBeginDrag={() => markFastScrolling(true)}
        onMomentumScrollBegin={() => markFastScrolling(true)}
        onMomentumScrollEnd={() => markFastScrolling(false)}
        onEndReached={loadMoreSongs}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.kicker}>EXPLORE</Text>
                <Text style={styles.heading}>Hidden Tunes</Text>
              </View>

              <TouchableOpacity
                style={styles.refreshButton}
                onPress={onRefresh}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.smartHero}>
              <View style={styles.smartHeroGlow} />

              <View style={styles.smartHeroTop}>
                <View style={styles.smartHeroIcon}>
                  <Ionicons name="infinite" size={26} color={COLORS.primary} />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.smartHeroToggle,
                    smartAutoplayEnabled && styles.smartHeroToggleActive,
                  ]}
                  onPress={toggleSmartAutoplay}
                >
                  <Text
                    style={[
                      styles.smartHeroToggleText,
                      smartAutoplayEnabled && styles.smartHeroToggleTextActive,
                    ]}
                  >
                    Smart {smartAutoplayEnabled ? "On" : "Off"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.smartHeroTitle}>Enter a listening room</Text>

              <Text style={styles.smartHeroSubtitle}>
                Personal picks, exact genre spotlights, and mood rooms built from the catalog you already have.
              </Text>

              <View style={styles.smartHeroActions}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[
                    styles.smartHeroPrimary,
                    !cloudSongs.length && styles.disabledButton,
                  ]}
                  onPress={() => {
                    const first = smartPicks[0] || cloudSongs[0];
                    if (first) openSmartPick(first);
                  }}
                  disabled={!cloudSongs.length}
                >
                  <Ionicons name="play" size={17} color="#000" />
                  <Text style={styles.smartHeroPrimaryText}>Start Discovery</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.smartHeroSecondary}
                  onPress={() => router.push("/playlists" as any)}
                >
                  <Ionicons name="albums" size={18} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>

            {currentSong && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Continue Listening</Text>
                    <Text style={styles.sectionSub}>
                      Jump back into your current stream
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/player" as any)}>
                    <Text style={styles.seeAll}>Player</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.continueCard}
                  onPress={resumeCurrentSong}
                >
                  <HTImage source={currentSong} style={styles.continueImage} />

                  <View style={styles.continueInfo}>
                    <Text style={styles.continueKicker}>NOW PLAYING</Text>

                    <Text numberOfLines={1} style={styles.continueTitle}>
                      {currentSong.title || "Unknown Song"}
                    </Text>

                    <Text numberOfLines={1} style={styles.continueArtist}>
                      {currentSong.artist ||
                        currentSong.user?.name ||
                        currentSong.channelTitle ||
                        "Hidden Tunes"}
                    </Text>
                  </View>

                  <View style={styles.continuePlay}>
                    <Ionicons name="play" size={18} color="#000" />
                  </View>
                </TouchableOpacity>
              </>
            )}

            {moodRooms.length > 0 && (
              <View style={styles.moodRailSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Mood Rooms</Text>
                  <Text style={styles.sectionSub}>
                    {primaryMoodRoom
                      ? `Start with ${primaryMoodRoom.title} or choose a nearby feeling`
                      : "Choose a feeling from existing mood labels"}
                  </Text>
                </View>

                <FlatList
                  horizontal
                  data={moodRooms}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        item.id === primaryMoodRoom?.id && styles.chipFeatured,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => openMood(item.title)}
                    >
                      <Text style={styles.chipText}>{item.title}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {loading ? (
              <ExploreSkeletonRail />
            ) : null}

            {!loading && cloudSongs.length > 0 && (
              <View style={styles.catalogStats}>
                <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
                <Text style={styles.catalogStatsText}>
                  {cloudSongs.length} songs ready
                </Text>
              </View>
            )}

            {smartPicks.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                  <Text style={styles.sectionTitle}>Because You Listened</Text>
                    <Text style={styles.sectionSub}>
                      Songs connected to your recent plays and saved favorites
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/queue" as any)}>
                    <Text style={styles.seeAll}>Queue</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={smartPicks}
                  keyExtractor={(item) => `smart-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderSmartPick}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                />
              </>
            )}

            {continueSongs.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Return To The Feeling</Text>
                    <Text style={styles.sectionSub}>
                      Your latest songs, ready to continue
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/recently-played" as any)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={continueSongs}
                  keyExtractor={(item) => `recent-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderRecentSong}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                />
              </>
            )}

            {visibleCloudSongs.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Fresh From The Vault</Text>
                  <Text style={styles.sectionSub}>New uploads with room to grow</Text>
                </View>

                <FlatList
                  horizontal
                  data={visibleCloudSongs}
                  keyExtractor={(item) => `cloud-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderCloudSong}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                />
              </>
            )}

            <View style={styles.genreHeader}>
              <Text style={styles.sectionTitle}>Original Genre Spotlights</Text>
              <Text style={styles.sectionSub}>
                {primaryGenreWorld
                  ? `${primaryGenreWorld.title} and nearby catalog lanes, shown without renaming genres`
                  : "Built only from original catalog genre labels"}
              </Text>
            </View>

            <View style={styles.genreGrid}>
              {genreWorlds.map((genre, index) => {
                const preview =
                  genre.preview[genrePreviewIndex % genre.preview.length] ||
                  `${genre.title} discoveries`;
                const primaryArtwork = genre.artwork[0] || FALLBACK_ARTWORK;
                const secondaryArtwork = genre.artwork[1] || primaryArtwork;
                const tertiaryArtwork = genre.artwork[2] || secondaryArtwork;

                return (
                <TouchableOpacity
                  key={genre.id}
                  activeOpacity={0.86}
                  style={[
                    styles.genreWorldCard,
                    index % 2 === 1 && styles.genreWorldCardAlt,
                  ]}
                  onPress={() =>
                    openGenre({
                      id: genre.title,
                      title: genre.title,
                      query: genre.title,
                    })
                  }
                >
                  <View style={styles.genreWorldGlow} />
                  <View style={styles.genreAccentLine} />

                  <View style={styles.genreArtworkStack}>
                    <HTImage
                      uri={tertiaryArtwork}
                      style={[styles.genreArtwork, styles.genreArtworkBack]}
                    />
                    <HTImage
                      uri={secondaryArtwork}
                      style={[styles.genreArtwork, styles.genreArtworkMid]}
                    />
                    <HTImage uri={primaryArtwork} style={styles.genreArtwork} />
                  </View>

                  <View style={styles.genreWorldTop}>
                    <View style={styles.genreIndexBadge}>
                      <Text style={styles.genreIndexText}>
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    <View style={styles.genreVibePill}>
                      <Text numberOfLines={1} style={styles.genreVibeText}>
                        {genre.songs.length} songs
                      </Text>
                    </View>
                  </View>

                  <View style={styles.genreWorldContent}>
                    <Text numberOfLines={1} style={styles.genreTitle}>
                      {genre.title}
                    </Text>

                    <Text numberOfLines={1} style={styles.genrePreview}>
                      {preview}
                    </Text>
                  </View>

                  <View style={styles.genreCtaRow}>
                    <Text style={styles.genreCtaText}>Explore genre</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
                );
              })}
            </View>

            {showHeavySections && playlists.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Listening Rooms</Text>
                    <Text style={styles.sectionSub}>Playlists shaped around your taste</Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/cloud-playlists" as any)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={playlists}
                  keyExtractor={(item: any) => `playlist-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.cloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/cloud-playlist/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage source={item} style={styles.cloudCover} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.title || item.name || "Playlist"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {Array.isArray(item.tracks)
                          ? `${item.tracks.length} tracks`
                          : "Playlist"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showHeavySections && albums.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Deep Cuts & Albums</Text>
                  <Text style={styles.sectionSub}>Releases worth hearing beyond one track</Text>
                </View>

                <FlatList
                  horizontal
                  data={rankedAlbums}
                  keyExtractor={(item: any) => `album-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.cloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/album/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage source={item} style={styles.cloudCover} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.title || item.name || "Album"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {item.artist || "Hidden Tunes"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showHeavySections && artists.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Creators To Follow</Text>
                  <Text style={styles.sectionSub}>Voices building the Hidden Tunes catalog</Text>
                </View>

                <FlatList
                  horizontal
                  data={rankedArtists}
                  keyExtractor={(item: any) => `artist-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={horizontalRailTuning.initialNumToRender}
                  maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
                  windowSize={horizontalRailTuning.windowSize}
                  updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                  getItemLayout={(_, index) => ({
                    length: ARTIST_CARD_WIDTH + CARD_GAP,
                    offset: (ARTIST_CARD_WIDTH + CARD_GAP) * index,
                    index,
                  })}
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.artistCloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/artist/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage source={item} style={styles.artistCloudImage} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.name || "Artist"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {Array.isArray(item.tracks)
                          ? `${item.tracks.length} songs`
                          : item.genre || "Hidden Tunes"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showTvSection && !loading && featured ? (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => openYouTubeTrack(featured)}
                style={styles.heroWrap}
              >
                <HTImage source={featured} style={styles.heroImage} />

                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.92)"]}
                  style={styles.heroOverlay}
                />

                <View style={styles.heroBadge}>
                  <Ionicons name="flame" size={14} color="#ffcc66" />
                  <Text style={styles.heroBadgeText}>Hidden Tunes TV</Text>
                </View>

                <View style={styles.heroContent}>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {featured.title}
                  </Text>

                  <Text style={styles.heroArtist} numberOfLines={1}>
                    {featured.artist || featured.channelTitle || "YouTube"}
                  </Text>

                  <View style={styles.heroAction}>
                    <Ionicons name="play" size={18} color="#000" />
                    <Text style={styles.heroActionText}>Play</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}

            {!loading &&
            hasCheckedDiscoveryFallbacks &&
            !featured &&
            !cloudSongs.length ? (
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={58} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>Discovery is warming up</Text>
                <Text style={styles.emptyText}>Pull down to refresh the catalog.</Text>
              </View>
            ) : null}

            {loadingTvSection && !showTvSection ? (
              <View style={styles.tvLoadingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading Hidden Tunes TV...</Text>
              </View>
            ) : null}

            {showTvSection && !loading && tracks.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Visual Discovery</Text>
                <Text style={styles.sectionSub}>Hidden Tunes TV picks inside the app</Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          loadingMoreSongs ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadMoreText}>Loading more...</Text>
            </View>
          ) : hasMoreSongs ? (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.loadMoreButton}
              onPress={loadMoreSongs}
            >
              <Ionicons name="albums-outline" size={17} color="#000" />
              <Text style={styles.loadMoreButtonText}>Find more</Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={renderYouTubeTrack}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingTop: 68,
    paddingHorizontal: 20,
    paddingBottom: 165,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heading: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
  },
  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border || "rgba(255,255,255,0.12)",
  },
  smartHero: {
    marginTop: 24,
    borderRadius: 34,
    padding: 22,
    minHeight: 230,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  smartHeroGlow: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  smartHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smartHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  smartHeroToggle: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  smartHeroToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  smartHeroToggleText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  smartHeroToggleTextActive: {
    color: "#000",
  },
  smartHeroTitle: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 20,
    letterSpacing: -0.7,
  },
  smartHeroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  smartHeroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  smartHeroPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  disabledButton: {
    opacity: 0.45,
  },
  smartHeroPrimaryText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
  },
  smartHeroSecondary: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    gap: 10,
    paddingTop: 2,
    paddingBottom: 24,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipFeatured: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(168,85,247,0.34)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  moodRailSection: {
    marginTop: 22,
  },
  catalogStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  catalogStatsText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  rowHeader: {
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  seeAll: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 24,
  },
  continueImage: {
    width: 78,
    height: 78,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  continueInfo: {
    flex: 1,
    marginLeft: 14,
  },
  continueKicker: {
    color: COLORS.primary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "900",
    marginBottom: 6,
  },
  continueTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  continueArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  continuePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudRow: {
    gap: CARD_GAP,
    paddingBottom: 28,
    paddingRight: 20,
  },
  cloudCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  artistCloudCard: {
    width: ARTIST_CARD_WIDTH,
    alignItems: "center",
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cloudCover: {
    width: "100%",
    height: 126,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  artistCloudImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  cloudTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  cloudArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  cloudBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  cloudBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    marginLeft: 4,
  },
  smartBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addButtonWrap: {
    position: "absolute",
    top: 14,
    right: 14,
  },
  genreHeader: {
    marginTop: 4,
    marginBottom: 14,
  },
  genreGrid: {
    gap: 14,
    marginBottom: 28,
  },
  genreWorldCard: {
    width: "100%",
    minHeight: 184,
    borderRadius: 32,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.058)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "space-between",
    overflow: "hidden",
    shadowColor: "#A855F7",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
  genreWorldCardAlt: {
    borderColor: "rgba(34,211,238,0.13)",
  },
  genreWorldGlow: {
    position: "absolute",
    right: -74,
    top: -76,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  genreAccentLine: {
    position: "absolute",
    left: 0,
    top: 24,
    bottom: 24,
    width: 2,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.72,
  },
  genreWorldTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  genreArtworkStack: {
    position: "absolute",
    right: 18,
    top: 34,
    width: 126,
    height: 116,
  },
  genreArtwork: {
    position: "absolute",
    right: 0,
    top: 8,
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  genreArtworkMid: {
    right: 20,
    top: 4,
    opacity: 0.62,
    transform: [{ rotate: "-7deg" }],
  },
  genreArtworkBack: {
    right: 40,
    top: 0,
    opacity: 0.28,
    transform: [{ rotate: "-13deg" }],
  },
  genreIndexBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  genreIndexText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  genreVibePill: {
    maxWidth: 150,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  genreVibeText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  genreWorldContent: {
    marginTop: 40,
    paddingRight: 118,
    zIndex: 2,
  },
  genreTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  genrePreview: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 8,
  },
  genreCtaRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 0,
    paddingVertical: 4,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
    zIndex: 2,
  },
  genreCtaText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },
  loader: {
    height: 190,
    justifyContent: "center",
    alignItems: "center",
  },

  skeletonPanel: {
    minHeight: 190,
    borderRadius: 28,
    padding: 16,
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  skeletonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  skeletonRail: {
    flexDirection: "row",
    gap: 12,
  },

  skeletonCard: {
    flex: 1,
    minHeight: 126,
    borderRadius: 20,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
  },

  skeletonArtwork: {
    height: 70,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },

  skeletonLineLarge: {
    width: "82%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 8,
  },

  skeletonLineSmall: {
    width: "58%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginLeft: 10,
    fontSize: 14,
  },
  tvLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    paddingVertical: 8,
  },
  heroWrap: {
    height: 320,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 30,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBadge: {
    position: "absolute",
    top: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 6,
  },
  heroContent: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 22,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginTop: 8,
  },
  heroAction: {
    marginTop: 18,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  heroActionText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 8,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 26,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  rank: {
    width: 30,
    color: "rgba(255,255,255,0.32)",
    fontSize: 15,
    fontWeight: "900",
  },
  cover: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  trackTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },
  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    height: 340,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 18,
  },
  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
  },
  loadMoreFooter: {
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  loadMoreText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  loadMoreButton: {
    alignSelf: "center",
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 22,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadMoreButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
