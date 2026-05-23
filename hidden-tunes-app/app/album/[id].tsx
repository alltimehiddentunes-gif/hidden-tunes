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

import NeonEQ from "../../components/NeonEQ";
import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import HTImage from "../../components/HTImage";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";
import {
  extractHiddenTunesAlbums,
  getHiddenTunesAlbumById,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesAlbum,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { getArtworkUri, resolveEntityArtwork } from "../../utils/artwork";
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
  loadAlbumDetailSnapshot,
  saveAlbumDetailSnapshot,
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

function getTotalDuration(tracks: HiddenTunesNormalizedSong[]) {
  return tracks.reduce((total, track) => total + (track.duration || 0), 0);
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

function findAlbumById(albums: HiddenTunesAlbum[], id: string) {
  const cleanId = normalizeLookup(id);

  return (
    albums.find(
      (album) =>
        album.id === id ||
        normalizeLookup(album.id) === cleanId ||
        normalizeLookup(album.slug) === cleanId ||
        normalizeLookup(album.title) === cleanId
    ) || null
  );
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams();
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const screenStartedAt = useRef(startPerformanceTimer()).current;

  const [album, setAlbum] = useState<HiddenTunesAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);

  const tracks = useMemo(
    () => (album?.tracks || []).map(safeSong),
    [album?.tracks]
  );

  const totalDuration = useMemo(() => getTotalDuration(tracks), [tracks]);
  const listPerformance = useMemo(
    () => getListPerformanceSettings(tracks.length),
    [tracks.length]
  );
  const trackKeyExtractor = useMemo(
    () => createStableKeyExtractor("album-track"),
    []
  );

  useEffect(() => trackRenderProbe("AlbumScreen"), []);

  const loadAlbum = useCallback(
    async (showLoader = true) => {
      const albumId = String(id || "");
      let showedCachedAlbum = false;
      const refreshStart = startPerformanceTimer();

      try {
        setHasCheckedFallbacks(false);
        if (showLoader) setLoading(true);

        const snapshotAlbum = await loadAlbumDetailSnapshot(albumId);
        if (snapshotAlbum) {
          setAlbum(snapshotAlbum);
          setLoading(false);
          showedCachedAlbum = true;
          logCacheResult("album", true, {
            id: albumId,
            tracks: snapshotAlbum.tracks.length,
            snapshot: true,
          });
          logScreenReady("album", screenStartedAt, {
            cache: "hit",
            tracks: snapshotAlbum.tracks.length,
          });
          logPerformanceSummary("album", {
            cache: "hit",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: snapshotAlbum.tracks.length,
          });
        }

        const cachedSongs = await hydrateHiddenTunesCatalogCache();
        const cachedAlbum = findAlbumById(extractHiddenTunesAlbums(cachedSongs), albumId);

        if (cachedAlbum && !showedCachedAlbum) {
          setAlbum(cachedAlbum);
          setLoading(false);
          showedCachedAlbum = true;
          logCacheResult("album", true, {
            id: albumId,
            tracks: cachedAlbum.tracks.length,
          });
          logScreenReady("album", screenStartedAt, {
            cache: "hit",
            tracks: cachedAlbum.tracks.length,
          });
          logPerformanceSummary("album", {
            cache: "hit",
            firstContentMs: Date.now() - screenStartedAt,
            itemCount: cachedAlbum.tracks.length,
          });
        } else if (!showedCachedAlbum) {
          logCacheResult("album", false, { id: albumId });
        }

        const data = await getHiddenTunesAlbumById(albumId);
        logApiRefresh("album", refreshStart, {
          id: albumId,
          found: Boolean(data),
          tracks: data?.tracks.length || 0,
        });
        logPerformanceSummary("album", {
          cache: showedCachedAlbum ? "hit" : "miss",
          apiRefreshMs: Date.now() - refreshStart,
          itemCount: data?.tracks.length || 0,
          emptyStateReason: data
            ? "content_available"
            : "cache_api_and_fallback_empty",
        });

        if (data) {
          setAlbum(data);
          void saveAlbumDetailSnapshot(data);
          if (!showedCachedAlbum) {
            logScreenReady("album", screenStartedAt, {
              cache: "miss",
              tracks: data.tracks.length,
            });
          }
        } else if (!showedCachedAlbum) {
          setAlbum(null);
        }
      } catch (error) {
        console.log("Load album error:", error);
        if (!showedCachedAlbum) setAlbum(null);
      } finally {
        setHasCheckedFallbacks(true);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, screenStartedAt]
  );

  useEffect(() => {
    loadAlbum(true);
  }, [id, loadAlbum]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAlbum(false);
  }

  function handlePlay(track: HiddenTunesNormalizedSong) {
    const tapStartedAt = startPerformanceTimer();
    const normalized = safeSong(track);
    const startIndex = Math.max(
      0,
      tracks.findIndex((item) => item.id === normalized.id)
    );

    void playSong(normalized as any, tracks as any, startIndex)
      .finally(() => {
        logTapToPlay("album", tapStartedAt, { id: normalized.id });
      })
      .catch((error) => {
        if (__DEV__) console.log("Album play error:", error);
      });

    requestAnimationFrame(() => {
      router.push("/player" as any);
    });
  }

  function playAlbum() {
    if (!tracks.length) return;
    const tapStartedAt = startPerformanceTimer();

    void playSong(tracks[0] as any, tracks as any, 0)
      .finally(() => {
        logTapToPlay("album", tapStartedAt, { id: tracks[0]?.id });
      })
      .catch((error) => {
        if (__DEV__) console.log("Album play-all error:", error);
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
        logTapToPlay("album", tapStartedAt, { id: shuffled[0]?.id });
      })
      .catch((error) => {
        if (__DEV__) console.log("Album shuffle error:", error);
      });

    requestAnimationFrame(() => {
      router.push("/player" as any);
    });
  }

  const albumArtwork = useMemo(
    () => resolveEntityArtwork(album, tracks),
    [album, tracks]
  );

  if (loading) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Opening album experience...</Text>
      </LinearGradient>
    );
  }

  if (!album && hasCheckedFallbacks) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <Ionicons name="disc-outline" size={64} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>Album unavailable</Text>
        <Text style={styles.emptyText}>Refresh the catalog or return to Search.</Text>

        <TouchableOpacity style={styles.emptyButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#000" />
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (!album) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Checking cached album...</Text>
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
        contentContainerStyle={styles.list}
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
              <View style={styles.coverWrap}>
                <HTImage
                  source={albumArtwork}
                  candidates={tracks}
                  style={styles.cover}
                />
              </View>

              <View style={styles.albumBadge}>
                <Ionicons name="cloud-done" size={14} color={COLORS.primary} />
                <Text style={styles.albumBadgeText}>ALBUM EXPERIENCE</Text>
              </View>

              <Text style={styles.title}>{album.title}</Text>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: "/artist/[id]",
                    params: {
                      id: album.artistId || album.artist,
                    },
                  } as any)
                }
              >
                <Text style={styles.artist}>{album.artist}</Text>
              </TouchableOpacity>

              <Text style={styles.meta}>
                {tracks.length} track{tracks.length === 1 ? "" : "s"}
                {totalDuration > 0 ? ` • ${formatDuration(totalDuration)}` : ""}
                {album.genre ? ` • ${album.genre}` : ""}
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.playButton, !tracks.length && styles.disabledButton]}
                  onPress={playAlbum}
                  disabled={!tracks.length}
                >
                  <Ionicons name="play" size={20} color="#000" />
                  <Text style={styles.playText}>Play Album</Text>
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

            <View style={styles.trackHeader}>
              <Text style={styles.trackHeaderTitle}>Tracklist</Text>
              <Text style={styles.trackHeaderSub}>Start the release from any song</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyTracks}>
            <Ionicons name="musical-notes-outline" size={52} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>This release is waiting for tracks</Text>
            <Text style={styles.emptyText}>
              Check back after the catalog refreshes.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const active = currentSong?.id === item.id;

          return (
            <TouchableOpacity
              style={[styles.trackRow, active && styles.trackRowActive]}
              onPress={() => handlePlay(item)}
              activeOpacity={0.86}
            >
              <View style={styles.trackNumberBox}>
                {active ? (
                  <NeonEQ isPlaying={isPlaying} size="small" />
                ) : (
                  <Text style={styles.trackNumber}>{index + 1}</Text>
                )}
              </View>

              <HTImage source={item} style={styles.trackCover} />

              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.artist} {item.duration ? `• ${formatDuration(item.duration)}` : ""}
                </Text>
              </View>

              <AddToPlaylistButton track={item as any} />

              <Ionicons
                name={active && isPlaying ? "pause-circle" : "play-circle"}
                size={30}
                color={COLORS.primary}
                style={styles.playIcon}
              />
            </TouchableOpacity>
          );
        }}
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
    top: 310,
    right: -140,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontWeight: "700",
  },
  list: {
    paddingTop: 55,
    paddingBottom: 150,
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
  },
  coverWrap: {
    width: 226,
    height: 226,
    borderRadius: 34,
    padding: 3,
    backgroundColor: "rgba(168,85,247,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 31,
    backgroundColor: COLORS.card,
  },
  albumBadge: {
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
  albumBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 18,
    letterSpacing: -0.5,
  },
  artist: {
    color: COLORS.primary,
    fontSize: 15,
    marginTop: 8,
    fontWeight: "900",
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 13,
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
  trackHeader: {
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 14,
  },
  trackHeaderTitle: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },
  trackHeaderSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
    fontWeight: "700",
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.065)",
    borderRadius: 22,
    padding: 12,
    marginHorizontal: 20,
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
