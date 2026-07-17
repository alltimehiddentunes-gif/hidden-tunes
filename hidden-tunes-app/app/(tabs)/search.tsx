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
  FlatList,
  InteractionManager,
  Pressable,
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
import { router, useFocusEffect } from "expo-router";

import NeonEQ from "../../components/NeonEQ";
import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import HTImage from "../../components/HTImage";
import MediaCard from "../../components/MediaCard";

import { COLORS, GRADIENTS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";
import { useTrackPlaybackStatus } from "../../context/playerContextSlices";
import { normalizeGenreName } from "../../utils/genreNormalization";
import { HIDDEN_TUNES_GENRES } from "../../utils/genres";

import type { BackendYouTubeTrack } from "../../services/youtubeBackend";
import {
  HIDDEN_TUNES_SEARCH_LABEL,
  runSearchWaterfall,
} from "../../services/searchWaterfall";
import {
  buildLocalCatalogSearchFallback,
  mergeUnifiedSongResults,
} from "../../services/unifiedSearchResults";
import {
  searchHiddenTunesSongsPage,
  getHiddenTunesSecondaryCatalogSections,
  hydrateHiddenTunesCatalogCache,
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesCatalogCacheInfo,
  fetchCoordinatedCatalogFirstPage,
  extractHiddenTunesAlbums,
  extractHiddenTunesArtists,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesCloudPlaylist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import {
  canOpenArtistProfileById,
  resolveArtistFromList,
} from "../../utils/artistIdentity";
import {
  logApiRefresh,
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  startPerformanceTimer,
} from "../../utils/performanceLogs";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
  getNestedSongListLayout,
  LIST_ITEM_HEIGHTS,
  markFastScrolling,
} from "../../utils/performanceMode";
import {
  recordScreenOpen,
  recordSearchFirstResult,
  useRenderCountProbe,
} from "../../utils/performanceVerification";
import {
  getCachedSearchResults,
  hasFreshSearchResults,
  normalizeSearchQueryKey,
  setCachedSearchResults,
} from "../../utils/searchQueryCache";
import { openGenreCatalog } from "../../utils/catalogNavigation";
import { openPodcastHome } from "../../utils/podcastNavigation";
import { shouldShowCatalogEmpty } from "../../utils/catalogEmptyStateTiming";
import UniversalSearchGroupedResults from "../../components/UniversalSearchGroupedResults";
import { SubtleTvEntryLink, EmotionalDiscoveryChips, SubtleRadioEntryLink, SubtlePodcastEntryLink } from "../../components/EmotionalDiscoveryChips";
import { LaunchContentChips } from "../../components/launch/LaunchContentChips";
import {
  buildFeaturedPodcastChips,
  buildFeaturedVideoChips,
  CONTINUE_EXPLORING_CHIPS,
  LAUNCH_CONTENT_LABELS,
} from "../../utils/launchContentRegistry";
import {
  invalidateCatalogSearchIndex,
  runInstantCatalogSearch,
} from "../../services/instantCatalogSearch";
import {
  type CatalogSearchIndex,
} from "../../utils/catalogSearchIndex";
import {
  rankCatalogSongs,
  type CatalogSongMatchReason,
  type CatalogSongSearchHit,
} from "../../utils/catalogSongRanking";
import {
  runUniversalCatalogSearch,
  type UniversalSearchGroupedResults as GroupedSearchResults,
} from "../../services/universalSearchService";
import {
  fetchTvCatalog,
  type HiddenTunesTvVideo,
} from "../../services/tvCatalogApi";
import { useRuntimeRenderProbe } from "../../utils/runtimeInstrumentation";
import {
  createTapGuardState,
  shouldIgnoreDuplicateTap,
} from "../../utils/tapPressGuard";

type SearchType = "all" | "hidden" | "audius" | "archive" | "youtube" | "podcasts";

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
  sourceName?: string;
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
const SEARCH_SKELETON_KEYS = ["one", "two", "three", "four"];
const SEARCH_DEBOUNCE_MS = 380;
const FUZZY_SEARCH_DEBOUNCE_MS = 520;
const TV_FETCH_DEBOUNCE_MS = 500;
const LOCAL_SEARCH_MIN_CHARS = 2;
const API_SEARCH_MIN_CHARS = 3;
const VISIBLE_SONG_LIMIT = 28;
const LOCAL_RANK_CATALOG_LIMIT = 160;
const INSTANT_CATALOG_SONG_LIMIT = 180;
const NETWORK_SEARCH_DEDUPE_MS = 45_000;

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

const FILTERS: { key: SearchType; label: string }[] = [
  { key: "hidden", label: "CATALOG" },
  { key: "all", label: "ALL" },
  { key: "youtube", label: "TV" },
  { key: "podcasts", label: "Podcasts" },
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

function normalizeDedupeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeByKey<
  T extends {
    id?: string;
    videoId?: string;
    url?: string;
    streamUrl?: string;
    title?: string;
    artist?: string;
  },
>(items: T[]) {
  const seenIds = new Set<string>();
  const seenTitleArtist = new Set<string>();

  return items.filter((item) => {
    const idKey = String(
      item.videoId || item.id || item.streamUrl || item.url || ""
    ).replace("youtube-", "");

    if (idKey) {
      if (seenIds.has(idKey)) return false;
      seenIds.add(idKey);
    }

    const titleArtistKey = `${normalizeDedupeText(String(item.title || ""))}|${normalizeDedupeText(String(item.artist || getArtist(item)))}`;

    if (titleArtistKey !== "|") {
      if (seenTitleArtist.has(titleArtistKey)) return false;
      seenTitleArtist.add(titleArtistKey);
    }

    return Boolean(idKey || titleArtistKey !== "|");
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
    sourceName: "YouTube" as const,
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

  const sourceName = HIDDEN_TUNES_SEARCH_LABEL;

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
    song.url ||
    (song as any).raw?.audio_url ||
    (song as any).raw?.url;

  return typeof audio === "string" && audio.trim().length > 0;
}

function resolveSearchPlayableSong(
  raw: any,
  catalogs: HiddenTunesNormalizedSong[][]
): NativeSearchTrack {
  let song = normalizePlayableSong(raw);

  if (hasPlayableAudio(song)) {
    return song;
  }

  const id = String(song.id || "").trim();
  if (!id) return song;

  for (const catalog of catalogs) {
    const match = catalog.find((entry) => String(entry.id) === id);
    if (!match) continue;

    song = normalizePlayableSong(match);
    if (hasPlayableAudio(song)) {
      return song;
    }
  }

  return song;
}

function buildSearchPlayQueue(
  visibleSongResults: NativeSearchTrack[],
  flatResults: SearchResultTrack[],
  catalogs: HiddenTunesNormalizedSong[][]
) {
  const seen = new Set<string>();
  const queue: NativeSearchTrack[] = [];

  const pushRaw = (raw: any) => {
    const song = resolveSearchPlayableSong(raw, catalogs);
    const key = String(song.id || "").trim();
    if (!key || seen.has(key)) return;
    if (!hasPlayableAudio(song)) return;

    seen.add(key);
    queue.push(song);
  };

  for (const item of visibleSongResults) {
    pushRaw(item);
  }

  for (const item of flatResults) {
    if (isYouTubeTrack(item)) continue;
    pushRaw(item);
  }

  return queue;
}

type SearchRowHandlers = {
  handlePress: (item: SearchResultTrack, index: number) => void;
  handleSongResultPress: (item: SearchResultTrack, index: number) => void;
  openArtistFromTrack: (item: SearchResultTrack) => void;
  openAlbumFromTrack: (item: SearchResultTrack) => void;
};

function normalizePlayableSong(item: any): NativeSearchTrack {
  const stream = String(
    item.audioUrl ||
      item.audio_url ||
      item.previewUrl ||
      item.streamUrl ||
      item.url ||
      item.raw?.audio_url ||
      item.raw?.url ||
      ""
  ).trim();

  const artwork = String(
    item.artwork_url ||
      item.artwork ||
      item.cover_url ||
      item.cover ||
      item.thumbnail ||
      ""
  ).trim();

  const durationSeconds =
    item.duration_seconds ?? item.duration ?? item.raw?.duration_seconds;

  return normalizeNativeResult({
    ...item,
    id: String(item.id || "").trim(),
    title: String(item.title || "Unknown Song"),
    artist: String(
      item.artist || item.user?.name || item.channelTitle || "Unknown Artist"
    ),
    album: item.album || item.albumTitle || "",
    audioUrl: stream,
    audio_url: item.audio_url || stream,
    previewUrl: item.previewUrl || stream,
    streamUrl: item.streamUrl || stream,
    url: item.url || stream,
    artwork_url: item.artwork_url || artwork,
    artwork: item.artwork || artwork,
    cover_url: item.cover_url || artwork,
    cover: item.cover || artwork,
    thumbnail: item.thumbnail || artwork,
    duration_seconds: durationSeconds,
    duration: item.duration ?? durationSeconds,
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

type GroupedMainSongHit = {
  id: string;
  payload: HiddenTunesNormalizedSong | NativeSearchTrack;
  subtitle?: string;
  lyricSnippet?: string;
  matchReason?: CatalogSongMatchReason;
};

function isHiddenTunesCatalogTrack(item: SearchResultTrack) {
  if (isYouTubeTrack(item)) return false;
  const source = String((item as any).source || "").toLowerCase();
  const sourceName = String((item as any).sourceName || "").toLowerCase();
  return source === "hidden-tunes" || sourceName.includes("hidden tunes");
}

function orderFlatSearchResults(
  items: SearchResultTrack[],
  searchQuery: string
): SearchResultTrack[] {
  const safeQuery = String(searchQuery || "").trim();
  if (!safeQuery) return items;

  const youtube = items.filter((item) => isYouTubeTrack(item));
  const catalog = items.filter((item) => isHiddenTunesCatalogTrack(item));
  const other = items.filter(
    (item) => !isYouTubeTrack(item) && !isHiddenTunesCatalogTrack(item)
  );

  const rankedCatalog = rankCatalogSongs(
    catalog as HiddenTunesNormalizedSong[],
    safeQuery,
    80
  ).map((hit) => hit.song as unknown as SearchResultTrack);

  const rankedIds = new Set(
    rankedCatalog.map((item) => String((item as any).id || ""))
  );
  const trailingCatalog = catalog.filter(
    (item) => !rankedIds.has(String((item as any).id || ""))
  );

  return [...rankedCatalog, ...trailingCatalog, ...other, ...youtube];
}

type CatalogSongRowPressHandler = (
  song: NativeSearchTrack,
  index: number
) => void;

/** Plain Pressable catalog row — no MediaCard (avoids nested touchable swallowing taps). */
const SearchCatalogSongPressableRow = memo(function SearchCatalogSongPressableRow({
  song,
  index,
  subtitle,
  lyricSnippet,
  active = false,
  isPlayingSong = false,
  onRowPress,
  reserveRightActionsSpace = false,
}: {
  song: HiddenTunesNormalizedSong | NativeSearchTrack | SearchResultTrack | any;
  index: number;
  subtitle?: string;
  lyricSnippet?: string;
  active?: boolean;
  isPlayingSong?: boolean;
  onRowPress: CatalogSongRowPressHandler;
  reserveRightActionsSpace?: boolean;
}) {
  const playable = useMemo(() => normalizePlayableSong(song), [song]);
  const title = String(playable.title || "Unknown Song");
  const artistLine = subtitle || String(getArtist(playable));
  const handlePress = useCallback(() => {
    onRowPress(playable, index);
  }, [index, onRowPress, playable]);

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "rgba(168,85,247,0.2)" }}
      style={({ pressed }) => [
        styles.catalogSongRowPressable,
        reserveRightActionsSpace && styles.catalogSongRowPressableWithActions,
        active && styles.catalogSongRowActive,
        pressed && styles.catalogSongRowPressed,
      ]}
      onPress={handlePress}
    >
      <LinearGradient
        colors={GRADIENTS.card}
        style={[
          styles.catalogSongRowCard,
          reserveRightActionsSpace && styles.catalogSongRowCardWithActions,
        ]}
      >
        <HTImage
          source={playable}
          style={styles.catalogSongArtwork}
          contentFit="cover"
        />

        <View style={styles.catalogSongTextCol}>
          <Text style={styles.catalogSongTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.catalogSongSubtitle} numberOfLines={1}>
            {artistLine}
          </Text>

          {lyricSnippet ? (
            <Text style={styles.catalogSongLyric} numberOfLines={2}>
              {lyricSnippet}
            </Text>
          ) : null}

          {active ? (
            <Text style={styles.catalogSongNowPlaying}>
              {isPlayingSong ? "Now playing" : "Selected"}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const SearchGroupedMainSongRow = memo(function SearchGroupedMainSongRow({
  hit,
  index,
  active,
  isPlayingSong,
  onRowPress,
}: {
  hit: GroupedMainSongHit;
  index: number;
  active: boolean;
  isPlayingSong: boolean;
  onRowPress: CatalogSongRowPressHandler;
}) {
  return (
    <View style={styles.groupedSongRowWrap}>
      <SearchCatalogSongPressableRow
        song={hit.payload}
        index={index}
        subtitle={hit.subtitle || String(hit.payload?.artist || "")}
        lyricSnippet={hit.lyricSnippet}
        active={active}
        isPlayingSong={isPlayingSong}
        onRowPress={onRowPress}
      />
    </View>
  );
});

const SearchResultRow = memo(function SearchResultRow({
  item,
  index,
  handlersRef,
}: {
  item: SearchResultTrack;
  index: number;
  handlersRef: React.RefObject<SearchRowHandlers>;
}) {
  const normalized = useMemo(() => normalizeSearchTrack(item), [item]);
  const youtube = isYouTubeTrack(normalized);
  const playable = useMemo(() => normalizePlayableSong(normalized), [normalized]);
  const trackId = String(normalized.id || "");
  const { isActive, isPlaying } = useTrackPlaybackStatus(youtube ? "" : trackId);
  const artist = String(getArtist(normalized));
  const title = String(normalized.title || "Unknown Song");

  const onCatalogSongPress = useCallback<CatalogSongRowPressHandler>((song, rowIndex) => {
    handlersRef.current?.handleSongResultPress(song, rowIndex);
  }, [handlersRef]);

  const onTvPress = useCallback(() => {
    handlersRef.current?.handlePress(item, index);
  }, [handlersRef, index, item]);

  const openArtist = useCallback(() => {
    handlersRef.current?.openArtistFromTrack(item);
  }, [handlersRef, item]);

  const openAlbum = useCallback(() => {
    handlersRef.current?.openAlbumFromTrack(item);
  }, [handlersRef, item]);

  const onPlayablePress = useCallback(() => {
    onCatalogSongPress(playable, index);
  }, [index, onCatalogSongPress, playable]);

  if (youtube) {
    return (
      <View style={[styles.resultShell, isActive && styles.resultShellActive]}>
        <MediaCard
          title={title}
          subtitle={artist}
          image={normalized}
          type="radio"
          size="medium"
          showPlayButton={false}
          onPress={onTvPress}
        />

        <View style={styles.resultOverlayActions} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.artistButton}
            onPress={openArtist}
          >
            <Ionicons name="person-outline" size={17} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.albumButton}
            onPress={openAlbum}
          >
            <Ionicons name="albums-outline" size={18} color={COLORS.text} />
          </TouchableOpacity>

          {isActive ? (
            <View style={styles.eqBox}>
              <NeonEQ isPlaying={isPlaying} size="small" />
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.playButton, styles.youtubeButton]}
              onPress={onTvPress}
            >
              <Ionicons name="tv" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.resultShell, isActive && styles.resultShellActive]}>
      <SearchCatalogSongPressableRow
        song={item}
        index={index}
        subtitle={artist}
        active={isActive}
        isPlayingSong={isPlaying}
        onRowPress={onCatalogSongPress}
        reserveRightActionsSpace
      />

      <View style={styles.resultOverlayActions} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.artistButton}
          onPress={openArtist}
        >
          <Ionicons name="person-outline" size={17} color={COLORS.text} />
        </TouchableOpacity>

        <AddToPlaylistButton track={playable as any} />

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.albumButton}
          onPress={openAlbum}
        >
          <Ionicons name="albums-outline" size={18} color={COLORS.text} />
        </TouchableOpacity>

        {isActive ? (
          <View style={styles.eqBox}>
            <NeonEQ isPlaying={isPlaying} size="small" />
          </View>
        ) : (
          <Pressable
            android_ripple={{ color: "rgba(168,85,247,0.2)" }}
            onPress={onPlayablePress}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
          >
            <Ionicons name="play" size={20} color="#000" />
          </Pressable>
        )}
      </View>
    </View>
  );
});

const SearchMoodRadioCard = memo(function SearchMoodRadioCard({
  queryLabel,
  onPress,
}: {
  queryLabel: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.radioCard}
      onPress={onPress}
    >
      <View style={styles.radioIcon}>
        <Ionicons name="radio" size={26} color={COLORS.primary} />
      </View>

      <View style={styles.radioInfo}>
        <Text style={styles.radioTitle}>Start a mood radio</Text>
        <Text style={styles.radioSubtitle} numberOfLines={1}>
          Build a queue from {queryLabel}
        </Text>
      </View>

      <View style={styles.radioButton}>
        <Ionicons name="play" size={17} color="#000" />
      </View>
    </TouchableOpacity>
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
  useRuntimeRenderProbe("Search");
  const { playSong, stopPlayback } = usePlayerActions();
  const { currentSongId, isPlaying } = usePlayerNowPlaying();

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchDebounceGenerationRef = useRef(0);
  const resultListRef = useRef<FlatList<SearchResultTrack>>(null);
  const searchRowHandlersRef = useRef<SearchRowHandlers>({
    handlePress: () => {},
    handleSongResultPress: () => {},
    openArtistFromTrack: () => {},
    openAlbumFromTrack: () => {},
  });
  const searchPlayTapRef = useRef(createTapGuardState());
  const inFlightSearchKeyRef = useRef<string | null>(null);
  const fuzzySearchGenerationRef = useRef(0);
  const tvFetchGenerationRef = useRef(0);
  const tvFetchInFlightRef = useRef<string | null>(null);
  const fuzzySearchInFlightRef = useRef<string | null>(null);
  const loadingMoreResultsRef = useRef(false);
  const lastCompletedSearchRef = useRef<{ key: string; at: number }>({
    key: "",
    at: 0,
  });
  const catalogIndexRef = useRef<{
    songCount: number;
    index: CatalogSearchIndex;
  } | null>(null);
  const searchTimingRef = useRef({ query: "", startedAt: 0 });
  const searchFirstResultLoggedRef = useRef("");
  const screenMountedRef = useRef(true);
  const recentSearchesRef = useRef<string[]>([]);
  const recentSearchPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const fuzzyInteractionRef = useRef<{ cancel: () => void } | null>(null);
  const screenStartedAt = useRef(startPerformanceTimer()).current;

  const [query, setQuery] = useState("");
  const [rankedSearchQuery, setRankedSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResultTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSource, setActiveSource] = useState<SearchType>("all");
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
  const [tvSearchVideos, setTvSearchVideos] = useState<HiddenTunesTvVideo[]>([]);
  const [deferredFuzzySearch, setDeferredFuzzySearch] = useState<{
    query: string;
    results: GroupedSearchResults | null;
  }>({ query: "", results: null });
  const [remoteCatalogSongs, setRemoteCatalogSongs] = useState<
    HiddenTunesNormalizedSong[]
  >([]);

  useEffect(() => {
    recentSearchesRef.current = recentSearches;
  }, [recentSearches]);

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      if (recentSearchPersistTimerRef.current) {
        clearTimeout(recentSearchPersistTimerRef.current);
        recentSearchPersistTimerRef.current = null;
      }
      fuzzyInteractionRef.current?.cancel();
      fuzzyInteractionRef.current = null;
    };
  }, []);

  const matchedGenres = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();

    if (!safeQuery || safeQuery.length < 2) {
      return HIDDEN_TUNES_GENRES.slice(0, 10);
    }

    return HIDDEN_TUNES_GENRES.filter((genre) => {
      const aliasMatch = (genre.aliases || []).some((alias) =>
        alias.toLowerCase().includes(safeQuery)
      );
      const resolvesToGenre = normalizeGenreName(safeQuery) === genre.title;

      return (
        genre.title.toLowerCase().includes(safeQuery) ||
        genre.id.toLowerCase().includes(safeQuery) ||
        genre.query.toLowerCase().includes(safeQuery) ||
        aliasMatch ||
        resolvesToGenre
      );
    }).slice(0, 10);
  }, [query]);

  const resultPartitions = useMemo(() => {
    const youtube: SearchResultTrack[] = [];
    const hidden: SearchResultTrack[] = [];
    const native: SearchResultTrack[] = [];

    for (const item of results) {
      if (isYouTubeTrack(item)) {
        youtube.push(item);
        continue;
      }

      native.push(item);

      if (isHiddenTunesCatalogTrack(item)) {
        hidden.push(item);
      }
    }

    return { hidden, native, youtube };
  }, [results]);

  const playableResults = useMemo(
    () =>
      dedupeByKey(
        resultPartitions.native.map((item) => normalizeNativeResult(item))
      ),
    [resultPartitions.native]
  );

  const continueListening = useMemo(() => {
    if (playableResults.length > 0) return playableResults.slice(0, 8);
    return cloudSongs.slice(0, 8);
  }, [playableResults, cloudSongs]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setRankedSearchQuery("");
      return;
    }

    const timer = setTimeout(() => {
      setRankedSearchQuery(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const activeSearchQuery = rankedSearchQuery;
  const emptySearchMode = trimmedQuery.length < LOCAL_SEARCH_MIN_CHARS;
  const showGroupedSearch = activeSearchQuery.length >= LOCAL_SEARCH_MIN_CHARS;
  const moodRadioQueryLabel = trimmedQuery || "afrobeats";

  const catalogSongsForSearch = useMemo(() => {
    if (remoteCatalogSongs.length > 0) {
      return remoteCatalogSongs.slice(0, LOCAL_RANK_CATALOG_LIMIT);
    }

    return getHiddenTunesCatalogSnapshot().slice(0, INSTANT_CATALOG_SONG_LIMIT);
  }, [remoteCatalogSongs]);

  const universalCatalog = useMemo(
    () => ({
      songs: catalogSongsForSearch,
      albums: cloudAlbums,
      artists: cloudArtists,
      genres: HIDDEN_TUNES_GENRES,
      tvVideos: activeSource === "youtube" ? tvSearchVideos : [],
    }),
    [
      activeSource,
      catalogSongsForSearch,
      cloudAlbums,
      cloudArtists,
      tvSearchVideos,
    ]
  );

  const universalCatalogRef = useRef(universalCatalog);
  universalCatalogRef.current = universalCatalog;

  const instantGroupedResults = useMemo(() => {
    if (!showGroupedSearch) return EMPTY_GROUPED_RESULTS;
    return runInstantCatalogSearch(universalCatalog, activeSearchQuery);
  }, [activeSearchQuery, showGroupedSearch, universalCatalog]);

  const groupedSearchResults = useMemo(() => {
    if (!showGroupedSearch) return EMPTY_GROUPED_RESULTS;

    const instant = instantGroupedResults;
    const deferred = deferredFuzzySearch;

    if (
      deferred.query !== activeSearchQuery ||
      !deferred.results?.hasAnyResults
    ) {
      return instant;
    }

    return {
      ...deferred.results,
      songs:
        deferred.results.songs.length > 0
          ? deferred.results.songs
          : instant.songs,
      topResults:
        deferred.results.topResults.length > 0
          ? deferred.results.topResults
          : instant.topResults,
      hasAnyResults:
        deferred.results.hasAnyResults || instant.hasAnyResults,
    };
  }, [activeSearchQuery, deferredFuzzySearch, instantGroupedResults, showGroupedSearch]);

  const rankedCatalogSongHits = useMemo(() => {
    if (!showGroupedSearch || activeSearchQuery.length < LOCAL_SEARCH_MIN_CHARS) {
      return [] as CatalogSongSearchHit[];
    }

    const songsToRank =
      remoteCatalogSongs.length > 0
        ? remoteCatalogSongs.slice(0, LOCAL_RANK_CATALOG_LIMIT)
        : catalogSongsForSearch;

    return rankCatalogSongs(
      songsToRank,
      activeSearchQuery,
      VISIBLE_SONG_LIMIT + 12
    );
  }, [
    activeSearchQuery,
    catalogSongsForSearch,
    remoteCatalogSongs,
    showGroupedSearch,
  ]);

  const visibleSongResults = useMemo(() => {
    if (!showGroupedSearch) return [] as NativeSearchTrack[];

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

    for (const hit of rankedCatalogSongHits) {
      addSong(hit.song);
      if (collected.length >= VISIBLE_SONG_LIMIT) break;
    }

    if (collected.length < VISIBLE_SONG_LIMIT) {
      for (const song of collectGroupedSongPayloads(groupedSearchResults)) {
        addSong(song);
        if (collected.length >= VISIBLE_SONG_LIMIT) break;
      }
    }

    if (collected.length < VISIBLE_SONG_LIMIT) {
      for (const item of resultPartitions.native) {
        addSong(item as NativeSearchTrack);
        if (collected.length >= VISIBLE_SONG_LIMIT) break;
      }
    }

    return collected;
  }, [
    groupedSearchResults,
    rankedCatalogSongHits,
    resultPartitions.native,
    showGroupedSearch,
  ]);

  const catalogLookupSources = useMemo(
    () => [remoteCatalogSongs, catalogSongsForSearch],
    [catalogSongsForSearch, remoteCatalogSongs]
  );

  const listResults = useMemo(() => {
    if (activeSource === "youtube") return resultPartitions.youtube;

    if (activeSource === "podcasts") {
      return [];
    }

    if (activeSource === "hidden") return resultPartitions.hidden;

    return resultPartitions.native;
  }, [
    activeSource,
    resultPartitions.hidden,
    resultPartitions.native,
    resultPartitions.youtube,
  ]);

  const showMoodRadioCard =
    trimmedQuery.length >= LOCAL_SEARCH_MIN_CHARS || listResults.length > 0;

  const searchPlayQueue = useMemo(
    () => buildSearchPlayQueue(visibleSongResults, results, catalogLookupSources),
    [visibleSongResults, results, catalogLookupSources]
  );

  const groupedMainSongHits = useMemo(() => {
    if (!showGroupedSearch) return [] as GroupedMainSongHit[];

    const seen = new Set<string>();
    const hits: GroupedMainSongHit[] = [];

    const addHit = (hit: GroupedMainSongHit) => {
      if (!hit?.id || seen.has(hit.id)) return;
      seen.add(hit.id);
      hits.push(hit);
    };

    for (const ranked of rankedCatalogSongHits) {
      addHit({
        id: `song:${ranked.song.id}`,
        payload: ranked.song,
        subtitle: `${ranked.song.artist}${
          ranked.song.album ? ` • ${ranked.song.album}` : ""
        }`,
        matchReason: ranked.matchReason,
      });
    }

    for (const hit of groupedSearchResults.lyrics) {
      addHit({
        id: hit.id,
        payload: hit.payload,
        subtitle: hit.subtitle,
        lyricSnippet: hit.lyricSnippet,
        matchReason: hit.catalogMatchReason || "lyric_match",
      });
    }

    return hits;
  }, [groupedSearchResults.lyrics, rankedCatalogSongHits, showGroupedSearch]);

  const groupedForUniversalSearch = useMemo(() => {
    if (!showGroupedSearch) return groupedSearchResults;

    const topResults = groupedSearchResults.topResults.filter(
      (hit) =>
        !hit.id.startsWith("song:") &&
        !hit.id.startsWith("lyric:") &&
        !hit.id.startsWith("tv:")
    );

    const hasAnyResults =
      topResults.length > 0 ||
      groupedSearchResults.artists.length > 0 ||
      groupedSearchResults.albums.length > 0 ||
      groupedSearchResults.genreMoods.length > 0 ||
      groupedMainSongHits.length > 0;

    return {
      ...groupedSearchResults,
      songs: [],
      lyrics: [],
      tv: [],
      topResults,
      hasAnyResults,
    };
  }, [groupedMainSongHits, groupedSearchResults, showGroupedSearch]);

  const hasCatalogSearchResults = useMemo(() => {
    if (groupedMainSongHits.length > 0) return true;

    const catalogFlatResults = results.filter((item) => !isYouTubeTrack(item));
    if (catalogFlatResults.length > 0) return true;

    if (groupedForUniversalSearch.artists.length > 0) return true;
    if (groupedForUniversalSearch.albums.length > 0) return true;
    if (groupedForUniversalSearch.genreMoods.length > 0) return true;
    if (groupedForUniversalSearch.topResults.length > 0) return true;

    return false;
  }, [
    groupedForUniversalSearch.albums.length,
    groupedForUniversalSearch.artists.length,
    groupedForUniversalSearch.genreMoods.length,
    groupedForUniversalSearch.topResults.length,
    groupedMainSongHits.length,
    results,
  ]);

  const showPremiumSearchEmpty = useMemo(() => {
    if (!showGroupedSearch) return false;
    if (refreshing) return false;

    if (
      trimmedQuery.length >= LOCAL_SEARCH_MIN_CHARS &&
      trimmedQuery.length < API_SEARCH_MIN_CHARS
    ) {
      return !instantGroupedResults.hasAnyResults && !loading;
    }

    if (loading && !hasCatalogSearchResults) return true;
    if (!hasCheckedSearchFallbacks) return false;
    if (trimmedQuery.length < API_SEARCH_MIN_CHARS) return false;

    return !hasCatalogSearchResults;
  }, [
    hasCatalogSearchResults,
    hasCheckedSearchFallbacks,
    instantGroupedResults.hasAnyResults,
    loading,
    refreshing,
    showGroupedSearch,
    trimmedQuery,
  ]);

  useEffect(() => {
    setDeferredFuzzySearch({ query: "", results: null });
    setRemoteCatalogSongs([]);
  }, [trimmedQuery]);

  useEffect(() => {
    if (activeSearchQuery.length < LOCAL_SEARCH_MIN_CHARS) {
      setDeferredFuzzySearch({ query: "", results: null });
      return;
    }

    const generation = ++fuzzySearchGenerationRef.current;
    const queryAtSchedule = activeSearchQuery;

    const timer = setTimeout(() => {
      if (generation !== fuzzySearchGenerationRef.current) return;
      if (fuzzySearchInFlightRef.current === queryAtSchedule) return;

      fuzzySearchInFlightRef.current = queryAtSchedule;

      fuzzyInteractionRef.current?.cancel();
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        if (generation !== fuzzySearchGenerationRef.current) return;
        if (queryAtSchedule !== activeSearchQuery) {
          fuzzySearchInFlightRef.current = null;
          return;
        }

        const results = runUniversalCatalogSearch(
          universalCatalogRef.current,
          queryAtSchedule
        );

        if (generation !== fuzzySearchGenerationRef.current) return;
        if (queryAtSchedule !== activeSearchQuery) {
          fuzzySearchInFlightRef.current = null;
          return;
        }
        if (!screenMountedRef.current) {
          fuzzySearchInFlightRef.current = null;
          return;
        }

        fuzzySearchInFlightRef.current = null;
        setDeferredFuzzySearch({ query: queryAtSchedule, results });
      });
      fuzzyInteractionRef.current = interactionHandle;
    }, FUZZY_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      fuzzyInteractionRef.current?.cancel();
      fuzzyInteractionRef.current = null;
      if (fuzzySearchInFlightRef.current === queryAtSchedule) {
        fuzzySearchInFlightRef.current = null;
      }
    };
  }, [activeSearchQuery]);

  // useScrollToTop(resultListRef);

  useRenderCountProbe("SearchScreen");

  useEffect(() => {
    searchTimingRef.current = { query: trimmedQuery, startedAt: Date.now() };
    searchFirstResultLoggedRef.current = "";
  }, [trimmedQuery]);

  useEffect(() => {
    if (trimmedQuery.length < LOCAL_SEARCH_MIN_CHARS) return;
    if (!instantGroupedResults.hasAnyResults) return;
    if (searchFirstResultLoggedRef.current === trimmedQuery) return;

    searchFirstResultLoggedRef.current = trimmedQuery;
    recordSearchFirstResult(
      trimmedQuery,
      Date.now() - searchTimingRef.current.startedAt
    );
  }, [instantGroupedResults.hasAnyResults, trimmedQuery]);

  const resultKeyExtractor = useMemo(
    () => createStableKeyExtractor("search-result"),
    []
  );

  const resultListPerformance = useMemo(
    () =>
      getListPerformanceSettings(Math.min(listResults.length, VISIBLE_SONG_LIMIT)),
    [listResults.length]
  );

  const searchResultLayout = useMemo(
    () => getNestedSongListLayout(LIST_ITEM_HEIGHTS.catalogSongRow),
    []
  );

  const cloudDiscoveryLoadedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecentSearches();

      if (cloudDiscoveryLoadedRef.current) return;

      cloudDiscoveryLoadedRef.current = true;
      void loadCloudDiscovery(true);

      return () => {
        setDeferredFuzzySearch({ query: "", results: null });
      };
    }, [])
  );

  useEffect(() => {
    if (activeSource !== "youtube") {
      setTvSearchVideos([]);
      return;
    }

    const safeQuery = trimmedQuery;
    if (safeQuery.length < LOCAL_SEARCH_MIN_CHARS) {
      setTvSearchVideos([]);
      return;
    }

    const generation = ++tvFetchGenerationRef.current;
    const queryAtSchedule = safeQuery;
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled || generation !== tvFetchGenerationRef.current) return;
      if (tvFetchInFlightRef.current === queryAtSchedule) return;

      tvFetchInFlightRef.current = queryAtSchedule;

      void fetchTvCatalog({ q: queryAtSchedule, limit: 40 }).then((response) => {
        if (cancelled || generation !== tvFetchGenerationRef.current) return;
        if (queryAtSchedule !== trimmedQuery) return;

        tvFetchInFlightRef.current = null;

        if (!response.success) return;
        setTvSearchVideos(response.videos || []);
      }).catch(() => {
        if (!cancelled) {
          tvFetchInFlightRef.current = null;
        }
      });
    }, TV_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSource, trimmedQuery]);

  async function loadRecentSearches() {
    try {
      const saved = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch (error) {
    }
  }

  function saveRecentSearch(text: string) {
    const clean = text.trim();
    if (!clean || clean.length < 2) return;

    const next = [clean, ...recentSearchesRef.current.filter((item) => item !== clean)].slice(
      0,
      12
    );

    const unchanged =
      next.length === recentSearchesRef.current.length &&
      next.every((value, index) => value === recentSearchesRef.current[index]);
    if (unchanged) return;

    recentSearchesRef.current = next;
    setRecentSearches(next);

    if (recentSearchPersistTimerRef.current) {
      clearTimeout(recentSearchPersistTimerRef.current);
    }

    recentSearchPersistTimerRef.current = setTimeout(() => {
      recentSearchPersistTimerRef.current = null;
      void AsyncStorage.setItem(
        SEARCH_HISTORY_KEY,
        JSON.stringify(recentSearchesRef.current)
      ).catch(() => {});
    }, 1200);
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
      if (showLoader && screenMountedRef.current) setLoadingCloud(true);

      const memorySnapshot = getHiddenTunesCatalogSnapshot();
      const cached = memorySnapshot.length
        ? memorySnapshot
        : await hydrateHiddenTunesCatalogCache();
      if (!screenMountedRef.current) return;

      const catalogSlice = cached.slice(0, INSTANT_CATALOG_SONG_LIMIT);

      if (cached.length) {
        invalidateCatalogSearchIndex();
        catalogIndexRef.current = null;
        setCloudSongs(
          dedupeByKey(
            catalogSlice.slice(0, 24).map((item: any) =>
              normalizeNativeResult({
                ...item,
                source: "hidden-tunes",
                sourceName: "Hidden Tunes",
                type: "r2",
              })
            )
          )
        );
        setCloudAlbums(extractHiddenTunesAlbums(catalogSlice));
        setCloudArtists(
          extractHiddenTunesArtists(catalogSlice).slice(0, 12) as any
        );
        setLoadingCloud(false);
        logCacheResult("search", true, { count: cached.length });
        logScreenReady("search", screenStartedAt, {
          cache: "hit",
          count: cached.length,
        });
        recordScreenOpen("search", {
          openMs: Date.now() - screenStartedAt,
          firstContentMs: Date.now() - screenStartedAt,
        });
        logPerformanceSummary("search", {
          cache: "hit",
          firstContentMs: Date.now() - screenStartedAt,
          itemCount: cached.length,
        });

        const cacheInfo = await getHiddenTunesCatalogCacheInfo();
        if (!screenMountedRef.current) return;

        if (cacheInfo.isFresh) {
          void getHiddenTunesSecondaryCatalogSections({ forceRefresh: false }).then(
            (sections) => {
              if (!screenMountedRef.current) return;
              setCloudAlbums(sections.albums || []);
              setCloudArtists(sections.artists || []);
              setCloudPlaylists(sections.playlists || []);
            }
          );
          return;
        }
      } else {
        logCacheResult("search", false);
      }

      const songs = await fetchCoordinatedCatalogFirstPage({
        limit: 24,
        forceRefresh: cached.length === 0,
      });
      if (!screenMountedRef.current) return;

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

      void getHiddenTunesSecondaryCatalogSections({ forceRefresh: false }).then(
        (sections) => {
          if (!screenMountedRef.current) return;
          setCloudAlbums(sections.albums || []);
          setCloudArtists(sections.artists || []);
          setCloudPlaylists(sections.playlists || []);
        }
      );
    } catch {
    } finally {
      if (screenMountedRef.current) {
        setLoadingCloud(false);
        setRefreshing(false);
      }
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCloudDiscovery(false);

    if (query.trim().length >= API_SEARCH_MIN_CHARS) {
      await searchTracks(query, activeSource, { forceNetwork: true });
    } else {
      setRefreshing(false);
    }
  }, [activeSource, query]);

  const buildYouTubeQueue = useCallback(() => {
    const queue: YouTubeQueueItem[] = resultPartitions.youtube
      .map((track) => {
        const normalized = normalizeYouTubeResult(track as BackendYouTubeTrack);
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
  }, [resultPartitions.youtube]);

  async function searchTracks(
    text: string,
    source: SearchType = activeSource,
    options: { forceNetwork?: boolean } = {}
  ) {
    const safeText = String(text || "").trim();
    const searchKey = normalizeSearchQueryKey(safeText, source);
    const requestId = ++searchRequestIdRef.current;
    const refreshStart = startPerformanceTimer();
    const forceNetwork = options.forceNetwork === true;

    setSearchPage(1);
    setHasMoreHiddenResults(false);
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

    if (
      !forceNetwork &&
      inFlightSearchKeyRef.current === searchKey
    ) {
      return;
    }

    if (
      !forceNetwork &&
      lastCompletedSearchRef.current.key === searchKey &&
      Date.now() - lastCompletedSearchRef.current.at < NETWORK_SEARCH_DEDUPE_MS
    ) {
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
      !forceNetwork &&
      cachedResults?.length &&
      requestId === searchRequestIdRef.current
    ) {
      setResults(cachedResults);
      setHasCheckedSearchFallbacks(true);
      setLoading(false);
      showedCachedResults = true;
      lastCompletedSearchRef.current = { key: searchKey, at: Date.now() };
      logCacheResult("search_results", true, {
        query: safeText,
        source,
        count: cachedResults.length,
      });

      if (hasFreshSearchResults(safeText, source)) {
        return;
      }
    } else if (safeText.length < LOCAL_SEARCH_MIN_CHARS) {
      setLoading(true);
      logCacheResult("search_results", false, { query: safeText, source });
    } else {
      logCacheResult("search_results", false, { query: safeText, source });
    }

    inFlightSearchKeyRef.current = searchKey;

    try {
      saveRecentSearch(safeText);

      if (source === "podcasts") {
        if (requestId !== searchRequestIdRef.current) return;

        setLoading(false);
        setRefreshing(false);
        openPodcastHome(safeText);
        return;
      }

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

      const waterfall = await runSearchWaterfall(
        safeText,
        source === "hidden"
          ? "hidden"
          : source === "audius"
            ? "audius"
            : source === "archive"
              ? "archive"
              : "all"
      );

      if (waterfall) {
        setHasMoreHiddenResults(waterfall.hasMoreHidden);

        if (waterfall.remoteCatalogSongs.length > 0) {
          setRemoteCatalogSongs(waterfall.remoteCatalogSongs);
        }

        const catalogFallback = buildLocalCatalogSearchFallback(
          getHiddenTunesCatalogSnapshot().slice(0, LOCAL_RANK_CATALOG_LIMIT),
          safeText,
          24
        );

        const mergedTracks = mergeUnifiedSongResults(
          waterfall.tracks,
          catalogFallback
        );

        const normalizedResults = orderFlatSearchResults(
          dedupeByKey(
            mergedTracks.map((item) =>
              normalizeSearchTrack(normalizeNativeResult(item))
            )
          ),
          safeText
        );

        logApiRefresh("search_results", refreshStart, {
          query: safeText,
          source,
          count: normalizedResults.length,
        });

        if (requestId !== searchRequestIdRef.current) return;

        setResults(normalizedResults);
        await setCachedSearchResults(safeText, source, normalizedResults);
        lastCompletedSearchRef.current = { key: searchKey, at: Date.now() };
        logPerformanceSummary("search_results", {
          cache: showedCachedResults ? "hit" : "miss",
          apiRefreshMs: Date.now() - refreshStart,
          itemCount: normalizedResults.length,
          emptyStateReason: normalizedResults.length
            ? "content_available"
            : "waterfall_empty",
        });
        return;
      }
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;

      if (!showedCachedResults) {
        const catalogFallback = buildLocalCatalogSearchFallback(
          getHiddenTunesCatalogSnapshot().slice(0, LOCAL_RANK_CATALOG_LIMIT),
          safeText,
          24
        ).map((item) => normalizeSearchTrack(normalizeNativeResult(item)));

        setResults(
          catalogFallback.length
            ? orderFlatSearchResults(dedupeByKey(catalogFallback), safeText)
            : []
        );
      }

    } finally {
      if (requestId !== searchRequestIdRef.current) return;

      if (inFlightSearchKeyRef.current === searchKey) {
        inFlightSearchKeyRef.current = null;
      }

      setHasCheckedSearchFallbacks(true);
      setLoading(false);
      setRefreshing(false);
    }
  }

  const loadMoreHiddenSearchResults = useCallback(async () => {
    const safeText = query.trim();

    if (
      loadingMoreResultsRef.current ||
      loadingMoreResults ||
      !hasMoreHiddenResults ||
      safeText.length < API_SEARCH_MIN_CHARS ||
      activeSource === "youtube" ||
      activeSource === "podcasts" ||
      activeSource === "audius" ||
      activeSource === "archive"
    ) {
      return;
    }

    loadingMoreResultsRef.current = true;

    try {
      setLoadingMoreResults(true);

      const nextPage = searchPage + 1;
      const queryAtStart = safeText;
      const requestIdAtStart = searchRequestIdRef.current;
      const page = await searchHiddenTunesSongsPage(safeText, nextPage, 30);
      const nextResults = page.songs.map((item: any) =>
        normalizeNativeResult({
          ...item,
          source: "hidden-tunes",
          sourceName: "Hidden Tunes",
          type: "r2",
        })
      );

      if (
        !screenMountedRef.current ||
        requestIdAtStart !== searchRequestIdRef.current ||
        queryAtStart !== query.trim()
      ) {
        return;
      }

      setResults((current) =>
        orderFlatSearchResults(
          dedupeByKey([
            ...current,
            ...nextResults.map((item) => normalizeSearchTrack(item)),
          ]),
          safeText
        )
      );
      setSearchPage(nextPage);
      setHasMoreHiddenResults(page.hasMore);
    } catch (error) {
    } finally {
      loadingMoreResultsRef.current = false;
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

  const commitSearch = useCallback(
    (text: string, source: SearchType = activeSource) => {
      handleQueryChange(text);
      scheduleNetworkSearch(text, source);
    },
    [activeSource, handleQueryChange, scheduleNetworkSearch]
  );

  const handleSongResultPress = useCallback(
    (rawSong: HiddenTunesNormalizedSong | NativeSearchTrack | any, index: number) => {
      const tapKey = `${String(rawSong?.id || "row")}:${index}`;
      if (shouldIgnoreDuplicateTap(searchPlayTapRef.current, tapKey)) {
        return;
      }

      let song = normalizePlayableSong(rawSong);
      if (!hasPlayableAudio(song)) {
        song = resolveSearchPlayableSong(rawSong, catalogLookupSources);
      }

      if (!hasPlayableAudio(song)) {
        if (__DEV__) {
          console.warn("[SearchTap] missing audio — playback skipped", {
            id: song?.id,
            title: song?.title,
            index,
          });
        }
        return;
      }

      const queueBase = searchPlayQueue.length > 0 ? searchPlayQueue : [song];
      let queue = queueBase;
      let playIndex = index;

      if (
        playIndex < 0 ||
        playIndex >= queue.length ||
        String(queue[playIndex]?.id) !== String(song.id)
      ) {
        playIndex = queue.findIndex(
          (item) => String(item.id) === String(song.id)
        );
      }

      if (playIndex < 0) {
        queue = [
          song,
          ...queue.filter((item) => String(item.id) !== String(song.id)),
        ];
        playIndex = 0;
      }

      void playSong(song, queue, playIndex).catch((error: unknown) => {
        if (__DEV__) {
          console.warn("[SearchTap] playSong failed", error);
        }
      });

      requestAnimationFrame(() => {
        router.push("/player" as any);
      });
    },
    [catalogLookupSources, playSong, searchPlayQueue]
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

    // Prefer unambiguous catalog UUID over name-only legacy profile.
    const catalogArtists = extractHiddenTunesArtists(
      getHiddenTunesCatalogSnapshot(),
    );
    const match = resolveArtistFromList(catalogArtists, artist);
    if (match?.id && canOpenArtistProfileById(match.id)) {
      router.push({
        pathname: "/artist/[id]",
        params: { id: String(match.id) },
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

  const handlePress = useCallback(
    (item: SearchResultTrack, index: number) => {
      if (isYouTubeTrack(item)) {
        void stopPlayback();

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

      handleSongResultPress(item, index);
    },
    [buildYouTubeQueue, handleSongResultPress, stopPlayback]
  );

  const renderResult = useCallback(
    ({ item, index }: { item: SearchResultTrack; index: number }) => (
      <SearchResultRow
        item={item}
        index={index}
        handlersRef={searchRowHandlersRef}
      />
    ),
    []
  );

  searchRowHandlersRef.current = {
    handlePress,
    handleSongResultPress,
    openArtistFromTrack,
    openAlbumFromTrack,
  };

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
    [activeSource, commitSearch]
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

  const handleArtistResultPress = useCallback(
    (artist: HiddenTunesArtist) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[search] visible result tapped", "artist", artist?.name);
      }
      openGroupedArtist(artist);
    },
    [openGroupedArtist]
  );

  const handleAlbumResultPress = useCallback(
    (album: HiddenTunesAlbum) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[search] visible result tapped", "album", album?.title);
      }
      openGroupedAlbum(album);
    },
    [openGroupedAlbum]
  );

  const handleGenreResultPress = useCallback(
    (genre: any) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(
          "[search] visible result tapped",
          "genre",
          String(genre?.title || "")
        );
      }
      openGenre(genre as GenreItem);
    },
    [openGenre]
  );

  const handleTvResultPress = useCallback(
    (video: HiddenTunesTvVideo) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[search] visible result tapped", "tv", video?.title);
      }
      openGroupedTv(video);
    },
    [openGroupedTv]
  );

  const handleUniversalSongPress = useCallback(
    (song: any) => {
      const playIndex = searchPlayQueue.findIndex(
        (item) => String(item.id) === String(song?.id)
      );
      handleSongResultPress(song, playIndex >= 0 ? playIndex : 0);
    },
    [handleSongResultPress, searchPlayQueue]
  );

  const handleUniversalSuggestionPress = useCallback(
    (text: string) => commitSearch(text, activeSource),
    [activeSource, commitSearch]
  );

  const renderPremiumSearchEmpty = useCallback(() => {
    const isShortQuery =
      trimmedQuery.length >= LOCAL_SEARCH_MIN_CHARS &&
      trimmedQuery.length < API_SEARCH_MIN_CHARS;

    const suggestedSongs = cloudSongs.slice(0, 6);
    const popularArtists = cloudArtists.slice(0, 6);
    const genreSuggestions =
      matchedGenres.length > 0
        ? matchedGenres.slice(0, 6)
        : HIDDEN_TUNES_GENRES.slice(0, 6);
    const relatedSearches = recentSearches.slice(0, 4);

    return (
      <View style={styles.premiumEmptyBox}>
        <Ionicons
          name="search-outline"
          size={40}
          color={COLORS.textMuted}
          style={styles.premiumEmptyIcon}
        />
        <Text style={styles.premiumEmptyTitle}>
          {loading
            ? "Searching Hidden Tunes..."
            : isShortQuery
              ? "Keep typing to search"
              : "Explore more Hidden Tunes"}
        </Text>
        <Text style={styles.premiumEmptySub}>
          {loading
            ? "Searching your Hidden Tunes catalog..."
            : isShortQuery
              ? "Type one more letter to search the full catalog."
              : TESTER_COPY.searchNoMatch}
        </Text>
        {!loading ? (
          <>
            {relatedSearches.length > 0 ? (
              <View style={styles.premiumEmptySection}>
                <Text style={styles.premiumEmptySectionTitle}>Related searches</Text>
                <View style={styles.premiumEmptyChips}>
                  {relatedSearches.map((item) => (
                    <TouchableOpacity
                      key={`related-${item}`}
                      activeOpacity={0.86}
                      style={styles.premiumEmptyChip}
                      onPress={() => commitSearch(item, activeSource)}
                    >
                      <Text style={styles.premiumEmptyChipText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <EmotionalDiscoveryChips
              title="Emotional Worlds"
              subtitle="Open a Hidden Tunes listening room"
              style={styles.premiumEmptyDiscoveryChips}
            />

            <View style={styles.premiumEmptySection}>
              <Text style={styles.premiumEmptySectionTitle}>Trending moods</Text>
              <View style={styles.premiumEmptyChips}>
                {TRENDING_SEARCHES.slice(0, 4).map((item) => (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.86}
                    style={styles.premiumEmptyChip}
                    onPress={() => commitSearch(item, activeSource)}
                  >
                    <Text style={styles.premiumEmptyChipText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.premiumEmptySection}>
              <Text style={styles.premiumEmptySectionTitle}>Browse genres</Text>
              <View style={styles.premiumEmptyChips}>
                {genreSuggestions.map((genre) => (
                  <TouchableOpacity
                    key={genre.id}
                    activeOpacity={0.86}
                    style={styles.premiumEmptyChip}
                    onPress={() => openGenreCatalog(genre)}
                  >
                    <Text style={styles.premiumEmptyChipText}>{genre.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {popularArtists.length > 0 ? (
              <View style={styles.premiumEmptySection}>
                <Text style={styles.premiumEmptySectionTitle}>Popular artists</Text>
                <View style={styles.premiumEmptyChips}>
                  {popularArtists.map((artist) => (
                    <TouchableOpacity
                      key={String(artist.id || artist.name)}
                      activeOpacity={0.86}
                      style={styles.premiumEmptyChip}
                      onPress={() =>
                        router.push({
                          pathname: "/artist/[id]",
                          params: { id: String(artist.id || artist.name) },
                        } as any)
                      }
                    >
                      <Text style={styles.premiumEmptyChipText}>
                        {artist.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {suggestedSongs.length > 0 ? (
              <View style={styles.premiumEmptySection}>
                <Text style={styles.premiumEmptySectionTitle}>Suggested songs</Text>
                {suggestedSongs.map((track, trackIndex) => {
                  const playIndex = searchPlayQueue.findIndex(
                    (item) => String(item.id) === String(track.id)
                  );

                  return (
                    <SearchCatalogSongPressableRow
                      key={String(track.id || trackIndex)}
                      song={track}
                      index={playIndex >= 0 ? playIndex : trackIndex}
                      active={currentSongId === String(track.id)}
                      isPlayingSong={isPlaying}
                      onRowPress={handleSongResultPress}
                    />
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }, [
    activeSource,
    cloudArtists,
    cloudSongs,
    commitSearch,
    currentSongId,
    handleSongResultPress,
    isPlaying,
    loading,
    matchedGenres,
    recentSearches,
    searchPlayQueue,
    trimmedQuery,
  ]);

  function renderDiscovery() {
    return (
      <>
        <View style={styles.cloudStatus}>
          <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
          <Text style={styles.cloudStatusText}>
            {cloudSongs.length} songs ready
          </Text>
        </View>

        {cloudSongs.length > 0 ? (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{LAUNCH_CONTENT_LABELS.trendingNow}</Text>
              <Text style={styles.sectionSub}>Fresh momentum across Hidden Tunes</Text>
            </View>

            {cloudSongs.slice(0, 6).map((track, trackIndex) => {
              const playIndex = searchPlayQueue.findIndex(
                (item) => String(item.id) === String(track.id)
              );

              return (
                <View key={`trending-${track.id}`} style={styles.groupedSongRowWrap}>
                  <SearchCatalogSongPressableRow
                    song={track}
                    index={playIndex >= 0 ? playIndex : trackIndex}
                    subtitle={track.artist}
                    onRowPress={handleSongResultPress}
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        <LaunchContentChips
          title={LAUNCH_CONTENT_LABELS.featuredVideos}
          chips={buildFeaturedVideoChips(4)}
          nested={false}
        />

        <LaunchContentChips
          title={LAUNCH_CONTENT_LABELS.featuredPodcasts}
          chips={buildFeaturedPodcastChips(4)}
          nested={false}
        />

        <LaunchContentChips
          title={LAUNCH_CONTENT_LABELS.continueExploring}
          chips={CONTINUE_EXPLORING_CHIPS}
          nested={false}
        />

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
            <Text style={styles.sectionTitle}>Continue The Thread</Text>
            <Text style={styles.sectionSub}>Songs ready to restart the moment</Text>
          </View>

          {loadingCloud ? (
            <View style={styles.loadingMini}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingMiniText}>Preparing songs...</Text>
            </View>
          ) : (
            continueListening.map((track, trackIndex) => {
              const playIndex = searchPlayQueue.findIndex(
                (item) => String(item.id) === String(track.id)
              );

              return (
                <View key={track.id} style={styles.groupedSongRowWrap}>
                  <SearchCatalogSongPressableRow
                    song={track}
                    index={playIndex >= 0 ? playIndex : trackIndex}
                    subtitle={track.artist}
                    onRowPress={handleSongResultPress}
                  />
                </View>
              );
            })
          )}
        </View>

        {cloudAlbums.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Albums With Depth</Text>
              <Text style={styles.sectionSub}>Releases ready for a longer listen</Text>
            </View>

            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
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

            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
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
              <Text style={styles.sectionTitle}>{LAUNCH_CONTENT_LABELS.featuredPlaylists}</Text>
              <Text style={styles.sectionSub}>Curated paths through the catalog</Text>
            </View>

            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
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

        <SubtleRadioEntryLink style={styles.searchTvEntry} />
        <SubtleTvEntryLink style={styles.searchTvEntry} />
        <SubtlePodcastEntryLink style={styles.searchTvEntry} />
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
            Search songs, moods, artists, albums, and genres
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
        nestedScrollEnabled
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
                  scheduleNetworkSearch(query, source);
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

      {loading && !showGroupedSearch ? (
        <View style={styles.loadingBox}>
          <View style={styles.loadingTitleRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Searching Hidden Tunes...</Text>
          </View>
          <SearchSkeletonRows />
        </View>
      ) : (
        <FlatList
          ref={resultListRef}
          data={listResults}
          keyExtractor={resultKeyExtractor}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 180 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={resultListPerformance.initialNumToRender}
          maxToRenderPerBatch={resultListPerformance.maxToRenderPerBatch}
          windowSize={resultListPerformance.windowSize}
          updateCellsBatchingPeriod={resultListPerformance.updateCellsBatchingPeriod}
          getItemLayout={listResults.length > 0 ? searchResultLayout : undefined}
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

              {showMoodRadioCard ? (
                <SearchMoodRadioCard
                  queryLabel={moodRadioQueryLabel}
                  onPress={openSearchRadio}
                />
              ) : null}

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
                    nestedScrollEnabled
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

              {loading && showGroupedSearch ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingInlineText}>
                    Searching Hidden Tunes...
                  </Text>
                </View>
              ) : null}

              {showPremiumSearchEmpty ? renderPremiumSearchEmpty() : null}

              {showGroupedSearch && groupedMainSongHits.length > 0 ? (
                <View style={styles.groupedSongSection}>
                  <View style={styles.compactSectionHeader}>
                    <Text style={styles.compactSectionTitle}>Songs</Text>
                    <Text style={styles.compactSectionSub}>
                      {groupedMainSongHits.length} ready to play
                    </Text>
                  </View>

                  {groupedMainSongHits.map((hit, hitIndex) => {
                    const playIndex = searchPlayQueue.findIndex(
                      (item) =>
                        String(item.id) === String(hit.payload?.id || "")
                    );

                    return (
                      <SearchGroupedMainSongRow
                        key={hit.id}
                        hit={hit}
                        index={playIndex >= 0 ? playIndex : hitIndex}
                        active={
                          currentSongId === String(hit.payload?.id || "")
                        }
                        isPlayingSong={isPlaying}
                        onRowPress={handleSongResultPress}
                      />
                    );
                  })}
                </View>
              ) : null}

              {showGroupedSearch && !showPremiumSearchEmpty ? (
                <UniversalSearchGroupedResults
                  grouped={groupedForUniversalSearch}
                  query={trimmedQuery}
                  onSongPress={handleUniversalSongPress}
                  onLyricPress={handleUniversalSongPress}
                  onArtistPress={handleArtistResultPress}
                  onAlbumPress={handleAlbumResultPress}
                  onGenrePress={handleGenreResultPress}
                  onTvPress={handleTvResultPress}
                  onSuggestionPress={handleUniversalSuggestionPress}
                  activeSongId={currentSongId}
                  isPlaying={isPlaying}
                  showEmpty={false}
                />
              ) : null}

              {!showGroupedSearch || listResults.length > 0 ? (
                <View style={styles.compactSectionHeader}>
                  <Text style={styles.compactSectionTitle}>
                    {showGroupedSearch ? "All Matches" : "Hidden Tunes Matches"}
                  </Text>
                  <Text style={styles.compactSectionSub}>
                    {results.length > 0
                      ? `${results.length} tracks found • ready`
                      : showGroupedSearch
                        ? "Hidden Tunes catalog matches"
                        : "Start typing to discover"}
                  </Text>
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            showGroupedSearch
              ? null
              : shouldShowCatalogEmpty({
                  hasCheckedFallbacks: hasCheckedSearchFallbacks,
                  isLoading: loading,
                  isRefreshing: refreshing,
                  resolvedCount: listResults.length,
                }) && query.trim().length >= API_SEARCH_MIN_CHARS ? (
            renderPremiumSearchEmpty()
            ) : null
          }
          ListFooterComponent={
            <>
              {loadingMoreResults ? (
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
              ) : null}
              {showGroupedSearch ? (
                <>
                  <SubtleRadioEntryLink style={styles.searchTvEntry} />
                  <SubtleTvEntryLink style={styles.searchTvEntry} />
                  <SubtlePodcastEntryLink style={styles.searchTvEntry} />
                </>
              ) : null}
            </>
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
  searchTvEntry: {
    marginTop: 8,
    marginBottom: 20,
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
  groupedSongSection: {
    marginBottom: 14,
  },
  compactSectionHeader: {
    marginBottom: 10,
  },
  compactSectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  compactSectionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  premiumEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  premiumEmptyIcon: {
    marginBottom: 12,
    opacity: 0.85,
  },
  premiumEmptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  premiumEmptySub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  premiumEmptyChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  premiumEmptySection: {
    width: "100%",
    marginTop: 18,
    alignItems: "flex-start",
  },
  premiumEmptyDiscoveryChips: {
    width: "100%",
    marginHorizontal: 0,
    marginTop: 18,
    marginBottom: 0,
  },
  premiumEmptySectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  premiumEmptyChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  premiumEmptyChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  compactTvSection: {
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 4,
  },
  compactTvRow: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  compactTvArtwork: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  compactTvTextCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  compactTvRowTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  compactTvRowSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },
  compactTvBrowseLink: {
    marginTop: 4,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  compactTvBrowseText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  groupedSongRowWrap: {
    marginBottom: 10,
  },
  catalogSongRowPressable: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 28,
    overflow: "hidden",
  },
  catalogSongRowPressableWithActions: {
    marginRight: 0,
  },
  catalogSongRowActive: {
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
  },
  catalogSongRowPressed: {
    opacity: 0.92,
  },
  catalogSongRowCard: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  catalogSongRowCardWithActions: {
    paddingRight: 188,
  },
  catalogSongArtwork: {
    width: 82,
    height: 82,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  catalogSongTextCol: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 8,
  },
  catalogSongTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  catalogSongSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
    fontWeight: "600",
  },
  catalogSongLyric: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  catalogSongNowPlaying: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
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
    zIndex: 4,
    elevation: 4,
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
  playButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
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
