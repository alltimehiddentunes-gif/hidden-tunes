import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useScrollToTop } from "@react-navigation/native";
import { router } from "expo-router";

import NeonEQ from "../../components/NeonEQ";
import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import MediaCard from "../../components/MediaCard";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";
import { getCanonicalGenre } from "../../utils/genreAliases";
import { HIDDEN_TUNES_GENRES } from "../../utils/genres";

import { searchArchiveAudio } from "../../services/archiveSearch";
import type { BackendYouTubeTrack } from "../../services/youtubeBackend";
import {
  normalizeArchiveTrack,
  normalizeAudiusTrack,
} from "../../services/musicNormalizer";
import {
  searchHiddenTunesSongsPage,
  getHiddenTunesSongsPage,
  hydrateHiddenTunesCatalogCache,
  getHiddenTunesAlbums,
  getHiddenTunesArtists,
  getHiddenTunesCloudPlaylists,
  getHiddenTunesCatalogSnapshot,
  extractHiddenTunesAlbums,
  extractHiddenTunesArtists,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesCloudPlaylist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
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
  createStableKeyExtractor,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import { trackRenderProbe } from "../../utils/renderDiagnostics";
import {
  getCachedSearchResults,
  setCachedSearchResults,
} from "../../utils/searchQueryCache";
import { openGenreCatalog } from "../../utils/catalogNavigation";
import UniversalSearchGroupedResults from "../../components/UniversalSearchGroupedResults";
import {
  invalidateCatalogSearchIndex,
  runInstantCatalogSearch,
} from "../../services/instantCatalogSearch";
import {
  buildCatalogSearchIndex,
  searchCatalogIndex,
  type CatalogSearchIndex,
} from "../../utils/catalogSearchIndex";
import {
  flattenTvHomeCache,
  runUniversalCatalogSearch,
  type UniversalSearchGroupedResults as GroupedSearchResults,
} from "../../services/universalSearchService";
import {
  fetchTvCatalog,
  loadTvHomeCache,
  type HiddenTunesTvVideo,
} from "../../services/tvCatalogApi";

type SearchType = "all" | "hidden" | "audius" | "archive" | "youtube";

type NativeSearchTrack = {
  id: string;
  title: string;
  artist: string;
  user?: {
    name?: string;
  };
  thumbnail?: string;
  artwork?: string;
  cover?: string;
  source?: "audius" | "archive" | "hidden-tunes";
  sourceName?: "Audius" | "Internet Archive" | "Hidden Tunes" | string;
  streamUrl?: string;
  url?: string;
  duration?: number;
  isOnline?: boolean;
  type: "local" | "audius" | "archive" | "r2";
  [key: string]: any;
};

type SearchResultTrack = NativeSearchTrack | BackendYouTubeTrack;

type YouTubeQueueItem = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnail: string;
};

type GenreItem = {
  id: string;
  title: string;
  query: string;
  emoji: string;
};

const SEARCH_HISTORY_KEY = "hidden_tunes_recent_searches_v4";
const TV_DISCOVERY_CACHE_KEY = "hidden_tunes_tv_discovery_queries_v1";
const WEAK_RESULT_THRESHOLD = 4;
const SEARCH_SKELETON_KEYS = ["one", "two", "three", "four"];
const SEARCH_DEBOUNCE_MS = 380;
const LOCAL_SEARCH_MIN_CHARS = 2;
const API_SEARCH_MIN_CHARS = 3;
const VISIBLE_SONG_LIMIT = 28;

const EMPTY_GROUPED_RESULTS: GroupedSearchResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  tv: [],
  hasAnyResults: false,
};

const TRENDING_SEARCHES = [
  "Caasi Wills",
  "Afrobeats",
  "Amapiano",
  "Gospel Afrobeat",
  "Afro Soul",
  "Dancehall",
  "Ghana music",
  "Naija hits",
];

const SMART_RECOMMENDATIONS = [
  "Late night Afrobeat",
  "Emotional Afro Soul",
  "Workout Afrobeats",
  "African Gospel",
  "Romantic Amapiano",
  "New Afrobeat songs",
];

const FILTERS: { key: SearchType; label: string }[] = [
  { key: "hidden", label: "HIDDEN" },
  { key: "youtube", label: "YOUTUBE" },
  { key: "all", label: "ALL" },
  { key: "audius", label: "AUDIUS" },
  { key: "archive", label: "ARCHIVE" },
];

function sanitizeYouTubeVideoId(value: any) {
  const text = String(value || "").replace("youtube-", "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function normalizeDuration(duration: unknown): number | undefined {
  if (typeof duration === "number") return duration;

  if (typeof duration === "string") {
    const parsed = Number(duration);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function dedupeByKey<
  T extends { id?: string; videoId?: string; url?: string; streamUrl?: string },
>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = String(
      item.videoId || item.id || item.streamUrl || item.url || ""
    ).replace("youtube-", "");

    if (!key) return false;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function isYouTubeTrack(item: any): item is BackendYouTubeTrack {
  return (
    item?.type === "youtube_video" ||
    item?.source === "youtube" ||
    item?.sourceName === "YouTube" ||
    Boolean(item?.videoId)
  );
}

function getCover(item: Partial<SearchResultTrack> | any) {
  return getArtworkUri(item, FALLBACK_ARTWORK);
}

function getArtist(item: Partial<SearchResultTrack> | any) {
  return item?.artist || item?.channelTitle || item?.user?.name || "Unknown Artist";
}

function getYoutubeVideoId(item: Partial<SearchResultTrack>) {
  return sanitizeYouTubeVideoId((item as BackendYouTubeTrack).videoId || item.id);
}

function normalizeYouTubeResult(track: BackendYouTubeTrack): BackendYouTubeTrack {
  const videoId = getYoutubeVideoId(track);
  const artist = String(track.artist || track.channelTitle || "YouTube");

  const cover = String(
    track.thumbnail ||
      track.artwork ||
      track.cover ||
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );

  return {
    ...track,
    id: `youtube-${videoId}`,
    videoId,
    title: String(track.title || "YouTube Music"),
    artist,
    channelTitle: String(track.channelTitle || artist),
    thumbnail: cover,
    artwork: cover,
    cover,
    source: "youtube",
    sourceName: "YouTube",
    type: "youtube_video",
    isYouTube: true,
    isOnline: true,
  };
}

function normalizeNativeResult(item: any): NativeSearchTrack {
  const artist = String(getArtist(item));
  const cover = String(getCover(item));

  const source =
    item.source === "archive"
      ? "archive"
      : item.source === "audius"
        ? "audius"
        : "hidden-tunes";

  const sourceName =
    source === "archive"
      ? "Internet Archive"
      : source === "audius"
        ? "Audius"
        : "Hidden Tunes";

  const type: NativeSearchTrack["type"] =
    source === "archive" ? "archive" : source === "audius" ? "audius" : "r2";

  const id = String(item.id || `${item.title || "track"}-${artist}-${source}`).trim();

  const audioUrl = String(
    item.audioUrl ||
      item.audio_url ||
      item.previewUrl ||
      item.streamUrl ||
      item.url ||
      ""
  );

  return {
    ...item,
    id,
    title: String(item.title || "Unknown Song"),
    artist,
    user: item.user || { name: artist },
    cover,
    thumbnail: item.thumbnail || cover,
    artwork: item.artwork || cover,
    audioUrl,
    audio_url: item.audio_url || audioUrl,
    previewUrl: item.previewUrl || audioUrl,
    url: audioUrl,
    streamUrl: audioUrl,
    duration: normalizeDuration(item.duration),
    source,
    sourceName,
    type,
    isOnline: true,
  };
}

function hasPlayableAudio(song: Partial<NativeSearchTrack>) {
  const audio =
    song.audioUrl ||
    song.audio_url ||
    song.previewUrl ||
    song.streamUrl ||
    song.url;

  return typeof audio === "string" && audio.trim().length > 0;
}

function normalizePlayableSong(item: any): NativeSearchTrack {
  const stream =
    item.audioUrl ||
    item.audio_url ||
    item.previewUrl ||
    item.streamUrl ||
    item.url ||
    "";

  const audioUrl = String(stream).trim();

  return normalizeNativeResult({
    ...item,
    audioUrl,
    audio_url: item.audio_url || audioUrl,
    previewUrl: item.previewUrl || audioUrl,
    streamUrl: item.streamUrl || audioUrl,
    url: item.url || audioUrl,
    source: item.source || "hidden-tunes",
    sourceName: item.sourceName || "Hidden Tunes",
    type: item.type || "r2",
  });
}

function collectGroupedSongPayloads(grouped: GroupedSearchResults) {
  const songs: HiddenTunesNormalizedSong[] = [];

  for (const hit of grouped.songs) {
    if (hit.payload) songs.push(hit.payload as HiddenTunesNormalizedSong);
  }

  for (const hit of grouped.lyrics) {
    if (hit.payload) songs.push(hit.payload as HiddenTunesNormalizedSong);
  }

  for (const hit of grouped.topResults) {
    if (!hit.id.startsWith("song:") && !hit.id.startsWith("lyric:")) continue;
    if (hit.payload) songs.push(hit.payload as HiddenTunesNormalizedSong);
  }

  return songs;
}

function normalizeSearchTrack(item: SearchResultTrack): SearchResultTrack {
  if (isYouTubeTrack(item)) return normalizeYouTubeResult(item);
  return normalizeNativeResult(item);
}

const SearchResultRow = memo(function SearchResultRow({
  item,
  active,
  isPlaying,
  onPress,
  onArtistPress,
  onAlbumPress,
  sourceColorValue,
}: {
  item: SearchResultTrack;
  active: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onArtistPress: () => void;
  onAlbumPress: () => void;
  sourceColorValue: string;
}) {
  const normalized = normalizeSearchTrack(item);
  const youtube = isYouTubeTrack(normalized);
  const artist = String(getArtist(normalized));
  const title = String(normalized.title || "Unknown Song");
  const sourceName = String(normalized.sourceName || "Hidden Tunes");

  if (__DEV__) {
    console.log("[SearchRow] render", {
      id: normalized.id,
      title,
      hasOnPress: Boolean(onPress),
      hasAudio: hasPlayableAudio(normalized as Partial<NativeSearchTrack>),
    });
  }

  return (
    <View style={[styles.resultShell, active && styles.resultShellActive]}>
      <MediaCard
        title={title}
        subtitle={`${artist} • ${sourceName}`}
        image={normalized}
        type={youtube ? "radio" : "song"}
        size="medium"
        showPlayButton={false}
        onPress={onPress}
      />

      <View style={styles.resultOverlayActions}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.artistButton}
          onPress={onArtistPress}
        >
          <Ionicons name="person-outline" size={17} color={COLORS.text} />
        </TouchableOpacity>

        {!youtube && <AddToPlaylistButton track={normalized as any} />}

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.albumButton}
          onPress={onAlbumPress}
        >
          <Ionicons name="albums-outline" size={18} color={COLORS.text} />
        </TouchableOpacity>

        {active ? (
          <View style={styles.eqBox}>
            <NeonEQ isPlaying={isPlaying} size="small" />
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.playButton, youtube && styles.youtubeButton]}
            onPress={onPress}
          >
            <Ionicons
              name={youtube ? "tv" : "play"}
              size={20}
              color={youtube ? "#fff" : "#000"}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sourceBadge}>
        <Ionicons
          name={youtube ? "tv" : "cloud-done"}
          size={13}
          color={sourceColorValue}
        />

        <Text style={[styles.sourceBadgeText, { color: sourceColorValue }]}>
          {youtube ? "Hidden Tunes TV" : sourceName}
        </Text>
      </View>
    </View>
  );
});

function SearchSkeletonRows() {
  return (
    <View style={styles.searchSkeletonList}>
      {SEARCH_SKELETON_KEYS.map((item) => (
        <View key={`search-skeleton-${item}`} style={styles.searchSkeletonRow}>
          <View style={styles.searchSkeletonArtwork} />
          <View style={styles.searchSkeletonText}>
            <View style={styles.searchSkeletonLineLarge} />
            <View style={styles.searchSkeletonLineSmall} />
          </View>
          <View style={styles.searchSkeletonButton} />
        </View>
      ))}
    </View>
  );
}

export default function SearchScreen() {
  const { playSong, stopPlayback } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchDebounceGenerationRef = useRef(0);
  const resultListRef = useRef<FlatList<SearchResultTrack>>(null);
  const catalogIndexRef = useRef<{
    songCount: number;
    index: CatalogSearchIndex;
  } | null>(null);
  const searchTapAlertShownRef = useRef(false);
  const screenStartedAt = useRef(startPerformanceTimer()).current;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSource, setActiveSource] = useState<SearchType>("all");
  const [tvFallbackQuery, setTvFallbackQuery] = useState("");
  const [tvFallbackReason, setTvFallbackReason] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreHiddenResults, setHasMoreHiddenResults] = useState(false);
  const [loadingMoreResults, setLoadingMoreResults] = useState(false);
  const [hasCheckedSearchFallbacks, setHasCheckedSearchFallbacks] =
    useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [cloudSongs, setCloudSongs] = useState<NativeSearchTrack[]>([]);
  const [cloudAlbums, setCloudAlbums] = useState<HiddenTunesAlbum[]>([]);
  const [cloudArtists, setCloudArtists] = useState<HiddenTunesArtist[]>([]);
  const [cloudPlaylists, setCloudPlaylists] = useState<HiddenTunesCloudPlaylist[]>(
    []
  );
  const [fullCatalogSongs, setFullCatalogSongs] = useState<
    HiddenTunesNormalizedSong[]
  >([]);
  const [tvIndexVideos, setTvIndexVideos] = useState<HiddenTunesTvVideo[]>([]);
  const [tvSearchVideos, setTvSearchVideos] = useState<HiddenTunesTvVideo[]>([]);
  const [fuzzyGroupedResults, setFuzzyGroupedResults] =
    useState<GroupedSearchResults | null>(null);

  const matchedGenres = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();

    if (!safeQuery || safeQuery.length < 2) {
      return HIDDEN_TUNES_GENRES.slice(0, 10);
    }

    return HIDDEN_TUNES_GENRES.filter((genre) => {
      const aliasMatch = (genre.aliases || []).some((alias) =>
        alias.toLowerCase().includes(safeQuery)
      );
      const resolvesToGenre = getCanonicalGenre(safeQuery) === genre.title;

      return (
        genre.title.toLowerCase().includes(safeQuery) ||
        genre.id.toLowerCase().includes(safeQuery) ||
        genre.query.toLowerCase().includes(safeQuery) ||
        aliasMatch ||
        resolvesToGenre
      );
    }).slice(0, 10);
  }, [query]);

  const playableResults = useMemo(() => {
    return dedupeByKey(
      results
        .filter((item) => !isYouTubeTrack(item))
        .map((item) => normalizeNativeResult(item))
    );
  }, [results]);

  const continueListening = useMemo(() => {
    if (playableResults.length > 0) return playableResults.slice(0, 8);
    return cloudSongs.slice(0, 8);
  }, [playableResults, cloudSongs]);

  const trimmedQuery = query.trim();
  const emptySearchMode = trimmedQuery.length < LOCAL_SEARCH_MIN_CHARS;
  const showGroupedSearch = trimmedQuery.length >= LOCAL_SEARCH_MIN_CHARS;

  const universalCatalog = useMemo(
    () => ({
      songs:
        fullCatalogSongs.length > 0
          ? fullCatalogSongs
          : getHiddenTunesCatalogSnapshot(),
      albums: cloudAlbums,
      artists: cloudArtists,
      genres: HIDDEN_TUNES_GENRES,
      tvVideos: (() => {
        const seen = new Set<string>();
        return [...tvSearchVideos, ...tvIndexVideos].filter((video) => {
          if (!video?.id || seen.has(video.id)) return false;
          seen.add(video.id);
          return true;
        });
      })(),
    }),
    [
      cloudAlbums,
      cloudArtists,
      fullCatalogSongs,
      tvIndexVideos,
      tvSearchVideos,
    ]
  );

  const instantGroupedResults = useMemo(() => {
    if (!showGroupedSearch) return EMPTY_GROUPED_RESULTS;
    return runInstantCatalogSearch(universalCatalog, trimmedQuery);
  }, [showGroupedSearch, trimmedQuery, universalCatalog]);

  const groupedSearchResults = useMemo(() => {
    if (!showGroupedSearch) return EMPTY_GROUPED_RESULTS;
    if (!fuzzyGroupedResults?.hasAnyResults) return instantGroupedResults;

    return {
      ...fuzzyGroupedResults,
      songs:
        fuzzyGroupedResults.songs.length > 0
          ? fuzzyGroupedResults.songs
          : instantGroupedResults.songs,
      topResults:
        fuzzyGroupedResults.topResults.length > 0
          ? fuzzyGroupedResults.topResults
          : instantGroupedResults.topResults,
      hasAnyResults:
        fuzzyGroupedResults.hasAnyResults || instantGroupedResults.hasAnyResults,
    };
  }, [fuzzyGroupedResults, instantGroupedResults, showGroupedSearch]);

  const visibleSongResults = useMemo(() => {
    if (!showGroupedSearch) return [] as NativeSearchTrack[];

    const startedAt = Date.now();
    const seen = new Set<string>();
    const collected: NativeSearchTrack[] = [];

    const addSong = (raw: HiddenTunesNormalizedSong | NativeSearchTrack) => {
      const normalized = normalizePlayableSong({
        ...raw,
        source: "hidden-tunes",
        sourceName: "Hidden Tunes",
        type: "r2",
      });

      if (!normalized.id || seen.has(normalized.id)) return;
      if (collected.length >= VISIBLE_SONG_LIMIT) return;

      seen.add(normalized.id);
      collected.push(normalized);
    };

    for (const song of collectGroupedSongPayloads(groupedSearchResults)) {
      addSong(song);
    }

    const catalogSongs = universalCatalog.songs;
    if (collected.length < VISIBLE_SONG_LIMIT && catalogSongs.length > 0) {
      if (
        !catalogIndexRef.current ||
        catalogIndexRef.current.songCount !== catalogSongs.length
      ) {
        catalogIndexRef.current = {
          songCount: catalogSongs.length,
          index: buildCatalogSearchIndex(catalogSongs),
        };
      }

      const extraMatches = searchCatalogIndex(
        catalogIndexRef.current.index,
        trimmedQuery,
        VISIBLE_SONG_LIMIT
      );

      for (const song of extraMatches) {
        addSong(song);
        if (collected.length >= VISIBLE_SONG_LIMIT) break;
      }
    }

    if (__DEV__) {
      const localMs = Date.now() - startedAt;
      console.log("[Search:local]", {
        query: trimmedQuery,
        localResultCount: collected.length,
        localSearchMs: localMs,
        source: catalogSongs.length > 0 ? "catalog/cache" : "empty",
      });
    }

    return collected;
  }, [
    groupedSearchResults,
    showGroupedSearch,
    trimmedQuery,
    universalCatalog.songs,
  ]);

  useEffect(() => {
    setFuzzyGroupedResults(null);
  }, [trimmedQuery]);

  useEffect(() => {
    if (trimmedQuery.length < LOCAL_SEARCH_MIN_CHARS) {
      setFuzzyGroupedResults(null);
      return;
    }

    const handle = setTimeout(() => {
      setFuzzyGroupedResults(runUniversalCatalogSearch(universalCatalog, trimmedQuery));
    }, 140);

    return () => clearTimeout(handle);
  }, [trimmedQuery, universalCatalog]);

  useEffect(() => {
    if (fullCatalogSongs.length > 0) {
      invalidateCatalogSearchIndex();
      catalogIndexRef.current = null;
    }
  }, [fullCatalogSongs]);

  useScrollToTop(resultListRef);
  useEffect(() => trackRenderProbe("SearchScreen"), []);

  const resultKeyExtractor = useMemo(
    () => createStableKeyExtractor("search-result"),
    []
  );

  const resultListPerformance = useMemo(
    () => getListPerformanceSettings(results.length),
    [results.length]
  );

  useEffect(() => {
    loadRecentSearches();
    loadCloudDiscovery(true);

    void loadTvHomeCache().then((cache) => {
      if (!cache?.lanes?.length) return;
      setTvIndexVideos(flattenTvHomeCache(cache.lanes));
    });

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const safeQuery = trimmedQuery;
    if (safeQuery.length < LOCAL_SEARCH_MIN_CHARS) {
      setTvSearchVideos([]);
      return;
    }

    let cancelled = false;

    void fetchTvCatalog({ q: safeQuery, limit: 40 }).then((response) => {
      if (cancelled || !response.success) return;
      setTvSearchVideos(response.videos || []);
    });

    return () => {
      cancelled = true;
    };
  }, [trimmedQuery]);

  async function loadRecentSearches() {
    try {
      const saved = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch (error) {
    }
  }

  async function saveRecentSearch(text: string) {
    const clean = text.trim();
    if (!clean || clean.length < 2) return;

    const next = [clean, ...recentSearches.filter((item) => item !== clean)].slice(
      0,
      12
    );

    setRecentSearches(next);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  }

  async function saveTvDiscoveryQuery(text: string) {
    const clean = text.trim();
    if (!clean || clean.length < 2) return;

    try {
      const saved = await AsyncStorage.getItem(TV_DISCOVERY_CACHE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      const current = Array.isArray(parsed) ? parsed : [];
      const next = [clean, ...current.filter((item) => item !== clean)].slice(
        0,
        20
      );

      await AsyncStorage.setItem(TV_DISCOVERY_CACHE_KEY, JSON.stringify(next));
    } catch (error) {
    }
  }

  async function clearRecentSearches() {
    setRecentSearches([]);
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  }

  async function loadCloudDiscovery(showLoader = true) {
    const refreshStart = startPerformanceTimer();

    try {
      if (showLoader) setLoadingCloud(true);

      const cached = await hydrateHiddenTunesCatalogCache();

      if (cached.length) {
        invalidateCatalogSearchIndex();
        setFullCatalogSongs(cached);
        setCloudSongs(
          dedupeByKey(
            cached.slice(0, 24).map((item: any) =>
              normalizeNativeResult({
                ...item,
                source: "hidden-tunes",
                sourceName: "Hidden Tunes",
                type: "r2",
              })
            )
          )
        );
        setCloudAlbums(extractHiddenTunesAlbums(cached));
        setCloudArtists(
          extractHiddenTunesArtists(cached).slice(0, 12) as any
        );
        setLoadingCloud(false);
        logCacheResult("search", true, { count: cached.length });
        logScreenReady("search", screenStartedAt, {
          cache: "hit",
          count: cached.length,
        });
        logPerformanceSummary("search", {
          cache: "hit",
          firstContentMs: Date.now() - screenStartedAt,
          itemCount: cached.length,
        });
      } else {
        logCacheResult("search", false);
      }

      const songs = await getHiddenTunesSongsPage({ page: 1, limit: 24 }).then(
        (page) => page.songs
      );

      const catalogSnapshot = getHiddenTunesCatalogSnapshot();
      if (catalogSnapshot.length) {
        setFullCatalogSongs(catalogSnapshot);
      } else if (songs.length) {
        setFullCatalogSongs(songs);
      }

      setCloudSongs(
        dedupeByKey(
          (songs || []).map((item: any) =>
            normalizeNativeResult({
              ...item,
              source: "hidden-tunes",
              sourceName: "Hidden Tunes",
              type: "r2",
            })
          )
        )
      );
      logApiRefresh("search_discovery", refreshStart, {
        count: songs.length,
      });

      if (!cached.length) {
        logScreenReady("search", screenStartedAt, {
          cache: "miss",
          count: songs.length,
        });
        logPerformanceSummary("search", {
          cache: "miss",
          apiRefreshMs: Date.now() - refreshStart,
          itemCount: songs.length,
          emptyStateReason: songs.length
            ? "content_available"
            : "cache_api_and_fallback_empty",
        });
      }

      void Promise.allSettled([
        getHiddenTunesAlbums({ forceRefresh: false }),
        getHiddenTunesArtists({ forceRefresh: false }),
        getHiddenTunesCloudPlaylists(),
      ]).then(([albumsResult, artistsResult, playlistsResult]) => {
        if (albumsResult.status === "fulfilled") {
          setCloudAlbums(albumsResult.value || []);
        }

        if (artistsResult.status === "fulfilled") {
          setCloudArtists(artistsResult.value || []);
        }

        if (playlistsResult.status === "fulfilled") {
          setCloudPlaylists(playlistsResult.value || []);
        }
      });
    } catch {
    } finally {
      setLoadingCloud(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCloudDiscovery(false);

    if (query.trim().length >= API_SEARCH_MIN_CHARS) {
      await searchTracks(query, activeSource);
    } else {
      setRefreshing(false);
    }
  }, [activeSource, query]);

  function sourceColor(source?: string) {
    if (source === "YouTube" || source === "youtube") return "#ff0033";
    if (source === "Internet Archive" || source === "archive") {
      return COLORS.pink || "#ec4899";
    }
    if (source === "Hidden Tunes" || source === "hidden-tunes") {
      return COLORS.primary;
    }

    return COLORS.primary;
  }

  const buildYouTubeQueue = useCallback(() => {
    const queue: YouTubeQueueItem[] = results
      .filter((track) => isYouTubeTrack(track))
      .map((track) => {
        const normalized = normalizeYouTubeResult(track);
        const videoId = getYoutubeVideoId(normalized);

        return {
          id: videoId,
          videoId,
          title: String(normalized.title || "YouTube Music"),
          artist: String(getArtist(normalized)),
          channelTitle: String(normalized.channelTitle || getArtist(normalized)),
          thumbnail: String(getCover(normalized)),
        };
      })
      .filter((track) => track.videoId.length === 11);

    return dedupeByKey(queue);
  }, [results]);

  async function searchTracks(text: string, source: SearchType = activeSource) {
    const safeText = String(text || "").trim();
    const requestId = ++searchRequestIdRef.current;
    const refreshStart = startPerformanceTimer();

    setTvFallbackQuery("");
    setTvFallbackReason("");
    setSearchPage(1);
    setHasMoreHiddenResults(false);
    setHasCheckedSearchFallbacks(false);

    if (!safeText || safeText.length < LOCAL_SEARCH_MIN_CHARS) {
      setResults([]);
      setHasCheckedSearchFallbacks(true);
      return;
    }

    if (safeText.length < API_SEARCH_MIN_CHARS) {
      setHasCheckedSearchFallbacks(true);
      setLoading(false);
      return;
    }

    const cachedResults = await getCachedSearchResults<SearchResultTrack>(
      safeText,
      source
    );
    let showedCachedResults = false;

    if (
      cachedResults?.length &&
      requestId === searchRequestIdRef.current
    ) {
      setResults(cachedResults);
      setHasCheckedSearchFallbacks(true);
      setLoading(false);
      showedCachedResults = true;
      logCacheResult("search_results", true, {
        query: safeText,
        source,
        count: cachedResults.length,
      });
    } else if (safeText.length < LOCAL_SEARCH_MIN_CHARS) {
      setLoading(true);
      logCacheResult("search_results", false, { query: safeText, source });
    } else {
      logCacheResult("search_results", false, { query: safeText, source });
    }

    try {
      await saveRecentSearch(safeText);

      if (source === "youtube") {
        if (requestId !== searchRequestIdRef.current) return;

        await saveTvDiscoveryQuery(safeText);
        setLoading(false);
        setRefreshing(false);
        router.push({
          pathname: "/tv",
          params: { q: safeText },
        } as any);
        return;
      }

      const finalResults: SearchResultTrack[] = [];

      if (source === "all" || source === "hidden") {
        try {
          const hiddenTunesPage = await searchHiddenTunesSongsPage(safeText, 1, 30);
          const hiddenTunesResults = hiddenTunesPage.songs;
          setHasMoreHiddenResults(hiddenTunesPage.hasMore);

          finalResults.push(
            ...hiddenTunesResults.map((item: any) =>
              normalizeNativeResult({
                ...item,
                source: "hidden-tunes",
                sourceName: "Hidden Tunes",
                type: "r2",
              })
            )
          );
        } catch (error) {
        }
      }

      if (source === "all" || source === "audius") {
        try {
          const response = await fetch(
            `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
              safeText
            )}`
          );

          const rawText = await response.text();

          if (rawText.trim().startsWith("{")) {
            const json = JSON.parse(rawText);

            finalResults.push(
              ...(json.data || []).map((item: any) => {
                const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${item.id}/stream`;

                return normalizeNativeResult({
                  ...normalizeAudiusTrack({
                    ...item,
                    streamUrl,
                    source: "audius",
                  }),
                  source: "audius",
                  sourceName: "Audius",
                  type: "audius",
                  cover:
                    item.artwork?.["480x480"] ||
                    item.artwork?.["1000x1000"] ||
                    item.artwork?.["150x150"] ||
                    "",
                  streamUrl,
                  url: streamUrl,
                });
              })
            );
          }
        } catch (error) {
        }
      }

      if (source === "all" || source === "archive") {
        try {
          const archiveResults = await searchArchiveAudio(safeText);

          finalResults.push(
            ...archiveResults.map((item: any) =>
              normalizeNativeResult({
                ...normalizeArchiveTrack({
                  ...item,
                  source: "archive",
                }),
                source: "archive",
                sourceName: "Internet Archive",
                type: "archive",
                cover: item.cover || item.artwork || item.thumbnail || "",
              })
            )
          );
        } catch (error) {
        }
      }

      const normalizedResults = dedupeByKey(
        finalResults.map((item) => normalizeSearchTrack(item))
      );
      logApiRefresh("search_results", refreshStart, {
        query: safeText,
        source,
        count: normalizedResults.length,
      });

      if (
        source === "all" &&
        normalizedResults.filter((item) => !isYouTubeTrack(item)).length <
          WEAK_RESULT_THRESHOLD
      ) {
        setTvFallbackQuery(safeText);
        setTvFallbackReason(
          normalizedResults.length > 0
            ? "Hidden Tunes matches are limited — expand with Hidden Tunes TV."
            : "No Hidden Tunes matches yet — showing Hidden Tunes TV results."
        );
        await saveTvDiscoveryQuery(safeText);
      }

      if (requestId !== searchRequestIdRef.current) return;

      setResults(normalizedResults);
      await setCachedSearchResults(safeText, source, normalizedResults);
      logPerformanceSummary("search_results", {
        cache: showedCachedResults ? "hit" : "miss",
        apiRefreshMs: Date.now() - refreshStart,
        itemCount: normalizedResults.length,
        emptyStateReason: normalizedResults.length
          ? "content_available"
          : "cache_api_and_fallback_empty",
      });
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;

      if (!showedCachedResults) {
        setResults([]);
      }

      setTvFallbackQuery(safeText);
      setTvFallbackReason(
        "No Hidden Tunes matches yet — showing Hidden Tunes TV results."
      );
      await saveTvDiscoveryQuery(safeText);
    } finally {
      if (requestId !== searchRequestIdRef.current) return;

      setHasCheckedSearchFallbacks(true);
      setLoading(false);
      setRefreshing(false);
    }
  }

  const loadMoreHiddenSearchResults = useCallback(async () => {
    const safeText = query.trim();

    if (
      loadingMoreResults ||
      !hasMoreHiddenResults ||
      safeText.length < API_SEARCH_MIN_CHARS ||
      activeSource === "youtube" ||
      activeSource === "audius" ||
      activeSource === "archive"
    ) {
      return;
    }

    try {
      setLoadingMoreResults(true);

      const nextPage = searchPage + 1;
      const page = await searchHiddenTunesSongsPage(safeText, nextPage, 30);
      const nextResults = page.songs.map((item: any) =>
        normalizeNativeResult({
          ...item,
          source: "hidden-tunes",
          sourceName: "Hidden Tunes",
          type: "r2",
        })
      );

      setResults((current) =>
        dedupeByKey([
          ...current,
          ...nextResults.map((item) => normalizeSearchTrack(item)),
        ])
      );
      setSearchPage(nextPage);
      setHasMoreHiddenResults(page.hasMore);
    } catch (error) {
    } finally {
      setLoadingMoreResults(false);
    }
  }, [
    activeSource,
    hasMoreHiddenResults,
    loadingMoreResults,
    query,
    searchPage,
  ]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);

    const safeText = String(text || "").trim();

    if (safeText.length < LOCAL_SEARCH_MIN_CHARS) {
      setResults([]);
      setHasCheckedSearchFallbacks(true);
      setLoading(false);
    }
  }, []);

  const commitSearch = useCallback(
    (text: string, source: SearchType = activeSource) => {
      handleQueryChange(text);

      const safeText = String(text || "").trim();
      if (safeText.length >= API_SEARCH_MIN_CHARS) {
        void searchTracks(text, source);
      }
    },
    [activeSource, handleQueryChange]
  );

  const scheduleNetworkSearch = useCallback(
    (text: string, source: SearchType = activeSource) => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      const generation = ++searchDebounceGenerationRef.current;
      const safeText = String(text || "").trim();

      if (safeText.length < API_SEARCH_MIN_CHARS) {
        setHasCheckedSearchFallbacks(true);
        setLoading(false);
        return;
      }

      if (!showGroupedSearch) {
        setLoading(true);
      }

      searchTimeoutRef.current = setTimeout(() => {
        if (generation !== searchDebounceGenerationRef.current) return;
        void searchTracks(text, source);
      }, SEARCH_DEBOUNCE_MS);
    },
    [activeSource, showGroupedSearch]
  );

  const handleSongResultPress = useCallback(
    (rawSong: HiddenTunesNormalizedSong | NativeSearchTrack | any, index: number) => {
      const song = normalizePlayableSong(rawSong);
      const queue = visibleSongResults.map((item) => normalizePlayableSong(item));
      const safeIndex = Math.max(
        0,
        queue.findIndex((item) => String(item.id) === String(song.id))
      );

      const hasAudio = hasPlayableAudio(song);

      console.log("[SearchTap] pressed", {
        id: song?.id,
        title: song?.title,
        index,
        safeIndex,
        queueLength: queue.length,
        hasAudio,
      });

      if (__DEV__ && !searchTapAlertShownRef.current) {
        searchTapAlertShownRef.current = true;
        Alert.alert(
          "Search tap",
          `${song?.title || "Song"}\nqueue=${queue.length} index=${safeIndex >= 0 ? safeIndex : index}`
        );
      }

      if (!hasAudio) {
        console.warn("[SearchTap] missing audio — playback skipped", {
          id: song?.id,
          title: song?.title,
        });
        return;
      }

      if (queue.length === 0) {
        console.warn("[SearchTap] empty visibleSongResults queue", {
          id: song?.id,
          title: song?.title,
        });
        return;
      }

      if (safeIndex < 0) {
        console.warn("[SearchTap] song not in visibleSongResults", {
          id: song?.id,
          title: song?.title,
          queueLength: queue.length,
        });
        return;
      }

      const playIndex = safeIndex;

      void playSong(song, queue, playIndex).catch((error: unknown) => {
        console.warn("[SearchTap] playSong failed", error);
      });

      requestAnimationFrame(() => {
        router.push("/player" as any);
      });
    },
    [playSong, visibleSongResults]
  );

  const openGenre = useCallback((genre: GenreItem) => {
    openGenreCatalog({
      id: genre.id,
      title: genre.title,
      query: genre.query,
    });
  }, []);

  const openAlbumFromTrack = useCallback((item: SearchResultTrack) => {
    const normalized = normalizeSearchTrack(item);
    const artist = String(getArtist(normalized));
    const cover = String(getCover(normalized));

    if (!isYouTubeTrack(normalized) && (normalized as any).albumId) {
      router.push({
        pathname: "/album/[id]",
        params: {
          id: String((normalized as any).albumId),
        },
      } as any);
      return;
    }

    router.push({
      pathname: "/album",
      params: {
        album: `${artist} Essentials`,
        artist,
        thumbnail: cover,
        query: `${artist} album songs`,
      },
    } as any);
  }, []);

  const openArtistFromTrack = useCallback((item: SearchResultTrack) => {
    const normalized = normalizeSearchTrack(item);
    const artist = String(getArtist(normalized));

    if (!isYouTubeTrack(normalized) && (normalized as any).artistId) {
      router.push({
        pathname: "/artist/[id]",
        params: {
          id: String((normalized as any).artistId),
        },
      } as any);
      return;
    }

    router.push({
      pathname: "/artist",
      params: { artist },
    } as any);
  }, []);

  const openSearchRadio = useCallback(() => {
    const safeQuery = query.trim() || "afrobeats";

    router.push({
      pathname: "/radio",
      params: {
        title: `${safeQuery} Radio`,
        query: `${safeQuery} music`,
      },
    } as any);
  }, [query]);

  const openTvFallback = useCallback(
    (value = tvFallbackQuery || query) => {
      const safeQuery = String(value || "").trim();

      if (!safeQuery) {
        router.push("/tv" as any);
        return;
      }

      router.push({
        pathname: "/tv",
        params: { q: safeQuery },
      } as any);
    },
    [query, tvFallbackQuery]
  );

  const handlePress = useCallback(
    async (item: SearchResultTrack) => {
      if (isYouTubeTrack(item)) {
        await stopPlayback();

        const normalizedTrack = normalizeYouTubeResult(item);
        const videoId = getYoutubeVideoId(normalizedTrack);

        if (!videoId) {
          return;
        }

        const youtubeQueue = buildYouTubeQueue();

        const startIndex = Math.max(
          0,
          youtubeQueue.findIndex((track) => track.videoId === videoId)
        );

        router.push({
          pathname: "/youtube-player",
          params: {
            id: videoId,
            videoId,
            title: normalizedTrack.title,
            artist: normalizedTrack.artist,
            channelTitle: normalizedTrack.channelTitle,
            thumbnail: normalizedTrack.thumbnail,
            startIndex: String(startIndex),
            queue: JSON.stringify(youtubeQueue),
          },
        } as any);

        return;
      }

      handleSongResultPress(item, 0);
    },
    [buildYouTubeQueue, handleSongResultPress, stopPlayback]
  );

  const renderResult = useCallback(
    ({ item, index }: { item: SearchResultTrack; index: number }) => {
      const normalized = normalizeSearchTrack(item);
      const youtube = isYouTubeTrack(normalized);
      const active = currentSong?.id === normalized.id && !youtube;
      const sourceName = String(normalized.sourceName || "Hidden Tunes");

      const onRowPress = () => {
        if (youtube) {
          void handlePress(item);
          return;
        }

        handleSongResultPress(item, index);
      };

      return (
        <SearchResultRow
          item={item}
          active={active}
          isPlaying={isPlaying}
          onPress={onRowPress}
          onArtistPress={() => openArtistFromTrack(item)}
          onAlbumPress={() => openAlbumFromTrack(item)}
          sourceColorValue={sourceColor(sourceName)}
        />
      );
    },
    [
      currentSong?.id,
      handlePress,
      handleSongResultPress,
      isPlaying,
      openAlbumFromTrack,
      openArtistFromTrack,
      visibleSongResults,
    ]
  );

  const renderChip = useCallback(
    (text: string, icon: keyof typeof Ionicons.glyphMap) => (
      <TouchableOpacity
        key={text}
        activeOpacity={0.85}
        style={styles.smartChip}
        onPress={() => commitSearch(text, activeSource)}
      >
        <Ionicons name={icon} size={14} color={COLORS.primary} />
        <Text style={styles.smartChipText}>{text}</Text>
      </TouchableOpacity>
    ),
    [activeSource]
  );

  const openGroupedSong = useCallback(
    (song: HiddenTunesNormalizedSong) => {
      const index = visibleSongResults.findIndex(
        (item) => String(item.id) === String(song?.id)
      );
      handleSongResultPress(song, index >= 0 ? index : 0);
    },
    [handleSongResultPress, visibleSongResults]
  );

  const openGroupedArtist = useCallback((artist: HiddenTunesArtist) => {
    router.push({
      pathname: "/artist/[id]",
      params: { id: String(artist.id) },
    } as any);
  }, []);

  const openGroupedAlbum = useCallback((album: HiddenTunesAlbum) => {
    router.push({
      pathname: "/album/[id]",
      params: { id: String(album.id) },
    } as any);
  }, []);

  const openGroupedTv = useCallback((video: HiddenTunesTvVideo) => {
    const videoId = sanitizeYouTubeVideoId(video.source_id || video.id);

    if (videoId) {
      void stopPlayback();
      router.push({
        pathname: "/youtube-player",
        params: {
          id: videoId,
          videoId,
          title: video.title,
          artist: video.channel_name || "YouTube",
          channelTitle: video.channel_name || "YouTube",
          thumbnail:
            video.thumbnail_url ||
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        },
      } as any);
      return;
    }

    router.push({
      pathname: "/tv",
      params: { q: video.title },
    } as any);
  }, [stopPlayback]);

  const renderTvFallbackCard = useCallback(() => {
    const safeQuery = tvFallbackQuery || query.trim();

    if (!safeQuery || safeQuery.length < API_SEARCH_MIN_CHARS) return null;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.tvFallbackCard}
        onPress={() => openTvFallback(safeQuery)}
      >
        <View style={styles.tvFallbackIcon}>
          <Ionicons name="tv" size={24} color="#fff" />
        </View>

        <View style={styles.tvFallbackTextBox}>
          <Text style={styles.tvFallbackKicker}>Hidden Tunes TV</Text>
          <Text style={styles.tvFallbackTitle} numberOfLines={2}>
            {tvFallbackReason || "No song matches yet. Expand with Hidden Tunes TV."}
          </Text>
          <Text style={styles.tvFallbackSub} numberOfLines={1}>
            Keep exploring {safeQuery}
          </Text>
        </View>

        <View style={styles.tvFallbackButton}>
          <Ionicons name="arrow-forward" size={18} color="#000" />
        </View>
      </TouchableOpacity>
    );
  }, [openTvFallback, query, tvFallbackQuery, tvFallbackReason]);

  function renderDiscovery() {
    return (
      <>
        <View style={styles.cloudStatus}>
          <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
          <Text style={styles.cloudStatusText}>
            {cloudSongs.length} songs ready
          </Text>
        </View>

        {recentSearches.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Recently Felt</Text>
                <Text style={styles.sectionSub}>Jump back into your last search mood</Text>
              </View>

              <TouchableOpacity onPress={clearRecentSearches}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chipWrap}>
              {recentSearches.map((item) => renderChip(item, "time-outline"))}
            </View>
          </View>
        )}

        <View style={styles.discoverySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending Moods</Text>
            <Text style={styles.sectionSub}>Fast paths into the catalog</Text>
          </View>

          <View style={styles.chipWrap}>
            {TRENDING_SEARCHES.map((item) => renderChip(item, "trending-up"))}
          </View>
        </View>

        <View style={styles.discoverySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Search Sparks</Text>
            <Text style={styles.sectionSub}>Ideas that can become your next queue</Text>
          </View>

          <View style={styles.recommendGrid}>
            {SMART_RECOMMENDATIONS.map((item, index) => (
              <TouchableOpacity
                key={item}
                activeOpacity={0.9}
                style={styles.recommendCard}
                onPress={() => commitSearch(item, activeSource)}
              >
                <LinearGradient
                  colors={
                    index % 2 === 0
                      ? ([
                          "rgba(168,85,247,0.95)",
                          "rgba(34,211,238,0.28)",
                        ] as any)
                      : ([
                          "rgba(255,255,255,0.12)",
                          "rgba(255,255,255,0.04)",
                        ] as any)
                  }
                  style={styles.recommendGradient}
                >
                  <Text style={styles.recommendText}>{item}</Text>
                  <Ionicons name="arrow-forward-circle" size={24} color={COLORS.text} />
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.discoverySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Continue The Thread</Text>
            <Text style={styles.sectionSub}>Songs ready to restart the moment</Text>
          </View>

          {loadingCloud ? (
            <View style={styles.loadingMini}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingMiniText}>Preparing songs...</Text>
            </View>
          ) : (
            continueListening.map((track) => (
              <View key={track.id} style={styles.compactTrack}>
                <TouchableOpacity
                  style={styles.compactTrackInfo}
                  onPress={() => handleSongResultPress(track, 0)}
                >
                  <Text numberOfLines={1} style={styles.compactTitle}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.compactSub}>
                    {track.artist} • Hidden Tunes
                  </Text>
                </TouchableOpacity>

                <AddToPlaylistButton track={track as any} />

                <TouchableOpacity
                  style={styles.compactPlay}
                  onPress={() => handleSongResultPress(track, 0)}
                >
                  <Ionicons name="play" size={16} color="#000" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {cloudAlbums.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Albums With Depth</Text>
              <Text style={styles.sectionSub}>Releases ready for a longer listen</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {cloudAlbums.slice(0, 8).map((album: any, index) => (
                <TouchableOpacity
                  key={String(album.id || album.albumId || index)}
                  style={styles.cloudCard}
                  onPress={() =>
                    router.push({
                      pathname: "/album/[id]",
                      params: {
                        id: String(album.id || album.albumId || index),
                      },
                    } as any)
                  }
                >
                  <MediaCard
                    title={album.title || album.name || "Album"}
                    subtitle={album.artist || "Hidden Tunes"}
                    image={album}
                    type="album"
                    size="small"
                    showPlayButton={false}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {cloudArtists.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Creator Worlds</Text>
              <Text style={styles.sectionSub}>Artists shaping your library</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {cloudArtists.slice(0, 8).map((artist: any, index) => (
                <TouchableOpacity
                  key={String(artist.id || artist.artistId || index)}
                  style={styles.cloudCard}
                  onPress={() =>
                    router.push({
                      pathname: "/artist/[id]",
                      params: {
                        id: String(artist.id || artist.artistId || index),
                      },
                    } as any)
                  }
                >
                  <MediaCard
                    title={artist.name || "Artist"}
                    subtitle={artist.genre || "Hidden Tunes"}
                    image={artist}
                    type="artist"
                    size="small"
                    showPlayButton={false}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {cloudPlaylists.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Listening Rooms</Text>
              <Text style={styles.sectionSub}>Curated paths through the catalog</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {cloudPlaylists.slice(0, 8).map((playlist: any, index) => (
                <TouchableOpacity
                  key={String(playlist.id || playlist.playlistId || index)}
                  style={styles.cloudCard}
                  onPress={() =>
                    router.push({
                      pathname: "/cloud-playlist/[id]",
                      params: {
                        id: String(playlist.id || playlist.playlistId || index),
                      },
                    } as any)
                  }
                >
                  <MediaCard
                    title={playlist.title || playlist.name || "Playlist"}
                    subtitle={playlist.description || "Hidden Tunes"}
                    image={playlist}
                    type="playlist"
                    size="small"
                    showPlayButton={false}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.title}>Search</Text>
          <Text style={styles.subtitle}>
            Search songs, moods, artists, albums, and TV
          </Text>
        </View>
      </View>

      <View style={styles.searchBorder}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={COLORS.cyan} />

          <TextInput
            placeholder="Search a song, mood, artist..."
            placeholderTextColor={COLORS.textDim}
            style={styles.input}
            value={query}
            onChangeText={(text) => {
              handleQueryChange(text);
              scheduleNetworkSearch(text, activeSource);
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={() => commitSearch(query, activeSource)}
          />

          {query.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setQuery("");
                setResults([]);
              }}
            >
              <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((item) => {
          const active = activeSource === item.key;

          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterButton, active && styles.filterButtonActive]}
              activeOpacity={0.85}
              onPress={() => {
                const source = item.key;
                setActiveSource(source);

                if (query.trim().length >= LOCAL_SEARCH_MIN_CHARS) {
                  if (query.trim().length >= API_SEARCH_MIN_CHARS) {
                    commitSearch(query, source);
                  }
                }
              }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        activeOpacity={0.86}
        style={styles.radioCard}
        onPress={openSearchRadio}
      >
        <View style={styles.radioIcon}>
          <Ionicons name="radio" size={26} color={COLORS.primary} />
        </View>

        <View style={styles.radioInfo}>
          <Text style={styles.radioTitle}>Start a mood radio</Text>
          <Text style={styles.radioSubtitle} numberOfLines={1}>
            Build a queue from {query.trim() || "afrobeats"}
          </Text>
        </View>

        <View style={styles.radioButton}>
          <Ionicons name="play" size={17} color="#000" />
        </View>
      </TouchableOpacity>

      {loading && !showGroupedSearch ? (
        <View style={styles.loadingBox}>
          <View style={styles.loadingTitleRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Finding the best matches...</Text>
          </View>
          <SearchSkeletonRows />
        </View>
      ) : (
        <FlatList
          ref={resultListRef}
          data={results}
          keyExtractor={resultKeyExtractor}
          contentContainerStyle={{ paddingBottom: 180 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={resultListPerformance.initialNumToRender}
          maxToRenderPerBatch={resultListPerformance.maxToRenderPerBatch}
          windowSize={resultListPerformance.windowSize}
          updateCellsBatchingPeriod={resultListPerformance.updateCellsBatchingPeriod}
          removeClippedSubviews
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          onEndReached={loadMoreHiddenSearchResults}
          onEndReachedThreshold={0.45}
          refreshControl={
            <RefreshControl
              tintColor={COLORS.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          ListHeaderComponent={
            <>
              {emptySearchMode && renderDiscovery()}

              {matchedGenres.length > 0 && (
                <View style={styles.genreSection}>
                  <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Mood Lanes</Text>
                    <Text style={styles.sectionSub}>
                      Browse by vibe
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.genreRow}
                  >
                    {matchedGenres.map((genre) => (
                      <TouchableOpacity
                        key={genre.id}
                        activeOpacity={0.86}
                        style={styles.genreChip}
                        onPress={() => openGenre(genre)}
                      >
                        <Text style={styles.genreEmoji}>{genre.emoji}</Text>

                        <Text style={styles.genreText} numberOfLines={1}>
                          {genre.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {renderTvFallbackCard()}

              {loading && showGroupedSearch ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingInlineText}>
                    Finding more matches...
                  </Text>
                </View>
              ) : null}

              {showGroupedSearch ? (
                <UniversalSearchGroupedResults
                  grouped={groupedSearchResults}
                  query={trimmedQuery}
                  onSongPress={openGroupedSong}
                  onLyricPress={openGroupedSong}
                  onArtistPress={openGroupedArtist}
                  onAlbumPress={openGroupedAlbum}
                  onGenrePress={openGenre}
                  onTvPress={openGroupedTv}
                  onSuggestionPress={(text) => commitSearch(text, activeSource)}
                  activeSongId={currentSong?.id}
                  isPlaying={isPlaying}
                />
              ) : null}

              {!showGroupedSearch || results.length > 0 ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {showGroupedSearch ? "More Matches" : "Hidden Tunes Matches"}
                  </Text>
                  <Text style={styles.sectionSub}>
                    {results.length > 0
                      ? `${results.length} tracks found • ${
                          activeSource === "youtube" ? "TV" : "ready"
                        }`
                      : showGroupedSearch
                        ? "Streaming and catalog matches"
                        : "Start typing to discover"}
                  </Text>
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            showGroupedSearch ? null : query.trim().length >= API_SEARCH_MIN_CHARS &&
              hasCheckedSearchFallbacks ? (
            <View style={styles.emptyBox}>
              <Ionicons name="musical-notes-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No close match yet</Text>
              <Text style={styles.emptyText}>
                Try a lyric, mood, artist, genre, or phrase
              </Text>
              {renderTvFallbackCard()}
            </View>
            ) : null
          }
          ListFooterComponent={
            loadingMoreResults ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Loading more...</Text>
              </View>
            ) : hasMoreHiddenResults ? (
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.loadMoreButton}
                onPress={loadMoreHiddenSearchResults}
              >
                <Ionicons name="albums-outline" size={17} color="#000" />
                <Text style={styles.loadMoreButtonText}>Load more results</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={renderResult}
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
  glowPurple: {
    position: "absolute",
    top: 35,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  glowCyan: {
    position: "absolute",
    top: 250,
    right: -130,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  headerTextBox: {
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  searchBorder: {
    borderRadius: 23,
    padding: 1.5,
    backgroundColor: "rgba(168,85,247,0.42)",
    marginBottom: 18,
  },
  searchBox: {
    height: 58,
    borderRadius: 22,
    backgroundColor: "rgba(18,7,31,0.96)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 16,
    paddingRight: 20,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  filterButtonActive: {
    backgroundColor: "rgba(168,85,247,0.28)",
  },
  filterText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
  },
  filterTextActive: {
    color: COLORS.text,
  },
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 26,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  radioIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  radioInfo: {
    flex: 1,
  },
  radioTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  radioSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  radioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingBox: {
    marginTop: 18,
    borderRadius: 28,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  loadingInlineText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  loadingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  loadingMini: {
    minHeight: 100,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  loadingMiniText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontWeight: "800",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginLeft: 10,
    fontWeight: "800",
  },
  searchSkeletonList: {
    gap: 10,
  },
  searchSkeletonRow: {
    minHeight: 74,
    borderRadius: 22,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  searchSkeletonArtwork: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  searchSkeletonText: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  searchSkeletonLineLarge: {
    width: "76%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  searchSkeletonLineSmall: {
    width: "48%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  searchSkeletonButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  cloudStatus: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cloudStatusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  discoverySection: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
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
  clearText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  smartChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  smartChipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  recommendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  recommendCard: {
    width: "48%",
    borderRadius: 24,
    overflow: "hidden",
  },
  recommendGradient: {
    minHeight: 106,
    padding: 15,
    justifyContent: "space-between",
  },
  recommendText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  compactTrack: {
    minHeight: 64,
    borderRadius: 22,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  compactTrackInfo: {
    flex: 1,
    marginRight: 10,
  },
  compactTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  compactSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  compactPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  cloudCard: {
    width: 150,
    marginRight: 14,
  },
  genreSection: {
    marginBottom: 22,
  },
  genreRow: {
    gap: 10,
    paddingRight: 20,
  },
  genreChip: {
    width: 128,
    minHeight: 78,
    borderRadius: 22,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "space-between",
  },
  genreEmoji: {
    fontSize: 24,
  },
  genreText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8,
  },
  resultShell: {
    position: "relative",
    marginBottom: 12,
  },
  resultShellActive: {
    borderRadius: 26,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  resultOverlayActions: {
    position: "absolute",
    right: 13,
    top: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  artistButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  albumButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeButton: {
    backgroundColor: "#ff0033",
  },
  eqBox: {
    width: 48,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadge: {
    position: "absolute",
    left: 112,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
  },
  sourceBadgeText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: "900",
  },
  tvFallbackCard: {
    minHeight: 104,
    borderRadius: 26,
    padding: 15,
    marginBottom: 20,
    backgroundColor: "rgba(255,0,51,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,0,51,0.28)",
    flexDirection: "row",
    alignItems: "center",
  },
  tvFallbackIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ff0033",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  tvFallbackTextBox: {
    flex: 1,
  },
  tvFallbackKicker: {
    color: "#ff6b86",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tvFallbackTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 5,
    lineHeight: 20,
  },
  tvFallbackSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  tvFallbackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  emptyBox: {
    minHeight: 260,
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
    textAlign: "center",
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
