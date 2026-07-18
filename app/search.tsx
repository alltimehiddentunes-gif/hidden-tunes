import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import DebouncedSearchInput from "../components/search/DebouncedSearchInput";
import { SearchApkSongRow } from "../components/search/SearchApkSongRow";
import { RadioStationCard } from "../components/radio/RadioBrowserCards";
import { PodcastEpisodeCard, PodcastShowCard } from "../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../components/podcast/MaturePodcastConsentModal";
import FavoriteButton from "../components/FavoriteButton";
import MatureContentConsentModal from "../components/mature/MatureContentConsentModal";
import { useDeferredSearchMediaSections } from "../hooks/useDeferredSearchMediaSections";
import { useDeferredSearchPodcastSections } from "../hooks/useDeferredSearchPodcastSections";
import { useMountedRef } from "../hooks/useMountedRef";
import { useRenderBurstDiagnostics } from "../hooks/useRenderBurstDiagnostics";
import { useMatureContentGate } from "../hooks/useMatureContentGate";
import { useMaturePodcastGate } from "../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../hooks/usePlaybackRouter";
import { usePlayerFeedSnapshot } from "../utils/playerFeedStore";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
} from "../context/PlayerContext";
import {
  fetchHiddenTunesDiscoveryCatalog,
  getCachedHiddenTunesCatalog,
  isDerivedCatalogTrusted,
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
import {
  freeMusicResultToSong,
  searchFreeMusicProviders,
} from "../services/freeMusicProviders";
import { fetchTvSearchVideos, type HiddenTunesTvVideo } from "../services/tvCatalogApi";
import { normalizeRadioStation } from "../services/radio/radioNormalizer";
import type { RadioStationListItem } from "../types/radio";
import type { PodcastEpisode } from "../types/podcast";
import { openVideoItem } from "../services/videos/openVideoItem";
import { getVideoDisplayCategory, getVideoDisplayCreator, normalizeVideoItem } from "../services/videos/videoNormalizer";
import { buildTvDiscoveryLaunchContext } from "../utils/tvDiscoveryLaunchContext";
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
import { useLocalization } from "../localization";
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
import { logPlaybackCritical } from "../utils/playbackCriticalLogs";
import { logSearchDiagnostic, logSearchRankingDiagnostics } from "../utils/searchDiagnostics";
import { isHeavyPerfDiagnosticsEnabled } from "../utils/devDiagnostics";
import { logVisibleFeatureChecklist } from "../utils/visibleFeatureDiagnostics";
import { logEntityTapReceived } from "../utils/entityDiagnostics";
import {
  SEARCH_BACKEND_DEBOUNCE_MS,
  SEARCH_EXTERNAL_DEBOUNCE_MS,
} from "../utils/searchPerformance";
import { resolveStationEntity } from "../utils/entityResolution";
import { resolveEntityArtwork } from "../utils/artwork";
import {
  buildAlbumFavoriteItem,
  buildArtistFavoriteItem,
  buildRadioStationFavoriteItem,
  buildSongFavoriteItem,
} from "../services/favorites/favoriteItemBuilders";
import { markFastScrolling } from "../utils/performanceMode";
import {
  getUserFacingArtist,
  getUserFacingRadioSubtitle,
  getUserFacingSearchSubtitle,
  getUserFacingSongSubtitle,
  getUserFacingVideoSubtitle,
} from "../services/ui/displayMetadata";

const EMPTY_SEARCH_RESULTS = EMPTY_UNIVERSAL_SEARCH_RESULTS;

const SEARCH_BACKEND_RESULT_LIMIT = 100;
const SEARCH_BACKEND_CACHE_LIMIT = 32;
const SEARCH_LOCAL_CACHE_LIMIT = 24;
const SEARCH_EXTERNAL_CACHE_LIMIT = 16;
const SEARCH_EXTERNAL_AUDIO_LIMIT = 16;
const SEARCH_PROVIDER_QUERY_LIMIT = 8;
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

function dedupeSongs<T extends { id?: string; title?: string; artist?: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const key = String(item.id || `${item.artist || "artist"}-${item.title || "track"}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  cache.set(key, value);
  if (cache.size <= limit) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

function buildSearchCatalogSignature(catalog?: HiddenTunesDerivedCatalog | null) {
  if (!catalog) return "empty";
  const firstSong = catalog.songs[0]?.id || "";
  const lastSong = catalog.songs[catalog.songs.length - 1]?.id || "";
  const firstArtist = catalog.artists[0]?.id || catalog.artists[0]?.name || "";
  const lastArtist = catalog.artists[catalog.artists.length - 1]?.id || catalog.artists[catalog.artists.length - 1]?.name || "";
  return [
    catalog.songs.length,
    firstSong,
    lastSong,
    catalog.albums.length,
    catalog.artists.length,
    firstArtist,
    lastArtist,
    catalog.genres.length,
    catalog.playlists.length,
  ].join(":");
}

function songBelongsToAlbum(song: HiddenTunesSong, album: HiddenTunesAlbumCatalogItem) {
  return (
    normalizeSearchText(song.album) === normalizeSearchText(album.title) &&
    normalizeSearchText(song.artist) === normalizeSearchText(album.artist)
  );
}

function songBelongsToArtist(song: HiddenTunesSong, artist: HiddenTunesArtistCatalogItem) {
  return normalizeSearchText(song.artist) === normalizeSearchText(artist.name);
}

function songBelongsToGenre(song: HiddenTunesSong, genre: HiddenTunesGenreCatalogItem) {
  const genreTitle = normalizeSearchText(genre.title);
  return (
    normalizeSearchText(song.genre) === genreTitle ||
    normalizeSearchText(song.mood) === genreTitle
  );
}

function buildPlayableQueue(songs: HiddenTunesSong[]) {
  return dedupeSongs(
    songs.filter((song) => String(song.streamUrl || song.url || "").trim().length > 0)
  );
}

function withInheritedSearchArtwork<
  T extends { artwork?: string; cover?: string; thumbnail?: string }
>(entity: T, relatedSongs: HiddenTunesSong[]): T {
  const artwork = resolveEntityArtwork(entity, relatedSongs);
  return {
    ...entity,
    artwork,
    cover: artwork,
    thumbnail: artwork,
  };
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const { playSong } = usePlayerActions();
  const { playRadioStation, playPodcastEpisode } = usePlaybackRouter();
  const {
    consentVisible: matureConsentVisible,
    runWithMatureConsent,
    cancelConsent: cancelMatureConsent,
    confirmConsent: confirmMatureConsent,
  } = useMatureContentGate();
  const {
    consentVisible: maturePodcastConsentVisible,
    runWithMaturePodcastConsent,
    cancelConsent: cancelMaturePodcastConsent,
    confirmConsent: confirmMaturePodcastConsent,
  } = useMaturePodcastGate();
  const playerFeed = usePlayerFeedSnapshot();
  const { t } = useLocalization();

  const searchUi = useMemo(
    () => ({
      kicker: t("search.kicker"),
      title: t("search.title"),
      placeholder: t("search.placeholderFind"),
      loadingCatalog: t("search.loadingCatalog"),
      searchingHiddenTunes: t("search.searchingHiddenTunes"),
      results: t("search.results"),
      moreToDiscover: t("search.moreToDiscover"),
      collection: t("search.collection"),
      moodRoom: t("search.moodRoom"),
      video: t("search.video"),
      findingRadioStations: t("search.findingRadioStations"),
      findingPodcasts: t("search.findingPodcasts"),
      seeMoreRadioStations: t("search.seeMoreRadioStations"),
      noMatchesTitle: t("search.noMatchesTitle"),
      noMatchesDescription: t("search.noMatchesDescription"),
      trending: t("search.trending"),
      tryThese: t("search.tryThese"),
      forYou: t("search.forYou"),
      quickPicks: t("search.quickPicks"),
      popularArtists: t("search.popularArtists"),
      albumSpotlight: t("search.albumSpotlight"),
      browseByMoodGenre: t("search.browseByMoodGenre"),
      quickPicksSource: t("search.quickPicksSource"),
      sections: {
        songs: t("search.sections.songs"),
        albums: t("search.sections.albums"),
        artists: t("search.sections.artists"),
        genresRooms: t("search.sections.genresRooms"),
        stationsRadio: t("search.sections.stationsRadio"),
        playlists: t("search.sections.playlists"),
        moreListening: t("search.sections.moreListening"),
        videos: t("search.sections.videos"),
        radioStations: t("search.sections.radioStations"),
        podcasts: t("search.sections.podcasts"),
        genres: t("search.sections.genres"),
      },
      formatMatchCount: (count: number) =>
        t(count === 1 ? "search.matchSingular" : "search.matchPlural", { count }),
      formatTrackCount: (count: number) => t("search.trackCount", { count }),
      formatSongCount: (count: number) => t("search.songCount", { count }),
      formatSearchQueueLabel: (query: string) =>
        query
          ? t("search.searchQueryLabel", { query })
          : t("search.searchResultsLabel"),
    }),
    [t]
  );

  const searchUiRef = useRef(searchUi);
  searchUiRef.current = searchUi;

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const initialQuery = String(params.q || "").trim();

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState(
    initialQuery.length >= 2 ? initialQuery : ""
  );

  useRenderBurstDiagnostics("screen:search", {
    queryLength: searchQuery.length,
    submittedLength: submittedSearchQuery.length,
  });
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
  const backendSearchCacheRef = useRef(new Map<string, HiddenTunesNormalizedSong[]>());
  const localSearchCacheRef = useRef(new Map<string, SearchGroupedResults>());
  const externalSearchCacheRef = useRef(new Map<string, HiddenTunesNormalizedSong[]>());
  const externalSearchRequestIdRef = useRef(0);
  const tvSearchRequestIdRef = useRef(0);
  const mountedRef = useMountedRef();

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];
  const catalogSignature = useMemo(() => buildSearchCatalogSignature(catalog), [catalog]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = getCachedHiddenTunesCatalog();
      if (cached && isDerivedCatalogTrusted(cached) && !cancelled) {
        setCatalog(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchHiddenTunesDiscoveryCatalog();
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
    [catalogSignature, albums, artists, genres, playlists, songs]
  );

  const albumLookup = useMemo(() => {
    const byId = new Map<string, HiddenTunesAlbumCatalogItem>();
    const byTitleArtist = new Map<string, HiddenTunesAlbumCatalogItem>();

    for (const item of albums) {
      const id = String(item.id || "").trim();
      if (id) byId.set(id, item);
      byTitleArtist.set(
        `${normalizeSearchText(item.title)}|${normalizeSearchText(item.artist)}`,
        item
      );
    }

    return { byId, byTitleArtist };
  }, [catalogSignature, albums]);

  const artistLookup = useMemo(() => {
    const byId = new Map<string, HiddenTunesArtistCatalogItem>();
    const byName = new Map<string, HiddenTunesArtistCatalogItem>();

    for (const item of artists) {
      const id = String(item.id || "").trim();
      if (id) byId.set(id, item);
      byName.set(normalizeSearchText(item.name), item);
    }

    return { byId, byName };
  }, [catalogSignature, artists]);

  const cleanSubmittedSearchQuery = submittedSearchQuery.trim();
  const normalizedSearchQuery = cleanSubmittedSearchQuery.toLowerCase().replace(/\s+/g, " ");
  const deferredMedia = useDeferredSearchMediaSections(cleanSubmittedSearchQuery);
  const deferredPodcasts = useDeferredSearchPodcastSections(cleanSubmittedSearchQuery);
  const backendSearchCacheKey = normalizedSearchQuery;
  const localSearchCacheKey = `${normalizedSearchQuery}|${catalogSignature}`;

  useEffect(() => {
    if (cleanSubmittedSearchQuery.length < 2) return;

    logVisibleFeatureChecklist({
      mainSearchRadioSectionsEnabled:
        deferredMedia.radioLoading || deferredMedia.radioReadyForQuery,
      searchRadioCount: deferredMedia.radioStations.length,
    });
  }, [
    cleanSubmittedSearchQuery,
    deferredMedia.radioLoading,
    deferredMedia.radioReadyForQuery,
    deferredMedia.radioStations.length,
  ]);

  const localSearchResults = useMemo(() => {
    if (!cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    const cached = localSearchCacheRef.current.get(localSearchCacheKey);
    if (cached) return cached;
    const results = runUniversalCatalogSearch(searchCatalog, cleanSubmittedSearchQuery);
    setBoundedCache(localSearchCacheRef.current, localSearchCacheKey, results, SEARCH_LOCAL_CACHE_LIMIT);
    return results;
  }, [cleanSubmittedSearchQuery, localSearchCacheKey, searchCatalog]);

  const shouldRunBackendSearch = cleanSubmittedSearchQuery.length > 0;

  useEffect(() => {
    const query = cleanSubmittedSearchQuery;
    const cacheKey = backendSearchCacheKey;

    if (!query) {
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

    const cached = backendSearchCacheRef.current.get(cacheKey);
    if (cached) {
      const requestId = backendSearchRequestIdRef.current + 1;
      backendSearchRequestIdRef.current = requestId;
      logSearchDiagnostic("search_backend_immediate_cache_hit", {
        query,
        count: cached.length,
      });
      logSearchDiagnostic("search_backend_cache_hit", {
        query,
        count: cached.length,
      });
      setBackendSearchSongs(cached);
      setBackendSearchQuery(query);
      setBackendSearchCompletedQuery(query);
      return;
    }

    const requestId = backendSearchRequestIdRef.current + 1;
    backendSearchRequestIdRef.current = requestId;
    setBackendSearchQuery(query);
    setBackendSearchCompletedQuery("");

    const controller = new AbortController();
    const timer = setTimeout(() => {
      logSearchDiagnostic("search_backend_immediate_start", {
        query,
        limit: SEARCH_BACKEND_RESULT_LIMIT,
      });
      logSearchDiagnostic("search_backend_query_start", {
        query,
        limit: SEARCH_BACKEND_RESULT_LIMIT,
      });

      void searchHiddenTunesSongs(query, {
        signal: controller.signal,
        limit: SEARCH_BACKEND_RESULT_LIMIT,
      })
        .then((results) => {
          if (backendSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          backendSearchCacheRef.current.set(cacheKey, results);
          if (backendSearchCacheRef.current.size > SEARCH_BACKEND_CACHE_LIMIT) {
            const oldestQuery = backendSearchCacheRef.current.keys().next().value;
            if (oldestQuery) backendSearchCacheRef.current.delete(oldestQuery);
          }
          setBackendSearchSongs(results);
          logSearchDiagnostic("search_backend_immediate_success", {
            query,
            count: results.length,
            limit: SEARCH_BACKEND_RESULT_LIMIT,
          });
          logSearchDiagnostic("search_backend_query_success", {
            query,
            count: results.length,
          });
          if (results.length >= SEARCH_BACKEND_RESULT_LIMIT) {
            logSearchDiagnostic("search_backend_q_may_not_be_full_catalog", {
              query,
              count: results.length,
              limit: SEARCH_BACKEND_RESULT_LIMIT,
            });
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (backendSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          console.log("Search backend query error:", error);
          setBackendSearchSongs([]);
          const message = error instanceof Error ? error.message : String(error);
          logSearchDiagnostic("search_backend_immediate_failed", {
            query,
            error: message,
          });
          logSearchDiagnostic("search_backend_query_failed", {
            query,
            error: message,
          });
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          if (backendSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          setBackendSearchCompletedQuery(query);
        });
    }, SEARCH_BACKEND_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      backendSearchRequestIdRef.current += 1;
    };
  }, [backendSearchCacheKey, cleanSubmittedSearchQuery]);

  const backendSearchResults = useMemo(() => {
    if (!cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (backendSearchQuery !== cleanSubmittedSearchQuery) return EMPTY_SEARCH_RESULTS;
    if (!backendSearchSongs.length) return EMPTY_SEARCH_RESULTS;

    const trusted = buildTrustedBackendSongHits(
      backendSearchSongs,
      cleanSubmittedSearchQuery
    );
    const hasAnyResults =
      trusted.songs.length > 0 ||
      trusted.artists.length > 0 ||
      trusted.albums.length > 0 ||
      trusted.genreMoods.length > 0 ||
      trusted.moodRooms.length > 0 ||
      trusted.playlists.length > 0;

    return {
      ...EMPTY_SEARCH_RESULTS,
      songs: trusted.songs,
      artists: trusted.artists,
      albums: trusted.albums,
      genreMoods: trusted.genreMoods,
      moodRooms: trusted.moodRooms,
      playlists: trusted.playlists,
      hasAnyResults,
    };
  }, [backendSearchQuery, backendSearchSongs, cleanSubmittedSearchQuery]);

  useEffect(() => {
    if (!cleanSubmittedSearchQuery) return;
    if (backendSearchQuery !== cleanSubmittedSearchQuery) return;
    if (!backendSearchResults.hasAnyResults) return;

    logSearchDiagnostic("search_backend_results_merged", {
      query: cleanSubmittedSearchQuery,
      backendSongHits: backendSearchResults.songs.length,
      backendArtistHits: backendSearchResults.artists.length,
      backendAlbumHits: backendSearchResults.albums.length,
    });
    logSearchDiagnostic("search_backend_result_promoted", {
      query: cleanSubmittedSearchQuery,
      backendSongHits: backendSearchResults.songs.length,
      localSongHits: localSearchResults.songs.length,
    });
    logSearchDiagnostic("search_result_source_backend", {
      query: cleanSubmittedSearchQuery,
      count: backendSearchSongs.length,
    });
  }, [
    backendSearchQuery,
    backendSearchResults.albums.length,
    backendSearchResults.artists.length,
    backendSearchResults.hasAnyResults,
    backendSearchResults.songs.length,
    backendSearchSongs.length,
    cleanSubmittedSearchQuery,
    localSearchResults.songs.length,
  ]);

  const internalSearchResults = useMemo(
    () => mergeGroupedSearchResults(backendSearchResults, localSearchResults),
    [backendSearchResults, localSearchResults]
  );

  const hasInternalCatalogResults = useMemo(
    () => hasInternalGroupedResults(internalSearchResults),
    [internalSearchResults]
  );

  const backendSearchPendingForQuery =
    shouldRunBackendSearch && backendSearchCompletedQuery !== cleanSubmittedSearchQuery;

  useEffect(() => {
    if (!cleanSubmittedSearchQuery) return;
    if (!backendSearchPendingForQuery) return;

    logSearchDiagnostic("search_empty_blocked_backend_loading", {
      query: cleanSubmittedSearchQuery,
    });
    logSearchDiagnostic("search_empty_waiting_for_backend", {
      query: cleanSubmittedSearchQuery,
    });
  }, [backendSearchPendingForQuery, cleanSubmittedSearchQuery]);

  const shouldRunExternalSearch =
    cleanSubmittedSearchQuery.length >= 2 && !hasInternalCatalogResults;

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

    if (!shouldRunExternalSearch) {
      setExternalSearchSongs([]);
      setExternalSearchQuery(query);
      setExternalSearchCompletedQuery(query);
      return;
    }

    const cachedExternalSongs = externalSearchCacheRef.current.get(normalizedSearchQuery);
    const requestId = externalSearchRequestIdRef.current + 1;
    externalSearchRequestIdRef.current = requestId;
    setExternalSearchQuery(query);
    setExternalSearchCompletedQuery("");

    if (cachedExternalSongs) {
      setExternalSearchSongs(cachedExternalSongs);
      setExternalSearchCompletedQuery(query);
      return;
    }

    setExternalSearchSongs([]);

    const timer = setTimeout(() => {
      void searchFreeMusicProviders(query, { limit: SEARCH_PROVIDER_QUERY_LIMIT })
        .then((response) => {
          if (externalSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          const providerSongs = dedupeSongs(response.results.map(freeMusicResultToSong)).slice(0, SEARCH_EXTERNAL_AUDIO_LIMIT);
          setBoundedCache(externalSearchCacheRef.current, normalizedSearchQuery, providerSongs, SEARCH_EXTERNAL_CACHE_LIMIT);
          setExternalSearchSongs(providerSongs);
        })
        .catch((error) => {
          if (externalSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          console.log("Search external provider error:", error);
          setExternalSearchSongs([]);
        })
        .finally(() => {
          if (externalSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
          setExternalSearchCompletedQuery(query);
        });
    }, SEARCH_EXTERNAL_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      externalSearchRequestIdRef.current += 1;
    };
  }, [cleanSubmittedSearchQuery, hasInternalCatalogResults, normalizedSearchQuery, shouldRunExternalSearch]);

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

    const controller = new AbortController();
    const requestId = tvSearchRequestIdRef.current + 1;
    tvSearchRequestIdRef.current = requestId;
    setTvSearchQuery(query);
    setTvSearchCompletedQuery("");

    void fetchTvSearchVideos(query, { signal: controller.signal, limit: SEARCH_TV_LIMIT })
      .then((videos) => {
        if (tvSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
        setTvSearchVideos(videos);
      })
      .catch((error) => {
        if (tvSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.log("Search TV fallback error:", error);
        setTvSearchVideos([]);
      })
      .finally(() => {
        if (tvSearchRequestIdRef.current !== requestId || !mountedRef.current) return;
        setTvSearchCompletedQuery(query);
      });

    return () => {
      controller.abort();
      tvSearchRequestIdRef.current += 1;
    };
  }, [cleanSubmittedSearchQuery, shouldRunTvSearch]);

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
    const backendSongs = songsFromSearchHits(backendSearchResults);
    const internalSongs = songsFromSearchHits(internalSearchResults);
    const merged = dedupeSongs([...backendSongs, ...internalSongs]);
    return unwrapRankedSearchItems(rankSearchSongs(merged, cleanSubmittedSearchQuery));
  }, [backendSearchResults, cleanSubmittedSearchQuery, internalSearchResults]);

  const reliableCatalogSongResults = useMemo(() => {
    if (!cleanSubmittedSearchQuery) return [] as HiddenTunesSong[];

    return unwrapRankedSearchItems(
      rankSearchSongs(searchResultSongs, cleanSubmittedSearchQuery, { limit: 80 })
    );
  }, [cleanSubmittedSearchQuery, searchResultSongs]);

  const reliableCatalogSongIds = useMemo(
    () => new Set(reliableCatalogSongResults.map((song) => String(song.id || ""))),
    [reliableCatalogSongResults]
  );

  const apkSongRanked = useMemo(() => {
    if (!cleanSubmittedSearchQuery) return [] as ReturnType<typeof rankApkSongResults>;
    const direct = dedupeSongs(reliableCatalogSongResults);
    const needsRelated = direct.length < 4;
    const related = needsRelated
      ? buildRelatedInternalDiscovery(cleanSubmittedSearchQuery, songs, direct, 18)
      : [];
    return rankApkSongResults(direct, cleanSubmittedSearchQuery, related);
  }, [cleanSubmittedSearchQuery, reliableCatalogSongResults, songs]);

  const apkSongResults = useMemo(
    () => apkSongRanked.map((entry) => entry.item),
    [apkSongRanked]
  );

  const apkAlbumResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesAlbumCatalogItem[];

    const fromBackbone = internalSearchResults.albums
      .map((hit) => {
        const album = hit.payload;
        const catalogAlbum =
          albumLookup.byId.get(String(album.id || "")) ||
          albumLookup.byTitleArtist.get(
            `${normalizeSearchText(album.title)}|${normalizeSearchText(album.artist)}`
          );

        const songsForAlbum =
          catalogAlbum?.songs?.length
            ? catalogAlbum.songs
            : ((album.tracks || []) as HiddenTunesSong[]);

        const base = catalogAlbum || {
          id: album.id,
          title: album.title,
          artist: album.artist,
          artwork: album.artwork,
          songs: songsForAlbum,
        };

        return withInheritedSearchArtwork(base, reliableCatalogSongResults);
      })
      .filter(Boolean) as HiddenTunesAlbumCatalogItem[];

    return rankApkAlbumResults(fromBackbone, cleanSubmittedSearchQuery);
  }, [
    albumLookup,
    cleanSubmittedSearchQuery,
    internalSearchResults.albums,
    reliableCatalogSongResults,
  ]);

  const apkArtistResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesArtistCatalogItem[];

    const fromBackbone = internalSearchResults.artists
      .map((hit) => {
        const artist = hit.payload;
        const catalogArtist =
          artistLookup.byId.get(String(artist.id || "")) ||
          artistLookup.byName.get(normalizeSearchText(artist.name));

        const base = catalogArtist || {
          id: artist.id,
          name: artist.name,
          artwork: artist.artwork || artist.cover || "",
          songs: (artist.tracks || []) as HiddenTunesSong[],
          albums: [],
        };

        return withInheritedSearchArtwork(base, reliableCatalogSongResults);
      })
      .filter(Boolean) as HiddenTunesArtistCatalogItem[];

    return rankApkArtistResults(fromBackbone, cleanSubmittedSearchQuery);
  }, [
    artistLookup,
    cleanSubmittedSearchQuery,
    internalSearchResults.artists,
    reliableCatalogSongResults,
  ]);

  const apkRoomResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesGenreCatalogItem[];

    const genreHits: HiddenTunesGenreCatalogItem[] = internalSearchResults.genreMoods.map((hit) => {
      const genre = hit.payload;
      const catalogGenre =
        genres.find((item) => item.id === genre.id) ||
        genres.find(
          (item) => normalizeSearchText(item.title) === normalizeSearchText(genre.title)
        );

      const base = catalogGenre || {
        id: genre.id,
        title: genre.title,
        artwork: "",
        songs: reliableCatalogSongResults.filter((song) => songBelongsToGenre(song, {
          id: genre.id,
          title: genre.title,
          artwork: "",
          songs: [],
        })),
      };

      return withInheritedSearchArtwork(base, reliableCatalogSongResults);
    });

    const roomHits = internalSearchResults.moodRooms
      .map((hit) => {
        const title = hit.payload.title;
        const catalogGenre = genres.find((genre) => textMatchesQuery(genre.title, title));
        if (!catalogGenre) {
          return withInheritedSearchArtwork(
            {
              id: hit.payload.id,
              title,
              artwork: "",
              songs: reliableCatalogSongResults.filter((song) =>
                textMatchesQuery([song.genre, song.mood, song.title].join(" "), title)
              ),
            },
            reliableCatalogSongResults
          );
        }
        return withInheritedSearchArtwork(catalogGenre, reliableCatalogSongResults);
      })
      .filter(Boolean) as HiddenTunesGenreCatalogItem[];

    const merged = dedupeByKey(
      [...genreHits, ...roomHits],
      (genre) => String(genre.id || genre.title)
    );

    return rankApkGenreResults(merged, cleanSubmittedSearchQuery);
  }, [
    cleanSubmittedSearchQuery,
    genres,
    internalSearchResults.genreMoods,
    internalSearchResults.moodRooms,
    reliableCatalogSongResults,
  ]);

  const apkPlaylistResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [] as HiddenTunesDerivedCatalog["playlists"];

    return internalSearchResults.playlists
      .map((hit) => {
        const playlist = hit.payload;
        const catalogPlaylist = playlists.find((item) => item.id === playlist.id) || playlist;
        return withInheritedSearchArtwork(catalogPlaylist, reliableCatalogSongResults);
      })
      .slice(0, 10) as HiddenTunesDerivedCatalog["playlists"];
  }, [
    cleanSubmittedSearchQuery,
    internalSearchResults.playlists,
    playlists,
    reliableCatalogSongResults,
  ]);

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
    return audioSearchResults.internetAudio
      .map((hit) => hit.payload as HiddenTunesSong)
      .filter(Boolean)
      .slice(0, SEARCH_EXTERNAL_AUDIO_LIMIT);
  }, [audioSearchResults.internetAudio]);

  const apkTvResults = useMemo(() => {
    if (cleanSubmittedSearchQuery.length < 2) return [];
    return searchResults.tv.slice(0, SEARCH_TV_LIMIT);
  }, [cleanSubmittedSearchQuery, searchResults.tv]);

  const apkResultCount =
    apkSongResults.length
    apkAlbumResults.length
    apkArtistResults.length
    apkRoomResults.length
    apkPlaylistResults.length
    apkStationResults.length
    apkExternalAudioResults.length
    apkTvResults.length;

  const hasSearchText = searchQuery.trim().length > 0;
  const cleanSearchQuery = searchQuery.trim();
  const searchDebouncePending =
    cleanSearchQuery.length > 0 && cleanSearchQuery !== cleanSubmittedSearchQuery;
  const showSearchResults =
    cleanSubmittedSearchQuery.length > 0 &&
    !searchDebouncePending &&
    !backendSearchPendingForQuery;
  const tvSearchPendingForQuery =
    shouldRunTvSearch && tvSearchCompletedQuery !== cleanSubmittedSearchQuery;
  const showSearchLoading =
    hasSearchText &&
    (searchDebouncePending ||
      backendSearchPendingForQuery ||
      externalSearchPendingForQuery);

  const showDiscovery = !hasSearchText || cleanSubmittedSearchQuery.length === 0;

  const discoveryArtists = useMemo(() => artists.slice(0, 10), [artists]);
  const discoveryAlbums = useMemo(() => albums.slice(0, 10), [albums]);
  const discoveryGenres = useMemo(() => genres.slice(0, 8), [genres]);
  const discoverySongs = useMemo(() => {
    const recentlyPlayed = Array.isArray(playerFeed.recentlyPlayed)
      ? playerFeed.recentlyPlayed
      : [];
    const favorites = Array.isArray(playerFeed.favorites) ? playerFeed.favorites : [];
    const recentIds = new Set(
      recentlyPlayed.map((entry) => String((entry as { id?: string })?.id || "")).filter(Boolean)
    );
    const recentMatches = songs.filter((song) => recentIds.has(String(song.id)));
    const favoriteMatches = favorites.slice(0, 6) as HiddenTunesSong[];
    const merged = [...favoriteMatches, ...recentMatches, ...songs.slice(0, 12)];
    const seen = new Set<string>();
    return merged.filter((song) => {
      const id = String(song.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 10);
  }, [playerFeed.favorites, playerFeed.recentlyPlayed, songs]);

  const playSearchResultSong = useCallback(
    (song: HiddenTunesSong, resultType: string = "song") => {
      const raw = (song as any).raw || {};
      const externalUrl = String(raw.externalUrl || (song as any).externalUrl || "").trim();

      if (resultType === "external" && raw.canPlayNatively === false) {
        if (externalUrl) void Linking.openURL(externalUrl);
        return;
      }

      const playableExternalResults = apkExternalAudioResults.filter(
        (item) => (item as any).raw?.canPlayNatively !== false && String(item.streamUrl || item.url || "").trim()
      );
      const queue =
        resultType === "external"
          ? playableExternalResults.length ? playableExternalResults : [song]
          : apkSongResults.length
            ? apkSongResults
            : reliableCatalogSongResults.length
              ? reliableCatalogSongResults
              : searchResultSongs.length
                ? searchResultSongs
                : [song];
      const queueIndex = findSongIndex(queue, song);
      const queueSong = queueIndex >= 0 ? queue[queueIndex] : song;

      logSearchDiagnostic("search_result_tapped", {
        resultType,
        songId: queueSong.id,
        query: cleanSubmittedSearchQuery,
      });

      router.push("/player" as any);
      logPlaybackCritical("tap_to_player_opened", {
        songId: queueSong.id,
        source: "search_result",
        resultType,
      });
      void playSong(queueSong, queue, Math.max(queueIndex, 0), {
        source: "search",
        label: searchUiRef.current.formatSearchQueueLabel(
          submittedSearchQuery || searchQuery
        ),
        searchQuery: submittedSearchQuery || searchQuery,
        artistName: queueSong.artist,
        genre: queueSong.genre,
        mood: queueSong.mood,
      }).catch((error: unknown) => {
        logPlaybackCritical("tap_to_play_failed", {
          songId: queueSong.id,
          source: "search_result",
          message: String((error as Error)?.message || error),
        });
      });
    },
    [
      apkExternalAudioResults,
      apkSongResults,
      cleanSubmittedSearchQuery,
      playSong,
      reliableCatalogSongResults,
      searchQuery,
      searchResultSongs,
      submittedSearchQuery,
    ]
  );

  const playDiscoverySong = useCallback(
    (song: HiddenTunesSong, label: string) => {
      const queueIndex = findSongIndex(discoverySongs, song);
      logSearchDiagnostic("search_result_tapped", {
        resultType: "discovery_song",
        songId: song.id,
        query: label,
      });
      void playSong(song, discoverySongs, Math.max(queueIndex, 0), {
        source: "search",
        label,
        artistName: song.artist,
        genre: song.genre,
        mood: song.mood,
      });
      router.push("/player" as any);
    },
    [discoverySongs, playSong]
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
          source: station.kind === "room" ? "mood" : "genre",
          label: station.title,
          genre: tracks[0].genre || station.title,
          mood: tracks[0].mood,
        });
        router.push("/player" as any);
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
    const artistId = String(artist.id || "").trim();
    if (artistId && artistId !== "undefined" && artistId !== "null" && !/^\d+$/.test(artistId)) {
      router.push({
        pathname: "/artist/[id]",
        params: { id: artistId },
      } as any);
      return;
    }
    router.push({
      pathname: "/artist",
      params: {
        artist: artist.name,
        id: artist.id,
      },
    } as any);
  }, [cleanSubmittedSearchQuery]);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
    logSearchDiagnostic("search_result_tapped", {
      resultType: "album",
      albumId: album.id,
      title: album.title,
      query: cleanSubmittedSearchQuery,
    });
    const albumId = String(album.id || "").trim();
    if (albumId) {
      router.push({
        pathname: "/album/[id]",
        params: { id: albumId },
      } as any);
      return;
    }

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

  const playAlbumResult = useCallback(
    (album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
      const catalogAlbum =
        "songs" in album
          ? (album as HiddenTunesAlbumCatalogItem)
          : albums.find((item) => item.id === album.id) || null;

      const queue = buildPlayableQueue(
        catalogAlbum?.songs?.length
          ? catalogAlbum.songs
          : reliableCatalogSongResults.filter((song) =>
              songBelongsToAlbum(
                song,
                catalogAlbum || {
                  id: album.id,
                  title: album.title,
                  artist: album.artist,
                  artwork: album.artwork || "",
                  songs: [],
                }
              )
            )
      );

      logSearchDiagnostic("search_result_tapped", {
        resultType: "album",
        albumId: album.id,
        title: album.title,
        query: cleanSubmittedSearchQuery,
      });

      if (!queue.length) {
        router.push({ pathname: '/album/[id]', params: { id: String(album.id || '') } } as any);
        return;
      }

      void playSong(queue[0], queue, 0, {
        source: "album",
        label: album.title,
        albumId: String(album.id || catalogAlbum?.id || ""),
        albumTitle: album.title,
        artistName: album.artist,
      });
      router.push("/player" as any);
    },
    [
      albums,
      cleanSubmittedSearchQuery,
      playSong,
      reliableCatalogSongResults,
      searchQuery,
      submittedSearchQuery,
    ]
  );

  const playArtistResult = useCallback(
    (artist: HiddenTunesArtistCatalogItem | HiddenTunesArtist) => {
      const catalogArtist =
        "songs" in artist
          ? (artist as HiddenTunesArtistCatalogItem)
          : artists.find((item) => item.id === artist.id) ||
            artists.find(
              (item) => normalizeSearchText(item.name) === normalizeSearchText(artist.name)
            ) ||
            null;

      const queue = buildPlayableQueue(
        catalogArtist?.songs?.length
          ? catalogArtist.songs
          : reliableCatalogSongResults.filter((song) =>
              songBelongsToArtist(
                song,
                catalogArtist || {
                  id: artist.id,
                  name: artist.name,
                  artwork: artist.artwork || "",
                  songs: [],
                  albums: [],
                }
              )
            )
      );

      logSearchDiagnostic("search_result_tapped", {
        resultType: "artist",
        artistId: artist.id,
        title: artist.name,
        query: cleanSubmittedSearchQuery,
      });

      if (!queue.length) {
        router.push({ pathname: '/artist', params: { artist: artist.name, id: artist.id } } as any);
        return;
      }

      void playSong(queue[0], queue, 0, {
        source: "artist",
        label: artist.name,
        artistId: String(artist.id || catalogArtist?.id || ""),
        artistName: artist.name,
      });
      router.push("/player" as any);
    },
    [
      artists,
      cleanSubmittedSearchQuery,
      playSong,
      reliableCatalogSongResults,
      searchQuery,
      submittedSearchQuery,
    ]
  );

  const playGenreResult = useCallback(
    (genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre) => {
      const catalogGenre =
        "songs" in genre
          ? (genre as HiddenTunesGenreCatalogItem)
          : genres.find((item) => item.id === genre.id) ||
            genres.find(
              (item) => normalizeSearchText(item.title) === normalizeSearchText(genre.title)
            ) ||
            null;

      const queue = buildPlayableQueue(
        catalogGenre?.songs?.length
          ? catalogGenre.songs
          : reliableCatalogSongResults.filter((song) =>
              songBelongsToGenre(
                song,
                catalogGenre || {
                  id: genre.id,
                  title: genre.title,
                  artwork: "",
                  songs: [],
                }
              )
            )
      );

      logSearchDiagnostic("search_result_tapped", {
        resultType: "room",
        genreId: genre.id,
        title: genre.title,
        query: cleanSubmittedSearchQuery,
      });

      if (!queue.length) {
        router.push({ pathname: '/genre', params: { title: genre.title, query: genre.title, id: genre.id, type: 'genre' } } as any);
        return;
      }

      const isMoodRoom = internalSearchResults.moodRooms.some(
        (hit) =>
          hit.payload.id === genre.id ||
          normalizeSearchText(hit.payload.title) === normalizeSearchText(genre.title)
      );

      void playSong(queue[0], queue, 0, {
        source: isMoodRoom ? "mood" : "genre",
        label: genre.title,
        genre: isMoodRoom ? queue[0]?.genre : genre.title,
        mood: isMoodRoom ? genre.title : queue[0]?.mood,
      });
      router.push("/player" as any);
    },
    [
      cleanSubmittedSearchQuery,
      genres,
      internalSearchResults.moodRooms,
      playSong,
      reliableCatalogSongResults,
      searchQuery,
      submittedSearchQuery,
    ]
  );

  const playPlaylistResult = useCallback(
    (playlist: HiddenTunesDerivedCatalog["playlists"][number]) => {
      const catalogPlaylist = playlists.find((item) => item.id === playlist.id) || playlist;
      const queue = buildPlayableQueue(catalogPlaylist.songs || []);

      logSearchDiagnostic("search_result_tapped", {
        resultType: "playlist",
        playlistId: playlist.id,
        title: playlist.title,
        query: cleanSubmittedSearchQuery,
      });

      if (!queue.length) {
        router.push('/playlists' as any);
        return;
      }

      void playSong(queue[0], queue, 0, {
        source: "playlist",
        label: playlist.title,
        railId: String(playlist.id || catalogPlaylist.id || ""),
      });
      router.push("/player" as any);
    },
    [
      cleanSubmittedSearchQuery,
      playlists,
      playSong,
      searchQuery,
      submittedSearchQuery,
    ]
  );


  const openTv = useCallback(
    (video: HiddenTunesTvVideo) => {
      const discoveryContext = buildTvDiscoveryLaunchContext(video, {
        query: cleanSubmittedSearchQuery || undefined,
        browseReturnPath: "/search",
      });
      void openVideoItem(video, { discoveryContext });
    },
    [cleanSubmittedSearchQuery]
  );

  const playSearchRadioStation = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void (async () => {
          let station = deferredMedia.resolveRadioStation(item.id);
          if (!station || !mountedRef.current) return;
          const sessionStations = deferredMedia.radioStations
            .map((entry) => deferredMedia.resolveRadioStation(entry.id))
            .filter(Boolean);
          await playRadioStation(normalizeRadioStation(station), {
            session: sessionStations.map((entry) => normalizeRadioStation(entry!)),
            startIndex: Math.max(
              0,
              sessionStations.findIndex((entry) => entry?.id === station!.id)
            ),
            label: cleanSubmittedSearchQuery
              ? `Search: ${cleanSubmittedSearchQuery}`
              : "Radio Search",
            searchQuery: cleanSubmittedSearchQuery || undefined,
            cacheKey: cleanSubmittedSearchQuery
              ? `search:${cleanSubmittedSearchQuery}`
              : undefined,
          });
        })();
      });
    },
    [
      cleanSubmittedSearchQuery,
      deferredMedia.radioStations,
      deferredMedia.resolveRadioStation,
      mountedRef,
      playRadioStation,
      runWithMatureConsent,
    ]
  );

  const playSearchPodcastEpisode = useCallback(
    (episode: PodcastEpisode) => {
      runWithMaturePodcastConsent(episode, () => {
        void playPodcastEpisode(episode);
      });
    },
    [playPodcastEpisode, runWithMaturePodcastConsent]
  );

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
    if (!cleanSubmittedSearchQuery) return;
    logSearchDiagnostic("search_started", { query: cleanSubmittedSearchQuery });
  }, [cleanSubmittedSearchQuery]);

  useEffect(() => {
    if (!isHeavyPerfDiagnosticsEnabled()) return;
    if (!showSearchResults || !cleanSubmittedSearchQuery) return;

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
      apkTvResults.length,
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
    logSearchDiagnostic("search_tv_results", { count: apkTvResults.length, query: cleanSubmittedSearchQuery });
    if (apkExternalAudioResults.length > 0) {
      logSearchDiagnostic("search_external_fallback_used", {
        query: cleanSubmittedSearchQuery,
        count: apkExternalAudioResults.length,
      });
    }
    if (apkResultCount === 0) {
      logSearchDiagnostic("search_empty_true_after_backend", { query: cleanSubmittedSearchQuery });
      logSearchDiagnostic("search_empty_after_all_sources", { query: cleanSubmittedSearchQuery });
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
    apkTvResults.length,
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
                <Text style={styles.kicker}>{searchUi.kicker}</Text>
                <Text style={styles.title}>{searchUi.title}</Text>
              </View>

              <View style={styles.iconSpacer} />
            </View>

            <View style={styles.searchPanel}>
              <DebouncedSearchInput
                value={searchQuery}
                onImmediateChange={handleSearchImmediateChange}
                onDebouncedChange={setSubmittedSearchQuery}
                onClear={clearSearch}
                placeholder={searchUi.placeholder}
                placeholderTextColor={COLORS.textMuted}
                style={styles.searchInput}
                containerStyle={styles.searchInputShell}
                autoFocus
              />
            </View>

            {loading && songs.length === 0 && !hasSearchText ? (
              <View style={styles.centerPanel}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{searchUi.loadingCatalog}</Text>
              </View>
            ) : null}

            {showSearchLoading ? (
              <View style={styles.centerPanel}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>{searchUi.searchingHiddenTunes}</Text>
              </View>
            ) : null}

            {showSearchResults ? (
              <View style={styles.resultsPanel}>
                <View style={styles.resultSummaryRow}>
                  <View>
                    <Text style={styles.sectionEyebrow}>{searchUi.results}</Text>
                    <Text style={styles.sectionTitle}>
                      {searchUi.formatMatchCount(apkResultCount)}
                    </Text>
                  </View>
                  {apkExternalAudioResults.length > 0 ? (
                    <Text style={styles.fallbackBadge}>{searchUi.moreToDiscover}</Text>
                  ) : null}
                </View>

                {apkSongResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.songs}</Text>
                    {apkSongResults.slice(0, 18).map((song, index) => (
                      <SearchApkSongRow
                        key={`song-${song.id}-${index}`}
                        song={song as unknown as HiddenTunesNormalizedSong}
                        onPress={() => playSearchResultSong(song, "song")}
                        styles={styles}
                      />
                    ))}
                  </View>
                ) : null}

                {apkAlbumResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.albums}</Text>
                    <FlatList
                      horizontal
                      data={apkAlbumResults}
                      keyExtractor={(album) => String(album.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                      initialNumToRender={4}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      removeClippedSubviews
                      renderItem={({ item: album }) => (
                        <View style={styles.albumCardWrap}>
                          <TouchableOpacity activeOpacity={0.88} style={styles.albumCard} onPress={() => playAlbumResult(album)}>
                            <HTImage source={album} style={styles.albumImage} contentFit="cover" />
                            <Text numberOfLines={2} style={styles.albumTitle}>{album.title}</Text>
                            <Text numberOfLines={1} style={styles.albumArtist}>
                              {getUserFacingArtist(album)}
                            </Text>
                          </TouchableOpacity>
                          <FavoriteButton
                            item={buildAlbumFavoriteItem({
                              id: String(album.id),
                              title: album.title,
                              artist: album.artist,
                              artwork: album.artwork,
                            })}
                            size={16}
                          />
                        </View>
                      )}
                    />
                  </View>
                ) : null}

                {apkArtistResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.artists}</Text>
                    <FlatList
                      horizontal
                      data={apkArtistResults}
                      keyExtractor={(artist) => String(artist.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                      initialNumToRender={4}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      removeClippedSubviews
                      renderItem={({ item: artist }) => (
                        <View style={styles.albumCardWrap}>
                          <TouchableOpacity activeOpacity={0.88} style={styles.artistCard} onPress={() => playArtistResult(artist)}>
                            <HTImage source={artist} style={styles.artistImage} contentFit="cover" />
                            <Text numberOfLines={2} style={styles.artistName}>{artist.name}</Text>
                            <Text numberOfLines={1} style={styles.artistMeta}>
                              {searchUi.formatSongCount(artist.songs.length)}
                            </Text>
                          </TouchableOpacity>
                          <FavoriteButton
                            item={buildArtistFavoriteItem({
                              id: String(artist.id),
                              name: artist.name,
                              artwork: artist.artwork,
                            })}
                            size={16}
                          />
                        </View>
                      )}
                    />
                  </View>
                ) : null}

                {apkRoomResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.genresRooms}</Text>
                    <View style={styles.roomGrid}>
                      {apkRoomResults.map((genre) => (
                        <TouchableOpacity key={genre.id} activeOpacity={0.86} style={styles.roomCard} onPress={() => playGenreResult(genre)}>
                          <HTImage source={genre} style={styles.roomImage} contentFit="cover" />
                          <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.roomShade} />
                          <Text numberOfLines={1} style={styles.roomTitle}>{genre.title}</Text>
                          <Text style={styles.roomMeta}>
                            {searchUi.formatTrackCount(genre.songs.length)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {apkStationResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.stationsRadio}</Text>
                    <View style={styles.roomGrid}>
                      {apkStationResults.map((station) => (
                        <TouchableOpacity
                          key={`station-${station.id}`}
                          activeOpacity={0.86}
                          style={styles.roomCard}
                          onPress={() => startSearchStation(station)}
                        >
                          {station.tracks[0] ? (
                            <>
                              <HTImage source={station.tracks[0]} style={styles.roomImage} contentFit="cover" />
                              <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.roomShade} />
                            </>
                          ) : (
                            <LinearGradient colors={GRADIENTS.card} style={styles.stationArt}>
                              <Ionicons name="radio" size={28} color={COLORS.primaryGlow} />
                            </LinearGradient>
                          )}
                          <Text numberOfLines={1} style={styles.roomTitle}>{station.title}</Text>
                          <Text style={styles.roomMeta}>
                            {getUserFacingRadioSubtitle({
                              subtitle: station.subtitle,
                              genre: station.kind === "room" ? searchUi.moodRoom : undefined,
                            })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {apkPlaylistResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.playlists}</Text>
                    <FlatList
                      horizontal
                      data={apkPlaylistResults}
                      keyExtractor={(playlist) => String(playlist.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                      initialNumToRender={4}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      removeClippedSubviews
                      renderItem={({ item: playlist }) => (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          style={styles.albumCard}
                          onPress={() => playPlaylistResult(playlist)}
                        >
                          <HTImage source={playlist} style={styles.albumImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.albumTitle}>{playlist.title}</Text>
                          <Text numberOfLines={1} style={styles.albumArtist}>
                            {playlist.description || searchUi.collection}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {apkExternalAudioResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.moreListening}</Text>
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
                          <Text numberOfLines={1} style={styles.songArtist}>
                            {getUserFacingArtist(song)}
                          </Text>
                          <Text numberOfLines={1} style={styles.songMeta}>
                            {getUserFacingSongSubtitle(song)}
                          </Text>
                        </View>
                        <FavoriteButton item={buildSongFavoriteItem(song)} size={18} />
                        <View style={styles.playCircle}>
                          <Ionicons
                            name={(song as any).raw?.canPlayNatively === false ? "open-outline" : "play"}
                            size={16}
                            color={COLORS.text}
                          />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {apkTvResults.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.videos}</Text>
                    {apkTvResults.map((hit, index) => {
                      const video = hit.payload as HiddenTunesTvVideo;
                      const item = normalizeVideoItem(video);
                      const creator = getVideoDisplayCreator(item);
                      const category =
                        getVideoDisplayCategory(item) ||
                        getUserFacingVideoSubtitle(video, hit.subtitle) ||
                        searchUi.video;
                      return (
                        <TouchableOpacity
                          key={`tv-${video.id}-${index}`}
                          activeOpacity={0.86}
                          style={styles.songRow}
                          onPress={() => openTv(video)}
                        >
                          <LinearGradient colors={GRADIENTS.card} style={styles.coverBorder}>
                            <HTImage
                              source={{ artwork: item.thumbnailUrl || "" }}
                              style={styles.cover}
                              contentFit="cover"
                            />
                          </LinearGradient>
                          <View style={styles.songCopy}>
                            <Text numberOfLines={1} style={styles.songTitle}>{item.title}</Text>
                            <Text numberOfLines={1} style={styles.songArtist}>
                              {creator}
                            </Text>
                            <Text numberOfLines={1} style={styles.songMeta}>{category}</Text>
                          </View>
                          <View style={styles.playCircle}>
                            <Ionicons name="play" size={16} color={COLORS.text} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {cleanSubmittedSearchQuery.length >= 2 && deferredMedia.radioLoading ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.radioStations}</Text>
                    <View style={styles.deferredLoadingRow}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.deferredLoadingText}>
                        {searchUi.findingRadioStations}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {cleanSubmittedSearchQuery.length >= 2 &&
                deferredMedia.radioReadyForQuery &&
                deferredMedia.radioStations.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionEyebrow}>{searchUi.sections.radioStations}</Text>
                      {deferredMedia.radioHasMore ? (
                        <TouchableOpacity
                          activeOpacity={0.86}
                          onPress={() =>
                            router.push({
                              pathname: "/stations/search",
                              params: { q: cleanSubmittedSearchQuery },
                            } as any)
                          }
                        >
                          <Text style={styles.seeMoreLink}>{searchUi.seeMoreRadioStations}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {deferredMedia.radioStations.map((station) => (
                      <RadioStationCard
                        key={`search-radio-${station.id}`}
                        item={station}
                        onPress={() => playSearchRadioStation(station)}
                      />
                    ))}
                  </View>
                ) : null}

                {cleanSubmittedSearchQuery.length >= 2 && deferredPodcasts.loading ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.podcasts}</Text>
                    <View style={styles.deferredLoadingRow}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.deferredLoadingText}>
                        {searchUi.findingPodcasts}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {cleanSubmittedSearchQuery.length >= 2 &&
                deferredPodcasts.readyForQuery &&
                deferredPodcasts.results.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.podcasts}</Text>
                    {deferredPodcasts.results.map((result, index) =>
                      result.kind === "show" && result.show ? (
                        <PodcastShowCard
                          key={`search-podcast-show-${result.show.id}-${index}`}
                          show={result.show}
                          onPress={() =>
                            router.push({
                              pathname: "/podcasts/show/[id]",
                              params: { id: result.show!.id },
                            } as any)
                          }
                        />
                      ) : result.episode ? (
                        <PodcastEpisodeCard
                          key={`search-podcast-episode-${result.episode.id}-${index}`}
                          episode={result.episode}
                          onPress={() => playSearchPodcastEpisode(result.episode!)}
                        />
                      ) : null
                    )}
                  </View>
                ) : null}

                {apkResultCount === 0 &&
                deferredMedia.radioStations.length === 0 &&
                deferredPodcasts.results.length === 0 &&
                !deferredMedia.radioLoading &&
                !deferredPodcasts.loading ? (
                  <View style={styles.emptyPanel}>
                    <Ionicons name="search" size={34} color={COLORS.primaryGlow} />
                    <Text style={styles.emptyTitle}>{searchUi.noMatchesTitle}</Text>
                    <Text style={styles.emptyText}>{searchUi.noMatchesDescription}</Text>
                    <View style={[styles.chipRow, { justifyContent: "center", marginTop: 16 }]}>
                      {UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS.slice(0, 4).map((chip) => (
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
                  </View>
                ) : null}
              </View>
            ) : null}

            {showDiscovery && !showSearchLoading ? (
              <View style={styles.discoveryPanel}>
                <Text style={styles.sectionEyebrow}>{searchUi.trending}</Text>
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

                <Text style={[styles.sectionEyebrow, styles.sectionSpacing]}>{searchUi.tryThese}</Text>
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
                    <Text style={styles.sectionEyebrow}>{searchUi.forYou}</Text>
                    <Text style={styles.sectionTitle}>{searchUi.quickPicks}</Text>
                    {discoverySongs.map((song, index) => (
                      <TouchableOpacity key={`pick-${song.id}-${index}`} activeOpacity={0.86} style={styles.songRow} onPress={() => playDiscoverySong(song, searchUi.quickPicksSource)}>
                        <LinearGradient colors={GRADIENTS.card} style={styles.coverBorder}>
                          <HTImage source={song} style={styles.cover} contentFit="cover" />
                        </LinearGradient>
                        <View style={styles.songCopy}>
                          <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                          <Text numberOfLines={1} style={styles.songArtist}>{getUserFacingArtist(song)}</Text>
                          <Text numberOfLines={1} style={styles.songMeta}>{getUserFacingSongSubtitle(song)}</Text>
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
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.artists}</Text>
                    <Text style={styles.sectionTitle}>{searchUi.popularArtists}</Text>
                    <FlatList
                      horizontal
                      data={discoveryArtists}
                      keyExtractor={(artist) => String(artist.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                      initialNumToRender={4}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      removeClippedSubviews
                      renderItem={({ item: artist }) => (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          style={styles.artistCard}
                          onPress={() => openArtist(artist)}
                        >
                          <HTImage source={artist} style={styles.artistImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.artistName}>
                            {artist.name}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {discoveryAlbums.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.albums}</Text>
                    <Text style={styles.sectionTitle}>{searchUi.albumSpotlight}</Text>
                    <FlatList
                      horizontal
                      data={discoveryAlbums}
                      keyExtractor={(album) => String(album.id)}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                      initialNumToRender={4}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      removeClippedSubviews
                      renderItem={({ item: album }) => (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          style={styles.albumCard}
                          onPress={() => openAlbum(album)}
                        >
                          <HTImage source={album} style={styles.albumImage} contentFit="cover" />
                          <Text numberOfLines={2} style={styles.albumTitle}>
                            {album.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.albumArtist}>
                            {getUserFacingArtist(album)}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                ) : null}

                {discoveryGenres.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionEyebrow}>{searchUi.sections.genres}</Text>
                    <Text style={styles.sectionTitle}>{searchUi.browseByMoodGenre}</Text>
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
      <MatureContentConsentModal
        visible={matureConsentVisible}
        onCancel={cancelMatureConsent}
        onConfirm={confirmMatureConsent}
      />
      <MaturePodcastConsentModal
        visible={maturePodcastConsentVisible}
        onCancel={cancelMaturePodcastConsent}
        onConfirm={confirmMaturePodcastConsent}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  glowPurple: {
    position: "absolute",
    top: 44,
    left: -126,
    width: 318,
    height: 318,
    borderRadius: 159,
    backgroundColor: "rgba(168,85,247,0.24)",
  },
  glowCyan: {
    position: "absolute",
    top: 292,
    right: -146,
    width: 352,
    height: 352,
    borderRadius: 176,
    backgroundColor: "rgba(34,211,238,0.14)",
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
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: "rgba(168,85,247,0.42)",
    backgroundColor: "rgba(18,7,31,0.58)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  seeMoreLink: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "800",
  },
  deferredLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  deferredLoadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
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
    backgroundColor: "rgba(255,255,255,0.032)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.085)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
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
    backgroundColor: "rgba(255,255,255,0.045)",
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
    backgroundColor: "rgba(18,7,31,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: "rgba(255,255,255,0.034)",
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
    backgroundColor: "rgba(255,255,255,0.045)",
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
  albumCardWrap: {
    width: 132,
    alignItems: "center",
    gap: 4,
  },
  albumImage: {
    width: 132,
    height: 132,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.045)",
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
