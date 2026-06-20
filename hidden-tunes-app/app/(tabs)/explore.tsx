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
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";

import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import HTImage from "../../components/HTImage";
import { COLORS, GRADIENTS } from "../../constants/theme";
import { usePlayerActions, usePlayerNowPlaying, usePlayerState } from "../../context/PlayerContext";
import ExploreListHeader, {
  type ExploreListHeaderProps,
  type ExploreMountStage,
} from "../../components/explore/ExploreListHeader";
import MoodRoomCard from "../../components/explore/MoodRoomCard";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import {
  capScreenCatalogSongs,
  MAX_SCREEN_CATALOG_SONGS,
} from "../../utils/screenCatalogLimits";

import {
  getHiddenTunesSecondaryCatalogSections,
  getHiddenTunesSongsPage,
  fetchCoordinatedCatalogFirstPage,
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
import { getSharedDiscoverySnapshot } from "../../services/discoveryCache";
import {
  loadOnboardingPreferences,
  peekOnboardingPreferences,
  type OnboardingPreferences,
} from "../../services/onboardingPreferences";
import type { DiscoverySong } from "../../services/smartDiscovery";
import { hydrateSmartRecommendationsCache } from "../../utils/smartRecommendationsCache";
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
import {
  isWithinFirstInteractionWindow,
  logBackgroundWork,
  scheduleDelayedNonEssentialWork,
} from "../../utils/backgroundWork";
import { scheduleStartupTask } from "../../utils/startupScheduler";
import {
  shouldReplaceCatalogResults,
  shouldResetCatalogFallbackGate,
} from "../../utils/catalogEmptyStateTiming";
import {
  getHorizontalListPerformanceSettings,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import {
  createScrollJankHandler,
  recordScreenOpen,
  useRenderCountProbe,
} from "../../utils/performanceVerification";
import { useRuntimeRenderProbe } from "../../utils/runtimeInstrumentation";
import {
  openGenreCatalog,
  openLaunchWorld,
  openMoodCatalog,
} from "../../utils/catalogNavigation";
import {
  dedupeAdjacentDiscoverySections,
  logCatalogDedupeSummary,
} from "../../utils/catalogDedupe";
import { logExploreGenreGroups } from "../../utils/exploreGenreGroups";
import { normalizeGenreName } from "../../utils/genreNormalization";

const INITIAL_EXPLORE_SNAPSHOT_LIMIT = 160;
const DISCOVERY_COMPUTE_SONG_LIMIT = 220;

type GenreItem = {
  id: string;
  title: string;
  query?: string;
  emoji?: string;
};

const CARD_WIDTH = 150;
const CARD_GAP = 14;
const ARTIST_CARD_WIDTH = 142;

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

type MoodRoomItem = {
  id: string;
  title: string;
  subtitle: string;
  artwork?: string[];
  gradient: readonly [string, string, ...string[]];
};

const ExploreNavCard = memo(function ExploreNavCard({
  item,
  title,
  subtitle,
  onPress,
}: {
  item: any;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.cloudCard} onPress={onPress}>
      <HTImage source={item} style={styles.cloudCover} />
      <Text numberOfLines={1} style={styles.cloudTitle}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.cloudArtist}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
});

const ExploreArtistNavCard = memo(function ExploreArtistNavCard({
  item,
  onPress,
}: {
  item: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.artistCloudCard} onPress={onPress}>
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
  );
});

function buildInitialExploreSongs() {
  const snapshot = getHiddenTunesCatalogSnapshot();
  if (!snapshot.length) return [] as HiddenTunesNormalizedSong[];
  return dedupeSongs(snapshot.slice(0, INITIAL_EXPLORE_SNAPSHOT_LIMIT).map(safeSong));
}

export default memo(function ExploreScreen() {
  useRuntimeRenderProbe("Explore");
  const { playSong } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites } = usePlayerState();
  const [onboardingPrefs, setOnboardingPrefs] = useState<OnboardingPreferences | null>(
    () => peekOnboardingPreferences()
  );

  useEffect(() => {
    void loadOnboardingPreferences().then(setOnboardingPrefs);
    void hydrateSmartRecommendationsCache();
  }, []);
  const listRef = useRef<FlatList<HiddenTunesNormalizedSong>>(null);
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const initialExploreLoadRef = useRef(false);
  const exploreHasSongsRef = useRef(false);
  const exploreSongCountRef = useRef(0);
  const loadExploreRef = useRef<
    (showLoader?: boolean, forceRefresh?: boolean) => Promise<void>
  >(async () => {});

  const [cloudSongs, setCloudSongs] = useState<HiddenTunesNormalizedSong[]>(
    () => buildInitialExploreSongs()
  );
  const [albums, setAlbums] = useState<HiddenTunesAlbum[]>([]);
  const [artists, setArtists] = useState<HiddenTunesArtist[]>([]);
  const [playlists, setPlaylists] = useState<HiddenTunesCloudPlaylist[]>([]);
  const [loading, setLoading] = useState(() => buildInitialExploreSongs().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedDiscoveryFallbacks, setHasCheckedDiscoveryFallbacks] =
    useState(false);
  const [showHeavySections, setShowHeavySections] = useState(false);
  const [songPage, setSongPage] = useState(1);
  const [hasMoreSongs, setHasMoreSongs] = useState(true);
  const [loadingMoreSongs, setLoadingMoreSongs] = useState(false);
  const [exploreMountStage, setExploreMountStage] = useState<ExploreMountStage>(0);
  const exploreStageScheduledRef = useRef(false);
  const exploreStageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const screenMountedRef = useRef(true);

  const logExploreStageReady = useCallback((stage: ExploreMountStage) => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    console.log(`[explore-stage] ready ${stage}`);
  }, []);

  const advanceExploreMountStage = useCallback(
    (stage: ExploreMountStage) => {
      if (stage < 1 || stage > 4) return;

      setExploreMountStage((current) => {
        if (current >= stage) return current;
        logExploreStageReady(stage);
        return stage;
      });
    },
    [logExploreStageReady]
  );

  const scheduleExploreHeaderStages = useCallback(() => {
    if (exploreStageScheduledRef.current) return;
    exploreStageScheduledRef.current = true;

    const scheduleStage = (delayMs: number, stage: ExploreMountStage) => {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          advanceExploreMountStage(stage);
        });
      }, delayMs);
      exploreStageTimersRef.current.push(timer);
    };

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        advanceExploreMountStage(1);
        scheduleStage(80, 2);
        scheduleStage(160, 3);
        scheduleStage(240, 4);
      });
    });
  }, [advanceExploreMountStage]);

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      exploreStageTimersRef.current.forEach(clearTimeout);
      exploreStageTimersRef.current = [];
    };
  }, []);

  // useScrollToTop(listRef);
  useRenderCountProbe("ExploreScreen");

  const listPerformance = useMemo(
    () => getListPerformanceSettings(cloudSongs.length),
    [cloudSongs.length]
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
      const sections = await getHiddenTunesSecondaryCatalogSections({
        forceRefresh,
      });
      if (!screenMountedRef.current) return;

      setAlbums(sections.albums);
      setArtists(sections.artists);
      setPlaylists(sections.playlists.slice(0, 8));
    } catch (error) {
    } finally {
      if (screenMountedRef.current) {
        setShowHeavySections(true);
      }
    }
  }, []);

  const applyExploreSongs = useCallback((nextSongsInput: HiddenTunesNormalizedSong[]) => {
    const nextSongs = capScreenCatalogSongs(
      dedupeSongs((nextSongsInput || []).map(safeSong))
    );
    exploreSongCountRef.current = nextSongs.length;
    exploreHasSongsRef.current = nextSongs.length > 0;
    setCloudSongs(nextSongs);
    setSongPage(1);
    setHasMoreSongs(
      nextSongs.length >= 24 && nextSongs.length < MAX_SCREEN_CATALOG_SONGS
    );
    const sliceForDerivation = nextSongs.slice(0, DISCOVERY_COMPUTE_SONG_LIMIT);
    setAlbums(extractHiddenTunesAlbums(sliceForDerivation));
    setArtists(extractHiddenTunesArtists(sliceForDerivation));
  }, []);

  const loadExplore = useCallback(
    async (showLoader = true, forceRefresh = false) => {
      try {
        let showedCachedCatalog = exploreHasSongsRef.current;
        if (shouldResetCatalogFallbackGate(exploreSongCountRef.current)) {
          setHasCheckedDiscoveryFallbacks(false);
        }

        if (!forceRefresh) {
          const memorySnapshot = getHiddenTunesCatalogSnapshot();
          if (memorySnapshot.length) {
            applyExploreSongs(
              dedupeSongs(
                memorySnapshot.slice(0, INITIAL_EXPLORE_SNAPSHOT_LIMIT).map(safeSong)
              )
            );
            setLoading(false);
            setRefreshing(false);
            showedCachedCatalog = true;
            markFirstCachedContentVisible("explore");
            logCacheResult("explore", true, {
              count: memorySnapshot.length,
              source: "memory",
            });
          } else {
            const cached = await hydrateHiddenTunesCatalogCache();
            if (!screenMountedRef.current) return;

            if (cached.length) {
              applyExploreSongs(
                dedupeSongs(
                  cached.slice(0, INITIAL_EXPLORE_SNAPSHOT_LIMIT).map(safeSong)
                )
              );
              setLoading(false);
              setRefreshing(false);
              showedCachedCatalog = true;
              markFirstCachedContentVisible("explore");
              logCacheResult("explore", true, { count: cached.length });
              logScreenReady("explore", screenStartedAt, {
                cache: "hit",
                count: cached.length,
              });
              recordScreenOpen("explore", {
                openMs: Date.now() - screenStartedAt,
                firstContentMs: Date.now() - screenStartedAt,
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
          }
        } else if (showLoader) {
          setLoading(true);
        }

        const refreshExploreFromApi = async () => {
          const refreshStart = startPerformanceTimer();
          const songResults = forceRefresh
            ? await refreshHiddenTunesSongs()
            : await fetchCoordinatedCatalogFirstPage({ limit: 24 });
          if (!screenMountedRef.current) return;

          const nextSongs = Array.isArray(songResults)
            ? dedupeSongs(songResults.map(safeSong))
            : [];

          if (
            shouldReplaceCatalogResults(nextSongs, exploreSongCountRef.current, {
              allowClearStale: forceRefresh,
            })
          ) {
            applyExploreSongs(nextSongs);
          }
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

          const scheduleSecondarySections = () => {
            if (forceRefresh) {
              void loadCatalogSecondarySections(forceRefresh);
              return;
            }

            scheduleDelayedNonEssentialWork(() => {
              void loadCatalogSecondarySections(false);
            });
          };

          InteractionManager.runAfterInteractions(scheduleSecondarySections);
        };

        if (forceRefresh || !showedCachedCatalog) {
          await refreshExploreFromApi();
        } else {
          scheduleStartupTask(
            "afterInteraction",
            "explore_catalog_api_refresh",
            refreshExploreFromApi
          );
          scheduleDelayedNonEssentialWork(() => {
            void loadCatalogSecondarySections(false);
          });
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
      loadCatalogSecondarySections,
      screenStartedAt,
    ]
  );

  loadExploreRef.current = loadExplore;

  useFocusEffect(
    useCallback(() => {
      if (initialExploreLoadRef.current) return;

      initialExploreLoadRef.current = true;
      void loadExploreRef.current(true, false);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setShowHeavySections(false);
    await loadExplore(false, true);
  }, [loadExplore]);

  const loadMoreSongs = useCallback(async () => {
    if (loadingMoreSongs || !hasMoreSongs) return;

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
      const nextSongs = capScreenCatalogSongs(
        dedupeSongs([
          ...cloudSongs,
          ...(page.songs || []).map(safeSong),
        ])
      );

      if (!screenMountedRef.current) return;

      setCloudSongs(nextSongs);
      setSongPage(nextPage);
      setHasMoreSongs(
        page.hasMore && nextSongs.length < MAX_SCREEN_CATALOG_SONGS
      );
      const sliceForDerivation = nextSongs.slice(0, DISCOVERY_COMPUTE_SONG_LIMIT);
      setAlbums(extractHiddenTunesAlbums(sliceForDerivation));
      setArtists((current) => {
        const derived = extractHiddenTunesArtists(sliceForDerivation);
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

  const listenerRecentlyPlayed = useMemo(
    () => (Array.isArray(recentlyPlayed) ? recentlyPlayed : []) as DiscoverySong[],
    [recentlyPlayed]
  );

  const listenerFavorites = useMemo(
    () => (Array.isArray(favorites) ? favorites : []) as DiscoverySong[],
    [favorites]
  );

  const sharedDiscovery = useMemo(
    () =>
      getSharedDiscoverySnapshot({
        songs: cloudSongs.slice(0, DISCOVERY_COMPUTE_SONG_LIMIT),
        recentlyPlayed: listenerRecentlyPlayed,
        favorites: listenerFavorites,
        albums,
        artists,
        onboarding: onboardingPrefs,
        currentSong,
      }),
    [
      albums,
      artists,
      cloudSongs,
      currentSong,
      listenerFavorites,
      listenerRecentlyPlayed,
      onboardingPrefs,
    ]
  );

  const smartRecommendations = sharedDiscovery.smartRecommendations;

  const rankedAlbums = sharedDiscovery.rankedAlbums;
  const rankedArtists = sharedDiscovery.rankedArtists;
  const moodRooms = useMemo(
    () => sharedDiscovery.moodRooms.slice(0, 6),
    [sharedDiscovery.moodRooms]
  );
  const genreWorlds = useMemo(
    () => sharedDiscovery.genreSpotlights,
    [sharedDiscovery.genreSpotlights]
  );
  const launchWorlds = useMemo(
    () => sharedDiscovery.launchWorlds,
    [sharedDiscovery.launchWorlds]
  );
  const genreHubs = useMemo(
    () => sharedDiscovery.genreHubs,
    [sharedDiscovery.genreHubs]
  );
  const moodCollections = useMemo(
    () => sharedDiscovery.moodCollections,
    [sharedDiscovery.moodCollections]
  );
  const recentlyAdded = sharedDiscovery.recentlyDiscovered;
  const curatedSections = sharedDiscovery.curatedSections;

  const exploreSectionSongs = useMemo(() => {
    const sections = dedupeAdjacentDiscoverySections([
      {
        id: "recommended-for-you",
        songs: smartRecommendations.recommendedForYou.slice(0, 10).map(safeSong),
      },
      {
        id: "because-you-played",
        songs: smartRecommendations.becauseYouPlayed.slice(0, 10).map(safeSong),
      },
      {
        id: "continue-listening",
        songs: smartRecommendations.continueListening.slice(0, 10).map(safeSong),
      },
      {
        id: "rediscover-favorites",
        songs: smartRecommendations.rediscoverFavorites.slice(0, 10).map(safeSong),
      },
      {
        id: "more-like-this",
        songs: smartRecommendations.moreLikeThis.slice(0, 10).map(safeSong),
      },
      {
        id: "recently-added",
        songs: recentlyAdded.slice(0, 10).map(safeSong),
      },
      ...curatedSections.map((section) => ({
        id: section.id,
        songs: section.songs.map(safeSong),
      })),
    ]);

    logCatalogDedupeSummary(
      "explore-sections",
      smartRecommendations.recommendedForYou.length +
        smartRecommendations.becauseYouPlayed.length +
        smartRecommendations.continueListening.length +
        smartRecommendations.rediscoverFavorites.length +
        smartRecommendations.moreLikeThis.length +
        recentlyAdded.length,
      sections.reduce((total, section) => total + section.songs.length, 0)
    );

    const byId = new Map(sections.map((section) => [section.id, section.songs]));

    return {
      recommendedForYou: byId.get("recommended-for-you") || [],
      smartPicks: byId.get("because-you-played") || [],
      continueSongs: byId.get("continue-listening") || [],
      rediscoverFavorites: byId.get("rediscover-favorites") || [],
      moreLikeThis: byId.get("more-like-this") || [],
      recentlyAdded: byId.get("recently-added") || [],
      curatedSections: curatedSections
        .map((section) => ({
          ...section,
          songs: byId.get(section.id) || [],
        }))
        .filter((section) => section.songs.length > 0),
    };
  }, [curatedSections, recentlyAdded, smartRecommendations]);

  const recommendedForYou = exploreSectionSongs.recommendedForYou;
  const smartPicks = exploreSectionSongs.smartPicks;
  const continueSongs = exploreSectionSongs.continueSongs;
  const rediscoverFavorites = exploreSectionSongs.rediscoverFavorites;
  const moreLikeThis = exploreSectionSongs.moreLikeThis;
  const recentlyAddedDeduped = exploreSectionSongs.recentlyAdded;
  const curatedSectionsDeduped = exploreSectionSongs.curatedSections;

  const genreGroupsLoggedRef = useRef<string>("");

  useEffect(() => {
    const signature = genreWorlds.map((genre) => `${genre.id}:${genre.songs.length}`).join("|");
    if (!signature || signature === genreGroupsLoggedRef.current) return;
    genreGroupsLoggedRef.current = signature;
    logExploreGenreGroups(genreWorlds);
  }, [genreWorlds]);

  const primaryMoodRoom = moodRooms[0];

  // Note: Avoid mass artwork preloading on Explore; let visible rows load naturally.

  const openGenre = useCallback((genre: GenreItem) => {
    const title = normalizeGenreName(String(genre.title || "").trim());

    if (!title) return;

    openGenreCatalog({
      id: genre.id || title,
      title,
      query: normalizeGenreName(genre.query) || title,
    });
  }, []);

  const openMood = useCallback((mood: string) => {
    openMoodCatalog(mood);
  }, []);

  const handleOpenLaunchWorld = useCallback((worldId: string) => {
    openLaunchWorld(worldId);
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

        void playSong(normalized as any, queue as any, startIndex).finally(() => {
          logTapToPlay("explore", tapStartedAt, { id: normalized.id });
        });

        requestAnimationFrame(() => {
          router.push("/player" as any);
        });
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

        void playSong(normalized as any, smartQueue as any, startIndex).finally(() => {
          logTapToPlay("explore", tapStartedAt, { id: normalized.id, smart: true });
        });

        requestAnimationFrame(() => {
          router.push("/player" as any);
        });
      } catch (error) {
      }
    },
    [cloudSongs, playSong, smartPicks]
  );

  const handleStartDiscovery = useCallback(() => {
    const first = smartPicks[0] || cloudSongs[0];
    if (first) openSmartPick(first);
  }, [cloudSongs, openSmartPick, smartPicks]);

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

  const renderMoodRoom = useCallback(
    ({ item }: { item: MoodRoomItem }) => (
      <MoodRoomCard
        title={item.title}
        subtitle={item.subtitle}
        artwork={item.artwork?.[0]}
        gradient={item.gradient}
        active={item.id === primaryMoodRoom?.id}
        onPress={() => openMood(item.title)}
      />
    ),
    [openMood, primaryMoodRoom?.id]
  );

  const renderPlaylistItem = useCallback(
    ({ item }: { item: HiddenTunesCloudPlaylist }) => (
      <ExploreNavCard
        item={item}
        title={(item as any).title || (item as any).name || "Playlist"}
        subtitle={
          Array.isArray(item.tracks) ? `${item.tracks.length} tracks` : "Playlist"
        }
        onPress={() =>
          router.push({
            pathname: "/cloud-playlist/[id]",
            params: { id: item.id },
          } as any)
        }
      />
    ),
    []
  );

  const renderAlbumItem = useCallback(
    ({ item }: { item: HiddenTunesAlbum }) => (
      <ExploreNavCard
        item={item}
        title={(item as any).title || (item as any).name || "Album"}
        subtitle={item.artist || "Hidden Tunes"}
        onPress={() =>
          router.push({
            pathname: "/album/[id]",
            params: { id: item.id },
          } as any)
        }
      />
    ),
    []
  );

  const renderArtistItem = useCallback(
    ({ item }: { item: HiddenTunesArtist }) => (
      <ExploreArtistNavCard
        item={item}
        onPress={() =>
          router.push({
            pathname: "/artist/[id]",
            params: { id: item.id },
          } as any)
        }
      />
    ),
    []
  );

  const exploreScrollJankRef = useRef(createScrollJankHandler("explore"));

  const getCloudItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_WIDTH + CARD_GAP,
      offset: (CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    []
  );

  useEffect(() => {
    if (cloudSongs.length > 0) {
      scheduleExploreHeaderStages();
    }
  }, [cloudSongs.length, scheduleExploreHeaderStages]);

  const listHeaderElement = useMemo(
    () => (
      <ExploreListHeader
        mountStage={exploreMountStage}
        loading={loading}
        refreshing={refreshing}
        cloudSongsCount={cloudSongs.length}
        cloudSongs={cloudSongs}
        playSong={playSong as ExploreListHeaderProps["playSong"]}
        hasCheckedDiscoveryFallbacks={hasCheckedDiscoveryFallbacks}
        moodRooms={moodRooms}
        primaryMoodRoomId={primaryMoodRoom?.id}
        smartPicks={smartPicks}
        recommendedForYou={recommendedForYou}
        continueSongs={continueSongs}
        rediscoverFavorites={rediscoverFavorites}
        moreLikeThis={moreLikeThis}
        smartRadioEntries={sharedDiscovery.smartRadioEntries}
        recentlyAdded={recentlyAddedDeduped}
        curatedSections={curatedSectionsDeduped}
        launchWorlds={launchWorlds}
        genreHubs={genreHubs}
        moodCollections={moodCollections}
        genreWorlds={genreWorlds}
        showHeavySections={showHeavySections}
        playlists={playlists}
        rankedAlbums={rankedAlbums}
        rankedArtists={rankedArtists}
        horizontalRailTuning={horizontalRailTuning}
        getCloudItemLayout={getCloudItemLayout}
        onRefresh={onRefresh}
        onStartDiscovery={handleStartDiscovery}
        openGenre={openGenre}
        openMood={openMood}
        onOpenLaunchWorld={handleOpenLaunchWorld}
        renderMoodRoom={renderMoodRoom}
        renderSmartPick={renderSmartPick}
        renderRecentSong={renderRecentSong}
        renderCloudSong={renderCloudSong}
        renderPlaylistItem={renderPlaylistItem}
        renderAlbumItem={renderAlbumItem}
        renderArtistItem={renderArtistItem}
      />
    ),
    [
      cloudSongs,
      continueSongs,
      curatedSectionsDeduped,
      exploreMountStage,
      genreHubs,
      genreWorlds,
      getCloudItemLayout,
      handleOpenLaunchWorld,
      handleStartDiscovery,
      hasCheckedDiscoveryFallbacks,
      horizontalRailTuning,
      loading,
      launchWorlds,
      moreLikeThis,
      moodCollections,
      moodRooms,
      onRefresh,
      openGenre,
      openMood,
      playSong,
      playlists,
      primaryMoodRoom?.id,
      rankedAlbums,
      rankedArtists,
      recommendedForYou,
      rediscoverFavorites,
      recentlyAddedDeduped,
      refreshing,
      renderAlbumItem,
      renderArtistItem,
      renderCloudSong,
      renderMoodRoom,
      renderPlaylistItem,
      renderRecentSong,
      renderSmartPick,
      sharedDiscovery.smartRadioEntries,
      showHeavySections,
      smartPicks,
    ]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        ref={listRef}
        data={[]}
        keyExtractor={(_, index) => `explore-body-${index}`}
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
        onScroll={() => exploreScrollJankRef.current()}
        onScrollBeginDrag={() => markFastScrolling(true)}
        onMomentumScrollBegin={() => markFastScrolling(true)}
        onMomentumScrollEnd={() => markFastScrolling(false)}
        onEndReached={loadMoreSongs}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={listHeaderElement}
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
        renderItem={() => null}
      />
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingTop: 72,
    paddingHorizontal: 20,
    paddingBottom: 180,
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
    marginTop: 28,
    borderRadius: 34,
    padding: 24,
    minHeight: 196,
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
  moodRail: {
    gap: 12,
    paddingBottom: 10,
    paddingRight: 4,
  },
  moodRailSection: {
    marginTop: 10,
    marginBottom: 12,
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
    marginTop: 36,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  sectionEmpty: {
    paddingHorizontal: 4,
    paddingBottom: 18,
  },
  sectionEmptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
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
  cloudRow: {
    gap: CARD_GAP,
    paddingBottom: 32,
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
    height: 138,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  artistCloudImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
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
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
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
    marginTop: 36,
    marginBottom: 18,
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
