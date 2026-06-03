import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import AppShell from "@/components/navigation/AppShell";
import { SubtleTvEntryLink } from "@/components/EmotionalDiscoveryChips";
import HTImage from "@/components/HTImage";
import LiveWaveform from "@/components/LiveWaveform";
import NeonEQ from "@/components/NeonEQ";
import UnifiedMediaCard from "@/components/UnifiedMediaCard";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "@/services/hiddenTunes";
import {
  searchHiddenTunesSongs,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "@/services/hiddenTunesApi";
import { searchArchiveAudio } from "@/services/archiveSearch";
import { searchJamendoMusic } from "@/services/jamendoSearch";
import { fetchTvCatalog, type HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import {
  runInstantCatalogSearch,
  type InstantSearchCatalog,
} from "@/services/instantCatalogSearch";
import type { UniversalSearchGroupedResults as SearchGroupedResults } from "@/services/universalSearchService";
import type { HiddenTunesGenre } from "@/utils/genres";

const EMPTY_SEARCH_RESULTS: SearchGroupedResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  tv: [],
  hasAnyResults: false,
};

const CATALOG_PAGE_SIZE = 31;
const SEARCH_FULL_CATALOG_TARGET = 1000;
const SEARCH_EXTERNAL_AUDIO_LIMIT = 16;
const SEARCH_TV_LIMIT = 8;

type CatalogGroup = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  songs: HiddenTunesSong[];
  type: "mood" | "genre";
};

function getArtwork(song?: HiddenTunesSong | null) {
  return song?.cover || song?.artwork || song?.thumbnail || "";
}

function songText(song: HiddenTunesSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood, song.lyrics]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqSongs(songs: HiddenTunesSong[]) {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildMatchedGroup(
  id: string,
  title: string,
  terms: string[],
  songs: HiddenTunesSong[],
  type: "mood" | "genre" = "mood"
): CatalogGroup | null {
  const matches = songs.filter((song) => {
    const text = songText(song);
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
  const groupSongs = uniqSongs(matches).slice(0, 18);
  if (!groupSongs.length) return null;
  return {
    id,
    title,
    subtitle: `${groupSongs.length} song${groupSongs.length === 1 ? "" : "s"}`,
    artwork: getArtwork(groupSongs[0]),
    songs: groupSongs,
    type,
  };
}

function buildMoodRooms(songs: HiddenTunesSong[]) {
  return [
    buildMatchedGroup("healing", "Healing", ["healing", "heal", "restore", "worship", "prayer", "peace"], songs),
    buildMatchedGroup("late-night", "Late Night", ["late", "night", "midnight", "after dark", "drive"], songs),
    buildMatchedGroup("calm", "Calm", ["calm", "soft", "peace", "ambient", "quiet", "instrumental"], songs),
    buildMatchedGroup("energy", "Energy", ["energy", "dance", "party", "afro", "beat", "upbeat"], songs),
  ].filter(Boolean) as CatalogGroup[];
}

function buildOpenRooms(songs: HiddenTunesSong[]) {
  return [
    buildMatchedGroup("calm-instrumentals", "Calm Instrumentals", ["instrumental", "calm", "ambient"], songs),
    buildMatchedGroup("night-drive", "Night Drive", ["night", "drive", "late", "midnight"], songs),
    buildMatchedGroup("worship-focus", "Worship Focus", ["worship", "gospel", "prayer", "jesus", "praise"], songs),
    buildMatchedGroup("healing-room", "Healing Room", ["healing", "heal", "restore", "peace"], songs),
  ].filter(Boolean) as CatalogGroup[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PremiumHeroPressable = memo(function PremiumHeroPressable({
  children,
  height,
  isActive,
  onPress,
}: {
  children: ReactNode;
  height: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(isActive ? 0.16 : 0.08);

  useEffect(() => {
    glow.value = withTiming(isActive ? 0.18 : 0.08, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [glow, isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.982, { damping: 18, stiffness: 360 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 16, stiffness: 320 });
  }, [scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.heroCard, { height }, animatedStyle]}
    >
      <Animated.View style={[styles.heroActiveGlow, glowStyle]} pointerEvents="none" />
      {children}
    </AnimatedPressable>
  );
});

type HeroCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

function toNormalizedSongs(songs: HiddenTunesSong[]) {
  return songs as unknown as HiddenTunesNormalizedSong[];
}

function toSearchAlbums(albums: HiddenTunesAlbumCatalogItem[]) {
  return albums.map((album) => ({
    id: album.id,
    title: album.title,
    slug: album.id,
    artist: album.artist,
    artwork: album.artwork,
    tracks: toNormalizedSongs(album.songs),
  })) as HiddenTunesAlbum[];
}

function toSearchArtists(artists: HiddenTunesArtistCatalogItem[]) {
  return artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    slug: artist.id,
    artwork: artist.artwork,
    cover: artist.artwork,
    thumbnail: artist.artwork,
    albums: toSearchAlbums(artist.albums),
    tracks: toNormalizedSongs(artist.songs),
  })) as HiddenTunesArtist[];
}

function toSearchGenres(genres: HiddenTunesGenreCatalogItem[]) {
  return genres.map((genre) => ({
    id: genre.id,
    title: genre.title,
    query: genre.title,
    emoji: "",
  })) as HiddenTunesGenre[];
}

function normalizeExternalSearchSong(track: any, index: number): HiddenTunesNormalizedSong {
  const sourceName = String(track?.sourceName || "External");
  const id = String(track?.id || `${sourceName}-${track?.artist || "artist"}-${track?.title || "track"}-${index}`);
  const artwork = track?.cover || track?.artwork || track?.thumbnail || "";
  const streamUrl = track?.streamUrl || track?.url || track?.audio || "";

  return {
    id,
    title: String(track?.title || "Untitled"),
    artist: String(track?.artist || sourceName),
    album: track?.album ? String(track.album) : undefined,
    genre: track?.genre ? String(track.genre) : undefined,
    mood: track?.mood ? String(track.mood) : undefined,
    cover: artwork,
    artwork,
    thumbnail: artwork,
    streamUrl,
    url: streamUrl,
    sourceName,
    source: String(track?.source || sourceName.toLowerCase()),
    type: String(track?.type || sourceName.toLowerCase()),
    isOnline: true,
    raw: track,
  } as HiddenTunesNormalizedSong;
}

function countAudioSearchResults(results: SearchGroupedResults) {
  return results.songs.length + results.lyrics.length;
}

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

function mergeSearchGroupedResults(
  primary: SearchGroupedResults,
  fallback: SearchGroupedResults
): SearchGroupedResults {
  const mergeHits = <T extends { id: string }>(primaryHits: T[], fallbackHits: T[]) => {
    const seen = new Set<string>();
    const merged: T[] = [];

    [...primaryHits, ...fallbackHits].forEach((hit) => {
      if (!hit?.id || seen.has(hit.id)) return;
      seen.add(hit.id);
      merged.push(hit);
    });

    return merged;
  };

  const topResults = mergeHits(primary.topResults, fallback.topResults).slice(0, 10);
  const songs = mergeHits(primary.songs, fallback.songs);
  const lyrics = mergeHits(primary.lyrics, fallback.lyrics);
  const artists = mergeHits(primary.artists, fallback.artists);
  const albums = mergeHits(primary.albums, fallback.albums);
  const genreMoods = mergeHits(primary.genreMoods, fallback.genreMoods);
  const tv = mergeHits(primary.tv, fallback.tv);

  return {
    topResults,
    songs,
    lyrics,
    artists,
    albums,
    genreMoods,
    tv,
    hasAnyResults:
      topResults.length > 0 ||
      songs.length > 0 ||
      lyrics.length > 0 ||
      artists.length > 0 ||
      albums.length > 0 ||
      genreMoods.length > 0 ||
      tv.length > 0,
  };
}

function buildHeroCards(
  songs: HiddenTunesSong[],
  featuredSongs: HiddenTunesSong[],
  currentSong: { id?: string; title?: string; artist?: string; user?: { name?: string } } | null,
  recentlyPlayed: Array<{ id?: string; title?: string; artist?: string }>
): HeroCard[] {
  const cards: HeroCard[] = [];
  const primary = featuredSongs[0] || songs[0];
  const pick = featuredSongs[1] || featuredSongs[0];
  const genreSong = featuredSongs.find((song) => song.genre) || songs.find((song) => song.genre);
  const recent = recentlyPlayed[0];

  if (currentSong && primary) {
    const match =
      songs.find((song) => String(song.id) === String(currentSong.id)) ||
      (primary as HiddenTunesSong);

    cards.push({
      key: `current-${match.id}`,
      label: "NOW PLAYING",
      title: currentSong.title || match.title || "Now playing",
      subtitle:
        currentSong.artist ||
        currentSong.user?.name ||
        match.artist ||
        "Hidden Tunes",
      song: match as unknown as HiddenTunesNormalizedSong,
      icon: "pulse",
      isCurrent: true,
    });
  }

  if (primary) {
    cards.push({
      key: `featured-${primary.id}`,
      label: "FEATURED",
      title: primary.title,
      subtitle: primary.artist || "Hidden Tunes",
      song: primary as unknown as HiddenTunesNormalizedSong,
      icon: "sparkles",
    });
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: "PICK",
      title: pick.title,
      subtitle: pick.artist || "Editor pick",
      song: pick as unknown as HiddenTunesNormalizedSong,
      icon: "cloud-done",
    });
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: genreSong.artist || "Genre spotlight",
      song: genreSong as unknown as HiddenTunesNormalizedSong,
      icon: "albums",
    });
  }

  if (recent) {
    const recentSong =
      songs.find((song) => String(song.id) === String(recent.id)) || primary;

    if (recentSong) {
      cards.push({
        key: `recent-${recentSong.id}`,
        label: "RECENTLY PLAYED",
        title: recent.title || recentSong.title,
        subtitle: recent.artist || recentSong.artist || "In rotation",
        song: recentSong as unknown as HiddenTunesNormalizedSong,
        icon: "time",
      });
    }
  }

  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.key)) return false;
    seen.add(card.key);
    return true;
  }).slice(0, 6);
}

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites, activeQueue } = usePlayerState();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [backendSearchSongs, setBackendSearchSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [backendSearchQuery, setBackendSearchQuery] = useState("");
  const [backendSearchCompletedQuery, setBackendSearchCompletedQuery] = useState("");
  const [externalSearchSongs, setExternalSearchSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [externalSearchQuery, setExternalSearchQuery] = useState("");
  const [externalSearchCompletedQuery, setExternalSearchCompletedQuery] = useState("");
  const [tvSearchVideos, setTvSearchVideos] = useState<HiddenTunesTvVideo[]>([]);
  const [tvSearchQuery, setTvSearchQuery] = useState("");
  const [tvSearchCompletedQuery, setTvSearchCompletedQuery] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(CATALOG_PAGE_SIZE);
  const [searchAutoFocusKey, setSearchAutoFocusKey] = useState(0);
  const heroIndexRef = useRef(0);
  const heroListRef = useRef<FlatList<HeroCard> | null>(null);
  const backendSearchRequestIdRef = useRef(0);
  const externalSearchRequestIdRef = useRef(0);
  const tvSearchRequestIdRef = useRef(0);
  const { width: viewportWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(520, Math.max(300, viewportWidth - 36));
  const heroCardHeight = Math.min(292, Math.max(226, Math.round(heroCardWidth * 0.65)));
  const railCardWidth = Math.min(244, Math.max(204, viewportWidth * 0.62));
  const searchPanelPadding = viewportWidth < 380 ? 12 : 14;

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setVisibleCatalogCount(CATALOG_PAGE_SIZE);
    setRefreshing(false);
  }, []);

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);
  const featuredSongs = useMemo(() => songs.slice(0, 8), [songs]);
  const moodGenreChips = useMemo(() => genres.slice(0, 4), [genres]);
  const recentlyAddedSongs = useMemo(() => songs.slice(0, 12), [songs]);
  const moodRooms = useMemo(() => buildMoodRooms(songs), [songs]);
  const openRooms = useMemo(() => buildOpenRooms(songs), [songs]);
  const visibleArtists = useMemo(() => artists.slice(0, 12), [artists]);
  const visibleAlbums = useMemo(() => albums.slice(0, 12), [albums]);
  const visibleGenres = useMemo(() => genres.slice(0, 10), [genres]);
  const visibleCatalogSongs = useMemo(() => songs.slice(0, visibleCatalogCount), [songs, visibleCatalogCount]);
  const canLoadMore = visibleCatalogCount < songs.length;

  const becauseYouListened = useMemo(() => {
    const recentArtists = new Set(
      (Array.isArray(recentlyPlayed) ? recentlyPlayed : [])
        .map((entry) => String(entry?.artist || "").toLowerCase())
        .filter(Boolean)
    );
    const favoriteArtists = new Set((favorites || []).map((song: any) => String(song.artist || "").toLowerCase()));
    const candidates = songs.filter((song) => {
      const artist = String(song.artist || "").toLowerCase();
      return recentArtists.has(artist) || favoriteArtists.has(artist);
    });
    return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(0, 12);
  }, [favorites, recentlyPlayed, songs]);

  const smartQueueSongs = useMemo(() => {
    const queueSongs = Array.isArray(activeQueue) ? (activeQueue as HiddenTunesSong[]) : [];
    return uniqSongs((queueSongs.length ? queueSongs : songs.slice(12, 30)).filter(Boolean)).slice(0, 12);
  }, [activeQueue, songs]);

  const heroCards = useMemo(
    () =>
      buildHeroCards(
        songs,
        featuredSongs,
        currentSong,
        Array.isArray(recentlyPlayed) ? recentlyPlayed : []
      ),
    [currentSong, featuredSongs, recentlyPlayed, songs]
  );

  const searchCatalog = useMemo<InstantSearchCatalog>(() => ({
    songs: toNormalizedSongs(songs),
    albums: toSearchAlbums(albums),
    artists: toSearchArtists(artists),
    genres: toSearchGenres(genres),
    tvVideos: [],
  }), [albums, artists, genres, songs]);

  const backendSearchCatalog = useMemo<InstantSearchCatalog>(() => ({
    songs: backendSearchSongs,
    albums: [],
    artists: [],
    genres: [],
    tvVideos: [],
  }), [backendSearchSongs]);

  const externalSearchCatalog = useMemo<InstantSearchCatalog>(() => ({
    songs: externalSearchSongs,
    albums: [],
    artists: [],
    genres: [],
    tvVideos: [],
  }), [externalSearchSongs]);

  const tvSearchCatalog = useMemo<InstantSearchCatalog>(() => ({
    songs: [],
    albums: [],
    artists: [],
    genres: [],
    tvVideos: tvSearchVideos,
  }), [tvSearchVideos]);

  const cleanSubmittedSearchQuery = submittedSearchQuery.trim();

  const localSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;

    const result = runInstantCatalogSearch(searchCatalog, cleanSubmittedSearchQuery);

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("search_catalog_source", {
        source: "local_catalog",
        query: cleanSubmittedSearchQuery,
        songCount: searchCatalog.songs.length,
      });
      console.log("search_local_results_count", {
        query: cleanSubmittedSearchQuery,
        count: result.songs.length + result.lyrics.length,
        hasAnyResults: result.hasAnyResults,
      });
    }

    return result;
  }, [cleanSubmittedSearchQuery, searchCatalog]);

  const shouldRunBackendSearch =
    cleanSubmittedSearchQuery.length >= 2 &&
    !loading &&
    (songs.length < SEARCH_FULL_CATALOG_TARGET || !localSearchResults.hasAnyResults);

  useEffect(() => {
    const query = cleanSubmittedSearchQuery;

    if (query.length < 2) {
      const requestId = backendSearchRequestIdRef.current + 1;
      backendSearchRequestIdRef.current = requestId;
      setTimeout(() => {
        if (backendSearchRequestIdRef.current !== requestId) return;
        setBackendSearchSongs([]);
        setBackendSearchQuery("");
        setBackendSearchCompletedQuery("");
        setExternalSearchSongs([]);
        setExternalSearchQuery("");
        setExternalSearchCompletedQuery("");
        setTvSearchVideos([]);
        setTvSearchQuery("");
        setTvSearchCompletedQuery("");
      }, 0);
      return;
    }

    if (loading) return;

    if (!shouldRunBackendSearch) {
      const requestId = backendSearchRequestIdRef.current + 1;
      backendSearchRequestIdRef.current = requestId;
      setTimeout(() => {
        if (backendSearchRequestIdRef.current !== requestId) return;
        setBackendSearchSongs([]);
        setBackendSearchQuery(query);
        setBackendSearchCompletedQuery(query);
      }, 0);
      return;
    }

    const requestId = backendSearchRequestIdRef.current + 1;
    backendSearchRequestIdRef.current = requestId;
    setTimeout(() => {
      if (backendSearchRequestIdRef.current !== requestId) return;
      setBackendSearchQuery(query);
      setBackendSearchCompletedQuery("");
    }, 0);

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("search_catalog_source", {
        source: songs.length < SEARCH_FULL_CATALOG_TARGET ? "backend_incomplete_catalog" : "backend_empty_local_fallback",
        query,
        localSongCount: songs.length,
      });
    }

    void searchHiddenTunesSongs(query)
      .then((results) => {
        if (backendSearchRequestIdRef.current !== requestId) return;

        setBackendSearchSongs(results);

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("search_backend_results_count", {
            query,
            count: results.length,
          });
        }
      })
      .catch((error) => {
        if (backendSearchRequestIdRef.current !== requestId) return;
        console.log("Search backend fallback error:", error);
        setBackendSearchSongs([]);
      })
      .finally(() => {
        if (backendSearchRequestIdRef.current !== requestId) return;
        setBackendSearchCompletedQuery(query);
      });
  }, [cleanSubmittedSearchQuery, loading, localSearchResults.hasAnyResults, shouldRunBackendSearch, songs.length]);

  const backendSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    if (backendSearchQuery !== cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (!backendSearchSongs.length) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(backendSearchCatalog, cleanSubmittedSearchQuery);
  }, [backendSearchCatalog, backendSearchQuery, backendSearchSongs.length, cleanSubmittedSearchQuery]);

  const audioSearchBeforeExternal = useMemo(() => {
    return mergeSearchGroupedResults(localSearchResults, backendSearchResults);
  }, [backendSearchResults, localSearchResults]);

  const backendSearchPendingForQuery =
    shouldRunBackendSearch &&
    backendSearchCompletedQuery !== cleanSubmittedSearchQuery;

  const shouldRunExternalSearch =
    cleanSubmittedSearchQuery.length >= 2 &&
    !loading &&
    !backendSearchPendingForQuery;

  useEffect(() => {
    const query = cleanSubmittedSearchQuery;

    if (query.length < 2) {
      const requestId = externalSearchRequestIdRef.current + 1;
      externalSearchRequestIdRef.current = requestId;
      setTimeout(() => {
        if (externalSearchRequestIdRef.current !== requestId) return;
        setExternalSearchSongs([]);
        setExternalSearchQuery("");
        setExternalSearchCompletedQuery("");
      }, 0);
      return;
    }

    if (!shouldRunExternalSearch) return;

    const requestId = externalSearchRequestIdRef.current + 1;
    externalSearchRequestIdRef.current = requestId;
    setTimeout(() => {
      if (externalSearchRequestIdRef.current !== requestId) return;
      setExternalSearchQuery(query);
      setExternalSearchCompletedQuery("");
    }, 0);

    void Promise.all([
      searchJamendoMusic(query),
      searchArchiveAudio(query),
    ])
      .then(([jamendo, archive]) => {
        if (externalSearchRequestIdRef.current !== requestId) return;

        const externalSongs = [...jamendo, ...archive]
          .slice(0, SEARCH_EXTERNAL_AUDIO_LIMIT)
          .map(normalizeExternalSearchSong);

        setExternalSearchSongs(externalSongs);

        console.log("search_layer_completed", {
          layer: "external_audio",
          query,
          count: externalSongs.length,
        });
        console.log("external_audio_results_merged", {
          query,
          count: externalSongs.length,
        });

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("search_external_results_count", {
            query,
            count: externalSongs.length,
          });
        }
      })
      .catch((error) => {
        if (externalSearchRequestIdRef.current !== requestId) return;
        console.log("Search external fallback error:", error);
        setExternalSearchSongs([]);
      })
      .finally(() => {
        if (externalSearchRequestIdRef.current !== requestId) return;
        setExternalSearchCompletedQuery(query);
      });
  }, [cleanSubmittedSearchQuery, loading, shouldRunExternalSearch]);

  const externalSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    if (externalSearchQuery !== cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (!externalSearchSongs.length) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(externalSearchCatalog, cleanSubmittedSearchQuery);
  }, [cleanSubmittedSearchQuery, externalSearchCatalog, externalSearchQuery, externalSearchSongs.length]);

  const audioSearchResults = useMemo(() => {
    return mergeSearchGroupedResults(audioSearchBeforeExternal, externalSearchResults);
  }, [audioSearchBeforeExternal, externalSearchResults]);

  const externalSearchPendingForQuery =
    shouldRunExternalSearch &&
    externalSearchCompletedQuery !== cleanSubmittedSearchQuery;

  const shouldRunTvSearch =
    cleanSubmittedSearchQuery.length >= 2 &&
    !loading &&
    !backendSearchPendingForQuery &&
    !externalSearchPendingForQuery;

  useEffect(() => {
    const query = cleanSubmittedSearchQuery;

    if (query.length < 2) {
      const requestId = tvSearchRequestIdRef.current + 1;
      tvSearchRequestIdRef.current = requestId;
      setTimeout(() => {
        if (tvSearchRequestIdRef.current !== requestId) return;
        setTvSearchVideos([]);
        setTvSearchQuery("");
        setTvSearchCompletedQuery("");
      }, 0);
      return;
    }

    if (!shouldRunTvSearch) return;

    const requestId = tvSearchRequestIdRef.current + 1;
    tvSearchRequestIdRef.current = requestId;
    setTimeout(() => {
      if (tvSearchRequestIdRef.current !== requestId) return;
      setTvSearchQuery(query);
      setTvSearchCompletedQuery("");
    }, 0);

    void fetchTvCatalog({ q: query, page: 1, limit: SEARCH_TV_LIMIT })
      .then((response) => {
        if (tvSearchRequestIdRef.current !== requestId) return;

        const videos = response.success ? response.videos : [];
        setTvSearchVideos(videos);

        console.log("search_layer_completed", {
          layer: "tv_fallback",
          query,
          count: videos.length,
          audioResultCount: countAudioSearchResults(audioSearchResults),
        });
        console.log("tv_fallback_results_merged", {
          query,
          count: videos.length,
          audioResultCount: countAudioSearchResults(audioSearchResults),
        });

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("search_tv_results_count", {
            query,
            count: videos.length,
            audioResultCount: countAudioSearchResults(audioSearchResults),
          });
        }
      })
      .catch((error) => {
        if (tvSearchRequestIdRef.current !== requestId) return;
        console.log("Search TV fallback error:", error);
        setTvSearchVideos([]);
      })
      .finally(() => {
        if (tvSearchRequestIdRef.current !== requestId) return;
        setTvSearchCompletedQuery(query);
      });
  }, [audioSearchResults, cleanSubmittedSearchQuery, loading, shouldRunTvSearch]);

  const tvSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    if (tvSearchQuery !== cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (!tvSearchVideos.length) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(tvSearchCatalog, cleanSubmittedSearchQuery);
  }, [cleanSubmittedSearchQuery, tvSearchCatalog, tvSearchQuery, tvSearchVideos.length]);

  const tvSearchPendingForQuery =
    shouldRunTvSearch &&
    tvSearchCompletedQuery !== cleanSubmittedSearchQuery;

  const searchResults = useMemo(() => {
    return mergeSearchGroupedResults(audioSearchResults, tvSearchResults);
  }, [audioSearchResults, tvSearchResults]);

  const searchResultSongs = useMemo(() => {
    const seen = new Set<string>();
    const collected: HiddenTunesSong[] = [];

    [
      ...audioSearchResults.topResults,
      ...audioSearchResults.songs,
      ...audioSearchResults.lyrics,
    ].forEach((hit) => {
      if (!hit.id.startsWith("song:") && !hit.id.startsWith("lyric:")) return;
      const song = hit.payload as HiddenTunesSong;
      const id = String(song?.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      collected.push(song);
    });

    console.log("search_queue_built", {
      query: cleanSubmittedSearchQuery,
      queueLength: collected.length,
      internalAndExternalAudioOnly: true,
      tvFallbackKeptOutOfAudioQueue: true,
    });

    return collected;
  }, [audioSearchResults, cleanSubmittedSearchQuery]);

  const hasSearchText = searchQuery.trim().length > 0;
  const cleanSearchQuery = searchQuery.trim();
  const searchDebouncePending = cleanSearchQuery.length >= 2 && cleanSearchQuery !== cleanSubmittedSearchQuery;
  const backendSearchPending = backendSearchPendingForQuery;
  const externalSearchPending = externalSearchPendingForQuery;
  const tvSearchPending = tvSearchPendingForQuery;
  const showSearchResults =
    !loading &&
    cleanSubmittedSearchQuery.length >= 2 &&
    !searchDebouncePending &&
    !backendSearchPending &&
    !externalSearchPending &&
    !tvSearchPending;
  const showSearchLoading =
    hasSearchText &&
    (loading || searchDebouncePending || backendSearchPending || externalSearchPending || tvSearchPending);

  useEffect(() => {
    if (!showSearchResults || searchResults.hasAnyResults) return;

    if (externalSearchPending || tvSearchPending) {
      console.log("search_empty_state_blocked_waiting_for_external", {
        query: cleanSubmittedSearchQuery,
        externalSearchPending,
        tvSearchPending,
      });
      return;
    }

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("search_empty_state_shown", {
        query: cleanSubmittedSearchQuery,
        localSongCount: songs.length,
        backendSongCount: backendSearchSongs.length,
        externalSongCount: externalSearchSongs.length,
        tvResultCount: tvSearchVideos.length,
      });
    }
  }, [backendSearchSongs.length, cleanSubmittedSearchQuery, externalSearchSongs.length, searchResults.hasAnyResults, showSearchResults, songs.length, tvSearchVideos.length]);

  useEffect(() => {
    if (heroCards.length <= 1) return;

    const timer = setInterval(() => {
      setHeroIndex((current) => {
        const next = (current + 1) % heroCards.length;
        heroIndexRef.current = next;
        heroListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 6500);

    return () => clearInterval(timer);
  }, [heroCards.length]);

  const playCatalogSong = useCallback(
    (song: HiddenTunesSong | HiddenTunesNormalizedSong) => {
      const index = findSongIndex(songs, song);
      const catalogSong = index >= 0 ? songs[index] : (song as HiddenTunesSong);
      void playSong(catalogSong, songs, Math.max(index, 0), {
        source: "full_catalog",
        label: "Full Catalog",
        genre: catalogSong.genre,
        mood: catalogSong.mood,
        artistName: catalogSong.artist,
      });
    },
    [playSong, songs]
  );

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem | HiddenTunesArtist) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, []);

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre | CatalogGroup) => {
    router.push({
      pathname: "/genre",
      params: {
        title: genre.title,
        query: genre.title,
        id: genre.id,
        type: "type" in genre ? genre.type : "genre",
      },
    } as any);
  }, []);

  const openTv = useCallback((video: any) => {
    router.push({
      pathname: "/youtube-player",
      params: {
        videoId: video.source_id || video.id,
        title: video.title,
        channelTitle: video.channel_name || video.channelTitle || "Hidden Tunes TV",
        thumbnail: video.thumbnail_url || video.thumbnail || "",
      },
    } as any);
  }, []);

  const handleSearchImmediateChange = useCallback((text: string) => {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("search_query_changed", { query: text });
    }

    setSearchQuery(text);
    if (text.trim().length === 0) {
      setSubmittedSearchQuery("");
    }
  }, []);

  const handleSuggestionPress = useCallback((text: string) => {
    setSearchQuery(text);
    setSubmittedSearchQuery(text);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSubmittedSearchQuery("");
  }, []);

  const openSearch = useCallback(() => {
    router.push("/search" as any);
  }, []);

  const playSongFromList = useCallback(
    (song: HiddenTunesSong, queueSongs: HiddenTunesSong[], queueContext: PlaybackQueueContext) => {
      const queue = queueSongs.length ? queueSongs : songs;
      const queueIndex = findSongIndex(queue, song);
      void playSong(song, queue, Math.max(queueIndex, 0), {
        ...queueContext,
        artistName: queueContext.artistName || song.artist,
        genre: queueContext.genre || song.genre,
        mood: queueContext.mood || song.mood,
      });
    },
    [playSong, songs]
  );

  const playSearchResultSong = useCallback(
    (song: HiddenTunesSong) => {
      const queue = searchResultSongs.length ? searchResultSongs : songs;
      const queueIndex = findSongIndex(queue, song);
      const queueSong = queueIndex >= 0 ? queue[queueIndex] : song;

      const resultSourceName = String((queueSong as any).sourceName || "Hidden Tunes");
      const resultLabel =
        resultSourceName === "Hidden Tunes"
          ? "Search Results"
          : `Search Results - ${resultSourceName}`;

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("search_result_play_context", {
          query: submittedSearchQuery || searchQuery,
          queueLength: queue.length,
          queueIndex: Math.max(queueIndex, 0),
          songId: queueSong.id,
          sourceName: resultSourceName,
        });
      }

      console.log("search_queue_built", {
        query: submittedSearchQuery || searchQuery,
        queueLength: queue.length,
        queueIndex: Math.max(queueIndex, 0),
        sourceName: resultSourceName,
      });

      void playSong(queueSong, queue, Math.max(queueIndex, 0), {
        source: "search",
        label: resultLabel,
        searchQuery: submittedSearchQuery || searchQuery,
        artistName: queueSong.artist,
        genre: queueSong.genre,
        mood: queueSong.mood,
      });
    },
    [playSong, searchQuery, searchResultSongs, songs, submittedSearchQuery]
  );

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      if (card.isCurrent) {
        router.push("/player" as any);
        return;
      }

      playCatalogSong(card.song);
    },
    [playCatalogSong]
  );

  const handleHeroMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offset = event.nativeEvent.contentOffset.x || 0;
      const nextIndex = Math.max(
        0,
        Math.min(heroCards.length - 1, Math.round(offset / heroCardWidth))
      );
      heroIndexRef.current = nextIndex;
      setHeroIndex(nextIndex);
    },
    [heroCardWidth, heroCards.length]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => {
      const isPlayingCard =
        Boolean(currentSong) &&
        String(item.song?.id || "") === String(currentSong?.id || "");

      return (
        <View style={[styles.heroSlide, { width: heroCardWidth }]}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
            <PremiumHeroPressable
              height={heroCardHeight}
              isActive={isPlayingCard || index === heroIndexRef.current}
              onPress={() => handleHeroPress(item)}
            >
              <HTImage source={item.song} style={styles.heroImage} />

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.98)"]}
                style={styles.heroOverlay}
              >
                <View style={styles.livePill}>
                  {isPlayingCard ? (
                    <NeonEQ isPlaying={isPlaying} size="small" />
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
                  <View style={styles.heroPlayButton}>
                    <Ionicons
                      name={isPlayingCard && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.heroPlayText}>
                      {isPlayingCard ? "OPEN PLAYER" : "PLAY"}
                    </Text>
                  </View>

                  {heroCards.length > 1 ? (
                    <View style={styles.heroCountPill}>
                      <Text style={styles.heroCountText}>
                        {index + 1}/{heroCards.length}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
            </PremiumHeroPressable>
          </LinearGradient>
        </View>
      );
    },
    [currentSong?.id, handleHeroPress, heroCardHeight, heroCardWidth, heroCards.length, isPlaying]
  );

  const keyExtractor = useCallback(
    (item: HiddenTunesSong, index: number) => String(item.id || index),
    []
  );

  const renderSongItem = useCallback(
    ({ item }: { item: HiddenTunesSong; index: number }) => (
      <HomeCatalogSongRow
        song={item as unknown as HiddenTunesNormalizedSong}
        image={getArtwork(item)}
        onPress={playCatalogSong as (song: HiddenTunesNormalizedSong) => void}
      />
    ),
    [playCatalogSong]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />
        <View style={styles.glowCenter} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Ionicons name="musical-notes" size={20} color="#000" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>HIDDEN TUNES</Text>
              <Text style={styles.subtitle}>For your mood</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={refreshCatalog}>
            <Ionicons name="refresh" size={22} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your music...</Text>
          </View>
        ) : songs.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="musical-notes" size={58} color={COLORS.primary} />
            </View>

            <Text style={styles.emptyTitle}>Nothing here yet</Text>

            <Text style={styles.emptyText}>New releases will appear soon.</Text>
          </View>
        ) : (
          <FlatList
            data={visibleCatalogSongs}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshCatalog}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={
              <View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.searchPanel, { padding: searchPanelPadding }]}
                  onPress={openSearch}
                >
                  <Ionicons name="search" size={20} color={COLORS.cyan} />
                  <Text style={styles.searchLauncherText}>
                    Search songs, artists, albums, lyrics
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>

                {heroCards.length > 0 ? (
                  <View style={styles.heroStage}>
                    <View style={styles.heroStageGlow} />
                    <FlatList
                      ref={heroListRef}
                      horizontal
                      data={heroCards}
                      keyExtractor={(item) => item.key}
                      renderItem={renderHeroCard}
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={heroCardWidth}
                      decelerationRate="fast"
                      onMomentumScrollEnd={handleHeroMomentumEnd}
                      onScrollToIndexFailed={() => {}}
                      contentContainerStyle={styles.heroList}
                    />

                    {heroCards.length > 1 ? (
                      <View style={styles.heroDots}>
                        {heroCards.map((card, index) => (
                          <View
                            key={card.key}
                            style={[
                              styles.heroDot,
                              index === heroIndex && styles.heroDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <>
                    <Text style={styles.catalogStatus}>{songs.length.toLocaleString()}+ songs ready</Text>

                    {moodRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>FOR YOUR MOOD</Text>
                        <Text style={styles.sectionTitle}>Mood Rooms</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {moodRooms.map((room) => (
                            <TouchableOpacity key={room.id} activeOpacity={0.88} style={styles.roomCard} onPress={() => openGenre(room)}>
                              <HTImage source={room.artwork} style={styles.roomImage} contentFit="cover" />
                              <View style={styles.roomShade} />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text style={styles.roomSubtitle}>{room.subtitle}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    <View style={styles.quickGrid}>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/playlists" as any)}>
                        <Ionicons name="musical-notes" size={19} color={COLORS.primaryGlow} />
                        <Text style={styles.quickText}>Music</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={openSearch}>
                        <Ionicons name="search" size={19} color={COLORS.cyan} />
                        <Text style={styles.quickText}>Search</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/queue" as any)}>
                        <Ionicons name="list" size={19} color={COLORS.primary} />
                        <Text style={styles.quickText}>Queue</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/worlds" as any)}>
                        <Ionicons name="heart" size={19} color="#F472B6" />
                        <Text style={styles.quickText}>Feelings</Text>
                      </TouchableOpacity>
                    </View>
                </>

                <>
                    {recentlyAddedSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <LinearGradient
                          colors={["rgba(168,85,247,0.22)", "rgba(34,211,238,0.08)"]}
                          style={styles.sectionAura}
                        />
                        <View style={styles.sectionHeaderRow}>
                          <View>
                            <Text style={styles.sectionEyebrow}>NEW</Text>
                            <Text style={styles.sectionTitle}>Recently Added</Text>
                          </View>
                          <Text style={styles.sectionMeta}>Play</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {recentlyAddedSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={`recently-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, recentlyAddedSongs, {
                                source: "recently_added",
                                label: "Recently Added",
                                railId: "recently_added",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {becauseYouListened.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>LISTENER</Text>
                        <Text style={styles.sectionTitle}>Because You Listened</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {becauseYouListened.map((item, index) => (
                            <HomeFeaturedCard
                              key={`because-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, becauseYouListened, {
                                source: "because_you_listened",
                                label: "Because You Listened",
                                railId: "because_you_listened",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {smartQueueSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>NEXT</Text>
                        <Text style={styles.sectionTitle}>Smart Music Queue</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {smartQueueSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={`smart-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, smartQueueSongs, {
                                source: "smart_queue",
                                label: "Smart Music Queue",
                                railId: "smart_queue",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleArtists.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>CREATORS</Text>
                        <Text style={styles.sectionTitle}>Creators In Your Orbit</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleArtists.map((artist) => (
                            <View key={artist.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={artist.name}
                                subtitle={`${artist.songs.length} song${artist.songs.length === 1 ? "" : "s"}`}
                                imageUri={artist.artwork}
                                rightIcon="person"
                                onPress={() => openArtist(artist)}
                                onRightPress={() => openArtist(artist)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleAlbums.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>COLLECTIONS</Text>
                        <Text style={styles.sectionTitle}>Albums Worth Staying With</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleAlbums.map((album) => (
                            <View key={album.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={album.title}
                                subtitle={`${album.songs.length} song${album.songs.length === 1 ? "" : "s"} / ${album.artist}`}
                                imageUri={album.artwork}
                                rightIcon="albums"
                                onPress={() => openAlbum(album)}
                                onRightPress={() => openAlbum(album)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {openRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>ROOMS</Text>
                        <Text style={styles.sectionTitle}>Open Rooms</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {openRooms.map((room) => (
                            <TouchableOpacity key={room.id} activeOpacity={0.88} style={styles.roomCard} onPress={() => openGenre(room)}>
                              <HTImage source={room.artwork} style={styles.roomImage} contentFit="cover" />
                              <View style={styles.roomShade} />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text style={styles.roomSubtitle}>{room.subtitle}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleGenres.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>GENRES</Text>
                        <Text style={styles.sectionTitle}>Mood Rooms / Genre Spotlights</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleGenres.map((genre) => (
                            <View key={genre.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={genre.title}
                                subtitle={`${genre.songs.length} song${genre.songs.length === 1 ? "" : "s"}`}
                                imageUri={genre.artwork}
                                rightIcon="sparkles"
                                onPress={() => openGenre(genre)}
                                onRightPress={() => openGenre(genre)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    <View style={styles.catalogHeaderRow}>
                      <View>
                        <Text style={styles.sectionEyebrow}>FULL CATALOG</Text>
                        <Text style={[styles.sectionTitle, styles.songsSectionTitle]}>All Songs</Text>
                      </View>
                      <Text style={styles.catalogCount}>{Math.min(visibleCatalogCount, songs.length)}/{songs.length}</Text>
                    </View>
                  </>
              </View>
            }
            ListFooterComponent={
              canLoadMore ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.loadMoreButton}
                  onPress={() =>
                    setVisibleCatalogCount((count) =>
                      Math.min(count + CATALOG_PAGE_SIZE, songs.length)
                    )
                  }
                >
                  <Text style={styles.loadMoreText}>Load More</Text>
                  <Ionicons name="chevron-down" size={18} color="#000" />
                </TouchableOpacity>
              ) : null
            }
            renderItem={renderSongItem}
          />
        )}
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 18,
  },
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(34,211,238,0.06)",
  },
  glowCenter: {
    position: "absolute",
    top: 180,
    alignSelf: "center",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(168,85,247,0.045)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(34,211,238,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  title: {
    color: COLORS.text,
    fontSize: 29,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontWeight: "700" },
  emptyIcon: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.16)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontWeight: "700",
  },
  list: { paddingBottom: 146 },
  heroStage: {
    marginBottom: 16,
    position: "relative",
  },
  heroStageGlow: {
    position: "absolute",
    top: 28,
    left: 28,
    right: 28,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(34,211,238,0.05)",
  },
  heroList: {
    paddingRight: 18,
  },
  heroSlide: {
    marginRight: 14,
  },
  heroBorder: {
    borderRadius: 28,
    padding: 1,
  },
  heroCard: {
    borderRadius: 27,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  heroActiveGlow: {
    position: "absolute",
    top: -28,
    left: -20,
    right: -20,
    height: 130,
    backgroundColor: COLORS.primary,
    borderRadius: 70,
    zIndex: 1,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    zIndex: 0,
  },
  heroOverlay: {
    flex: 1,
    zIndex: 2,
    justifyContent: "flex-end",
    padding: 19,
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.58)",
    marginBottom: 16,
  },
  liveText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  heroSong: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  heroPlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
  },
  heroPlayText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroCountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroDotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },
  listeningBrief: {
    marginBottom: 14,
    borderRadius: 22,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  listeningBriefCopy: { flex: 1, paddingRight: 12 },
  listeningLabel: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  listeningTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  listeningSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  waveformShell: {
    width: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  discoveryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  discoveryChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: {
    marginLeft: 0,
  },
  moodChipRow: {
    gap: 10,
    paddingRight: 18,
    marginBottom: 14,
  },
  moodChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.18)",
  },
  moodChipText: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
  },
  searchPanel: {
    marginBottom: 20,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchLauncherText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },
  searchPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchPanelTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  searchInputShell: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 0,
  },
  searchResultsPanel: {
    paddingBottom: 14,
  },
  searchLoadingPanel: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  searchLoadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  cinematicSection: {
    marginBottom: 22,
    position: "relative",
    overflow: "hidden",
    borderRadius: 22,
    paddingTop: 4,
  },
  sectionAura: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    borderRadius: 22,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 13,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },
  songsSectionTitle: {
    marginBottom: 13,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  featuredRow: {
    paddingRight: 18,
    paddingLeft: 2,
  },
  surfaceRow: {
    gap: 12,
    paddingRight: 18,
    paddingLeft: 2,
  },
  surfaceCardShell: {
    width: 244,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 11,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  catalogStatus: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 2,
    marginBottom: 18,
    textTransform: "uppercase",
  },
  quickGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  quickButton: {
    flex: 1,
    minHeight: 78,
    borderRadius: 20,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  quickText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  roomCard: {
    width: 186,
    height: 134,
    borderRadius: 22,
    overflow: "hidden",
    padding: 13,
    justifyContent: "flex-end",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    zIndex: 2,
  },
  roomSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    zIndex: 2,
  },
  catalogHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 6,
  },
  catalogCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 15,
  },
  loadMoreButton: {
    marginTop: 12,
    marginBottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  loadMoreText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
