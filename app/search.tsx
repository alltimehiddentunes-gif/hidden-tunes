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
import HTImage from "../components/HTImage";
import NeonEQ from "../components/NeonEQ";
import DebouncedSearchInput from "../components/search/DebouncedSearchInput";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
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
import type { InstantSearchCatalog } from "../services/instantCatalogSearch";
import {
  buildTrustedBackendSongHits,
  buildTrustedInternetAudioHits,
  EMPTY_UNIVERSAL_SEARCH_RESULTS,
  mergeGroupedSearchResults,
  runUniversalCatalogSearch,
  type UniversalSearchGroupedResults as SearchGroupedResults,
} from "../services/universalSearchService";
import type { HiddenTunesGenre } from "../utils/genres";
import { UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS } from "../utils/universalSearch";
import {
  buildRelatedInternalDiscovery,
  buildSearchStations,
  getApkSearchRankingDiagnostics,
  hasInternalGroupedResults,
  rankApkAlbumResults,
  rankApkArtistResults,
  rankApkGenreResults,
  rankApkSongResults,
  rankApkStationResults,
  rankSearchSongs,
  songsFromSearchHits,
  unwrapRankedSearchItems,
  type SearchStationResult,
} from "../utils/searchApkParity";
import { logSearchDiagnostic, logSearchRankingDiagnostics } from "../utils/searchDiagnostics";
import { logEntityTapReceived } from "../utils/entityDiagnostics";
import { resolveStationEntity } from "../utils/entityResolution";
import { markFastScrolling } from "../utils/performanceMode";

const EMPTY_SEARCH_RESULTS = EMPTY_UNIVERSAL_SEARCH_RESULTS;

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

function toSearchPlaylists(playlists: HiddenTunesDerivedCatalog["playlists"]) {
  return (playlists || []).map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    artwork: playlist.artwork,
    songs: playlist.songs,
    kind: playlist.kind,
    routeParams: playlist.routeParams,
  }));
}

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textMatchesQuery(value: unknown, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  const text = normalizeSearchText(value);
  return normalizedQuery.split(" ").every((part) => text.includes(part));
}

function catalogSongSearchText(song: HiddenTunesSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood, song.lyrics]
    .filter(Boolean)
    .join(" ");
}

function dedupeSongs<T extends { id?: string; title?: string; artist?: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const key = String(item.id || `${item.artist || "artist"}-${item.title || "track"}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const playlists = catalog?.playlists || [];

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = getCachedHiddenTunesCatalog();
      if (cached && !cancelled) {
        setCatalog(cached);
        setLoading(false);
        return;
      }

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
      playlists: toSearchPlaylists(playlists),
      tvVideos: [],
    }),
    [albums, artists, genres, playlists, songs]
  );

  const cleanSubmittedSearchQuery = submittedSearchQuery.trim();

  const localSearchResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    return runUniversalCatalogSearch(searchCatalog, cleanSubmittedSearchQuery);
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

    const trusted = buildTrustedBackendSongHits(
      backendSearchSongs,
      cleanSubmittedSearchQuery
    );

    return {
      ...EMPTY_SEARCH_RESULTS,
      songs: trusted.songs,
      artists: trusted.artists,
      hasAnyResults: trusted.songs.length > 0 || trusted.artists.length > 0,
    };
  }, [backendSearchQuery, backendSearchSongs, cleanSubmittedSearchQuery]);

  const internalSearchResults = useMemo(
    () => mergeGroupedSearchResults(localSearchResults, backendSearchResults),
    [backendSearchResults, localSearchResults]
  );

  const hasInternalCatalogResults = useMemo(
    () => hasInternalGroupedResults(internalSearchResults),
    [internalSearchResults]
  );

  const backendSearchPendingForQuery =
    shouldRunBackendSearch && backendSearchCompletedQuery !== cleanSubmittedSearchQuery;

  const shouldRunExternalSearch =
    cleanSubmittedSearchQuery.length >= 2 &&
    !loading &&
    !backendSearchPendingForQuery &&
    !hasInternalCatalogResults;

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

    const internetAudio = buildTrustedInternetAudioHits(
      externalSearchSongs,
      cleanSubmittedSearchQuery
    );

    return {
      ...EMPTY_SEARCH_RESULTS,
      internetAudio,
      hasAnyResults: internetAudio.length > 0,
    };
  }, [cleanSubmittedSearchQuery, externalSearchQuery, externalSearchSongs]);

  const audioSearchResults = useMemo(
    () => mergeGroupedSearchResults(internalSearchResults, externalSearchResults),
    [internalSearchResults, externalSearchResults]
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

    const tvOnly = runUniversalCatalogSearch(
      {
        songs: [],
        albums: [],
        artists: [],
        genres: [],
        playlists: [],
        tvVideos: tvSearchVideos,
      },
      cleanSubmittedSearchQuery
    );

    return {
      ...EMPTY_SEARCH_RESULTS,
      tv: tvOnly.tv,
      hasAnyResults: tvOnly.tv.length > 0,
    };
  }, [cleanSubmittedSearchQuery, tvSearchQuery, tvSearchVideos]);

  const searchResults = useMemo(
    () => mergeGroupedSearchResults(audioSearchResults, tvSearchResults),
    [audioSearchResults, tvSearchResults]
  );

  const searchResultSongs = useMemo(() => {
    const internalSongs = songsFromSearchHits(internalSearchResults);
    const merged = dedupeSongs([
      ...internalSongs,
      ...songs.filter((song) => textMatchesQuery(catalogSongSearchText(song), cleanSubmittedSearchQuery)),
    ]);
    return unwrapRankedSearchItems(rankSearchSongs(merged, cleanSubmittedSearchQuery));
  }, [cleanSubmittedSearchQuery, internalSearchResults, songs]);


  const apkSongRanked = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as ReturnType<typeof rankApkSongResults>;
    const direct = dedupeSongs(searchResultSongs);
    const needsRelated = direct.length < 4;
    const related = needsRelated
      ? buildRelatedInternalDiscovery(cleanSubmittedSearchQuery, songs, direct, 28)
      : [];
    return rankApkSongResults(direct, cleanSubmittedSearchQuery, related);
  }, [cleanSubmittedSearchQuery, searchResultSongs, songs]);

  const apkSongResults = useMemo(
    () => apkSongRanked.map((entry) => entry.item),
    [apkSongRanked]
  );

  const apkAlbumResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesAlbumCatalogItem[];
    const fromSearch = internalSearchResults.albums
      .map((hit) => {
        const album = hit.payload;
        return albums.find((item) => item.id === album.id) || {
          id: album.id,
          title: album.title,
          artist: album.artist,
          artwork: album.artwork,
          songs: (album.tracks || []) as HiddenTunesSong[],
        };
      })
      .filter(Boolean) as HiddenTunesAlbumCatalogItem[];
    const fromCatalog = albums.filter((album) =>
      textMatchesQuery(`${album.title} ${album.artist}`, cleanSubmittedSearchQuery)
    );
    const seen = new Set<string>();
    const merged = [...fromSearch, ...fromCatalog].filter((album) => {
      const key = String(album.id || `${album.title}-${album.artist}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return rankApkAlbumResults(merged, cleanSubmittedSearchQuery);
  }, [albums, cleanSubmittedSearchQuery, internalSearchResults.albums]);

  const apkArtistResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesArtistCatalogItem[];
    const fromSearch = internalSearchResults.artists
      .map((hit) => artists.find((item) => item.id === hit.payload.id) || null)
      .filter(Boolean) as HiddenTunesArtistCatalogItem[];
    const fromCatalog = artists.filter((artist) =>
      textMatchesQuery(artist.name, cleanSubmittedSearchQuery)
    );
    const seen = new Set<string>();
    const merged = [...fromSearch, ...fromCatalog].filter((artist) => {
      const key = String(artist.id || artist.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return rankApkArtistResults(merged, cleanSubmittedSearchQuery);
  }, [artists, cleanSubmittedSearchQuery, internalSearchResults.artists]);

  const apkRoomResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesGenreCatalogItem[];
    const fromCatalog = genres.filter((genre) =>
      textMatchesQuery(genre.title, cleanSubmittedSearchQuery)
    );
    const roomTitles = internalSearchResults.moodRooms.map((hit) => hit.payload.title);
    const fromRooms = roomTitles
      .map((title) => genres.find((genre) => textMatchesQuery(genre.title, title)) || null)
      .filter(Boolean) as HiddenTunesGenreCatalogItem[];
    const seen = new Set<string>();
    const merged = [...fromCatalog, ...fromRooms].filter((genre) => {
      const key = String(genre.id || genre.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return rankApkGenreResults(merged, cleanSubmittedSearchQuery);
  }, [cleanSubmittedSearchQuery, genres, internalSearchResults.moodRooms]);

  const apkPlaylistResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesDerivedCatalog["playlists"];
    return internalSearchResults.playlists
      .map((hit) => playlists.find((item) => item.id === hit.payload.id) || hit.payload)
      .slice(0, 10);
  }, [cleanSubmittedSearchQuery, internalSearchResults.playlists, playlists]);

  const apkStationResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as SearchStationResult[];
    const moodRooms = internalSearchResults.moodRooms.map((hit) => ({
      id: hit.payload.id,
      title: hit.payload.title,
    }));
    return rankApkStationResults(
      buildSearchStations(cleanSubmittedSearchQuery, genres, moodRooms),
      cleanSubmittedSearchQuery
    );
  }, [cleanSubmittedSearchQuery, genres, internalSearchResults.moodRooms]);

  const apkExternalAudioResults = useMemo(() => {
    const hasInternalApk =
      apkSongResults.length > 0 ||
      apkAlbumResults.length > 0 ||
      apkArtistResults.length > 0 ||
      apkRoomResults.length > 0 ||
      apkPlaylistResults.length > 0 ||
      apkStationResults.length > 0;

    if (hasInternalApk || hasInternalCatalogResults) {
      return [] as HiddenTunesSong[];
    }

    return audioSearchResults.internetAudio
      .map((hit) => hit.payload as HiddenTunesSong)
      .filter(Boolean)
      .slice(0, SEARCH_EXTERNAL_AUDIO_LIMIT);
  }, [
    apkAlbumResults.length,
    apkArtistResults.length,
    apkPlaylistResults.length,
    apkRoomResults.length,
    apkSongResults.length,
    apkSongRanked.length,
    apkStationResults.length,
    audioSearchResults.internetAudio,
    hasInternalCatalogResults,
  ]);

  const apkResultCount =
    apkSongResults.length +
    apkAlbumResults.length +
    apkArtistResults.length +
    apkRoomResults.length +
    apkPlaylistResults.length +
    apkStationResults.length +
    apkExternalAudioResults.length;

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
    (song: HiddenTunesSong, resultType: string = "song") => {
      const queue = apkSongResults.length ? apkSongResults : searchResultSongs.length ? searchResultSongs : songs;
      const queueIndex = findSongIndex(queue, song);
      const queueSong = queueIndex >= 0 ? queue[queueIndex] : song;

      logSearchDiagnostic("search_result_tapped", {
        resultType,
        songId: queueSong.id,
        query: cleanSubmittedSearchQuery,
      });

      void playSong(queueSong, queue, Math.max(queueIndex, 0), {
        source: "search",
        label: submittedSearchQuery || searchQuery ? `Search: ${submittedSearchQuery || searchQuery}` : "Search Results",
        searchQuery: submittedSearchQuery || searchQuery,
        artistName: queueSong.artist,
        genre: queueSong.genre,
        mood: queueSong.mood,
      });
    },
    [
      apkSongResults,
      cleanSubmittedSearchQuery,
      playSong,
      searchQuery,
      searchResultSongs,
      songs,
      submittedSearchQuery,
    ]
  );

  const playDiscoverySong = useCallback(
    (song: HiddenTunesSong, label: string) => {
      const queueIndex = findSongIndex(songs, song);
      logSearchDiagnostic("search_result_tapped", {
        resultType: "discovery_song",
        songId: song.id,
        query: label,
      });
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

  const startSearchStation = useCallback(
    (station: SearchStationResult) => {
      logSearchDiagnostic("search_result_tapped", {
        resultType: "station",
        stationId: station.id,
        title: station.title,
        query: cleanSubmittedSearchQuery,
      });
      logEntityTapReceived("station", {
        id: station.id,
        title: station.title,
      });

      const stationResolution = resolveStationEntity(
        getCachedHiddenTunesCatalog(),
        {
          id: station.id,
          title: station.title,
          query: station.title,
          explicitTracks: station.tracks,
        }
      );
      const tracks = stationResolution.tracks.length
        ? stationResolution.tracks
        : songs.filter((song) =>
            textMatchesQuery(
              [song.title, song.artist, song.genre, song.mood].join(" "),
              station.title
            )
          );

      if (tracks.length) {
        void playSong(tracks[0], tracks, 0, {
          source: "radio",
          label: station.title,
          genre: tracks[0].genre || station.title,
          mood: tracks[0].mood,
        });
        return;
      }

      router.push({
        pathname: "/genre",
        params: {
          title: station.title,
          query: station.title,
          id: station.id,
          type: station.kind === "room" ? "mood" : "genre",
        },
      } as any);
    },
    [cleanSubmittedSearchQuery, playSong, songs]
  );

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem | HiddenTunesArtist) => {
    logSearchDiagnostic("search_result_tapped", {
      resultType: "artist",
      artistId: artist.id,
      title: artist.name,
      query: cleanSubmittedSearchQuery,
    });
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, [cleanSubmittedSearchQuery]);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
    logSearchDiagnostic("search_result_tapped", {
      resultType: "album",
      albumId: album.id,
      title: album.title,
      query: cleanSubmittedSearchQuery,
    });
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, [cleanSubmittedSearchQuery]);

  const openPlaylist = useCallback((playlist: HiddenTunesDerivedCatalog["playlists"][number]) => {
    logSearchDiagnostic("search_result_tapped", {
      resultType: "playlist",
      playlistId: playlist.id,
      title: playlist.title,
      query: cleanSubmittedSearchQuery,
    });
    if (playlist.routeParams) {
      const params = playlist.routeParams;
      if (params.album && params.artist) {
        router.push({
          pathname: "/album",
          params: {
            album: params.album,
            artist: params.artist,
            thumbnail: playlist.artwork,
          },
        } as any);
        return;
      }
      if (params.artist) {
        router.push({ pathname: "/artist", params: { artist: params.artist } } as any);
        return;
      }
      if (params.title || params.genre) {
        router.push({
          pathname: "/genre",
          params: {
            title: params.title || params.genre || playlist.title,
            query: params.title || params.genre || playlist.title,
            id: playlist.id,
            type: "genre",
          },
        } as any);
        return;
      }
    }

    router.push("/playlists" as any);
  }, [cleanSubmittedSearchQuery]);

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre) => {
    logSearchDiagnostic("search_result_tapped", {
      resultType: "room",
      genreId: genre.id,
      title: genre.title,
      query: cleanSubmittedSearchQuery,
    });
    router.push({
      pathname: "/genre",
      params: {
        title: genre.title,
        query: genre.title,
        id: genre.id,
        type: "genre",
      },
    } as any);
  }, [cleanSubmittedSearchQuery]);

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

  const lastSearchDiagnosticsKeyRef = useRef("");

  useEffect(() => {
    if (cleanSubmittedSearchQuery.length < 2) return;
    logSearchDiagnostic("search_started", { query: cleanSubmittedSearchQuery });
  }, [cleanSubmittedSearchQuery]);

  useEffect(() => {
    if (!showSearchResults || cleanSubmittedSearchQuery.length < 2) return;

    const diagnosticsKey = [
      cleanSubmittedSearchQuery,
      apkResultCount,
      apkSongResults.length,
      apkAlbumResults.length,
      apkArtistResults.length,
      apkRoomResults.length,
      apkStationResults.length,
      apkPlaylistResults.length,
      apkExternalAudioResults.length,
    ].join(":");

    if (lastSearchDiagnosticsKeyRef.current === diagnosticsKey) return;
    lastSearchDiagnosticsKeyRef.current = diagnosticsKey;

    logSearchDiagnostic("search_internal_catalog_results", {
      query: cleanSubmittedSearchQuery,
      hasInternal: hasInternalCatalogResults,
      songHits: internalSearchResults.songs.length,
      albumHits: internalSearchResults.albums.length,
      artistHits: internalSearchResults.artists.length,
      roomHits: internalSearchResults.moodRooms.length,
      playlistHits: internalSearchResults.playlists.length,
    });
    logSearchDiagnostic("search_song_results", { count: apkSongResults.length, query: cleanSubmittedSearchQuery });
    logSearchRankingDiagnostics(
      getApkSearchRankingDiagnostics(cleanSubmittedSearchQuery, apkSongRanked)
    );
    logSearchDiagnostic("search_album_results", { count: apkAlbumResults.length, query: cleanSubmittedSearchQuery });
    logSearchDiagnostic("search_artist_results", { count: apkArtistResults.length, query: cleanSubmittedSearchQuery });
    logSearchDiagnostic("search_room_results", { count: apkRoomResults.length, query: cleanSubmittedSearchQuery });
    logSearchDiagnostic("search_station_results", { count: apkStationResults.length, query: cleanSubmittedSearchQuery });
    if (apkExternalAudioResults.length > 0) {
      logSearchDiagnostic("search_external_fallback_used", {
        query: cleanSubmittedSearchQuery,
        count: apkExternalAudioResults.length,
      });
    }
    if (apkResultCount === 0) {
      logSearchDiagnostic("search_empty_state_shown", { query: cleanSubmittedSearchQuery });
    }
  }, [
    apkAlbumResults.length,
    apkArtistResults.length,
    apkExternalAudioResults.length,
    apkPlaylistResults.length,
    apkResultCount,
    apkRoomResults.length,
    apkSongResults.length,
    apkSongRanked.length,
    apkStationResults.length,
    cleanSubmittedSearchQuery,
    hasInternalCatalogResults,
    internalSearchResults.albums.length,
    internalSearchResults.artists.length,
    internalSearchResults.moodRooms.length,
    internalSearchResults.playlists.length,
    internalSearchResults.songs.length,
    showSearchResults,
  ]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSubmittedSearchQuery("");
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View pointerEvents="none" style={styles.glowPurple} />
        <View pointerEvents="none" style={styles.glowCyan} />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            onScrollBeginDrag={() => markFastScrolling(true)}
            onMomentumScrollBegin={() => markFastScrolling(true)}
            onScrollEndDrag={() => markFastScrolling(false)}
            onMomentumScrollEnd={() => markFastScrolling(false)}
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
                placeholder="Find music"
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
                <View style={styles.resultSummaryRow}>
                  <View>
                    <Text style={styles.sectionEyebrow}>RESULTS</Text>
                    <Text style={styles.sectionTitle}>{apkResultCount} match{apkResultCount === 1 ? "" : "es"}</Text>
                  </View>
                  {apkExternalAudioResults.length > 0 ? <Text style={styles.fallbackBadge}>More to discover</Text> : null}
                </View>

                {apkSongResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>SONGS</Text>
                    {apkSongResults.slice(0, 18).map((song, index) => {
                      const active = String(currentSong?.id || "") === String(song.id || "");
                      return (
                        <TouchableOpacity
                          key={`song-${song.id}-${index}`}
                          activeOpacity={0.86}
                          style={[styles.songRow, active && styles.songRowActive]}
                          onPress={() => playSearchResultSong(song, "song")}
                        >
                          <LinearGradient colors={active ? GRADIENTS.neon : GRADIENTS.card} style={styles.coverBorder}>
                            <HTImage source={song} style={styles.cover} contentFit="cover" />
                          </LinearGradient>
                          <View style={styles.songCopy}>
                            <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                            <Text numberOfLines={1} style={styles.songArtist}>{song.artist || "Hidden Tunes"}</Text>
                            <Text numberOfLines={1} style={styles.songMeta}>{song.album || song.genre || song.mood || "Catalog result"}</Text>
                          </View>
                          {active && isPlaying ? (
                            <NeonEQ isPlaying={isPlaying} size="small" />
                          ) : (
                            <View style={styles.playCircle}>
                              <Ionicons name="play" size={16} color={COLORS.text} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {apkAlbumResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>ALBUMS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {apkAlbumResults.map((album) => (
                        <TouchableOpacity key={album.id} activeOpacity={0.88} style={styles.albumCard} onPress={() => openAlbum(album)}>
                          <HTImage source={album} style={styles.albumImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.albumTitle}>{album.title}</Text>
                          <Text numberOfLines={1} style={styles.albumArtist}>{album.artist}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {apkArtistResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>ARTISTS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {apkArtistResults.map((artist) => (
                        <TouchableOpacity key={artist.id} activeOpacity={0.88} style={styles.artistCard} onPress={() => openArtist(artist)}>
                          <HTImage source={artist} style={styles.artistImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.artistName}>{artist.name}</Text>
                          <Text numberOfLines={1} style={styles.artistMeta}>{artist.songs.length} song{artist.songs.length === 1 ? "" : "s"}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {apkRoomResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>GENRES / ROOMS</Text>
                    <View style={styles.roomGrid}>
                      {apkRoomResults.map((genre) => (
                        <TouchableOpacity key={genre.id} activeOpacity={0.86} style={styles.roomCard} onPress={() => openGenre(genre)}>
                          <HTImage source={genre} style={styles.roomImage} contentFit="cover" />
                          <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.roomShade} />
                          <Text numberOfLines={1} style={styles.roomTitle}>{genre.title}</Text>
                          <Text style={styles.roomMeta}>{genre.songs.length} tracks</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {apkStationResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>STATIONS / RADIO</Text>
                    <View style={styles.roomGrid}>
                      {apkStationResults.map((station) => (
                        <TouchableOpacity
                          key={`station-${station.id}`}
                          activeOpacity={0.86}
                          style={styles.roomCard}
                          onPress={() => startSearchStation(station)}
                        >
                          <LinearGradient colors={GRADIENTS.card} style={styles.stationArt}>
                            <Ionicons name="radio" size={28} color={COLORS.primaryGlow} />
                          </LinearGradient>
                          <Text numberOfLines={1} style={styles.roomTitle}>{station.title}</Text>
                          <Text style={styles.roomMeta}>{station.subtitle}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {apkPlaylistResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>PLAYLISTS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {apkPlaylistResults.map((playlist) => (
                        <TouchableOpacity
                          key={playlist.id}
                          activeOpacity={0.88}
                          style={styles.albumCard}
                          onPress={() => openPlaylist(playlist)}
                        >
                          <HTImage source={playlist} style={styles.albumImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.albumTitle}>{playlist.title}</Text>
                          <Text numberOfLines={1} style={styles.albumArtist}>{playlist.description || "Collection"}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {apkExternalAudioResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>INTERNET AUDIO</Text>
                    {apkExternalAudioResults.map((song, index) => (
                      <TouchableOpacity
                        key={`external-${song.id}-${index}`}
                        activeOpacity={0.86}
                        style={styles.songRow}
                        onPress={() => playSearchResultSong(song, "external")}
                      >
                        <LinearGradient colors={GRADIENTS.card} style={styles.coverBorder}>
                          <HTImage source={song} style={styles.cover} contentFit="cover" />
                        </LinearGradient>
                        <View style={styles.songCopy}>
                          <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                          <Text numberOfLines={1} style={styles.songArtist}>{song.artist}</Text>
                          <Text numberOfLines={1} style={styles.songMeta}>{(song as any).sourceName || "Internet audio"}</Text>
                        </View>
                        <View style={styles.playCircle}>
                          <Ionicons name="play" size={16} color={COLORS.text} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {apkResultCount === 0 ? (
                  <View style={styles.emptyPanel}>
                    <Ionicons name="search" size={34} color={COLORS.primaryGlow} />
                    <Text style={styles.emptyTitle}>No matches yet</Text>
                    <Text style={styles.emptyText}>Try another artist, album, genre, or mood.</Text>
                  </View>
                ) : null}
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
                    {discoverySongs.map((song, index) => (
                      <TouchableOpacity key={`pick-${song.id}-${index}`} activeOpacity={0.86} style={styles.songRow} onPress={() => playDiscoverySong(song, "Search Quick Picks")}>
                        <LinearGradient colors={GRADIENTS.card} style={styles.coverBorder}>
                          <HTImage source={song} style={styles.cover} contentFit="cover" />
                        </LinearGradient>
                        <View style={styles.songCopy}>
                          <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                          <Text numberOfLines={1} style={styles.songArtist}>{song.artist}</Text>
                          <Text numberOfLines={1} style={styles.songMeta}>{song.album || song.genre || "Hidden Tunes"}</Text>
                        </View>
                        <View style={styles.playCircle}>
                          <Ionicons name="play" size={16} color={COLORS.text} />
                        </View>
                      </TouchableOpacity>
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
  resultSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  fallbackBadge: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.14)",
    overflow: "hidden",
  },
  songRow: {
    minHeight: 82,
    marginBottom: 12,
    padding: 10,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  songRowActive: {
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(34,211,238,0.34)",
  },
  coverBorder: {
    width: 64,
    height: 64,
    borderRadius: 21,
    padding: 2,
  },
  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
    backgroundColor: COLORS.card,
  },
  songCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 13,
  },
  songTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  songArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  songMeta: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  roomCard: {
    width: "47%",
    height: 150,
    borderRadius: 23,
    overflow: "hidden",
    padding: 12,
    justifyContent: "flex-end",
    backgroundColor: COLORS.card,
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    zIndex: 2,
  },
  stationArt: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  roomMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    zIndex: 2,
  },
  artistMeta: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
    textAlign: "center",
  },
  emptyPanel: {
    marginTop: 24,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 10,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
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
