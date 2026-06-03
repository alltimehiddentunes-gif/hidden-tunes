import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import AppShell from "../components/navigation/AppShell";
import { SubtleTvEntryLink } from "../components/EmotionalDiscoveryChips";
import HTImage from "../components/HTImage";
import UnifiedMediaCard from "../components/UnifiedMediaCard";
import UniversalSearchGroupedResults from "../components/UniversalSearchGroupedResults";
import DebouncedSearchInput from "../components/search/DebouncedSearchInput";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "../services/hiddenTunes";
import {
  searchHiddenTunesSongs,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "../services/hiddenTunesApi";
import { searchArchiveAudio } from "../services/archiveSearch";
import { searchJamendoMusic } from "../services/jamendoSearch";
import { fetchTvCatalog, type HiddenTunesTvVideo } from "../services/tvCatalogApi";
import {
  runInstantCatalogSearch,
  type InstantSearchCatalog,
} from "../services/instantCatalogSearch";
import type { UniversalSearchGroupedResults as SearchGroupedResults } from "../services/universalSearchService";
import type { HiddenTunesGenre } from "../utils/genres";
import { UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS } from "../utils/universalSearch";

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

const SEARCH_FULL_CATALOG_TARGET = 1000;
const SEARCH_EXTERNAL_AUDIO_LIMIT = 16;
const SEARCH_TV_LIMIT = 8;

const TRENDING_SEARCHES = [
  "Afrobeats",
  "Amapiano",
  "Gospel",
  "Worship",
  "Afro Soul",
  "Dancehall",
  "Hidden Tunes",
];

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
  const id = String(
    track?.id || `${sourceName}-${track?.artist || "artist"}-${track?.title || "track"}-${index}`
  );
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

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites } = usePlayerState();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const initialQuery = String(params.q || "").trim();

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState(
    initialQuery.length >= 2 ? initialQuery : ""
  );
  const [backendSearchSongs, setBackendSearchSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [backendSearchQuery, setBackendSearchQuery] = useState("");
  const [backendSearchCompletedQuery, setBackendSearchCompletedQuery] = useState("");
  const [externalSearchSongs, setExternalSearchSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [externalSearchQuery, setExternalSearchQuery] = useState("");
  const [externalSearchCompletedQuery, setExternalSearchCompletedQuery] = useState("");
  const [tvSearchVideos, setTvSearchVideos] = useState<HiddenTunesTvVideo[]>([]);
  const [tvSearchQuery, setTvSearchQuery] = useState("");
  const [tvSearchCompletedQuery, setTvSearchCompletedQuery] = useState("");

  const backendSearchRequestIdRef = useRef(0);
  const externalSearchRequestIdRef = useRef(0);
  const tvSearchRequestIdRef = useRef(0);

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const data = await fetchHiddenTunesCatalog();
        if (!cancelled) setCatalog(data);
      } catch (error) {
        console.log("Search catalog load error:", error);
        if (!cancelled) setCatalog(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const searchCatalog = useMemo<InstantSearchCatalog>(
    () => ({
      songs: toNormalizedSongs(songs),
      albums: toSearchAlbums(albums),
      artists: toSearchArtists(artists),
      genres: toSearchGenres(genres),
      tvVideos: [],
    }),
    [albums, artists, genres, songs]
  );

  const backendSearchCatalog = useMemo<InstantSearchCatalog>(
    () => ({
      songs: backendSearchSongs,
      albums: [],
      artists: [],
      genres: [],
      tvVideos: [],
    }),
    [backendSearchSongs]
  );

  const externalSearchCatalog = useMemo<InstantSearchCatalog>(
    () => ({
      songs: externalSearchSongs,
      albums: [],
      artists: [],
      genres: [],
      tvVideos: [],
    }),
    [externalSearchSongs]
  );

  const tvSearchCatalog = useMemo<InstantSearchCatalog>(
    () => ({
      songs: [],
      albums: [],
      artists: [],
      genres: [],
      tvVideos: tvSearchVideos,
    }),
    [tvSearchVideos]
  );

  const cleanSubmittedSearchQuery = submittedSearchQuery.trim();

  const localSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(searchCatalog, cleanSubmittedSearchQuery);
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
      setBackendSearchSongs([]);
      setBackendSearchQuery("");
      setBackendSearchCompletedQuery("");
      setExternalSearchSongs([]);
      setExternalSearchQuery("");
      setExternalSearchCompletedQuery("");
      setTvSearchVideos([]);
      setTvSearchQuery("");
      setTvSearchCompletedQuery("");
      return;
    }

    if (loading) return;

    if (!shouldRunBackendSearch) {
      const requestId = backendSearchRequestIdRef.current + 1;
      backendSearchRequestIdRef.current = requestId;
      setBackendSearchSongs([]);
      setBackendSearchQuery(query);
      setBackendSearchCompletedQuery(query);
      return;
    }

    const requestId = backendSearchRequestIdRef.current + 1;
    backendSearchRequestIdRef.current = requestId;
    setBackendSearchQuery(query);
    setBackendSearchCompletedQuery("");

    void searchHiddenTunesSongs(query)
      .then((results) => {
        if (backendSearchRequestIdRef.current !== requestId) return;
        setBackendSearchSongs(results);
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

  const audioSearchBeforeExternal = useMemo(
    () => mergeSearchGroupedResults(localSearchResults, backendSearchResults),
    [backendSearchResults, localSearchResults]
  );

  const backendSearchPendingForQuery =
    shouldRunBackendSearch && backendSearchCompletedQuery !== cleanSubmittedSearchQuery;

  const shouldRunExternalSearch =
    cleanSubmittedSearchQuery.length >= 2 && !loading && !backendSearchPendingForQuery;

  useEffect(() => {
    const query = cleanSubmittedSearchQuery;

    if (query.length < 2) {
      const requestId = externalSearchRequestIdRef.current + 1;
      externalSearchRequestIdRef.current = requestId;
      setExternalSearchSongs([]);
      setExternalSearchQuery("");
      setExternalSearchCompletedQuery("");
      return;
    }

    if (!shouldRunExternalSearch) return;

    const requestId = externalSearchRequestIdRef.current + 1;
    externalSearchRequestIdRef.current = requestId;
    setExternalSearchQuery(query);
    setExternalSearchCompletedQuery("");

    void Promise.all([searchJamendoMusic(query), searchArchiveAudio(query)])
      .then(([jamendo, archive]) => {
        if (externalSearchRequestIdRef.current !== requestId) return;
        const externalSongs = [...jamendo, ...archive]
          .slice(0, SEARCH_EXTERNAL_AUDIO_LIMIT)
          .map(normalizeExternalSearchSong);
        setExternalSearchSongs(externalSongs);
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

  const audioSearchResults = useMemo(
    () => mergeSearchGroupedResults(audioSearchBeforeExternal, externalSearchResults),
    [audioSearchBeforeExternal, externalSearchResults]
  );

  const externalSearchPendingForQuery =
    shouldRunExternalSearch && externalSearchCompletedQuery !== cleanSubmittedSearchQuery;

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
      setTvSearchVideos([]);
      setTvSearchQuery("");
      setTvSearchCompletedQuery("");
      return;
    }

    if (!shouldRunTvSearch) return;

    const requestId = tvSearchRequestIdRef.current + 1;
    tvSearchRequestIdRef.current = requestId;
    setTvSearchQuery(query);
    setTvSearchCompletedQuery("");

    void fetchTvCatalog({ q: query, page: 1, limit: SEARCH_TV_LIMIT })
      .then((response) => {
        if (tvSearchRequestIdRef.current !== requestId) return;
        setTvSearchVideos(response.success ? response.videos : []);
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
  }, [cleanSubmittedSearchQuery, loading, shouldRunTvSearch]);

  const tvSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    if (tvSearchQuery !== cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (!tvSearchVideos.length) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(tvSearchCatalog, cleanSubmittedSearchQuery);
  }, [cleanSubmittedSearchQuery, tvSearchCatalog, tvSearchQuery, tvSearchVideos.length]);

  const searchResults = useMemo(
    () => mergeSearchGroupedResults(audioSearchResults, tvSearchResults),
    [audioSearchResults, tvSearchResults]
  );

  const searchResultSongs = useMemo(() => {
    const seen = new Set<string>();
    const collected: HiddenTunesSong[] = [];

    [...audioSearchResults.topResults, ...audioSearchResults.songs, ...audioSearchResults.lyrics].forEach(
      (hit) => {
        if (!hit.id.startsWith("song:") && !hit.id.startsWith("lyric:")) return;
        const song = hit.payload as HiddenTunesSong;
        const id = String(song?.id || "");
        if (!id || seen.has(id)) return;
        seen.add(id);
        collected.push(song);
      }
    );

    return collected;
  }, [audioSearchResults]);

  const hasSearchText = searchQuery.trim().length > 0;
  const cleanSearchQuery = searchQuery.trim();
  const searchDebouncePending =
    cleanSearchQuery.length >= 2 && cleanSearchQuery !== cleanSubmittedSearchQuery;
  const showSearchResults =
    !loading &&
    cleanSubmittedSearchQuery.length >= 2 &&
    !searchDebouncePending &&
    !backendSearchPendingForQuery &&
    !externalSearchPendingForQuery &&
    !(shouldRunTvSearch && tvSearchCompletedQuery !== cleanSubmittedSearchQuery);
  const showSearchLoading =
    hasSearchText &&
    (loading ||
      searchDebouncePending ||
      backendSearchPendingForQuery ||
      externalSearchPendingForQuery ||
      (shouldRunTvSearch && tvSearchCompletedQuery !== cleanSubmittedSearchQuery));

  const showDiscovery = !hasSearchText || cleanSubmittedSearchQuery.length < 2;

  const discoveryArtists = useMemo(() => artists.slice(0, 10), [artists]);
  const discoveryAlbums = useMemo(() => albums.slice(0, 10), [albums]);
  const discoveryGenres = useMemo(() => genres.slice(0, 8), [genres]);
  const discoverySongs = useMemo(() => {
    const recentIds = new Set(
      (Array.isArray(recentlyPlayed) ? recentlyPlayed : [])
        .map((entry) => String(entry?.id || ""))
        .filter(Boolean)
    );
    const recentMatches = songs.filter((song) => recentIds.has(String(song.id)));
    const favoriteMatches = (favorites || []).slice(0, 6) as HiddenTunesSong[];
    const merged = [...favoriteMatches, ...recentMatches, ...songs.slice(0, 12)];
    const seen = new Set<string>();
    return merged.filter((song) => {
      const id = String(song.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 10);
  }, [favorites, recentlyPlayed, songs]);

  const playSearchResultSong = useCallback(
    (song: HiddenTunesSong) => {
      const queue = searchResultSongs.length ? searchResultSongs : songs;
      const queueIndex = findSongIndex(queue, song);
      const queueSong = queueIndex >= 0 ? queue[queueIndex] : song;

      void playSong(queueSong, queue, Math.max(queueIndex, 0), {
        source: "search",
        label: "Search Results",
        searchQuery: submittedSearchQuery || searchQuery,
        artistName: queueSong.artist,
        genre: queueSong.genre,
        mood: queueSong.mood,
      });
    },
    [playSong, searchQuery, searchResultSongs, songs, submittedSearchQuery]
  );

  const playDiscoverySong = useCallback(
    (song: HiddenTunesSong, label: string) => {
      const queueIndex = findSongIndex(songs, song);
      void playSong(song, songs, Math.max(queueIndex, 0), {
        source: "search",
        label,
        artistName: song.artist,
        genre: song.genre,
        mood: song.mood,
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

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre) => {
    router.push({
      pathname: "/genre",
      params: {
        title: genre.title,
        query: genre.title,
        id: genre.id,
        type: "genre",
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

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} activeOpacity={0.85}>
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>

              <View style={styles.brandBlock}>
                <Text style={styles.kicker}>DISCOVER</Text>
                <Text style={styles.title}>Search</Text>
              </View>

              <View style={styles.iconSpacer} />
            </View>

            <View style={styles.searchPanel}>
              <DebouncedSearchInput
                value={searchQuery}
                onImmediateChange={handleSearchImmediateChange}
                onDebouncedChange={setSubmittedSearchQuery}
                onClear={clearSearch}
                placeholder="Search songs, artists, albums, lyrics"
                placeholderTextColor={COLORS.textMuted}
                style={styles.searchInput}
                containerStyle={styles.searchInputShell}
                autoFocus
              />
            </View>

            {loading && songs.length === 0 ? (
              <View style={styles.centerPanel}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading catalog...</Text>
              </View>
            ) : null}

            {showSearchLoading ? (
              <View style={styles.centerPanel}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Searching Hidden Tunes</Text>
              </View>
            ) : null}

            {showSearchResults ? (
              <View style={styles.resultsPanel}>
                <UniversalSearchGroupedResults
                  grouped={searchResults}
                  query={submittedSearchQuery || searchQuery}
                  onSongPress={playSearchResultSong}
                  onLyricPress={playSearchResultSong}
                  onArtistPress={openArtist}
                  onAlbumPress={openAlbum}
                  onGenrePress={openGenre}
                  onTvPress={openTv}
                  onSuggestionPress={handleSuggestionPress}
                  activeSongId={currentSong?.id ? String(currentSong.id) : null}
                  isPlaying={isPlaying}
                  showEmpty
                />
              </View>
            ) : null}

            {showDiscovery && !showSearchLoading ? (
              <View style={styles.discoveryPanel}>
                <Text style={styles.sectionEyebrow}>TRENDING</Text>
                <View style={styles.chipRow}>
                  {TRENDING_SEARCHES.map((chip) => (
                    <TouchableOpacity
                      key={chip}
                      activeOpacity={0.86}
                      style={styles.chip}
                      onPress={() => handleSuggestionPress(chip)}
                    >
                      <Text style={styles.chipText}>{chip}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.sectionEyebrow, styles.sectionSpacing]}>TRY THESE</Text>
                <View style={styles.chipRow}>
                  {UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS.slice(0, 6).map((chip) => (
                    <TouchableOpacity
                      key={chip}
                      activeOpacity={0.86}
                      style={styles.chipMuted}
                      onPress={() => handleSuggestionPress(chip)}
                    >
                      <Text style={styles.chipMutedText}>{chip}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {discoverySongs.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>FOR YOU</Text>
                    <Text style={styles.sectionTitle}>Quick picks</Text>
                    {discoverySongs.map((song) => (
                      <UnifiedMediaCard
                        key={`pick-${song.id}`}
                        title={song.title}
                        subtitle={song.artist}
                        image={song}
                        onPress={() => playDiscoverySong(song, "Search Quick Picks")}
                      />
                    ))}
                  </View>
                ) : null}

                {discoveryArtists.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>ARTISTS</Text>
                    <Text style={styles.sectionTitle}>Popular artists</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {discoveryArtists.map((artist) => (
                        <TouchableOpacity
                          key={artist.id}
                          activeOpacity={0.88}
                          style={styles.artistCard}
                          onPress={() => openArtist(artist)}
                        >
                          <HTImage source={artist} style={styles.artistImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.artistName}>
                            {artist.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {discoveryAlbums.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>ALBUMS</Text>
                    <Text style={styles.sectionTitle}>Album spotlight</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {discoveryAlbums.map((album) => (
                        <TouchableOpacity
                          key={album.id}
                          activeOpacity={0.88}
                          style={styles.albumCard}
                          onPress={() => openAlbum(album)}
                        >
                          <HTImage source={album} style={styles.albumImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.albumTitle}>
                            {album.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.albumArtist}>
                            {album.artist}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {discoveryGenres.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>GENRES</Text>
                    <Text style={styles.sectionTitle}>Browse by mood & genre</Text>
                    <View style={styles.chipRow}>
                      {discoveryGenres.map((genre) => (
                        <TouchableOpacity
                          key={genre.id}
                          activeOpacity={0.86}
                          style={styles.genreChip}
                          onPress={() => openGenre(genre)}
                        >
                          <Text style={styles.genreChipText}>{genre.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                <SubtleTvEntryLink style={styles.tvLink} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  glowPurple: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.16)",
  },
  glowCyan: {
    position: "absolute",
    top: 120,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 58,
    paddingBottom: 180,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconSpacer: { width: 46, height: 46 },
  brandBlock: { flex: 1, alignItems: "center" },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  searchPanel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.22)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  searchInputShell: { flex: 1 },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 8,
  },
  centerPanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  resultsPanel: { marginTop: 4 },
  discoveryPanel: { marginTop: 4 },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 12,
  },
  sectionSpacing: { marginTop: 18 },
  sectionBlock: { marginTop: 22 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.34)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  chipMuted: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipMutedText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  rail: { gap: 12, paddingRight: 8 },
  artistCard: { width: 108 },
  artistImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  artistName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    textAlign: "center",
  },
  albumCard: { width: 132 },
  albumImage: {
    width: 132,
    height: 132,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  albumTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8,
  },
  albumArtist: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  genreChip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(34,211,238,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.24)",
  },
  genreChipText: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: { marginTop: 24 },
});
