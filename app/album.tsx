import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../components/HTImage";
import AppShell from "../components/navigation/AppShell";
import PremiumEmptyState from "../components/PremiumEmptyState";
import { COLORS, GRADIENTS } from "../constants/theme";
import { getListPerformanceSettings, markFastScrolling } from "../utils/performanceMode";
import { usePlayerActions } from "../context/PlayerContext";
import { resolveEntityArtwork } from "../utils/artwork";
import {
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesSong,
} from "../services/hiddenTunes";

function clean(value: string) {
  return String(value || "").trim().toLowerCase();
}

function getTrackSortValue(track: HiddenTunesSong, fallbackIndex: number) {
  const raw = (track as any).raw || {};
  const candidates = [
    (track as any).trackNumber,
    (track as any).track_number,
    (track as any).track,
    raw.trackNumber,
    raw.track_number,
    raw.track,
    raw.position,
    raw.order,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return fallbackIndex + 10000;
}


function getSongDurationSeconds(song: HiddenTunesSong) {
  const raw = (song as any).raw || {};
  const value =
    (song as any).duration ??
    (song as any).durationSeconds ??
    (song as any).duration_seconds ??
    raw.duration ??
    raw.durationSeconds ??
    raw.duration_seconds;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10000 ? Math.round(parsed / 1000) : Math.round(parsed);
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function sortAlbumSongs(songs: HiddenTunesSong[]) {
  return songs
    .map((song, index) => ({ song, index }))
    .sort((left, right) => {
      const leftSort = getTrackSortValue(left.song, left.index);
      const rightSort = getTrackSortValue(right.song, right.index);
      if (leftSort !== rightSort) return leftSort - rightSort;
      return String(left.song.title || "").localeCompare(String(right.song.title || ""));
    })
    .map((item) => item.song);
}

export default function AlbumScreen() {
  const params = useLocalSearchParams();
  const { playSong } = usePlayerActions();

  const albumTitle = String(params.album || params.title || "Singles");
  const artistName = String(params.artist || "Unknown Artist");
  const paramThumbnail = String(params.thumbnail || "").trim();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAlbumCatalog();
  }, [albumTitle, artistName]);

  async function loadAlbumCatalog() {
    try {
      setLoading(true);
      setCatalog(getCachedHiddenTunesCatalog() || (await fetchHiddenTunesCatalog()));
    } catch (error) {
      console.log("Album catalog load error:", error);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }

  const album = useMemo<HiddenTunesAlbumCatalogItem | undefined>(() => {
    const normalizedAlbum = clean(albumTitle);
    const normalizedArtist = clean(artistName);
    const exact = (catalog?.albums || []).find((item) => {
      return clean(item.title) === normalizedAlbum && clean(item.artist) === normalizedArtist;
    });
    if (exact) return exact;

    return (catalog?.albums || []).find((item) => {
      if (clean(item.title) !== normalizedAlbum) return false;
      return normalizedArtist === "unknown artist" || clean(item.artist) === normalizedArtist;
    });
  }, [albumTitle, artistName, catalog?.albums]);

  const tracks = useMemo(() => {
    const normalizedAlbum = clean(album?.title || albumTitle);
    const normalizedArtist = clean(album?.artist || artistName);
    const catalogMatches = (catalog?.songs || []).filter((song) => {
      const albumMatches = clean(String(song.album || "")) === normalizedAlbum;
      const artistMatches = normalizedArtist === "unknown artist" || clean(String(song.artist || (song as any).user?.name || "")) === normalizedArtist;
      return albumMatches && artistMatches;
    });
    const sorted = sortAlbumSongs(album?.songs?.length ? album.songs : catalogMatches);
    if (sorted.length) {
      console.log("album_queue_built", {
        albumId: album?.id,
        albumTitle: album?.title || albumTitle,
        queueLength: sorted.length,
      });
    }
    return sorted;
  }, [album, albumTitle, artistName, catalog?.songs]);

  const trackRows = useMemo(() => {
    if (!tracks.length) return [] as Array<{ type: "header"; id: string; title: string; subtitle: string } | { type: "track"; id: string; song: HiddenTunesSong; index: number }>;
    return [
      {
        type: "header" as const,
        id: "album-session-header",
        title: "Album Session",
        subtitle: `${tracks.length} track${tracks.length === 1 ? "" : "s"} queued in album order`,
      },
      ...tracks.map((song, index) => ({
        type: "track" as const,
        id: `track-${song.id || index}`,
        song,
        index,
      })),
    ];
  }, [tracks]);

  const totalDuration = useMemo(
    () => tracks.reduce((total, song) => total + getSongDurationSeconds(song), 0),
    [tracks]
  );

  const heroArtwork = useMemo(
    () =>
      resolveEntityArtwork(
        {
          title: album?.title || albumTitle,
          artist: album?.artist || artistName,
          artwork: album?.artwork || paramThumbnail,
        },
        tracks
      ),
    [album, albumTitle, artistName, paramThumbnail, tracks]
  );

  function handlePlaySong(song: HiddenTunesSong, queueIndex: number) {
    void playSong(song, tracks, queueIndex, {
      source: "album",
      label: album?.title || albumTitle,
      albumId: album?.id,
      albumTitle: album?.title || albumTitle,
      artistName: album?.artist || artistName,
      genre: song.genre,
      mood: song.mood,
    });
    router.push("/player" as any);
  }

  return (
    <AppShell>
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.refreshButton} onPress={loadAlbumCatalog}>
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View pointerEvents="none" style={styles.glowPurple} />
      <View pointerEvents="none" style={styles.glowCyan} />

      <View style={styles.albumHero}>
        <LinearGradient colors={GRADIENTS.card} style={styles.heroSurface}>
        <HTImage
          source={{
            title: album?.title || albumTitle,
            artist: album?.artist || artistName,
            artwork: album?.artwork || paramThumbnail || heroArtwork,
          }}
          candidates={tracks}
          style={styles.albumCover}
          contentFit="cover"
        />

        <Text style={styles.kicker}>ALBUM</Text>
        <Text style={styles.albumTitle} numberOfLines={2}>{album?.title || albumTitle}</Text>
        <Text style={styles.artist} numberOfLines={1}>{album?.artist || artistName}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMetaPill}>{tracks.length} track{tracks.length === 1 ? "" : "s"}</Text>
          <Text style={styles.heroMetaPill}>{totalDuration > 0 ? formatDuration(totalDuration) : "Catalog ready"}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.playButton, tracks.length === 0 && styles.disabledPlayButton]}
            disabled={tracks.length === 0}
            onPress={() => tracks[0] && handlePlaySong(tracks[0], 0)}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.playButtonText}>Play Album</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.86} style={styles.secondaryButton} onPress={loadAlbumCatalog}>
            <Ionicons name="reload" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        </LinearGradient>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tracks</Text>
        <Text style={styles.sectionSub} numberOfLines={1}>
          {tracks.length} song{tracks.length === 1 ? "" : "s"} from the current catalog
        </Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onScrollEndDrag={() => markFastScrolling(false)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          data={trackRows}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <PremiumEmptyState
                icon="albums-outline"
                title="This release is waiting on tracks"
                message="When the catalog source includes songs for this album, they will appear here with artwork and playback-ready rows."
                actionLabel="Refresh"
                onAction={loadAlbumCatalog}
              />
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{item.title}</Text>
                  <Text style={styles.groupSubtitle}>{item.subtitle}</Text>
                </View>
              );
            }

            const duration = getSongDurationSeconds(item.song);

            return (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => handlePlaySong(item.song, item.index)}>
              <Text style={styles.rank}>{String(item.index + 1).padStart(2, "0")}</Text>
              <HTImage source={item.song} candidates={tracks} style={styles.cover} contentFit="cover" />

              <View style={styles.info}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.song.title}</Text>
                <Text style={styles.trackArtist} numberOfLines={1}>{item.song.artist}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="cloud-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.metaText}>{duration ? formatDuration(duration) : "Hidden Tunes"}</Text>
                </View>
              </View>

              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color={COLORS.text} />
              </View>
            </TouchableOpacity>
            );
          }}
        />
      )}
    </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowPurple: { position: "absolute", top: 40, left: -120, width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(168,85,247,0.18)" },
  glowCyan: { position: "absolute", top: 330, right: -150, width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(34,211,238,0.1)" },
  header: { paddingTop: 64, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  refreshButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  albumHero: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 24 },
  heroSurface: { alignItems: "center", borderRadius: 30, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  albumCover: { width: 204, height: 204, borderRadius: 32, backgroundColor: "rgba(168,85,247,0.1)" },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 22 },
  albumTitle: { color: COLORS.text, fontSize: 27, fontWeight: "900", textAlign: "center", marginTop: 8, lineHeight: 32 },
  artist: { color: COLORS.primaryGlow, fontSize: 15, fontWeight: "800", marginTop: 8 },
  heroMetaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 13 },
  heroMetaPill: { color: COLORS.textMuted, fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  disabledPlayButton: { opacity: 0.45 },
  playButtonText: { color: "#000", fontSize: 14, fontWeight: "900", marginLeft: 8 },
  secondaryButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 14 },
  groupHeader: { marginBottom: 10, paddingHorizontal: 2 },
  groupTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  groupSubtitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: "900" },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: COLORS.textMuted, marginTop: 14 },
  listContent: { paddingHorizontal: 20, paddingBottom: 165 },
  trackCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 26, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  rank: { width: 30, color: "rgba(255,255,255,0.32)", fontSize: 15, fontWeight: "900" },
  cover: { width: 64, height: 64, borderRadius: 18, backgroundColor: COLORS.card },
  info: { flex: 1, marginLeft: 14 },
  trackTitle: { color: COLORS.text, fontSize: 14.5, fontWeight: "900" },
  trackArtist: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", marginLeft: 5 },
  playCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  emptyTitle: { color: COLORS.text, fontSize: 21, fontWeight: "900", marginTop: 18 },
  emptyText: { color: COLORS.textMuted, marginTop: 8, textAlign: "center" },
});
