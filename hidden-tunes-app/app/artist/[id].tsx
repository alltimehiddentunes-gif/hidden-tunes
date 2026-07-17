import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ArtistTrackRow from "../../components/catalog/ArtistTrackRow";
import HTImage from "../../components/HTImage";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";
import {
  extractHiddenTunesArtists,
  getHiddenTunesArtistById,
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesSongsPage,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import {
  ArtistProfileApiError,
  artistReleaseTypeLabel,
  fetchArtistAbout,
  fetchArtistProfileShell,
  fetchArtistReleases,
  fetchArtistSimilar,
  fetchArtistTopSongs,
  followArtistProfile,
  getCachedArtistFollowState,
  setCachedArtistFollowState,
  unfollowArtistProfile,
  type ArtistProfileAbout,
  type ArtistProfileRelease,
  type ArtistProfileShell,
  type ArtistProfileSimilarArtist,
} from "../../services/artistProfileApi";
import {
  getCurrentSupabaseAccessToken,
  getCurrentSupabaseSessionSummary,
} from "../../services/mobileSupabaseAuth";
import { getArtworkUri, resolveEntityArtwork } from "../../utils/artwork";
import { shouldResetCatalogFallbackGate } from "../../utils/catalogEmptyStateTiming";
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
  createStableKeyExtractor,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import { scheduleDelayedNonEssentialWork } from "../../utils/backgroundWork";
import {
  loadArtistDetailSnapshot,
  saveArtistDetailSnapshot,
} from "../../utils/detailSnapshots";
import {
  canOpenArtistProfileById,
  resolveArtistFromList,
} from "../../utils/artistIdentity";

const INITIAL_TRACK_PAGE_SIZE = 20;
const INITIAL_RELEASE_PAGE_SIZE = 24;
const INITIAL_SIMILAR_PAGE_SIZE = 12;
const ARTIST_MINI_PLAYER_BOTTOM_PADDING = 150;

function getArtwork(item: any) {
  return getArtworkUri(item);
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";

  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function shuffleSongs<T>(items: T[]) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function safeSong(song: HiddenTunesNormalizedSong): HiddenTunesNormalizedSong {
  const artwork = getArtwork(song);
  const streamUrl = String(song.streamUrl || song.url || "");

  return {
    ...song,
    id: String(song.id),
    title: String(song.title || "Unknown Song"),
    artist: String(song.artist || "Hidden Tunes"),
    album: song.album || "Singles",
    artwork,
    cover: artwork,
    url: streamUrl,
    streamUrl,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  };
}

function findArtistById(artists: HiddenTunesArtist[], id: string) {
  if (!canOpenArtistProfileById(id)) return null;
  return resolveArtistFromList(artists, id);
}

function mapProfileReleaseToAlbum(
  release: ArtistProfileRelease,
  artistName: string,
): HiddenTunesAlbum {
  return {
    id: release.id,
    title: release.title,
    slug: release.slug || release.id,
    artist: artistName,
    artistId: release.artist_id || undefined,
    artwork: release.artwork || "",
    releaseType: release.release_type || "unknown",
    tracks: [],
  };
}

function mergeArtistWithProfile(
  base: HiddenTunesArtist,
  shell: ArtistProfileShell,
): HiddenTunesArtist {
  return {
    ...base,
    id: shell.artist.id || base.id,
    name: shell.artist.name || base.name,
    slug: shell.artist.slug || base.slug,
    artwork: shell.artist.artwork || base.artwork,
    image_url: shell.artist.artwork || base.image_url,
    bio: shell.artist.bio || base.bio,
    genre: shell.artist.genres[0] || base.genre,
  };
}

export default function ArtistScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const screenStartedAt = useRef(startPerformanceTimer()).current;
  const refreshAbortRef = useRef<AbortController | null>(null);

  const [artist, setArtist] = useState<HiddenTunesArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);
  const [profileShell, setProfileShell] = useState<ArtistProfileShell | null>(null);
  const [profileAbout, setProfileAbout] = useState<ArtistProfileAbout | null>(null);
  const [profileReleases, setProfileReleases] = useState<HiddenTunesAlbum[]>([]);
  const [releasesHasMore, setReleasesHasMore] = useState(false);
  const [releasesCursor, setReleasesCursor] = useState<string | null>(null);
  const [loadingMoreReleases, setLoadingMoreReleases] = useState(false);
  const [tracksHasMore, setTracksHasMore] = useState(false);
  const [tracksNextPage, setTracksNextPage] = useState(2);
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
  const [trackSectionLabel, setTrackSectionLabel] = useState("Essential Tracks");
  const [similarArtists, setSimilarArtists] = useState<ArtistProfileSimilarArtist[]>([]);
  const [similarHasMore, setSimilarHasMore] = useState(false);
  const [similarCursor, setSimilarCursor] = useState<string | null>(null);
  const [loadingMoreSimilar, setLoadingMoreSimilar] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followAvailable, setFollowAvailable] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const artistRef = useRef<HiddenTunesArtist | null>(null);
  const requestGenerationRef = useRef(0);
  const profileArtistIdRef = useRef<string | null>(null);
  const followInFlightRef = useRef(false);

  const tracks = useMemo(
    () => (artist?.tracks || []).map(safeSong),
    [artist?.tracks]
  );

  const albums = useMemo(() => {
    if (profileReleases.length > 0) return profileReleases;
    return artist?.albums || [];
  }, [artist?.albums, profileReleases]);

  const genreLabel = useMemo(() => {
    if (profileShell?.artist.genres?.length) {
      return profileShell.artist.genres.slice(0, 3).join(" · ");
    }
    return artist?.genre || "";
  }, [artist?.genre, profileShell?.artist.genres]);

  const bioText = useMemo(() => {
    return String(profileAbout?.bio || profileShell?.artist.bio || artist?.bio || "").trim();
  }, [artist?.bio, profileAbout?.bio, profileShell?.artist.bio]);

  const followerLabel = useMemo(() => {
    if (!followerCount || followerCount <= 0) return null;
    return `${followerCount} follower${followerCount === 1 ? "" : "s"}`;
  }, [followerCount]);
  const listPerformance = useMemo(
    () => getListPerformanceSettings(tracks.length),
    [tracks.length]
  );
  const trackKeyExtractor = useMemo(
    () => createStableKeyExtractor("artist-track"),
    []
  );
  const listBottomPadding = useMemo(
    () =>
      ARTIST_MINI_PLAYER_BOTTOM_PADDING +
      Math.max(insets.bottom, 0) +
      (currentSong ? 24 : 0),
    [currentSong, insets.bottom]
  );

  useEffect(() => trackRenderProbe("ArtistScreen"), []);

  useEffect(() => {
    artistRef.current = artist;
  }, [artist]);

  const loadArtist = useCallback(
    async (showLoader = true, signal?: AbortSignal) => {
      const artistId = String(id || "");
      const requestGeneration = ++requestGenerationRef.current;
      let showedCachedArtist = false;
      const refreshStart = startPerformanceTimer();

      try {
        if (shouldResetCatalogFallbackGate(artistRef.current?.tracks?.length || 0)) {
          setHasCheckedFallbacks(false);
        }
        if (showLoader && !artistRef.current) setLoading(true);

        const snapshotArtist = await loadArtistDetailSnapshot(artistId);
        if (requestGeneration !== requestGenerationRef.current || signal?.aborted) return;
        if (snapshotArtist) {
          // Bound cached tracks so idle open never paints hundreds of rows.
          const boundedSnapshot = {
            ...snapshotArtist,
            tracks: (snapshotArtist.tracks || []).slice(0, INITIAL_TRACK_PAGE_SIZE),
          };
          setArtist(boundedSnapshot);
          setTracksHasMore((snapshotArtist.tracks || []).length > INITIAL_TRACK_PAGE_SIZE);
          setTracksNextPage(2);
          setLoading(false);
          showedCachedArtist = true;
          logCacheResult("artist", true, {
            id: artistId,
            tracks: boundedSnapshot.tracks.length,
            snapshot: true,
          });
          logScreenReady("artist", screenStartedAt, {
            cache: "hit",
            tracks: boundedSnapshot.tracks.length,
          });
          logPerformanceSummary("artist", {
            cache: "hit",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: boundedSnapshot.tracks.length,
          });
        }

        if (!showedCachedArtist) {
          const memorySongs = getHiddenTunesCatalogSnapshot();
          const memoryArtist = memorySongs.length
            ? findArtistById(extractHiddenTunesArtists(memorySongs), artistId)
            : null;

          const cachedSongs = memoryArtist
            ? memorySongs
            : await hydrateHiddenTunesCatalogCache();
          if (requestGeneration !== requestGenerationRef.current || signal?.aborted) return;
          const cachedArtist =
            memoryArtist ||
            findArtistById(extractHiddenTunesArtists(cachedSongs), artistId);

          if (cachedArtist) {
            const boundedCached = {
              ...cachedArtist,
              tracks: (cachedArtist.tracks || []).slice(0, INITIAL_TRACK_PAGE_SIZE),
            };
            setArtist(boundedCached);
            setTracksHasMore((cachedArtist.tracks || []).length > INITIAL_TRACK_PAGE_SIZE);
            setTracksNextPage(2);
            setLoading(false);
            showedCachedArtist = true;
            logCacheResult("artist", true, {
              id: artistId,
              tracks: boundedCached.tracks.length,
              source: memoryArtist ? "memory" : "storage",
            });
            logScreenReady("artist", screenStartedAt, {
              cache: "hit",
              tracks: boundedCached.tracks.length,
            });
            logPerformanceSummary("artist", {
              cache: "hit",
              firstContentMs: Date.now() - screenStartedAt,
              itemCount: boundedCached.tracks.length,
            });
          } else {
            logCacheResult("artist", false, { id: artistId });
          }
        }

        const applyCatalogFallback = async () => {
          const data = await getHiddenTunesArtistById(artistId);
          if (requestGeneration !== requestGenerationRef.current || signal?.aborted) return false;
          logApiRefresh("artist", refreshStart, {
            id: artistId,
            found: Boolean(data),
            tracks: data?.tracks.length || 0,
          });
          logPerformanceSummary("artist", {
            cache: showedCachedArtist ? "hit" : "miss",
            apiRefreshMs: Date.now() - refreshStart,
            itemCount: data?.tracks.length || 0,
            emptyStateReason: data
              ? "content_available"
              : "cache_api_and_fallback_empty",
          });

          if (data) {
            const bounded = {
              ...data,
              tracks: (data.tracks || []).slice(0, INITIAL_TRACK_PAGE_SIZE),
            };
            setArtist((previous) =>
              previous
                ? {
                    ...previous,
                    ...bounded,
                    tracks: bounded.tracks,
                    albums: bounded.albums,
                  }
                : bounded,
            );
            setTracksHasMore((data.tracks || []).length >= INITIAL_TRACK_PAGE_SIZE);
            setTracksNextPage(2);
            void saveArtistDetailSnapshot(bounded);
            if (!showedCachedArtist) {
              logScreenReady("artist", screenStartedAt, {
                cache: "miss",
                tracks: bounded.tracks.length,
              });
            }
            return true;
          }

          if (!showedCachedArtist) {
            setArtist(null);
          }
          return false;
        };

        const loadSimilarDeferred = (canonicalId: string) => {
          scheduleDelayedNonEssentialWork(() => {
            if (requestGeneration !== requestGenerationRef.current || signal?.aborted) {
              return;
            }
            void fetchArtistSimilar(canonicalId, {
              limit: INITIAL_SIMILAR_PAGE_SIZE,
              signal,
            })
              .then((similarPage) => {
                if (requestGeneration !== requestGenerationRef.current || signal?.aborted) {
                  return;
                }
                const similarItems = (similarPage?.items || []).filter(
                  (item) => item.id && item.id !== canonicalId,
                );
                const dedupedSimilar: ArtistProfileSimilarArtist[] = [];
                const seenSimilar = new Set<string>();
                for (const item of similarItems) {
                  if (seenSimilar.has(item.id)) continue;
                  seenSimilar.add(item.id);
                  dedupedSimilar.push(item);
                }
                setSimilarArtists(dedupedSimilar);
                setSimilarHasMore(similarPage?.pagination.hasMore === true);
                setSimilarCursor(similarPage?.pagination.nextCursor || null);
              })
              .catch(() => {
                // Optional section — keep profile usable when similar fails.
              });
          });
        };

        const applyProfileEnrichment = async () => {
          try {
            const tokenResult = await getCurrentSupabaseAccessToken();
            const token = tokenResult.accessToken;

            const shell = await fetchArtistProfileShell(artistId, {
              signal,
              token,
            });
            if (requestGeneration !== requestGenerationRef.current || signal?.aborted) {
              return true;
            }

            setProfileShell(shell);
            profileArtistIdRef.current = shell.artist.id;

            setArtist((previous) => {
              if (previous) return mergeArtistWithProfile(previous, shell);
              return {
                id: shell.artist.id,
                name: shell.artist.name,
                slug: shell.artist.slug || "",
                artwork: shell.artist.artwork || "",
                image_url: shell.artist.artwork || undefined,
                bio: shell.artist.bio || "",
                genre: shell.artist.genres[0] || "",
                tracks: [],
                albums: [],
              };
            });
            setLoading(false);

            // Follow comes from shell + local cache — no duplicate GET.
            const cachedFollow = getCachedArtistFollowState(shell.artist.id);
            const initialFollowing =
              cachedFollow?.is_following ?? shell.viewer.is_following === true;
            const initialAvailable =
              cachedFollow?.available ?? shell.viewer.follow_available !== false;
            const initialFollowers =
              cachedFollow?.follower_count ??
              (Number(shell.statistics.follower_count) || 0);
            setIsFollowing(initialFollowing);
            setFollowAvailable(initialAvailable);
            setFollowerCount(initialFollowers);
            setCachedArtistFollowState({
              artist_id: shell.artist.id,
              is_following: initialFollowing,
              follower_count: initialFollowers,
              available: initialAvailable,
            });

            const [releasesPage, about, topSongsPage, songsPage] = await Promise.all([
              fetchArtistReleases(shell.artist.id, {
                limit: INITIAL_RELEASE_PAGE_SIZE,
                signal,
              }).catch(() => null),
              fetchArtistAbout(shell.artist.id, { signal }).catch(() => null),
              fetchArtistTopSongs(shell.artist.id, {
                limit: 5,
                signal,
              }).catch(() => null),
              getHiddenTunesSongsPage({
                page: 1,
                limit: INITIAL_TRACK_PAGE_SIZE,
                artistId: shell.artist.id,
              }).catch(() => null),
            ]);
            if (requestGeneration !== requestGenerationRef.current || signal?.aborted) {
              return true;
            }

            if (releasesPage?.items?.length) {
              setProfileReleases(
                releasesPage.items.map((release) =>
                  mapProfileReleaseToAlbum(release, shell.artist.name),
                ),
              );
              setReleasesHasMore(releasesPage.pagination.hasMore);
              setReleasesCursor(releasesPage.pagination.nextCursor);
            } else {
              setProfileReleases([]);
              setReleasesHasMore(false);
              setReleasesCursor(null);
            }
            if (about) setProfileAbout(about);
            if (topSongsPage?.ranking?.label) {
              setTrackSectionLabel(topSongsPage.ranking.label);
            } else {
              setTrackSectionLabel("Essential Tracks");
            }

            if (songsPage?.songs?.length) {
              setArtist((previous) => {
                const next: HiddenTunesArtist = previous
                  ? { ...previous, tracks: songsPage.songs }
                  : {
                      id: shell.artist.id,
                      name: shell.artist.name,
                      slug: shell.artist.slug || "",
                      artwork: shell.artist.artwork || "",
                      tracks: songsPage.songs,
                      albums: [],
                    };
                void saveArtistDetailSnapshot(next);
                return next;
              });
              setTracksHasMore(songsPage.hasMore === true);
              setTracksNextPage(songsPage.nextPage || 2);
            }

            logApiRefresh("artist", refreshStart, {
              id: artistId,
              found: true,
              tracks: songsPage?.songs?.length || 0,
              profile: true,
            });

            loadSimilarDeferred(shell.artist.id);
            return true;
          } catch (error) {
            if (signal?.aborted) return true;
            if (error instanceof ArtistProfileApiError && __DEV__) {
              console.log("Artist profile enrichment skipped:", error.message);
            }
            return false;
          }
        };

        const enriched = await applyProfileEnrichment();
        if (requestGeneration !== requestGenerationRef.current || signal?.aborted) return;
        if (!enriched) {
          await applyCatalogFallback();
        }
      } catch (error) {
        console.log("Load artist error:", error);
        if (!showedCachedArtist && requestGeneration === requestGenerationRef.current) {
          setArtist(null);
        }
      } finally {
        if (requestGeneration === requestGenerationRef.current) {
          setHasCheckedFallbacks(true);
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [id, screenStartedAt]
  );

  useEffect(() => {
    refreshAbortRef.current?.abort();
    const abortController = new AbortController();
    refreshAbortRef.current = abortController;
    setProfileShell(null);
    setProfileAbout(null);
    setProfileReleases([]);
    setReleasesHasMore(false);
    setReleasesCursor(null);
    setTracksHasMore(false);
    setTracksNextPage(2);
    setTrackSectionLabel("Essential Tracks");
    setSimilarArtists([]);
    setSimilarHasMore(false);
    setSimilarCursor(null);
    setIsFollowing(false);
    setFollowAvailable(true);
    setFollowerCount(0);
    setFollowBusy(false);
    followInFlightRef.current = false;
    profileArtistIdRef.current = null;
    setAboutExpanded(false);
    void loadArtist(true, abortController.signal);
    return () => {
      requestGenerationRef.current += 1;
      abortController.abort();
    };
  }, [id, loadArtist]);

  async function onRefresh() {
    refreshAbortRef.current?.abort();
    const abortController = new AbortController();
    refreshAbortRef.current = abortController;
    setRefreshing(true);
    await loadArtist(false, abortController.signal);
  }

  const handlePlay = useCallback(
    (track: HiddenTunesNormalizedSong) => {
      const tapStartedAt = startPerformanceTimer();
      const normalized = safeSong(track);

      const startIndex = Math.max(
        0,
        tracks.findIndex((item) => item.id === normalized.id)
      );

      void playSong(normalized as any, tracks as any, startIndex)
        .finally(() => {
          logTapToPlay("artist", tapStartedAt, { id: normalized.id });
        })
        .catch((error) => {
          if (__DEV__) console.log("Artist play error:", error);
        });

      requestAnimationFrame(() => {
        router.push("/player" as any);
      });
    },
    [playSong, tracks]
  );

  function playArtist() {
    if (!tracks.length) return;

    const tapStartedAt = startPerformanceTimer();

    void playSong(tracks[0] as any, tracks as any, 0)
      .finally(() => {
        logTapToPlay("artist", tapStartedAt, { id: tracks[0]?.id });
      })
      .catch((error) => {
        if (__DEV__) console.log("Artist play-all error:", error);
      });

    requestAnimationFrame(() => {
      router.push("/player" as any);
    });
  }

  function playShuffle() {
    if (!tracks.length) return;

    const shuffled = shuffleSongs(tracks);
    const tapStartedAt = startPerformanceTimer();

    void playSong(shuffled[0] as any, shuffled as any, 0)
      .finally(() => {
        logTapToPlay("artist", tapStartedAt, { id: shuffled[0]?.id });
      })
      .catch((error) => {
        if (__DEV__) console.log("Artist shuffle error:", error);
      });

    requestAnimationFrame(() => {
      router.push("/player" as any);
    });
  }

  function openAlbum(album: HiddenTunesAlbum) {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    } as any);
  }

  async function loadMoreReleases() {
    const artistId = profileArtistIdRef.current;
    if (!artistId || !releasesHasMore || !releasesCursor || loadingMoreReleases) return;
    setLoadingMoreReleases(true);
    try {
      const page = await fetchArtistReleases(artistId, {
        limit: INITIAL_RELEASE_PAGE_SIZE,
        cursor: releasesCursor,
      });
      const artistName = profileShell?.artist.name || artist?.name || "";
      setProfileReleases((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        const appended = page.items
          .map((release) => mapProfileReleaseToAlbum(release, artistName))
          .filter((item) => !seen.has(item.id));
        return [...previous, ...appended];
      });
      setReleasesHasMore(page.pagination.hasMore);
      setReleasesCursor(page.pagination.nextCursor);
    } catch {
      // Keep already-loaded releases when pagination fails.
    } finally {
      setLoadingMoreReleases(false);
    }
  }

  async function loadMoreTracks() {
    const artistId = profileArtistIdRef.current || String(artist?.id || "");
    if (!artistId || !tracksHasMore || loadingMoreTracks) return;
    if (tracks.length >= 40) {
      setTracksHasMore(false);
      return;
    }
    setLoadingMoreTracks(true);
    try {
      const page = await getHiddenTunesSongsPage({
        page: tracksNextPage,
        limit: INITIAL_TRACK_PAGE_SIZE,
        artistId,
      });
      setArtist((previous) => {
        if (!previous) return previous;
        const seen = new Set(previous.tracks.map((item) => item.id));
        const appended = page.songs.filter((item) => !seen.has(item.id));
        const merged = [...previous.tracks, ...appended].slice(0, 40);
        return { ...previous, tracks: merged };
      });
      const reachedCap = tracks.length + page.songs.length >= 40;
      setTracksHasMore(page.hasMore === true && !reachedCap);
      setTracksNextPage(page.nextPage || tracksNextPage + 1);
    } catch {
      // Keep already-loaded tracks when pagination fails.
    } finally {
      setLoadingMoreTracks(false);
    }
  }

  async function loadMoreSimilar() {
    const artistId = profileArtistIdRef.current;
    if (!artistId || !similarHasMore || !similarCursor || loadingMoreSimilar) return;
    setLoadingMoreSimilar(true);
    try {
      const page = await fetchArtistSimilar(artistId, {
        limit: 12,
        cursor: similarCursor,
      });
      setSimilarArtists((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        const appended = page.items.filter(
          (item) => item.id && item.id !== artistId && !seen.has(item.id),
        );
        return [...previous, ...appended];
      });
      setSimilarHasMore(page.pagination.hasMore);
      setSimilarCursor(page.pagination.nextCursor);
    } catch {
      // Keep already-loaded similar artists when pagination fails.
    } finally {
      setLoadingMoreSimilar(false);
    }
  }

  function openSimilarArtist(similar: ArtistProfileSimilarArtist) {
    if (!canOpenArtistProfileById(similar.id)) return;
    router.push({
      pathname: "/artist/[id]",
      params: { id: similar.id },
    } as any);
  }

  async function toggleFollow() {
    const artistUuid = profileArtistIdRef.current || String(artist?.id || "");
    if (!canOpenArtistProfileById(artistUuid)) return;
    if (!followAvailable) {
      Alert.alert(
        "Follow unavailable",
        "Artist follow is not available yet on this server.",
      );
      return;
    }
    if (followInFlightRef.current || followBusy) return;

    const session = await getCurrentSupabaseSessionSummary();
    if (!session.isSignedIn) {
      Alert.alert("Sign in to follow", "Sign in to follow artists and sync across devices.", [
        { text: "Not now", style: "cancel" },
        {
          text: "Sign in",
          onPress: () => router.push("/artist-submissions" as any),
        },
      ]);
      return;
    }

    const tokenResult = await getCurrentSupabaseAccessToken();
    if (!tokenResult.accessToken) {
      Alert.alert("Sign in to follow", tokenResult.error || "Sign in to follow artists.");
      return;
    }

    const previousFollowing = isFollowing;
    const previousCount = followerCount;
    const nextFollowing = !previousFollowing;
    const nextCount = Math.max(0, previousCount + (nextFollowing ? 1 : -1));

    followInFlightRef.current = true;
    setFollowBusy(true);
    setIsFollowing(nextFollowing);
    setFollowerCount(nextCount);
    setCachedArtistFollowState({
      artist_id: artistUuid,
      is_following: nextFollowing,
      follower_count: nextCount,
      available: true,
    });

    try {
      const result = nextFollowing
        ? await followArtistProfile(artistUuid, { token: tokenResult.accessToken })
        : await unfollowArtistProfile(artistUuid, { token: tokenResult.accessToken });
      setIsFollowing(result.is_following);
      setFollowerCount(result.follower_count);
      setFollowAvailable(result.available);
    } catch (error) {
      setIsFollowing(previousFollowing);
      setFollowerCount(previousCount);
      setCachedArtistFollowState({
        artist_id: artistUuid,
        is_following: previousFollowing,
        follower_count: previousCount,
        available: followAvailable,
      });
      const status = error instanceof ArtistProfileApiError ? error.status : 0;
      if (status === 503) {
        setFollowAvailable(false);
        Alert.alert(
          "Follow unavailable",
          "Artist follow is not available yet on this server.",
        );
      } else if (status === 401) {
        Alert.alert("Sign in to follow", "Your session expired. Sign in again to follow artists.");
      } else {
        Alert.alert(
          "Could not update follow",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    } finally {
      followInFlightRef.current = false;
      setFollowBusy(false);
    }
  }

  const renderTrackItem = useCallback(
    ({ item, index }: { item: HiddenTunesNormalizedSong; index: number }) => (
      <ArtistTrackRow
        track={item}
        index={index}
        active={currentSong?.id === item.id}
        isPlaying={isPlaying}
        metaLine={`${item.album || artist?.name || ""}${
          item.duration ? ` • ${formatDuration(item.duration)}` : ""
        }`}
        onPress={handlePlay}
      />
    ),
    [artist?.name, currentSong?.id, handlePlay, isPlaying]
  );

  const artistArtwork = useMemo(
    () => resolveEntityArtwork(artist, tracks),
    [artist, tracks]
  );

  if (loading && !artist) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Opening artist world...</Text>
      </LinearGradient>
    );
  }

  if (!artist && hasCheckedFallbacks && !refreshing) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <Ionicons name="person-circle-outline" size={70} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>Artist world unavailable</Text>
        <Text style={styles.emptyText}>Refresh the catalog or return to Search.</Text>

        <TouchableOpacity style={styles.emptyButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#000" />
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (!artist) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Checking cached artist...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.screen}>
      <FlatList
        data={tracks}
        keyExtractor={trackKeyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 12,
            paddingBottom: listBottomPadding,
          },
        ]}
        initialNumToRender={listPerformance.initialNumToRender}
        maxToRenderPerBatch={listPerformance.maxToRenderPerBatch}
        windowSize={listPerformance.windowSize}
        updateCellsBatchingPeriod={listPerformance.updateCellsBatchingPeriod}
        removeClippedSubviews
        onScrollBeginDrag={() => markFastScrolling(true)}
        onMomentumScrollBegin={() => markFastScrolling(true)}
        onMomentumScrollEnd={() => markFastScrolling(false)}
        refreshControl={
          <RefreshControl
            tintColor={COLORS.primary}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        renderItem={renderTrackItem}
        ListHeaderComponent={
          <>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onRefresh}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Refresh artist profile"
          >
            <Ionicons name="refresh" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <HTImage
              source={artistArtwork}
              candidates={tracks}
              style={styles.avatar}
            />
          </View>

          <View style={styles.artistBadge}>
            <Ionicons
              name={profileShell?.artist.is_verified ? "checkmark-circle" : "cloud-done"}
              size={14}
              color={COLORS.primary}
            />
            <Text style={styles.artistBadgeText}>
              {profileShell?.artist.is_verified ? "VERIFIED ARTIST" : "CREATOR WORLD"}
            </Text>
          </View>

          <Text style={styles.name} numberOfLines={2}>
            {artist.name}
          </Text>

          <Text style={styles.meta}>
            {tracks.length}
            {tracksHasMore ? "+" : ""} song{tracks.length === 1 ? "" : "s"} •{" "}
            {albums.length}
            {releasesHasMore ? "+" : ""} album{albums.length === 1 ? "" : "s"}
            {genreLabel ? ` • ${genreLabel}` : ""}
            {followerLabel ? ` • ${followerLabel}` : ""}
          </Text>

          {bioText ? (
            <View style={styles.aboutBlock}>
              <Text
                style={styles.aboutText}
                numberOfLines={aboutExpanded ? undefined : 3}
              >
                {bioText}
              </Text>
              {bioText.length > 140 ? (
                <TouchableOpacity
                  onPress={() => setAboutExpanded((value) => !value)}
                  style={styles.aboutToggle}
                  accessibilityRole="button"
                  accessibilityLabel={aboutExpanded ? "Show less biography" : "Show more biography"}
                >
                  <Text style={styles.aboutToggleText}>
                    {aboutExpanded ? "See less" : "See more"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.playButton, !tracks.length && styles.disabledButton]}
              onPress={playArtist}
              disabled={!tracks.length}
              accessibilityRole="button"
              accessibilityLabel={`Play artist ${artist.name}`}
            >
              <Ionicons name="play" size={20} color="#000" />
              <Text style={styles.playText}>Play Artist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowing && styles.followButtonActive,
                (!followAvailable || followBusy) && styles.disabledButton,
              ]}
              onPress={() => {
                void toggleFollow();
              }}
              disabled={followBusy}
              accessibilityRole="button"
              accessibilityLabel={
                !followAvailable
                  ? "Follow unavailable"
                  : isFollowing
                    ? `Unfollow ${artist.name}`
                    : `Follow ${artist.name}`
              }
              accessibilityState={{ disabled: followBusy, selected: isFollowing }}
            >
              {followBusy ? (
                <ActivityIndicator color={isFollowing ? COLORS.text : "#000"} />
              ) : (
                <>
                  <Ionicons
                    name={isFollowing ? "checkmark" : "person-add-outline"}
                    size={18}
                    color={isFollowing ? COLORS.text : "#000"}
                  />
                  <Text
                    style={[
                      styles.followButtonText,
                      isFollowing && styles.followButtonTextActive,
                    ]}
                  >
                    {!followAvailable ? "Unavailable" : isFollowing ? "Following" : "Follow"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shuffleButton, !tracks.length && styles.disabledButton]}
              onPress={playShuffle}
              disabled={!tracks.length}
              accessibilityRole="button"
              accessibilityLabel={`Shuffle artist ${artist.name}`}
            >
              <Ionicons name="shuffle" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {albums.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Releases</Text>
              <Text style={styles.sectionSub}>
                Albums, EPs, singles, and appearances when taxonomy is available
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumList}
            >
              {albums.map((item) => (
                <TouchableOpacity
                  key={`artist-album-${item.id}`}
                  style={styles.albumCard}
                  activeOpacity={0.86}
                  onPress={() => openAlbum(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open release ${item.title}`}
                >
                  <HTImage
                    source={item}
                    candidates={[item.tracks?.[0]]}
                    style={styles.albumCover}
                  />

                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {item.title}
                  </Text>

                  <Text style={styles.albumSub} numberOfLines={1}>
                    {Array.isArray(item.tracks) && item.tracks.length > 0
                      ? `${item.tracks.length} track${item.tracks.length === 1 ? "" : "s"}`
                      : artistReleaseTypeLabel(item.releaseType)}
                  </Text>
                </TouchableOpacity>
              ))}
              {releasesHasMore ? (
                <TouchableOpacity
                  style={styles.moreReleasesBtn}
                  onPress={() => {
                    void loadMoreReleases();
                  }}
                  disabled={loadingMoreReleases}
                  accessibilityRole="button"
                  accessibilityLabel="Load more releases"
                >
                  {loadingMoreReleases ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <Text style={styles.moreReleasesText}>See more</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </>
        )}

        {similarArtists.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Similar Artists</Text>
              <Text style={styles.sectionSub}>
                Based on shared catalog signals, not name matching
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumList}
            >
              {similarArtists.map((item) => (
                <TouchableOpacity
                  key={`artist-similar-${item.id}`}
                  style={styles.similarCard}
                  activeOpacity={0.86}
                  onPress={() => openSimilarArtist(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open similar artist ${item.name}`}
                >
                  <HTImage
                    source={{ artwork: item.artwork || undefined }}
                    style={styles.similarAvatar}
                  />
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.albumSub} numberOfLines={1}>
                    {item.reason ||
                      (item.genres[0]
                        ? item.genres[0].replace(/\b\w/g, (c) => c.toUpperCase())
                        : "Artist")}
                  </Text>
                </TouchableOpacity>
              ))}
              {similarHasMore ? (
                <TouchableOpacity
                  style={styles.moreReleasesBtn}
                  onPress={() => {
                    void loadMoreSimilar();
                  }}
                  disabled={loadingMoreSimilar}
                  accessibilityRole="button"
                  accessibilityLabel="Load more similar artists"
                >
                  {loadingMoreSimilar ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <Text style={styles.moreReleasesText}>See more</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{trackSectionLabel}</Text>
          <Text style={styles.sectionSub}>Start a queue from this artist world</Text>
        </View>
          </>
        }
        ListFooterComponent={
          tracksHasMore ? (
            <TouchableOpacity
              style={styles.moreTracksBtn}
              onPress={() => {
                void loadMoreTracks();
              }}
              disabled={loadingMoreTracks}
              accessibilityRole="button"
              accessibilityLabel="Load more tracks"
            >
              {loadingMoreTracks ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Text style={styles.moreTracksText}>See more tracks</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyTracks}>
            <Ionicons name="musical-notes-outline" size={52} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No songs here yet</Text>
            <Text style={styles.emptyText}>
              This artist world is still waiting for tracks.
            </Text>
          </View>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingBottom: 150,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontWeight: "700",
  },
  header: {
    paddingHorizontal: 18,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 10,
  },
  avatarWrap: {
    width: 196,
    height: 196,
    borderRadius: 98,
    padding: 3,
    backgroundColor: "rgba(168,85,247,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 95,
    backgroundColor: COLORS.card,
  },
  artistBadge: {
    marginTop: 22,
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
  artistBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  name: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: "900",
    marginTop: 18,
    textAlign: "center",
    letterSpacing: -0.5,
    paddingHorizontal: 8,
  },
  meta: {
    color: COLORS.textMuted,
    marginTop: 7,
    textAlign: "center",
    fontWeight: "700",
  },
  aboutBlock: {
    marginTop: 14,
    width: "100%",
    paddingHorizontal: 8,
  },
  aboutText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontWeight: "600",
  },
  aboutToggle: {
    marginTop: 8,
    alignSelf: "center",
  },
  aboutToggleText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  actionRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 999,
  },
  playText: {
    color: "#000",
    fontWeight: "900",
  },
  followButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    minWidth: 118,
    justifyContent: "center",
  },
  followButtonActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  followButtonText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
  },
  followButtonTextActive: {
    color: COLORS.text,
  },
  shuffleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  disabledButton: {
    opacity: 0.45,
  },
  sectionHeader: {
    marginTop: 34,
    marginBottom: 14,
    paddingHorizontal: 20,
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
    fontWeight: "700",
  },
  albumList: {
    paddingHorizontal: 20,
  },
  albumCard: {
    width: 150,
    marginRight: 14,
  },
  albumCover: {
    width: 150,
    height: 150,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  albumTitle: {
    color: COLORS.text,
    fontWeight: "900",
    marginTop: 10,
  },
  albumSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  moreReleasesBtn: {
    width: 108,
    height: 148,
    borderRadius: 18,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  moreReleasesText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  moreTracksBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  moreTracksText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  similarCard: {
    width: 118,
    marginRight: 14,
  },
  similarAvatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  trackRow: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.065)",
    borderRadius: 22,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  trackRowActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.45)",
  },
  trackNumberBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  trackNumber: {
    color: COLORS.textMuted,
    fontWeight: "900",
    fontSize: 13,
  },
  trackCover: {
    width: 52,
    height: 52,
    borderRadius: 15,
    marginLeft: 6,
    marginRight: 12,
    backgroundColor: COLORS.card,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },
  trackArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
  playIcon: {
    marginLeft: 8,
  },
  emptyTracks: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 16,
  },
  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "700",
  },
  emptyButton: {
    marginTop: 22,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyButtonText: {
    color: "#000",
    fontWeight: "900",
  },
});
