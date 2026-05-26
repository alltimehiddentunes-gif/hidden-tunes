import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  InteractionManager,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import {
  HomeCatalogSongRow,
  HomeFeaturedCard,
} from "../../components/catalog/HomePlaybackRows";
import { SubtleTvEntryLink } from "../../components/EmotionalDiscoveryChips";
import MoodRoomCard from "../../components/explore/MoodRoomCard";
import NeonEQ from "../../components/NeonEQ";
import HTImage from "../../components/HTImage";
import LiveWaveform from "../../components/LiveWaveform";

import { TESTER_COPY } from "../../constants/testerExperience";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";
import {
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesSongsPage,
  fetchCoordinatedCatalogFirstPage,
  hydrateHiddenTunesCatalogCache,
  refreshHiddenTunesSongs,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { preloadImages } from "../../utils/imagePreloader";
import { getSharedDiscoverySnapshot } from "../../services/discoveryCache";
import { buildMoreLikeThisMood, type DiscoverySong } from "../../services/smartDiscovery";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import {
  logApiRefresh,
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  logTapToPlay,
  startPerformanceTimer,
} from "../../utils/performanceLogs";
import {
  createScrollJankHandler,
  recordScreenOpen,
  useRenderCountProbe,
} from "../../utils/performanceVerification";
import {
  isWithinFirstInteractionWindow,
  logBackgroundWork,
  scheduleDelayedNonEssentialWork,
} from "../../utils/backgroundWork";
import {
  logAudioPreloadTargetSelected,
  pickHomeAudioPreloadTarget,
} from "../../utils/audioPreloadTargeting";
import { scheduleDebouncedAudioPreload } from "../../utils/audioPreloadScheduler";
import {
  getHorizontalListPerformanceSettings,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import {
  buildHomeFeedRows,
  type HomeFeedMountStage,
  type HomeFeedRow,
} from "../../utils/homeFeedRows";
import {
  openGenreCatalog,
  openMoodCatalog,
  scheduleGenreCatalogPrewarm,
} from "../../utils/catalogNavigation";
import {
  recordEmptyStatePrevented,
  recordOfflineCacheStartup,
  recordSnapshotFallbackUsage,
} from "../../utils/playbackStressDiagnostics";
import {
  markFirstApiRefreshComplete,
  markFirstCachedContentVisible,
} from "../../utils/startupDiagnostics";
import { scheduleStartupTask } from "../../utils/startupScheduler";
import {
  shouldReplaceCatalogResults,
  shouldResetCatalogFallbackGate,
  shouldShowCatalogEmpty,
  shouldShowCatalogLoadingShell,
} from "../../utils/catalogEmptyStateTiming";

const { width } = Dimensions.get("window");
const FEATURED_CARD_WIDTH = width * 0.72;
const HERO_CARD_WIDTH = width - 40;
const INITIAL_HOME_SONG_ROWS = 8;
const HOME_SONG_ROWS_INCREMENT = 12;
const HERO_AUTO_SLIDE_MS = 7000;
const HOME_SKELETON_KEYS = ["first", "second", "third"];

type HeroCard = {
  id?: string;
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

function getSongImage(song: any) {
  return getArtworkUri(song, FALLBACK_ARTWORK);
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getSongImage(song);
  const streamUrl = String(song?.streamUrl || song?.url || song?.audioUrl || "");

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || "Hidden Tunes"),
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

function HomeSkeletonCards() {
  return (
    <View style={styles.skeletonRow}>
      {HOME_SKELETON_KEYS.map((item) => (
        <View key={`home-skeleton-${item}`} style={styles.skeletonCard}>
          <View style={styles.skeletonArtwork} />
          <View style={styles.skeletonLineLarge} />
          <View style={styles.skeletonLineSmall} />
        </View>
      ))}
    </View>
  );
}

function buildInitialHomeSongs() {
  const snapshot = getHiddenTunesCatalogSnapshot();
  if (!snapshot.length) return [] as HiddenTunesNormalizedSong[];
  return dedupeSongs(snapshot.map(safeSong));
}

function HomeScreen() {
  const { playSong, preloadIdlePlayableTrack } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites } = usePlayerState();

  const initialFeaturedSongsRef = useRef(buildInitialHomeSongs());
  const isLoadingRef = useRef(false);
  const initialHomeLoadRef = useRef(false);
  const featuredSongsCountRef = useRef(initialFeaturedSongsRef.current.length);
  const loadFeaturedSongsRef = useRef<
    (showLoader?: boolean, forceRefresh?: boolean) => Promise<void>
  >(async () => {});
  const scrollRef = useRef<FlatList<HomeFeedRow>>(null);
  const heroListRef = useRef<FlatList<HeroCard>>(null);
  const heroIndexRef = useRef(0);
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const homeFirstContentRecordedRef = useRef(
    initialFeaturedSongsRef.current.length > 0
  );
  const hasInitialCachedCatalog = initialFeaturedSongsRef.current.length > 0;
  const fadeAnim = useRef(
    new Animated.Value(hasInitialCachedCatalog ? 1 : 0)
  ).current;
  const slideAnim = useRef(
    new Animated.Value(hasInitialCachedCatalog ? 0 : 18)
  ).current;
  const heroScale = useRef(
    new Animated.Value(hasInitialCachedCatalog ? 1 : 0.96)
  ).current;
  const heroGlowAnim = useRef(new Animated.Value(0.42)).current;

  const [featuredSongs, setFeaturedSongs] = useState<HiddenTunesNormalizedSong[]>(
    () => initialFeaturedSongsRef.current
  );
  const [loadingSongs, setLoadingSongs] = useState(
    () => initialFeaturedSongsRef.current.length === 0
  );
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedCatalogFallbacks, setHasCheckedCatalogFallbacks] =
    useState(false);
  const [visibleSongCount, setVisibleSongCount] = useState(INITIAL_HOME_SONG_ROWS);
  const [songPage, setSongPage] = useState(1);
  const [hasMoreSongPages, setHasMoreSongPages] = useState(true);
  const [loadingMoreSongs, setLoadingMoreSongs] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [feedMountStage, setFeedMountStage] = useState<HomeFeedMountStage>(0);
  const deferredSectionsScheduledRef = useRef(false);
  const feedMountStageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const logHomeFeedStageReady = useCallback((stage: HomeFeedMountStage) => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    console.log(`[home-feed] stage-ready ${stage}`);
  }, []);

  const advanceFeedMountStage = useCallback(
    (stage: HomeFeedMountStage) => {
      if (stage < 1 || stage > 3) return;

      setFeedMountStage((current) => {
        if (current >= stage) return current;
        logHomeFeedStageReady(stage);
        return stage;
      });
    },
    [logHomeFeedStageReady]
  );

  useRenderCountProbe("HomeScreen");

  const markHomeCachedContentReady = useCallback(
    (count: number, source: string) => {
      if (homeFirstContentRecordedRef.current) return;

      homeFirstContentRecordedRef.current = true;
      markFirstCachedContentVisible("home");

      const firstContentMs = Date.now() - screenStartedAt;
      logScreenReady("home", screenStartedAt, {
        cache: "hit",
        count,
        source,
      });
      recordScreenOpen("home", { openMs: firstContentMs, firstContentMs });
      logPerformanceSummary("home", {
        cache: "hit",
        firstContentMs,
        itemCount: count,
      });
    },
    [screenStartedAt]
  );

  useEffect(() => {
    if (!initialFeaturedSongsRef.current.length) return;

    recordSnapshotFallbackUsage("home", initialFeaturedSongsRef.current.length);
    recordOfflineCacheStartup("home", initialFeaturedSongsRef.current.length);
    markHomeCachedContentReady(
      initialFeaturedSongsRef.current.length,
      "memory_snapshot"
    );
  }, [markHomeCachedContentReady]);

  const defaultHeroTrack = featuredSongs[0];

  useScrollToTop(scrollRef);

  const applyFeaturedSongs = useCallback((songs: HiddenTunesNormalizedSong[]) => {
    const nextSongs = dedupeSongs((songs || []).map(safeSong));

    featuredSongsCountRef.current = nextSongs.length;
    setFeaturedSongs(nextSongs);
    setVisibleSongCount(INITIAL_HOME_SONG_ROWS);
    setSongPage(1);
    setHasMoreSongPages(nextSongs.length >= 20);

    scheduleStartupTask("background", "home_primary_artwork_prefetch", () =>
      preloadImages(
        nextSongs
          .slice(0, 2)
          .flatMap((song) => [song.artwork, song.cover, song.thumbnail])
      )
    );
  }, []);

  const finishInitialHomeLoadGate = useCallback(() => {
    setHasCheckedCatalogFallbacks(true);
    setLoadingSongs(false);
    setRefreshing(false);
  }, []);

  const scheduleHydrateCatalogFromStorage = useCallback(() => {
    scheduleStartupTask("background", "home_catalog_storage_hydrate", async () => {
      try {
        const cached = await hydrateHiddenTunesCatalogCache();

        if (cached.length) {
          if (
            shouldReplaceCatalogResults(cached, featuredSongsCountRef.current, {
              allowClearStale: false,
            })
          ) {
            applyFeaturedSongs(cached);
          }

          if (!homeFirstContentRecordedRef.current) {
            recordOfflineCacheStartup("home", cached.length);
            markHomeCachedContentReady(cached.length, "storage");
          }

          logCacheResult("home", true, {
            count: cached.length,
            source: "storage",
          });
        } else {
          logCacheResult("home", false);
        }
      } catch {
        if (!featuredSongsCountRef.current) {
          setFeaturedSongs([]);
          setHasMoreSongPages(false);
        }
      } finally {
        if (featuredSongsCountRef.current > 0) {
          finishInitialHomeLoadGate();
        }
      }
    });
  }, [
    applyFeaturedSongs,
    finishInitialHomeLoadGate,
    markHomeCachedContentReady,
  ]);

  const loadFeaturedSongs = useCallback(
    async (showLoader = true, forceRefresh = false) => {
      if (isLoadingRef.current && !forceRefresh) return;

      let showedCachedCatalog = featuredSongsCountRef.current > 0;
      let shouldFinishLoadGate = showedCachedCatalog || forceRefresh;

      try {
        isLoadingRef.current = true;

        if (!forceRefresh && shouldResetCatalogFallbackGate(featuredSongsCountRef.current)) {
          setHasCheckedCatalogFallbacks(false);

          const memorySnapshot = getHiddenTunesCatalogSnapshot();
          if (memorySnapshot.length) {
            applyFeaturedSongs(memorySnapshot);
            setLoadingSongs(false);
            showedCachedCatalog = true;
            shouldFinishLoadGate = true;
            markHomeCachedContentReady(memorySnapshot.length, "memory");
            recordSnapshotFallbackUsage("home", memorySnapshot.length);
            recordOfflineCacheStartup("home", memorySnapshot.length);
            logCacheResult("home", true, {
              count: memorySnapshot.length,
              source: "memory",
            });
            scheduleHydrateCatalogFromStorage();
          } else {
            if (showLoader) {
              setLoadingSongs(true);
            }
            logCacheResult("home", false);
            scheduleHydrateCatalogFromStorage();
          }
        } else if (showLoader && !showedCachedCatalog) {
          setLoadingSongs(true);
        }

        const refreshCatalogFromApi = async () => {
          const refreshStart = startPerformanceTimer();
          const songs = forceRefresh
            ? await refreshHiddenTunesSongs()
            : await fetchCoordinatedCatalogFirstPage();

          if (
            shouldReplaceCatalogResults(songs, featuredSongsCountRef.current, {
              allowClearStale: forceRefresh,
            })
          ) {
            applyFeaturedSongs(songs);
          }
          const refreshMs = Date.now() - refreshStart;

          logApiRefresh("home", refreshStart, {
            count: songs.length,
            forceRefresh,
          });
          markFirstApiRefreshComplete("home", refreshMs);

          if (!homeFirstContentRecordedRef.current && songs.length > 0) {
            markHomeCachedContentReady(songs.length, "api");
          }

          logPerformanceSummary("home", {
            cache: showedCachedCatalog || songs.length > 0 ? "hit" : "miss",
            apiRefreshMs: refreshMs,
            itemCount: songs.length,
            emptyStateReason: songs.length
              ? "content_available"
              : "cache_api_and_fallback_empty",
          });

          if (!showedCachedCatalog && !songs.length) {
            setHasMoreSongPages(false);
          }

          if (showedCachedCatalog && songs.length) {
            recordEmptyStatePrevented(
              "home",
              "cache_then_api_refresh",
              songs.length
            );
          } else if (showedCachedCatalog) {
            recordEmptyStatePrevented("home", "cache_only_startup", songs.length);
          }
        };

        const runCatalogApiRefresh = async () => {
          try {
            await refreshCatalogFromApi();
          } catch {
            if (!featuredSongsCountRef.current) {
              setFeaturedSongs([]);
              setHasMoreSongPages(false);
            }
          } finally {
            finishInitialHomeLoadGate();
          }
        };

        if (forceRefresh) {
          await runCatalogApiRefresh();
          shouldFinishLoadGate = true;
        } else {
          scheduleStartupTask("background", "home_catalog_api_refresh", runCatalogApiRefresh);
        }
      } catch {
        if (!featuredSongsCountRef.current) {
          setFeaturedSongs([]);
          setHasMoreSongPages(false);
        }
        shouldFinishLoadGate = true;
      } finally {
        isLoadingRef.current = false;

        if (shouldFinishLoadGate) {
          finishInitialHomeLoadGate();
        }
      }
    },
    [
      applyFeaturedSongs,
      finishInitialHomeLoadGate,
      markHomeCachedContentReady,
      scheduleHydrateCatalogFromStorage,
    ]
  );

  loadFeaturedSongsRef.current = loadFeaturedSongs;

  useEffect(() => {
    if (initialHomeLoadRef.current) return;
    initialHomeLoadRef.current = true;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        void loadFeaturedSongsRef.current(true);

        if (!hasInitialCachedCatalog) {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 420,
              useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
              toValue: 0,
              duration: 420,
              useNativeDriver: true,
            }),
            Animated.spring(heroScale, {
              toValue: 1,
              friction: 9,
              tension: 55,
              useNativeDriver: true,
            }),
          ]).start();
        }
      });
    });

    return () => {
      interactionHandle.cancel();
    };
  }, [fadeAnim, heroScale, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      const heroGlowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(heroGlowAnim, {
            toValue: 1,
            duration: 2600,
            useNativeDriver: true,
          }),
          Animated.timing(heroGlowAnim, {
            toValue: 0.42,
            duration: 2600,
            useNativeDriver: true,
          }),
        ])
      );

      heroGlowLoop.start();

      return () => {
        heroGlowLoop.stop();
      };
    }, [heroGlowAnim])
  );

  const scheduleDeferredHomeSections = useCallback(() => {
    if (deferredSectionsScheduledRef.current) return;
    deferredSectionsScheduledRef.current = true;

    const scheduleStage = (delayMs: number, stage: HomeFeedMountStage) => {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          advanceFeedMountStage(stage);
        });
      }, delayMs);
      feedMountStageTimersRef.current.push(timer);
    };

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        advanceFeedMountStage(1);
        scheduleStage(80, 2);
        scheduleStage(160, 3);
      });
    });
  }, [advanceFeedMountStage]);

  useEffect(() => {
    return () => {
      feedMountStageTimersRef.current.forEach(clearTimeout);
      feedMountStageTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (featuredSongs.length > 0) {
      scheduleDeferredHomeSections();
    }
  }, [featuredSongs.length, scheduleDeferredHomeSections]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeaturedSongs(false, true);
  }, [loadFeaturedSongs]);

  const listenerRecentlyPlayed = useMemo(
    () => (Array.isArray(recentlyPlayed) ? recentlyPlayed : []) as DiscoverySong[],
    [recentlyPlayed]
  );

  const listenerFavorites = useMemo(
    () => (Array.isArray(favorites) ? favorites : []) as DiscoverySong[],
    [favorites]
  );

  const discoveryListenersRef = useRef({
    recentlyPlayed: listenerRecentlyPlayed,
    favorites: listenerFavorites,
  });
  const [discoveryListenersVersion, setDiscoveryListenersVersion] = useState(0);

  const applyDiscoveryListeners = useCallback(
    (recentlyPlayedInput: DiscoverySong[], favoritesInput: DiscoverySong[]) => {
      discoveryListenersRef.current = {
        recentlyPlayed: recentlyPlayedInput,
        favorites: favoritesInput,
      };
      setDiscoveryListenersVersion((current) => current + 1);
    },
    []
  );

  const featuredCatalogKey = useMemo(() => {
    const first = featuredSongs[0];
    const last = featuredSongs[featuredSongs.length - 1];
    return `${featuredSongs.length}:${String(first?.id || first?.title || "")}:${String(last?.id || last?.title || "")}`;
  }, [featuredSongs]);

  useEffect(() => {
    applyDiscoveryListeners(listenerRecentlyPlayed, listenerFavorites);
  }, [applyDiscoveryListeners, featuredCatalogKey]);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    frameId = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (cancelled) return;
        logBackgroundWork("discovery-recompute-deferred");
        applyDiscoveryListeners(listenerRecentlyPlayed, listenerFavorites);
      }, 48);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timer) clearTimeout(timer);
    };
  }, [applyDiscoveryListeners, listenerFavorites, listenerRecentlyPlayed]);

  const sharedDiscovery = useMemo(
    () =>
      getSharedDiscoverySnapshot({
        songs: featuredSongs,
        recentlyPlayed: discoveryListenersRef.current.recentlyPlayed,
        favorites: discoveryListenersRef.current.favorites,
      }),
    [discoveryListenersVersion, featuredSongs]
  );

  const rankedSongs = sharedDiscovery.rankedSongs;
  const rankedAlbums = sharedDiscovery.rankedAlbums;
  const rankedArtists = sharedDiscovery.rankedArtists;
  const newestSongs = sharedDiscovery.recentlyDiscovered;
  const becauseYouListened = useMemo(() => {
    const raw = sharedDiscovery.becauseYouListenedRaw.slice(0, 6);
    if (!currentSong?.id) return raw;

    const currentId = String(currentSong.id);
    return raw.filter((song) => String(song.id || "") !== currentId);
  }, [currentSong?.id, sharedDiscovery.becauseYouListenedRaw]);
  const curatedSections = sharedDiscovery.curatedSections;
  const moodRooms = sharedDiscovery.moodRooms.slice(0, 8);
  const genreSpotlights = sharedDiscovery.genreSpotlights;

  const visibleAllSongs = useMemo(
    () => rankedSongs.slice(0, visibleSongCount),
    [rankedSongs, visibleSongCount]
  );

  const hasMoreCloudSongs = visibleSongCount < featuredSongs.length;

  const moreLikeThisMood = useMemo(
    () => buildMoreLikeThisMood(featuredSongs, currentSong, listenerRecentlyPlayed, 6),
    [currentSong, featuredSongs, listenerRecentlyPlayed]
  );

  const [activeMoodId, setActiveMoodId] = useState<string | null>(null);

  const primaryMoodRoom = moodRooms[0];
  const primaryGenreSpotlight = genreSpotlights[0];

  const activeMoodRoom = useMemo(() => {
    const targetId = activeMoodId || primaryMoodRoom?.id;
    return moodRooms.find((room) => room.id === targetId) || primaryMoodRoom;
  }, [activeMoodId, moodRooms, primaryMoodRoom]);

  const showMoreButton =
    feedMountStage >= 3 && (hasMoreCloudSongs || hasMoreSongPages);

  const homeFeedRows = useMemo(
    () =>
      buildHomeFeedRows({
        feedMountStage,
        becauseYouListened,
        moreLikeThisMoodSongs: moreLikeThisMood.songs,
        rankedArtistsCount: rankedArtists.length,
        rankedAlbumsCount: rankedAlbums.length,
        curatedSections,
        moodRooms,
        activeMoodRoom,
        primaryGenreSpotlight,
        visibleAllSongs,
        featuredSongsCount: featuredSongs.length,
        showMoreButton,
      }),
    [
      activeMoodRoom,
      becauseYouListened,
      curatedSections,
      feedMountStage,
      featuredSongs.length,
      moodRooms,
      moreLikeThisMood.songs,
      primaryGenreSpotlight,
      rankedAlbums.length,
      rankedArtists.length,
      showMoreButton,
      visibleAllSongs,
    ]
  );

  const homeListPerformance = useMemo(
    () => getListPerformanceSettings(homeFeedRows.length),
    [homeFeedRows.length]
  );

  const homeFeedKeyExtractor = useCallback((item: HomeFeedRow) => item.key, []);

  useEffect(() => {
    if (primaryMoodRoom?.id && !activeMoodId) {
      setActiveMoodId(primaryMoodRoom.id);
    }
  }, [activeMoodId, primaryMoodRoom?.id]);

  useEffect(() => {
    if (!featuredSongs.length || feedMountStage < 3) return;

    scheduleStartupTask("background", "home_section_artwork_prefetch", () =>
      preloadImages([
      ...newestSongs.slice(0, 4).flatMap((song) => [song.artwork, song.cover]),
      ...rankedAlbums.slice(0, 3).map((album) => album.artwork),
      ...rankedArtists.slice(0, 3).map((artist) => artist.artwork),
      ...visibleAllSongs.slice(0, 4).flatMap((song) => [song.artwork, song.cover]),
      ...(primaryGenreSpotlight?.songs || [])
        .slice(0, 2)
        .flatMap((song) => [song.artwork, song.cover]),
      ])
    );
  }, [
    feedMountStage,
    featuredSongs.length,
    newestSongs,
    primaryGenreSpotlight?.songs,
    rankedAlbums,
    rankedArtists,
    visibleAllSongs,
  ]);

  useEffect(() => {
    if (feedMountStage < 3 || !primaryGenreSpotlight?.title) return undefined;

    return scheduleDelayedNonEssentialWork(() => {
      logBackgroundWork("delayed-genre-prewarm");
      scheduleGenreCatalogPrewarm({
        id: primaryGenreSpotlight.id.replace(/^genre-/, ""),
        title: primaryGenreSpotlight.title,
        query: primaryGenreSpotlight.title,
      });
    });
  }, [feedMountStage, primaryGenreSpotlight?.id, primaryGenreSpotlight?.title]);

  useEffect(() => {
    if (feedMountStage < 3 || !primaryMoodRoom?.title) return undefined;

    return scheduleDelayedNonEssentialWork(() => {
      logBackgroundWork("delayed-genre-prewarm");
      scheduleGenreCatalogPrewarm({
        type: "mood",
        id: primaryMoodRoom.id.replace(/^mood-/, ""),
        title: primaryMoodRoom.title,
        query: `${primaryMoodRoom.title} music`,
      });
    });
  }, [feedMountStage, primaryMoodRoom?.id, primaryMoodRoom?.title]);

  const listeningBrief = useMemo(() => {
    if (currentSong) {
      return {
        label: "Now Playing",
        title: currentSong.title || "Your current song",
        subtitle:
          currentSong.artist ||
          currentSong.user?.name ||
          "Keep the feeling moving",
        icon: "pulse" as keyof typeof Ionicons.glyphMap,
      };
    }

    if (primaryMoodRoom) {
      return {
        label: "Mood Room",
        title: primaryMoodRoom.title,
        subtitle: primaryMoodRoom.subtitle,
        icon: "radio" as keyof typeof Ionicons.glyphMap,
      };
    }

    if (primaryGenreSpotlight) {
      return {
        label: "Original Genre",
        title: primaryGenreSpotlight.title,
        subtitle: primaryGenreSpotlight.subtitle,
        icon: "albums" as keyof typeof Ionicons.glyphMap,
      };
    }

    return {
      label: "Discovery",
      title: "Premium listening starts here",
      subtitle: "Fresh songs, creator worlds, and moods ready to play.",
      icon: "sparkles" as keyof typeof Ionicons.glyphMap,
    };
  }, [currentSong, primaryGenreSpotlight, primaryMoodRoom]);

  const heroCards = useMemo<HeroCard[]>(() => {
    const cards: HeroCard[] = [];
    const firstGenreSong = featuredSongs.find((song) => Boolean(song.genre));
    const firstMoodSong = featuredSongs.find((song) => Boolean(song.mood));
    const hiddenTunesPick = featuredSongs[1] || defaultHeroTrack;
    const recentSong = Array.isArray(recentlyPlayed)
      ? recentlyPlayed.find((song: any) => song?.streamUrl || song?.url || song?.audioUrl)
      : null;

    if (currentSong) {
      const song = safeSong(currentSong);

      cards.push({
        id: `current-${song.id}`,
        key: `current-${song.id}`,
        label: "NOW PLAYING",
        title: song.title,
        subtitle: song.artist || "Hidden Tunes",
        song,
        icon: "pulse",
        isCurrent: true,
      });
    }

    if (defaultHeroTrack) {
      cards.push({
        id: String(defaultHeroTrack.id || ""),
        key: `new-${defaultHeroTrack.id}`,
        label: "NEW UPLOAD",
        title: defaultHeroTrack.title,
        subtitle: defaultHeroTrack.artist || "Fresh for you",
        song: defaultHeroTrack,
        icon: "cloud-done",
      });
    }

    if (hiddenTunesPick && hiddenTunesPick.id !== defaultHeroTrack?.id) {
      cards.push({
        id: String(hiddenTunesPick.id || ""),
        key: `pick-${hiddenTunesPick.id}`,
        label: "HIDDEN TUNES PICK",
        title: hiddenTunesPick.title,
        subtitle: hiddenTunesPick.artist || "Editor pick",
        song: hiddenTunesPick,
        icon: "sparkles",
      });
    }

    if (firstGenreSong) {
      cards.push({
        id: String(firstGenreSong.id || ""),
        key: `genre-${firstGenreSong.genre}-${firstGenreSong.id}`,
        label: String(firstGenreSong.genre || "GENRE").toUpperCase(),
        title: firstGenreSong.title,
        subtitle: firstGenreSong.artist || "Genre discovery",
        song: firstGenreSong,
        icon: "albums",
      });
    }

    if (firstMoodSong) {
      cards.push({
        id: String(firstMoodSong.id || ""),
        key: `mood-${firstMoodSong.mood}-${firstMoodSong.id}`,
        label: `${String(firstMoodSong.mood || "Mood").toUpperCase()} MOOD`,
        title: firstMoodSong.title,
        subtitle: firstMoodSong.artist || "Mood discovery",
        song: firstMoodSong,
        icon: "radio",
      });
    }

    if (recentSong) {
      const song = safeSong(recentSong);

      cards.push({
        id: String(song.id || ""),
        key: `recent-${song.id}`,
        label: "RECENTLY PLAYED",
        title: song.title,
        subtitle: song.artist || "Back in rotation",
        song,
        icon: "time",
      });
    }

    const sliced = cards.slice(0, 6);

    if (currentSong) {
      const currentId = String((currentSong as any).id || "");
      const hasMatch = sliced.some((card) => {
        if (card.isCurrent) return true;
        if (card.id && String(card.id) === currentId) return true;
        if (card.song?.id && String(card.song.id) === currentId) return true;
        return false;
      });

      if (!hasMatch && currentId) {
        const song = safeSong(currentSong);
        return [
          {
            id: `current-${currentId}`,
            key: `current-${currentId}`,
            label: "NOW PLAYING",
            title: song.title,
            subtitle: song.artist || "Hidden Tunes",
            song,
            icon: "pulse" as keyof typeof Ionicons.glyphMap,
            isCurrent: true,
          },
          ...sliced,
        ].slice(0, 6);
      }
    }

    return sliced;
  }, [currentSong, defaultHeroTrack, featuredSongs, recentlyPlayed]);

  const homeAudioPreloadTarget = useMemo(
    () =>
      pickHomeAudioPreloadTarget({
        featuredCardSongs: heroCards.map((card) => card.song),
        visibleCatalogSongs: visibleAllSongs,
        heroFallback: defaultHeroTrack,
      }),
    [defaultHeroTrack, heroCards, visibleAllSongs]
  );

  useEffect(() => {
    if (feedMountStage < 3 || !homeAudioPreloadTarget?.song?.id) return undefined;

    const target = homeAudioPreloadTarget;
    let cancelDebounce: (() => void) | undefined;

    const cancelDelayed = scheduleDelayedNonEssentialWork(() => {
      cancelDebounce = scheduleDebouncedAudioPreload(
        `home:${target.song.id}:${target.tier}`,
        () => {
          logAudioPreloadTargetSelected("home", target);
          scheduleStartupTask("idle", "home_idle_audio_preload", () => {
            void preloadIdlePlayableTrack(target.song, {
              source: `home:${target.tier}`,
            });
          });
        },
        { delayMs: 350 }
      );
    }, { delayMs: 1500 });

    return () => {
      cancelDelayed();
      cancelDebounce?.();
    };
  }, [feedMountStage, homeAudioPreloadTarget, preloadIdlePlayableTrack]);

  const shouldAutoSlideHero =
    heroCards.length > 1 && !isPlaying;
  const firstHeroKey = heroCards[0]?.key;

  useEffect(() => {
    heroIndexRef.current = 0;
    setHeroIndex(0);
    heroListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstHeroKey]);

  useEffect(() => {
    if (!isPlaying || !currentSong || heroCards.length === 0) return;

    heroIndexRef.current = 0;
    setHeroIndex(0);

    heroListRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });
  }, [currentSong, heroCards.length, isPlaying]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldAutoSlideHero) return undefined;

      const timer = setInterval(() => {
        const nextIndex = (heroIndexRef.current + 1) % heroCards.length;

        heroIndexRef.current = nextIndex;
        setHeroIndex(nextIndex);

        heroListRef.current?.scrollToOffset({
          offset: HERO_CARD_WIDTH * nextIndex,
          animated: true,
        });
      }, HERO_AUTO_SLIDE_MS);

      return () => {
        clearInterval(timer);
      };
    }, [heroCards.length, shouldAutoSlideHero])
  );

  const playFeaturedSong = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      const tapStartedAt = startPerformanceTimer();
      const normalized = safeSong(song);
      const queue = dedupeSongs(featuredSongs.map(safeSong));

      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.id === normalized.id)
      );

      void playSong(normalized as any, queue as any, startIndex).finally(() => {
        logTapToPlay("home", tapStartedAt, { id: normalized.id });
      });

      requestAnimationFrame(() => {
        router.push("/player" as any);
      });
    },
    [featuredSongs, playSong]
  );

  const loadMoreCloudSongs = useCallback(async () => {
    if (loadingMoreSongs) return;

    if (visibleSongCount < featuredSongs.length) {
      setVisibleSongCount((current) =>
        Math.min(featuredSongs.length, current + HOME_SONG_ROWS_INCREMENT)
      );
      return;
    }

    if (!hasMoreSongPages) return;

    const nextPage = songPage + 1;
    if (nextPage > 1 && isWithinFirstInteractionWindow()) {
      return;
    }

    try {
      setLoadingMoreSongs(true);
      const page = await getHiddenTunesSongsPage({
        page: nextPage,
        limit: 30,
      });
      const nextSongs = dedupeSongs([
        ...featuredSongs,
        ...(page.songs || []).map(safeSong),
      ]);

      setFeaturedSongs(nextSongs);
      setVisibleSongCount((current) =>
        Math.min(nextSongs.length, current + HOME_SONG_ROWS_INCREMENT)
      );
      setSongPage(nextPage);
      setHasMoreSongPages(page.hasMore);
    } catch (error) {
    } finally {
      setLoadingMoreSongs(false);
    }
  }, [
    featuredSongs,
    hasMoreSongPages,
    loadingMoreSongs,
    songPage,
    visibleSongCount,
  ]);

  const homeScrollJankRef = useRef(createScrollJankHandler("home"));

  const handleHomeScroll = useCallback(() => {
    homeScrollJankRef.current();
  }, []);

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      if (card.isCurrent) {
        router.push("/player" as any);
        return;
      }

      playFeaturedSong(card.song);
    },
    [playFeaturedSong]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => {
      const isPlayingCard =
        Boolean(currentSong) &&
        String(item.song?.id || "") === String((currentSong as any)?.id || "");

      return (
        <View style={styles.heroSlide}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.heroCard}
              onPress={() => handleHeroPress(item)}
            >
              <HTImage source={item.song} style={styles.heroImage} />

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.98)"]}
                style={styles.overlay}
              >
                <View style={styles.livePill}>
                  {isPlayingCard ? (
                    <NeonEQ isPlaying={isPlaying === true} size="small" />
                  ) : (
                    <Ionicons name={item.icon} size={13} color={COLORS.primary} />
                  )}

                  <Text style={styles.liveText}>
                    {isPlayingCard ? "Now Playing" : item.label}
                  </Text>
                </View>

                <Text numberOfLines={1} style={styles.heroSong}>
                  {item.title}
                </Text>

                <Text numberOfLines={1} style={styles.heroArtist}>
                  {item.subtitle}
                </Text>

                <View style={styles.heroBottomRow}>
                  <View style={styles.playButton}>
                    <Ionicons
                      name={isPlayingCard && isPlaying === true ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.playText}>
                      {isPlayingCard ? "OPEN PLAYER" : "PLAY"}
                    </Text>
                  </View>

                  {heroCards.length > 1 && (
                    <View style={styles.heroCountPill}>
                      <Text style={styles.heroCountText}>
                        {index + 1}/{heroCards.length}
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      );
    },
    [currentSong?.id, handleHeroPress, heroCards.length, isPlaying]
  );

  const handleHeroMomentumEnd = useCallback((event: any) => {
    const offset = event.nativeEvent.contentOffset.x || 0;
    const nextIndex = Math.max(
      0,
      Math.min(heroCards.length - 1, Math.round(offset / HERO_CARD_WIDTH))
    );

    heroIndexRef.current = nextIndex;
    setHeroIndex(nextIndex);
  }, [heroCards.length]);

  const renderSongRow = useCallback(
    (song: HiddenTunesNormalizedSong, _sectionId: string) => (
      <HomeCatalogSongRow
        song={song}
        image={getSongImage(song)}
        onPress={playFeaturedSong}
      />
    ),
    [playFeaturedSong]
  );

  const horizontalArtistListTuning = useMemo(
    () => getHorizontalListPerformanceSettings(rankedArtists.length),
    [rankedArtists.length]
  );

  const horizontalAlbumListTuning = useMemo(
    () => getHorizontalListPerformanceSettings(rankedAlbums.length),
    [rankedAlbums.length]
  );

  const featuredSliderTuning = useMemo(
    () => getHorizontalListPerformanceSettings(newestSongs.length),
    [newestSongs.length]
  );

  const renderFeaturedItem = useCallback(
    ({ item, index }: { item: HiddenTunesNormalizedSong; index: number }) => (
      <HomeFeaturedCard item={item} index={index} onPress={playFeaturedSong} />
    ),
    [playFeaturedSong]
  );

  const renderHomeFeedRow = useCallback(
    ({ item }: { item: HomeFeedRow }) => {
      switch (item.kind) {
        case "section-title":
          return <Text style={styles.sectionTitleBlock}>{item.title}</Text>;

        case "song":
          return renderSongRow(item.song, item.sectionId);

        case "artists-rail":
          return (
            <FlatList
              horizontal
              data={rankedArtists}
              keyExtractor={(artist) => `artist-${artist.id || artist.name}-creators`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.artistRow}
              initialNumToRender={horizontalArtistListTuning.initialNumToRender}
              maxToRenderPerBatch={horizontalArtistListTuning.maxToRenderPerBatch}
              windowSize={horizontalArtistListTuning.windowSize}
              updateCellsBatchingPeriod={horizontalArtistListTuning.updateCellsBatchingPeriod}
              removeClippedSubviews
              nestedScrollEnabled
              renderItem={({ item: artist }) => (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.artistCard}
                  onPress={() =>
                    router.push({
                      pathname: "/artist/[id]",
                      params: { id: artist.id },
                    } as any)
                  }
                >
                  <HTImage source={artist} style={styles.artistImage} />
                  <Text numberOfLines={1} style={styles.artistName}>
                    {artist.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.artistMeta}>
                    {artist.tracks?.length || 0}
                  </Text>
                </TouchableOpacity>
              )}
            />
          );

        case "albums-rail":
          return (
            <FlatList
              horizontal
              data={rankedAlbums}
              keyExtractor={(album) => `album-${album.id || album.title}-albums`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.artistRow}
              initialNumToRender={horizontalAlbumListTuning.initialNumToRender}
              maxToRenderPerBatch={horizontalAlbumListTuning.maxToRenderPerBatch}
              windowSize={horizontalAlbumListTuning.windowSize}
              updateCellsBatchingPeriod={horizontalAlbumListTuning.updateCellsBatchingPeriod}
              removeClippedSubviews
              nestedScrollEnabled
              renderItem={({ item: album }) => (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.albumCard}
                  onPress={() =>
                    router.push({
                      pathname: "/album/[id]",
                      params: { id: album.id },
                    } as any)
                  }
                >
                  <HTImage source={album} style={styles.albumImage} />
                  <Text numberOfLines={1} style={styles.artistName}>
                    {album.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.artistMeta}>
                    {album.artist}
                  </Text>
                </TouchableOpacity>
              )}
            />
          );

        case "recently-added":
          return (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Recently Added</Text>
                <TouchableOpacity onPress={onRefresh} style={styles.refreshMini}>
                  <Ionicons name="refresh" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              {shouldShowCatalogLoadingShell({
                hasCheckedFallbacks: hasCheckedCatalogFallbacks,
                isLoading: loadingSongs,
                isRefreshing: refreshing,
                resolvedCount: featuredSongs.length,
              }) ? (
                <View style={styles.loadingBox}>
                  <View style={styles.loadingTitleRow}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Preparing fresh tracks...</Text>
                  </View>
                  <HomeSkeletonCards />
                </View>
              ) : shouldShowCatalogEmpty({
                hasCheckedFallbacks: hasCheckedCatalogFallbacks,
                isLoading: loadingSongs,
                isRefreshing: refreshing,
                resolvedCount: featuredSongs.length,
              }) ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Your listening room is warming up</Text>
                  <Text style={styles.emptyText}>{TESTER_COPY.catalogEmptyHome}</Text>
                </View>
              ) : (
                <FlatList
                  horizontal
                  data={newestSongs}
                  keyExtractor={(song) => `song-${song.id || song.title}-recently-discovered`}
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={FEATURED_CARD_WIDTH + 16}
                  decelerationRate="fast"
                  contentContainerStyle={styles.featuredSlider}
                  renderItem={renderFeaturedItem}
                  initialNumToRender={featuredSliderTuning.initialNumToRender}
                  maxToRenderPerBatch={featuredSliderTuning.maxToRenderPerBatch}
                  windowSize={featuredSliderTuning.windowSize}
                  updateCellsBatchingPeriod={featuredSliderTuning.updateCellsBatchingPeriod}
                  removeClippedSubviews
                  nestedScrollEnabled
                />
              )}
            </>
          );

        case "curated-section":
          return (
            <View>
              <View style={styles.sectionRow}>
                <View style={styles.sectionHeadingStack}>
                  <Text style={styles.sectionTitle}>{item.section.title}</Text>
                  <Text style={styles.sectionSubtitle}>{item.section.subtitle}</Text>
                </View>
                {item.section.genreTitle ? (
                  <TouchableOpacity
                    onPress={() =>
                      openGenreCatalog({
                        id: item.section.genreTitle,
                        title: item.section.genreTitle,
                        query: item.section.genreTitle,
                      })
                    }
                  >
                    <Text style={styles.seeAllLink}>Open room</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <FlatList
                horizontal
                data={item.section.songs}
                keyExtractor={(song) =>
                  `curated-${item.section.id}-${song.id || song.title}`
                }
                showsHorizontalScrollIndicator={false}
                snapToInterval={FEATURED_CARD_WIDTH + 16}
                decelerationRate="fast"
                contentContainerStyle={styles.featuredSlider}
                renderItem={renderFeaturedItem}
                initialNumToRender={featuredSliderTuning.initialNumToRender}
                maxToRenderPerBatch={featuredSliderTuning.maxToRenderPerBatch}
                windowSize={featuredSliderTuning.windowSize}
                updateCellsBatchingPeriod={featuredSliderTuning.updateCellsBatchingPeriod}
                removeClippedSubviews
                nestedScrollEnabled
              />
            </View>
          );

        case "mood-rooms-header":
          return (
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Mood Rooms</Text>
              {activeMoodRoom ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    openMoodCatalog(
                      activeMoodRoom.title,
                      `${activeMoodRoom.title} music`
                    )
                  }
                >
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          );

        case "mood-rooms-rail":
          return (
            <FlatList
              horizontal
              data={moodRooms}
              keyExtractor={(room) => `mood-${room.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moodRail}
              nestedScrollEnabled
              renderItem={({ item: room }) => (
                <MoodRoomCard
                  title={room.title}
                  subtitle={room.subtitle}
                  artwork={room.artwork?.[0]}
                  gradient={room.gradient}
                  active={room.id === activeMoodRoom?.id}
                  onPress={() => openMoodCatalog(room.title)}
                />
              )}
            />
          );

        case "genre-spotlight-header":
          return primaryGenreSpotlight ? (
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.sectionRow}
              onPress={() =>
                openGenreCatalog({
                  id: primaryGenreSpotlight.id.replace(/^genre-/, ""),
                  title: primaryGenreSpotlight.title,
                  query: primaryGenreSpotlight.title,
                })
              }
            >
              <Text style={styles.sectionTitle}>Genre Spotlights</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null;

        case "catalog-header":
          return (
            <Text style={styles.sectionTitleBlock}>
              Full Catalog Â· {visibleAllSongs.length}/{featuredSongs.length}
            </Text>
          );

        case "show-more":
          return (
            <TouchableOpacity
              activeOpacity={0.86}
              style={[
                styles.showMoreButton,
                loadingMoreSongs && styles.showMoreButtonDisabled,
              ]}
              onPress={loadMoreCloudSongs}
              disabled={loadingMoreSongs}
            >
              {loadingMoreSongs ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons name="albums-outline" size={18} color="#000" />
              )}
              <Text style={styles.showMoreText}>
                {loadingMoreSongs ? "Loading more..." : "Find more"}
              </Text>
            </TouchableOpacity>
          );

        case "footer-spacer":
          return (
            <View style={styles.footerSpacer}>
              <SubtleTvEntryLink />
              <View style={{ height: 120 }} />
            </View>
          );

        default:
          return null;
      }
    },
    [
      activeMoodRoom,
      featuredSliderTuning,
      featuredSongs.length,
      hasCheckedCatalogFallbacks,
      horizontalAlbumListTuning,
      horizontalArtistListTuning,
      loadingMoreSongs,
      loadingSongs,
      moodRooms,
      newestSongs,
      onRefresh,
      primaryGenreSpotlight,
      rankedAlbums,
      rankedArtists,
      renderFeaturedItem,
      renderSongRow,
      visibleAllSongs.length,
      loadMoreCloudSongs,
    ]
  );

  const listHeaderElement = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <View style={styles.logoGlow} />
            <HTImage
              source={FALLBACK_ARTWORK}
              style={styles.logoImage}
              contentFit="cover"
            />
          </View>

          <View>
            <Text style={styles.logoText}>Hidden Tunes</Text>
          </View>

          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => router.push("/search")}
            activeOpacity={0.85}
          >
            <Ionicons name="search" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.homeEyebrow}>
          {currentSong ? "Now Playing" : "For You"}
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.searchBar}
          onPress={() => router.push("/search")}
        >
          <Ionicons name="search" size={20} color={COLORS.cyan} />
          <Text style={styles.searchText}>Search Hidden Tunes...</Text>
          <Ionicons name="sparkles" size={18} color={COLORS.primary} />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.heroOuter,
            {
              transform: [{ scale: heroScale }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.heroBoxGlow,
              {
                opacity: heroGlowAnim,
                transform: [
                  {
                    scale: heroGlowAnim.interpolate({
                      inputRange: [0.42, 1],
                      outputRange: [0.98, 1.035],
                    }),
                  },
                ],
              },
            ]}
          />
          {heroCards.length > 0 ? (
            <FlatList
              ref={heroListRef}
              horizontal
              data={heroCards}
              keyExtractor={(item) => item.key}
              renderItem={renderHeroCard}
              showsHorizontalScrollIndicator={false}
              snapToInterval={HERO_CARD_WIDTH}
              decelerationRate="fast"
              pagingEnabled
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews
              nestedScrollEnabled
              onMomentumScrollEnd={handleHeroMomentumEnd}
            />
          ) : (
            <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
              <View style={styles.heroCard}>
                <View style={styles.heroEmpty}>
                  {shouldShowCatalogLoadingShell({
                    hasCheckedFallbacks: hasCheckedCatalogFallbacks,
                    isLoading: loadingSongs,
                    isRefreshing: refreshing,
                    resolvedCount: featuredSongs.length,
                  }) ? (
                    <>
                      <View style={styles.heroSkeletonIcon} />
                      <View style={styles.heroSkeletonLineWide} />
                      <View style={styles.heroSkeletonLine} />
                      <Text style={styles.heroEmptySub}>Preparing your catalog...</Text>
                    </>
                  ) : shouldShowCatalogEmpty({
                    hasCheckedFallbacks: hasCheckedCatalogFallbacks,
                    isLoading: loadingSongs,
                    isRefreshing: refreshing,
                    resolvedCount: featuredSongs.length,
                  }) ? (
                    <>
                      <Ionicons
                        name="musical-notes-outline"
                        size={44}
                        color={COLORS.primary}
                      />
                      <Text style={styles.heroEmptyText}>No songs yet</Text>
                      <Text style={styles.heroEmptySub}>Pull down to refresh.</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </LinearGradient>
          )}

          {currentSong ? (
            <View pointerEvents="none" style={styles.heroNowPlayingWaveformOverlay}>
              <Text style={styles.heroNowPlayingWaveformLabel}>Live</Text>
              <LiveWaveform isPlaying={isPlaying === true} size="small" />
            </View>
          ) : null}
        </Animated.View>

        {heroCards.length > 1 ? (
          <View style={styles.heroDots}>
            {heroCards.map((item, index) => (
              <View
                key={`hero-dot-${item.key}`}
                style={[styles.heroDot, index === heroIndex && styles.heroDotActive]}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.catalogPill}>
          <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
          <Text style={styles.catalogPillText}>{featuredSongs.length} songs ready</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.listeningBrief}
          onPress={() =>
            currentSong ? router.push("/player" as any) : router.push("/explore")
          }
        >
          <View style={styles.listeningBriefIcon}>
            <Ionicons name={listeningBrief.icon} size={20} color={COLORS.primary} />
          </View>

          <View style={styles.listeningBriefText}>
            <Text style={styles.listeningBriefLabel}>{listeningBrief.label}</Text>
            <Text numberOfLines={1} style={styles.listeningBriefTitle}>
              {listeningBrief.title}
            </Text>
          </View>

          <Ionicons name="arrow-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.grid}>
          {[
            {
              key: "premium-music",
              icon: "headset" as const,
              title: "Music",
              color: COLORS.primary,
              onPress: () => router.push("/music-feed" as any),
            },
            {
              key: "premium-search",
              icon: "search" as const,
              title: "Search",
              color: COLORS.cyan,
              onPress: () => router.push("/search"),
            },
            {
              key: "premium-queue",
              icon: "list" as const,
              title: "Queue",
              color: COLORS.pink,
              onPress: () => router.push("/queue"),
            },
            {
              key: "premium-feelings",
              icon: "heart" as const,
              title: "Feelings",
              color: "rgba(192,132,252,0.95)",
              onPress: () => router.push("/explore"),
            },
          ].map((card) => (
            <PremiumCard
              key={card.key}
              icon={card.icon}
              title={card.title}
              color={card.color}
              onPress={card.onPress}
            />
          ))}
        </View>
      </>
    ),
    [
      currentSong,
      featuredSongs.length,
      handleHeroMomentumEnd,
      hasCheckedCatalogFallbacks,
      heroCards,
      heroGlowAnim,
      heroIndex,
      heroScale,
      isPlaying,
      listeningBrief.icon,
      listeningBrief.label,
      listeningBrief.title,
      loadingSongs,
      playFeaturedSong,
      renderHeroCard,
    ]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <Animated.View
        style={[
          styles.animatedWrap,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <FlatList
          ref={scrollRef}
          data={homeFeedRows}
          keyExtractor={homeFeedKeyExtractor}
          renderItem={renderHomeFeedRow}
          ListHeaderComponent={listHeaderElement}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              tintColor={COLORS.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          onScroll={handleHomeScroll}
          scrollEventThrottle={400}
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          onEndReached={loadMoreCloudSongs}
          onEndReachedThreshold={0.35}
          removeClippedSubviews={homeListPerformance.removeClippedSubviews}
          initialNumToRender={homeListPerformance.initialNumToRender}
          maxToRenderPerBatch={homeListPerformance.maxToRenderPerBatch}
          windowSize={homeListPerformance.windowSize}
          updateCellsBatchingPeriod={homeListPerformance.updateCellsBatchingPeriod}
        />
      </Animated.View>
    </LinearGradient>
  );
}

export default memo(HomeScreen);

const PremiumCard = memo(function PremiumCard({ icon, title, color, onPress }: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const pressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.88}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.iconCircle, { borderColor: color }]}>
          <Ionicons name={icon} size={23} color={color} />
        </View>

        <Text style={styles.gridTitle}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  animatedWrap: {
    flex: 1,
  },

  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.2)",
  },

  glowCyan: {
    position: "absolute",
    top: 250,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.12)",
  },

  scrollContent: {
    paddingBottom: 160,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 52,
    paddingHorizontal: 20,
  },

  logoBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.5)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 5,
    overflow: "hidden",
  },

  logoGlow: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(168,85,247,0.16)",
  },

  logoImage: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },

  logoText: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
    marginLeft: 14,
  },

  logoSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 14,
    marginTop: 3,
  },

  searchButton: {
    marginLeft: "auto",
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  homeEyebrow: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginTop: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 8,
    fontWeight: "700",
  },

  searchBar: {
    marginTop: 12,
    marginHorizontal: 20,
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    flexDirection: "row",
    alignItems: "center",
  },

  searchText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 10,
  },

  heroOuter: {
    marginTop: 24,
    marginHorizontal: 20,
    position: "relative",
  },

  heroBoxGlow: {
    position: "absolute",
    left: -5,
    right: -5,
    top: -5,
    height: 328,
    borderRadius: 39,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.72)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 8,
  },

  heroDots: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.24)",
  },

  heroDotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },

  heroSlide: {
    width: HERO_CARD_WIDTH,
  },

  heroBorder: {
    height: 318,
    borderRadius: 34,
    padding: 2,
  },

  heroCard: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },

  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
  },

  livePill: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },

  liveText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heroSong: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
  },

  heroArtist: {
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    fontWeight: "700",
  },

  heroNowPlayingWaveformOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 20,
    elevation: 20,
    minHeight: 44,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  heroNowPlayingWaveformLabel: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  heroEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },

  heroEmptyText: {
    color: COLORS.text,
    marginTop: 12,
    fontWeight: "900",
    fontSize: 18,
  },

  heroEmptySub: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },

  heroSkeletonIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 18,
  },

  heroSkeletonLineWide: {
    width: "64%",
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 10,
  },

  heroSkeletonLine: {
    width: "42%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  playButton: {
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },

  playText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 8,
  },

  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heroCountPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  catalogPill: {
    marginTop: 16,
    marginHorizontal: 20,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  catalogPillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  listeningBrief: {
    marginTop: 14,
    marginHorizontal: 20,
    minHeight: 96,
    borderRadius: 28,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  listeningBriefIcon: {
    width: 52,
    height: 52,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 13,
  },

  listeningBriefText: {
    flex: 1,
    paddingRight: 10,
  },

  listeningBriefLabel: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  listeningBriefTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },

  listeningBriefSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },

  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 20,
  },

  gridCard: {
    width: (width - 64) / 4,
    height: 88,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 22,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  gridTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },

  sectionRow: {
    marginTop: 40,
    marginBottom: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionHeadingStack: {
    flex: 1,
    paddingRight: 12,
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  seeAllLink: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  continueImage: {
    width: 88,
    height: 88,
    borderRadius: 22,
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

  sectionRowSmall: {
    marginTop: 40,
    marginBottom: 18,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  sectionTitleBlock: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    paddingHorizontal: 20,
    marginTop: 40,
    marginBottom: 18,
  },

  moodRail: {
    paddingLeft: 20,
    paddingRight: 28,
    gap: 12,
    paddingBottom: 12,
  },

  refreshMini: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  footerSpacer: {
    marginTop: 8,
  },

  loadingBox: {
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
  },

  loadingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  loadingText: {
    color: COLORS.textMuted,
    marginLeft: 10,
    fontWeight: "700",
  },

  skeletonRow: {
    flexDirection: "row",
    gap: 12,
  },

  skeletonCard: {
    flex: 1,
    minHeight: 138,
    borderRadius: 20,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  skeletonArtwork: {
    height: 78,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },

  skeletonLineLarge: {
    width: "84%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 8,
  },

  skeletonLineSmall: {
    width: "56%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  emptyBox: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 20,
  },

  featuredSlider: {
    paddingLeft: 20,
    paddingRight: 28,
  },

  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: 272,
    borderRadius: 32,
    marginRight: 16,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  featuredCardActive: {
    borderColor: "rgba(168,85,247,0.65)",
  },

  featuredCover: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },

  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  featuredRank: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },

  featuredRankText: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  featuredContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
  },

  featuredBadge: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },

  featuredBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  featuredTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  featuredArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },

  featuredBottom: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  autoNextPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },

  autoNextText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 6,
  },

  featuredPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaList: {
    paddingHorizontal: 20,
    marginTop: 4,
  },

  mediaShell: {
    position: "relative",
  },

  mediaShellActive: {
    borderRadius: 28,
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  mediaAction: {
    position: "absolute",
    right: 16,
    top: 27,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  artistRow: {
    paddingLeft: 20,
    paddingRight: 28,
    gap: 14,
  },

  artistCard: {
    width: 148,
    borderRadius: 26,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },

  albumCard: {
    width: 162,
    borderRadius: 26,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  artistImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },

  albumImage: {
    width: "100%",
    height: 138,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },

  artistName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  artistMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  rowPlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  showMoreButton: {
    alignSelf: "center",
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },

  showMoreButtonDisabled: {
    opacity: 0.7,
  },

  showMoreText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
