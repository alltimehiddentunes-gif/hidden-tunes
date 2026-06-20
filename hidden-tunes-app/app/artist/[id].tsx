import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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
  getHiddenTunesCatalogCacheInfo,
  getHiddenTunesCatalogSnapshot,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
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
  getHorizontalListPerformanceSettings,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import { scheduleDelayedNonEssentialWork } from "../../utils/backgroundWork";
import {
  loadArtistDetailSnapshot,
  saveArtistDetailSnapshot,
} from "../../utils/detailSnapshots";

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

function normalizeLookup(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findArtistById(artists: HiddenTunesArtist[], id: string) {
  const cleanId = normalizeLookup(id);

  return (
    artists.find(
      (artist) =>
        artist.id === id ||
        normalizeLookup(artist.id) === cleanId ||
        normalizeLookup(artist.slug) === cleanId ||
        normalizeLookup(artist.name) === cleanId
    ) || null
  );
}

export default function ArtistScreen() {
  const { id } = useLocalSearchParams();
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const screenStartedAt = useRef(startPerformanceTimer()).current;

  const [artist, setArtist] = useState<HiddenTunesArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);
  const artistRef = useRef<HiddenTunesArtist | null>(null);

  const tracks = useMemo(
    () => (artist?.tracks || []).map(safeSong),
    [artist?.tracks]
  );

  const albums = useMemo(() => artist?.albums || [], [artist?.albums]);
  const listPerformance = useMemo(
    () => getListPerformanceSettings(tracks.length),
    [tracks.length]
  );
  const albumListTuning = useMemo(
    () => getHorizontalListPerformanceSettings(albums.length),
    [albums.length]
  );
  const trackKeyExtractor = useMemo(
    () => createStableKeyExtractor("artist-track"),
    []
  );

  useEffect(() => trackRenderProbe("ArtistScreen"), []);

  useEffect(() => {
    artistRef.current = artist;
  }, [artist]);

  const loadArtist = useCallback(
    async (showLoader = true, allowClearOnMiss = false) => {
      const artistId = String(id || "");
      let showedCachedArtist = false;
      const refreshStart = startPerformanceTimer();

      try {
        if (shouldResetCatalogFallbackGate(artistRef.current?.tracks?.length || 0)) {
          setHasCheckedFallbacks(false);
        }
        if (showLoader && !artistRef.current) setLoading(true);

        const snapshotArtist = await loadArtistDetailSnapshot(artistId);
        if (snapshotArtist) {
          setArtist(snapshotArtist);
          setLoading(false);
          showedCachedArtist = true;
          logCacheResult("artist", true, {
            id: artistId,
            tracks: snapshotArtist.tracks.length,
            snapshot: true,
          });
          logScreenReady("artist", screenStartedAt, {
            cache: "hit",
            tracks: snapshotArtist.tracks.length,
          });
          logPerformanceSummary("artist", {
            cache: "hit",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: snapshotArtist.tracks.length,
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
          const cachedArtist =
            memoryArtist ||
            findArtistById(extractHiddenTunesArtists(cachedSongs), artistId);

          if (cachedArtist) {
            setArtist(cachedArtist);
            setLoading(false);
            showedCachedArtist = true;
            logCacheResult("artist", true, {
              id: artistId,
              tracks: cachedArtist.tracks.length,
              source: memoryArtist ? "memory" : "storage",
            });
            logScreenReady("artist", screenStartedAt, {
              cache: "hit",
              tracks: cachedArtist.tracks.length,
            });
            logPerformanceSummary("artist", {
              cache: "hit",
              firstContentMs: Date.now() - screenStartedAt,
              itemCount: cachedArtist.tracks.length,
            });
          } else {
            logCacheResult("artist", false, { id: artistId });
          }
        }

        const cacheInfo = await getHiddenTunesCatalogCacheInfo();

        const applyArtistApiResult = async () => {
          const data = await getHiddenTunesArtistById(artistId);
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
            setArtist(data);
            void saveArtistDetailSnapshot(data);
            if (!showedCachedArtist) {
              logScreenReady("artist", screenStartedAt, {
                cache: "miss",
                tracks: data.tracks.length,
              });
            }
          } else if (!showedCachedArtist) {
            setArtist(null);
          }
        };

        if (showedCachedArtist && cacheInfo.isFresh) {
          scheduleDelayedNonEssentialWork(() => {
            void applyArtistApiResult();
          });
        } else {
          await applyArtistApiResult();
        }
      } catch (error) {
        console.log("Load artist error:", error);
        if (!showedCachedArtist) setArtist(null);
      } finally {
        setHasCheckedFallbacks(true);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, screenStartedAt]
  );

  useEffect(() => {
    loadArtist(true);
  }, [id, loadArtist]);

  async function onRefresh() {
    setRefreshing(true);
    await loadArtist(false);
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
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <FlatList
        data={tracks}
        keyExtractor={trackKeyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity onPress={onRefresh} style={styles.backBtn}>
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
            <Ionicons name="cloud-done" size={14} color={COLORS.primary} />
            <Text style={styles.artistBadgeText}>CREATOR WORLD</Text>
          </View>

          <Text style={styles.name}>{artist.name}</Text>

          <Text style={styles.meta}>
            {tracks.length} song{tracks.length === 1 ? "" : "s"} •{" "}
            {albums.length} album{albums.length === 1 ? "" : "s"}
            {artist.genre ? ` • ${artist.genre}` : ""}
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.playButton, !tracks.length && styles.disabledButton]}
              onPress={playArtist}
              disabled={!tracks.length}
            >
              <Ionicons name="play" size={20} color="#000" />
              <Text style={styles.playText}>Play Artist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shuffleButton, !tracks.length && styles.disabledButton]}
              onPress={playShuffle}
              disabled={!tracks.length}
            >
              <Ionicons name="shuffle" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {albums.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Releases</Text>
              <Text style={styles.sectionSub}>Albums and projects from this creator</Text>
            </View>

            <FlatList
              horizontal
              data={albums}
              keyExtractor={(item) => `artist-album-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumList}
              initialNumToRender={albumListTuning.initialNumToRender}
              maxToRenderPerBatch={albumListTuning.maxToRenderPerBatch}
              windowSize={albumListTuning.windowSize}
              updateCellsBatchingPeriod={albumListTuning.updateCellsBatchingPeriod}
              removeClippedSubviews
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.albumCard}
                  activeOpacity={0.86}
                  onPress={() => openAlbum(item)}
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
                    {item.tracks.length} track{item.tracks.length === 1 ? "" : "s"}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Essential Tracks</Text>
          <Text style={styles.sectionSub}>Start a queue from this artist world</Text>
        </View>
          </>
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
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  glowCyan: {
    position: "absolute",
    top: 320,
    right: -145,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  content: {
    paddingTop: 55,
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
  },
  meta: {
    color: COLORS.textMuted,
    marginTop: 7,
    textAlign: "center",
    fontWeight: "700",
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
