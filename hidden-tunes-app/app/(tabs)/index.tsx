import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import CatalogSongRow from "../../components/catalog/CatalogSongRow";
import NestedSongList from "../../components/catalog/NestedSongList";
import MediaCard from "../../components/MediaCard";
import NeonEQ from "../../components/NeonEQ";
import HTImage from "../../components/HTImage";
import LiveWaveform from "../../components/LiveWaveform";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";
import {
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesSongs,
  getHiddenTunesSongsPage,
  getHiddenTunesAlbumById,
  getHiddenTunesArtistById,
  extractHiddenTunesAlbums,
  extractHiddenTunesArtists,
  hydrateHiddenTunesCatalogCache,
  refreshHiddenTunesSongs,
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
  buildCuratedDiscoverySections,
  buildGenreSpotlights,
  buildMoodRooms,
  buildMoreLikeThisMood,
  buildRecentlyDiscovered,
} from "../../services/smartDiscovery";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import {
  logApiRefresh,
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  logTapToPlay,
  startPerformanceTimer,
} from "../../utils/performanceLogs";
import { trackRenderProbe } from "../../utils/renderDiagnostics";
import {
  LIST_ITEM_HEIGHTS,
  getHorizontalListPerformanceSettings,
  markFastScrolling,
  scheduleNavigationPrewarm,
} from "../../utils/performanceMode";
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

const { width } = Dimensions.get("window");
const FEATURED_CARD_WIDTH = width * 0.72;
const HERO_CARD_WIDTH = width - 40;
const INITIAL_HOME_SONG_ROWS = 8;
const HOME_SONG_ROWS_INCREMENT = 12;
const HERO_AUTO_SLIDE_MS = 7000;
const HOME_SKELETON_KEYS = ["first", "second", "third"];

type HeroCard = {
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
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites } = usePlayerState();

  const initialFeaturedSongsRef = useRef(buildInitialHomeSongs());
  const isLoadingRef = useRef(false);
  const initialHomeLoadRef = useRef(false);
  const featuredSongsCountRef = useRef(initialFeaturedSongsRef.current.length);
  const loadFeaturedSongsRef = useRef<
    (showLoader?: boolean, forceRefresh?: boolean) => Promise<void>
  >(async () => {});
  const scrollRef = useRef<ScrollView>(null);
  const heroListRef = useRef<FlatList<HeroCard>>(null);
  const heroIndexRef = useRef(0);
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const heroScale = useRef(new Animated.Value(0.96)).current;
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
  const [deferredSectionsReady, setDeferredSectionsReady] = useState(false);
  const deferredSectionsScheduledRef = useRef(false);

  useEffect(() => trackRenderProbe("HomeScreen"), []);

  useEffect(() => {
    if (!initialFeaturedSongsRef.current.length) return;

    markFirstCachedContentVisible("home");
    recordSnapshotFallbackUsage("home", initialFeaturedSongsRef.current.length);
    recordOfflineCacheStartup("home", initialFeaturedSongsRef.current.length);
    logScreenReady("home", screenStartedAt, {
      cache: "hit",
      count: initialFeaturedSongsRef.current.length,
      source: "memory_snapshot",
    });
    logPerformanceSummary("home", {
      cache: "hit",
      firstContentMs: Date.now() - screenStartedAt,
      itemCount: initialFeaturedSongsRef.current.length,
    });
  }, [screenStartedAt]);

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

  const loadFeaturedSongs = useCallback(
    async (showLoader = true, forceRefresh = false) => {
      if (isLoadingRef.current && !forceRefresh) return;

      try {
        isLoadingRef.current = true;

        let showedCachedCatalog = featuredSongsCountRef.current > 0;

        if (!forceRefresh) {
          setHasCheckedCatalogFallbacks(false);

          const memorySnapshot = getHiddenTunesCatalogSnapshot();
          if (memorySnapshot.length) {
            applyFeaturedSongs(memorySnapshot);
            setLoadingSongs(false);
            showedCachedCatalog = true;
            markFirstCachedContentVisible("home");
            recordSnapshotFallbackUsage("home", memorySnapshot.length);
            recordOfflineCacheStartup("home", memorySnapshot.length);
            logCacheResult("home", true, {
              count: memorySnapshot.length,
              source: "memory",
            });
          }

          const cached = await hydrateHiddenTunesCatalogCache();

          if (cached.length) {
            applyFeaturedSongs(cached);
            setLoadingSongs(false);
            showedCachedCatalog = true;
            markFirstCachedContentVisible("home");
            recordOfflineCacheStartup("home", cached.length);
            logCacheResult("home", true, { count: cached.length });
            logScreenReady("home", screenStartedAt, {
              cache: "hit",
              count: cached.length,
            });
            logPerformanceSummary("home", {
              cache: "hit",
              firstContentMs: Date.now() - screenStartedAt,
              itemCount: cached.length,
            });
          } else if (showLoader && !showedCachedCatalog) {
            setLoadingSongs(true);
            logCacheResult("home", false);
          }
        } else if (showLoader) {
          setLoadingSongs(true);
        }

        const refreshCatalogFromApi = async () => {
          const refreshStart = startPerformanceTimer();
          const songs = forceRefresh
            ? await refreshHiddenTunesSongs()
            : await getHiddenTunesSongs({ forceRefresh: false });

          applyFeaturedSongs(songs);
          const refreshMs = Date.now() - refreshStart;

          logApiRefresh("home", refreshStart, {
            count: songs.length,
            forceRefresh,
          });
          markFirstApiRefreshComplete("home", refreshMs);
          logPerformanceSummary("home", {
            cache: showedCachedCatalog ? "hit" : "miss",
            apiRefreshMs: refreshMs,
            itemCount: songs.length,
            emptyStateReason: songs.length
              ? "content_available"
              : "cache_api_and_fallback_empty",
          });

          if (!showedCachedCatalog) {
            logScreenReady("home", screenStartedAt, {
              cache: "miss",
              count: songs.length,
            });
          }

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

        if (forceRefresh || !showedCachedCatalog) {
          await refreshCatalogFromApi();
        } else {
          scheduleStartupTask(
            "afterInteraction",
            "home_catalog_api_refresh",
            refreshCatalogFromApi
          );
        }
      } catch {
        if (!featuredSongsCountRef.current) {
          setFeaturedSongs([]);
          setHasMoreSongPages(false);
        }
      } finally {
        isLoadingRef.current = false;
        setHasCheckedCatalogFallbacks(true);
        setLoadingSongs(false);
        setRefreshing(false);
      }
    },
    [applyFeaturedSongs, screenStartedAt]
  );

  loadFeaturedSongsRef.current = loadFeaturedSongs;

  useEffect(() => {
    if (initialHomeLoadRef.current) return;
    initialHomeLoadRef.current = true;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        void loadFeaturedSongsRef.current(true);

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

    InteractionManager.runAfterInteractions(() => {
      setDeferredSectionsReady(true);
    });
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

  const preferenceMaps = useMemo(
    () =>
      buildListenerPreferenceMaps(
        Array.isArray(recentlyPlayed) ? (recentlyPlayed as any) : [],
        Array.isArray(favorites) ? (favorites as any) : []
      ),
    [favorites, recentlyPlayed]
  );

  const rankedSongs = useMemo(
    () => rankSongsForListener(featuredSongs, preferenceMaps),
    [featuredSongs, preferenceMaps]
  );

  const rankedAlbums = useMemo(
    () =>
      rankAlbumsForListener(extractHiddenTunesAlbums(featuredSongs), preferenceMaps),
    [featuredSongs, preferenceMaps]
  );

  const rankedArtists = useMemo(
    () =>
      rankArtistsForListener(extractHiddenTunesArtists(featuredSongs), preferenceMaps),
    [featuredSongs, preferenceMaps]
  );

  const newestSongs = useMemo(
    () => buildRecentlyDiscovered(featuredSongs, 12),
    [featuredSongs]
  );

  const becauseYouListened = useMemo(
    () =>
      buildBecauseYouListened(
        featuredSongs,
        Array.isArray(recentlyPlayed) ? (recentlyPlayed as any) : [],
        Array.isArray(favorites) ? (favorites as any) : [],
        6
      ),
    [featuredSongs, favorites, recentlyPlayed]
  );

  const curatedSections = useMemo(
    () => buildCuratedDiscoverySections(featuredSongs, undefined, preferenceMaps),
    [featuredSongs, preferenceMaps]
  );

  const visibleAllSongs = useMemo(
    () => rankedSongs.slice(0, visibleSongCount),
    [rankedSongs, visibleSongCount]
  );

  const hasMoreCloudSongs = visibleSongCount < featuredSongs.length;

  const moreLikeThisMood = useMemo(
    () => buildMoreLikeThisMood(featuredSongs, currentSong, recentlyPlayed, 6),
    [currentSong, featuredSongs, recentlyPlayed]
  );

  const moodRooms = useMemo(
    () => buildMoodRooms(featuredSongs, preferenceMaps, 8),
    [featuredSongs, preferenceMaps]
  );

  const [activeMoodId, setActiveMoodId] = useState<string | null>(null);

  const genreSpotlights = useMemo(
    () => buildGenreSpotlights(featuredSongs, preferenceMaps, 6),
    [featuredSongs, preferenceMaps]
  );

  const primaryMoodRoom = moodRooms[0];
  const primaryGenreSpotlight = genreSpotlights[0];

  const activeMoodRoom = useMemo(() => {
    const targetId = activeMoodId || primaryMoodRoom?.id;
    return moodRooms.find((room) => room.id === targetId) || primaryMoodRoom;
  }, [activeMoodId, moodRooms, primaryMoodRoom]);

  useEffect(() => {
    if (primaryMoodRoom?.id && !activeMoodId) {
      setActiveMoodId(primaryMoodRoom.id);
    }
  }, [activeMoodId, primaryMoodRoom?.id]);

  useEffect(() => {
    if (!featuredSongs.length || !deferredSectionsReady) return;

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
    deferredSectionsReady,
    featuredSongs.length,
    newestSongs,
    primaryGenreSpotlight?.songs,
    rankedAlbums,
    rankedArtists,
    visibleAllSongs,
  ]);

  useEffect(() => {
    if (!featuredSongs.length || !deferredSectionsReady) return undefined;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      scheduleNavigationPrewarm([
        ...rankedArtists.slice(0, 2).map((artist) => () => {
          void getHiddenTunesArtistById(artist.id);
        }),
        ...rankedAlbums.slice(0, 2).map((album) => () => {
          void getHiddenTunesAlbumById(album.id);
        }),
      ]);
    });

    return () => {
      interactionHandle.cancel();
    };
  }, [deferredSectionsReady, featuredSongs.length, rankedAlbums, rankedArtists]);

  useEffect(() => {
    if (!primaryGenreSpotlight?.title) return undefined;

    return scheduleGenreCatalogPrewarm({
      id: primaryGenreSpotlight.id.replace(/^genre-/, ""),
      title: primaryGenreSpotlight.title,
      query: primaryGenreSpotlight.title,
    });
  }, [primaryGenreSpotlight?.id, primaryGenreSpotlight?.title]);

  useEffect(() => {
    if (!primaryMoodRoom?.title) return undefined;

    return scheduleGenreCatalogPrewarm({
      type: "mood",
      id: primaryMoodRoom.id.replace(/^mood-/, ""),
      title: primaryMoodRoom.title,
      query: `${primaryMoodRoom.title} music`,
    });
  }, [primaryMoodRoom?.id, primaryMoodRoom?.title]);

  const listeningBrief = useMemo(() => {
    if (currentSong) {
      return {
        label: "Continue Listening",
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
        key: `recent-${song.id}`,
        label: "RECENTLY PLAYED",
        title: song.title,
        subtitle: song.artist || "Back in rotation",
        song,
        icon: "time",
      });
    }

    return cards.slice(0, 6);
  }, [currentSong, defaultHeroTrack, featuredSongs, recentlyPlayed]);

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

    try {
      setLoadingMoreSongs(true);

      const nextPage = songPage + 1;
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

  const handleHomeScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceFromBottom < 360) {
        loadMoreCloudSongs();
      }
    },
    [loadMoreCloudSongs]
  );

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
      const active = item.isCurrent || currentSong?.id === String(item.song.id);

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
                  {active ? (
                    <NeonEQ isPlaying={isPlaying && item.isCurrent} size="small" />
                  ) : (
                    <Ionicons name={item.icon} size={13} color={COLORS.primary} />
                  )}

                  <Text style={styles.liveText}>{item.label}</Text>
                </View>

                <Text numberOfLines={1} style={styles.heroSong}>
                  {item.title}
                </Text>

                <Text numberOfLines={1} style={styles.heroArtist}>
                  {item.subtitle}
                </Text>

                {item.isCurrent && (
                  <View style={styles.heroWaveform}>
                    <LiveWaveform isPlaying={isPlaying} size="small" />
                  </View>
                )}

                <View style={styles.heroBottomRow}>
                  <View style={styles.playButton}>
                    <Ionicons
                      name={item.isCurrent && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.playText}>
                      {item.isCurrent ? "OPEN PLAYER" : "PLAY"}
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

  const renderCatalogSongItem = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => {
      const active = currentSong?.id === String(item.id);

      return (
        <View style={[styles.mediaShell, active && styles.mediaShellActive]}>
          <CatalogSongRow
            song={item}
            image={getSongImage(item)}
            active={active}
            isPlaying={isPlaying}
            onPress={playFeaturedSong}
          />
        </View>
      );
    },
    [currentSong?.id, isPlaying, playFeaturedSong]
  );

  const renderSongRow = useCallback(
    (song: HiddenTunesNormalizedSong, sectionId: string) => {
      const active = currentSong?.id === String(song.id);

      return (
        <View style={[styles.mediaShell, active && styles.mediaShellActive]}>
          <CatalogSongRow
            song={song}
            image={getSongImage(song)}
            active={active}
            isPlaying={isPlaying}
            onPress={playFeaturedSong}
          />
        </View>
      );
    },
    [currentSong?.id, isPlaying, playFeaturedSong]
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
    ({ item, index }: { item: HiddenTunesNormalizedSong; index: number }) => {
      const active = currentSong?.id === String(item.id);

      return (
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.featuredCard, active && styles.featuredCardActive]}
          onPress={() => playFeaturedSong(item)}
        >
          <HTImage source={item} style={styles.featuredCover} />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.96)"]}
            style={styles.featuredOverlay}
          />

          <View style={styles.featuredRank}>
            <Text style={styles.featuredRankText}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>

          <View style={styles.featuredContent}>
            <View style={styles.featuredBadge}>
              {active ? (
                <NeonEQ isPlaying={isPlaying} size="small" />
              ) : (
                <Ionicons name="sparkles" size={13} color={COLORS.primary} />
              )}

              <Text style={styles.featuredBadgeText}>
                {active ? "NOW PLAYING" : "HIDDEN TUNES"}
              </Text>
            </View>

            <Text numberOfLines={1} style={styles.featuredTitle}>
              {item.title}
            </Text>

            <Text numberOfLines={1} style={styles.featuredArtist}>
              {item.artist}
            </Text>

            <View style={styles.featuredBottom}>
              <View style={styles.autoNextPill}>
                <Ionicons
                  name="play-skip-forward"
                  size={13}
                  color={COLORS.text}
                />
                <Text style={styles.autoNextText}>Playing next</Text>
              </View>

              <View style={styles.featuredPlay}>
                <Ionicons
                  name={active && isPlaying ? "pause" : "play"}
                  size={18}
                  color="#000"
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [currentSong?.id, isPlaying, playFeaturedSong]
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
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleHomeScroll}
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          scrollEventThrottle={400}
          refreshControl={
            <RefreshControl
              tintColor={COLORS.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
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

          <Text style={styles.heroTitle}>Hidden listening.</Text>

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
                onMomentumScrollEnd={handleHeroMomentumEnd}
              />
            ) : (
              <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
                <View style={styles.heroCard}>
                  <View style={styles.heroEmpty}>
                    {loadingSongs || !hasCheckedCatalogFallbacks ? (
                      <>
                        <View style={styles.heroSkeletonIcon} />
                        <View style={styles.heroSkeletonLineWide} />
                        <View style={styles.heroSkeletonLine} />
                        <Text style={styles.heroEmptySub}>
                          Preparing your catalog...
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons
                          name="musical-notes-outline"
                          size={44}
                          color={COLORS.primary}
                        />
                        <Text style={styles.heroEmptyText}>No songs yet</Text>
                        <Text style={styles.heroEmptySub}>
                          Pull down to refresh.
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </LinearGradient>
            )}
          </Animated.View>

          {heroCards.length > 1 && (
            <View style={styles.heroDots}>
              {heroCards.map((item, index) => (
                <View
                  key={`hero-dot-${item.key}`}
                  style={[
                    styles.heroDot,
                    index === heroIndex && styles.heroDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          <View style={styles.catalogPill}>
            <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
            <Text style={styles.catalogPillText}>
              {featuredSongs.length} songs ready
            </Text>
          </View>

          {currentSong ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Continue Listening</Text>
                <TouchableOpacity onPress={() => router.push("/player" as any)}>
                  <Text style={styles.seeAllLink}>Player</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.continueCard}
                onPress={() => playFeaturedSong(safeSong(currentSong))}
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
                      "Hidden Tunes"}
                  </Text>
                </View>

                <View style={styles.continuePlay}>
                  <Ionicons name="play" size={18} color="#000" />
                </View>
              </TouchableOpacity>
            </>
          ) : null}

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
                key: "premium-tv",
                icon: "tv" as const,
                title: "TV",
                color: "#ff0033",
                onPress: () => router.push("/tv" as any),
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

          {deferredSectionsReady ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Hidden Tunes TV</Text>

                <TouchableOpacity
                  onPress={() => router.push("/tv" as any)}
                  style={styles.tvOpenButton}
                  activeOpacity={0.85}
                >
                  <Ionicons name="tv" size={18} color="#000" />
                  <Text style={styles.tvOpenText}>Open TV</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.tvEmptyCard}
                onPress={() => router.push("/tv" as any)}
              >
                <Ionicons name="tv" size={30} color={COLORS.primary} />
                <Text style={styles.tvEmptyTitle}>Open Hidden Tunes TV</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {deferredSectionsReady && becauseYouListened.length > 0 && (
            <>
              <Text style={styles.sectionTitleBlock}>Because You Listened</Text>

              <View style={styles.mediaList}>
                {becauseYouListened.map((song) => (
                  <Fragment
                    key={`song-${String(song.id || song.title || song.streamUrl || "track")}-because-you-listened`}
                  >
                    {renderSongRow(song, "because-you-listened")}
                  </Fragment>
                ))}
              </View>
            </>
          )}

          {deferredSectionsReady && moreLikeThisMood.songs.length > 0 && (
            <>
              <Text style={styles.sectionTitleBlock}>More Like This Mood</Text>

              <View style={styles.mediaList}>
                {moreLikeThisMood.songs.map((song) => (
                  <Fragment
                    key={`song-${String(song.id || song.title || song.streamUrl || "track")}-more-like-this-mood`}
                  >
                    {renderSongRow(song, "more-like-this-mood")}
                  </Fragment>
                ))}
              </View>
            </>
          )}

          {deferredSectionsReady && rankedArtists.length > 0 && (
            <>
              <Text style={styles.sectionTitleBlock}>Creators In Your Orbit</Text>

              <FlatList
                horizontal
                data={rankedArtists}
                keyExtractor={(item) =>
                  `artist-${item.id || item.name}-creators`
                }
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistRow}
                initialNumToRender={horizontalArtistListTuning.initialNumToRender}
                maxToRenderPerBatch={horizontalArtistListTuning.maxToRenderPerBatch}
                windowSize={horizontalArtistListTuning.windowSize}
                updateCellsBatchingPeriod={
                  horizontalArtistListTuning.updateCellsBatchingPeriod
                }
                removeClippedSubviews
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.artistCard}
                    onPress={() =>
                      router.push({
                        pathname: "/artist/[id]",
                        params: { id: item.id },
                      } as any)
                    }
                  >
                    <HTImage source={item} style={styles.artistImage} />
                    <Text numberOfLines={1} style={styles.artistName}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.artistMeta}>
                      {item.tracks?.length || 0}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {deferredSectionsReady && rankedAlbums.length > 0 && (
            <>
              <Text style={styles.sectionTitleBlock}>Albums Worth Staying With</Text>

              <FlatList
                horizontal
                data={rankedAlbums}
                keyExtractor={(item) =>
                  `album-${item.id || item.title}-albums`
                }
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistRow}
                initialNumToRender={horizontalAlbumListTuning.initialNumToRender}
                maxToRenderPerBatch={horizontalAlbumListTuning.maxToRenderPerBatch}
                windowSize={horizontalAlbumListTuning.windowSize}
                updateCellsBatchingPeriod={
                  horizontalAlbumListTuning.updateCellsBatchingPeriod
                }
                removeClippedSubviews
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.albumCard}
                    onPress={() =>
                      router.push({
                        pathname: "/album/[id]",
                        params: { id: item.id },
                      } as any)
                    }
                  >
                    <HTImage source={item} style={styles.albumImage} />
                    <Text numberOfLines={1} style={styles.artistName}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.artistMeta}>
                      {item.artist}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {deferredSectionsReady ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Recently Added</Text>

                <TouchableOpacity onPress={onRefresh} style={styles.refreshMini}>
                  <Ionicons name="refresh" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>

          {loadingSongs ? (
            <View style={styles.loadingBox}>
              <View style={styles.loadingTitleRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Preparing fresh tracks...</Text>
              </View>
              <HomeSkeletonCards />
            </View>
          ) : featuredSongs.length === 0 && hasCheckedCatalogFallbacks ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyText}>
                Pull down to refresh.
              </Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={newestSongs}
              keyExtractor={(item) =>
                `song-${item.id || item.title}-recently-discovered`
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
            />
          )}

            </>
          ) : null}

          {deferredSectionsReady &&
            curatedSections.map((section) => (
              <View key={`curated-${section.id}`}>
                <View style={styles.sectionRow}>
                  <View style={styles.sectionHeadingStack}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                  </View>

                  {section.genreTitle ? (
                    <TouchableOpacity
                      onPress={() =>
                        openGenreCatalog({
                          id: section.genreTitle,
                          title: section.genreTitle,
                          query: section.genreTitle,
                        })
                      }
                    >
                      <Text style={styles.seeAllLink}>Open room</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <FlatList
                  horizontal
                  data={section.songs}
                  keyExtractor={(item) =>
                    `curated-${section.id}-${item.id || item.title}`
                  }
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={FEATURED_CARD_WIDTH + 16}
                  decelerationRate="fast"
                  contentContainerStyle={styles.featuredSlider}
                  renderItem={renderFeaturedItem}
                  initialNumToRender={featuredSliderTuning.initialNumToRender}
                  maxToRenderPerBatch={featuredSliderTuning.maxToRenderPerBatch}
                  windowSize={featuredSliderTuning.windowSize}
                  updateCellsBatchingPeriod={
                    featuredSliderTuning.updateCellsBatchingPeriod
                  }
                  removeClippedSubviews
                />
              </View>
            ))}

          {deferredSectionsReady && moodRooms.length > 0 && (
            <View key="section-mood-rooms">
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
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              <FlatList
                horizontal
                data={moodRooms}
                keyExtractor={(item) => `mood-${item.id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodRail}
                renderItem={({ item }) => {
                  const active = item.id === activeMoodRoom?.id;
                  const artwork = item.artwork?.[0];

                  return (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={[styles.moodCard, active && styles.moodCardActive]}
                      onPress={() => setActiveMoodId(item.id)}
                    >
                      {artwork ? (
                        <HTImage
                          source={{ uri: String(artwork) }}
                          style={styles.moodCardArt}
                        />
                      ) : (
                        <View style={styles.moodCardArtFallback}>
                          <Ionicons
                            name="radio"
                            size={22}
                            color={COLORS.primary}
                          />
                        </View>
                      )}
                      <Text numberOfLines={2} style={styles.moodCardTitle}>
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />

              {activeMoodRoom ? (
                <View style={styles.mediaList}>
                  {activeMoodRoom.songs.slice(0, 4).map((song) => (
                    <Fragment
                      key={`song-${String(song.id || song.title || song.streamUrl || "track")}-mood-rooms`}
                    >
                      {renderSongRow(song, "mood-rooms")}
                    </Fragment>
                  ))}
                </View>
              ) : null}
            </View>
          )}

          {deferredSectionsReady && primaryGenreSpotlight && (
            <View
              key={`section-${primaryGenreSpotlight.id || primaryGenreSpotlight.title}`}
            >
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

              <View style={styles.mediaList}>
                {primaryGenreSpotlight.songs.slice(0, 4).map((song) => (
                  <Fragment
                    key={`song-${String(song.id || song.title || song.streamUrl || "track")}-genre-spotlights`}
                  >
                    {renderSongRow(song, "genre-spotlights")}
                  </Fragment>
                ))}
              </View>
            </View>
          )}

          {deferredSectionsReady ? (
            <>
              <Text style={styles.sectionTitleBlock}>
                Full Catalog · {visibleAllSongs.length}/{featuredSongs.length}
              </Text>

              <NestedSongList
                screen="home_full_catalog"
                data={visibleAllSongs}
                itemHeight={LIST_ITEM_HEIGHTS.catalogSongRow}
                keyPrefix="home-catalog"
                renderItem={renderCatalogSongItem}
                contentContainerStyle={styles.mediaList}
              />
            </>
          ) : null}

          {deferredSectionsReady && (hasMoreCloudSongs || hasMoreSongPages) && (
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
          )}

          <View style={{ height: 140 }} />
        </ScrollView>
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
    paddingTop: 60,
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

  heroTitle: {
    color: COLORS.text,
    fontSize: 38,
    fontWeight: "900",
    paddingHorizontal: 20,
    marginTop: 26,
    letterSpacing: -0.8,
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
    marginTop: 22,
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

  heroWaveform: {
    height: 28,
    marginBottom: 18,
    overflow: "hidden",
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

  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 18,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    gap: 14,
    paddingBottom: 10,
  },

  moodCard: {
    width: 112,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  moodCardActive: {
    borderColor: "rgba(168,85,247,0.55)",
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  moodCardArt: {
    width: "100%",
    height: 96,
    backgroundColor: COLORS.card,
  },

  moodCardArtFallback: {
    width: "100%",
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  moodCardTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    lineHeight: 16,
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

  tvOpenButton: {
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  tvOpenText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
  },

  tvEmptyCard: {
    marginHorizontal: 20,
    minHeight: 108,
    borderRadius: 28,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  tvEmptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
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
