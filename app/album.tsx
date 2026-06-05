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
import { COLORS, GRADIENTS } from "../constants/theme";
import { getListPerformanceSettings, markFastScrolling } from "../utils/performanceMode";
import { usePlayerActions } from "../context/PlayerContext";
import { resolveEntityArtwork } from "../utils/artwork";
import {
  logEntityArtworkResolved,
  logEntityTapReceived,
} from "../utils/entityDiagnostics";
import {
  resolveAlbumEntity,
  RELATED_SONGS_LABEL,
} from "../utils/entityResolution";
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
    logEntityTapReceived("album", {
      album: albumTitle,
      artist: artistName,
      id: String(params.id || ""),
    });
    void loadAlbumCatalog();
  }, [albumTitle, artistName, params.id]);

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

  const albumResolution = useMemo(
    () =>
      resolveAlbumEntity(catalog, {
        id: String(params.id || ""),
        album: albumTitle,
        title: albumTitle,
        artist: artistName,
        thumbnail: paramThumbnail,
      }),
    [albumTitle, artistName, catalog, paramThumbnail, params.id]
  );

  const album = albumResolution.entity as HiddenTunesAlbumCatalogItem | null | undefined;
  const tracks = albumResolution.tracks;
  const recoveryLabel = albumResolution.recoveryLabel;

  const trackRows = useMemo(() => {
    if (!tracks.length) return [] as Array<{ type: "header"; id: string; title: string; subtitle: string } | { type: "track"; id: string; song: HiddenTunesSong; index: number }>;
    return [
      {
        type: "header" as const,
        id: "album-session-header",
        title: recoveryLabel || "Album Session",
        subtitle: recoveryLabel
          ? `${tracks.length} related track${tracks.length === 1 ? "" : "s"} from the catalog`
          : `${tracks.length} track${tracks.length === 1 ? "" : "s"} queued in album order`,
      },
      ...tracks.map((song, index) => ({
        type: "track" as const,
        id: `track-${song.id || index}`,
        song,
        index,
      })),
    ];
  }, [tracks, recoveryLabel]);

  const totalDuration = useMemo(
    () => tracks.reduce((total, song) => total + getSongDurationSeconds(song), 0),
    [tracks]
  );

  const explicitAlbumArtwork = Boolean(String(album?.artwork || paramThumbnail || "").trim());

  const heroArtwork = useMemo(() => {
    const artwork = resolveEntityArtwork(
      {
        title: album?.title || albumTitle,
        artist: album?.artist || artistName,
        artwork: album?.artwork || paramThumbnail,
      },
      tracks
    );
    logEntityArtworkResolved({
      kind: "album",
      title: album?.title || albumTitle,
      trackCount: tracks.length,
      hasArtwork: Boolean(artwork),
    });
    return artwork;
  }, [album, albumTitle, artistName, paramThumbnail, tracks]);

  const hasPlayableTracks = tracks.length > 0;
  const shouldShowLargeArtwork = hasPlayableTracks || explicitAlbumArtwork;

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

      <View style={[styles.albumHero, !shouldShowLargeArtwork && styles.compactAlbumHero]}>
        <LinearGradient
          colors={GRADIENTS.card}
          style={[styles.heroSurface, !shouldShowLargeArtwork && styles.compactHeroSurface]}
        >
        {shouldShowLargeArtwork ? (
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
        ) : (
          <View style={styles.compactArtworkBadge}>
            <Ionicons name="albums-outline" size={24} color={COLORS.primaryGlow} />
          </View>
        )}

        <Text style={[styles.kicker, !shouldShowLargeArtwork && styles.compactKicker]}>ALBUM</Text>
        <Text
          style={[styles.albumTitle, !shouldShowLargeArtwork && styles.compactAlbumTitle]}
          numberOfLines={shouldShowLargeArtwork ? 2 : 1}
        >
          {album?.title || albumTitle}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>{album?.artist || artistName}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMetaPill}>{tracks.length} track{tracks.length === 1 ? "" : "s"}</Text>
          <Text style={styles.heroMetaPill}>{totalDuration > 0 ? formatDuration(totalDuration) : "Catalog ready"}</Text>
        </View>

        <View style={styles.actionRow}>
          {hasPlayableTracks ? (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.playButton}
              onPress={() => tracks[0] && handlePlaySong(tracks[0], 0)}
            >
              <Ionicons name="play" size={18} color="#000" />
              <Text style={styles.playButtonText}>Play Album</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity activeOpacity={0.86} style={styles.secondaryButton} onPress={loadAlbumCatalog}>
            <Ionicons name="reload" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        </LinearGradient>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tracks</Text>
        <Text style={styles.sectionSub} numberOfLines={1}>
          {recoveryLabel
            ? `${recoveryLabel} • ${tracks.length} song${tracks.length === 1 ? "" : "s"}`
            : `${tracks.length} song${tracks.length === 1 ? "" : "s"} from the current catalog`}
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
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="albums-outline" size={20} color={COLORS.primaryGlow} />
                </View>
                <View style={styles.emptyCopy}>
                  <Text style={styles.emptyTitle}>Tracks are still syncing</Text>
                  <Text style={styles.emptyText}>Refresh to check the catalog again.</Text>
                </View>
                <TouchableOpacity activeOpacity={0.86} style={styles.emptyRefresh} onPress={loadAlbumCatalog}>
                  <Ionicons name="reload" size={16} color={COLORS.text} />
                </TouchableOpacity>
              </View>
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
  compactAlbumHero: { paddingTop: 14, paddingBottom: 12 },
  heroSurface: { alignItems: "center", borderRadius: 30, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  compactHeroSurface: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22 },
  albumCover: { width: 204, height: 204, borderRadius: 32, backgroundColor: "rgba(168,85,247,0.1)" },
  compactArtworkBadge: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,85,247,0.13)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 22 },
  compactKicker: { marginTop: 12 },
  albumTitle: { color: COLORS.text, fontSize: 27, fontWeight: "900", textAlign: "center", marginTop: 8, lineHeight: 32 },
  compactAlbumTitle: { fontSize: 22, lineHeight: 27 },
  artist: { color: COLORS.primaryGlow, fontSize: 15, fontWeight: "800", marginTop: 8 },
  heroMetaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 13 },
  heroMetaPill: { color: COLORS.textMuted, fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
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
  empty: { paddingTop: 4, paddingBottom: 18 },
  emptyCard: { minHeight: 82, flexDirection: "row", alignItems: "center", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,85,247,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  emptyCopy: { flex: 1, marginLeft: 12, marginRight: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 14.5, fontWeight: "900" },
  emptyText: { color: COLORS.textMuted, marginTop: 4, fontSize: 12.5, lineHeight: 17 },
  emptyRefresh: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: COLORS.border },
});
