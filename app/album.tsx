import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayerActions } from "../context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesSong,
} from "../services/hiddenTunes";

function clean(value: string) {
  return String(value || "").trim().toLowerCase();
}

export default function AlbumScreen() {
  const params = useLocalSearchParams();
  const { playAudiusTrack } = usePlayerActions();

  const albumTitle = String(params.album || params.title || "Singles");
  const artistName = String(params.artist || "Unknown Artist");
  const fallbackThumbnail = String(params.thumbnail || "https://hiddentunes.com/covers/zangu-done.png");

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAlbumCatalog();
  }, [albumTitle, artistName]);

  async function loadAlbumCatalog() {
    try {
      setLoading(true);
      setCatalog(await fetchHiddenTunesCatalog());
    } catch (error) {
      console.log("Album catalog load error:", error);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }

  const album = useMemo<HiddenTunesAlbumCatalogItem | undefined>(() => {
    return (catalog?.albums || []).find((item) => {
      return clean(item.title) === clean(albumTitle) && clean(item.artist) === clean(artistName);
    });
  }, [albumTitle, artistName, catalog?.albums]);

  const tracks = album?.songs || [];
  const thumbnail = album?.artwork || tracks[0]?.cover || fallbackThumbnail;

  function playSong(song: HiddenTunesSong) {
    void playAudiusTrack(song);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.refreshButton} onPress={loadAlbumCatalog}>
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.albumHero}>
        <Image source={{ uri: thumbnail }} style={styles.albumCover} />

        <Text style={styles.kicker}>ALBUM</Text>
        <Text style={styles.albumTitle} numberOfLines={2}>{album?.title || albumTitle}</Text>
        <Text style={styles.artist} numberOfLines={1}>{album?.artist || artistName}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.playButton, tracks.length === 0 && styles.disabledPlayButton]}
            disabled={tracks.length === 0}
            onPress={() => tracks[0] && playSong(tracks[0])}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.playButtonText}>Play First</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.86} style={styles.secondaryButton} onPress={loadAlbumCatalog}>
            <Ionicons name="reload" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
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
          data={tracks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyText}>This album has no songs in the current catalog source.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => playSong(item)}>
              <Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text>
              <Image source={{ uri: item.cover || thumbnail }} style={styles.cover} />

              <View style={styles.info}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="cloud-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.metaText}>Hidden Tunes</Text>
                </View>
              </View>

              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color={COLORS.text} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 64, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  refreshButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  albumHero: { alignItems: "center", paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  albumCover: { width: 210, height: 210, borderRadius: 34, backgroundColor: COLORS.card },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 22 },
  albumTitle: { color: COLORS.text, fontSize: 30, fontWeight: "900", textAlign: "center", marginTop: 8, lineHeight: 36 },
  artist: { color: COLORS.textMuted, fontSize: 15, marginTop: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  disabledPlayButton: { opacity: 0.45 },
  playButtonText: { color: "#000", fontSize: 14, fontWeight: "900", marginLeft: 8 },
  secondaryButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: COLORS.textMuted, marginTop: 14 },
  listContent: { paddingHorizontal: 20, paddingBottom: 165 },
  trackCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 26, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  rank: { width: 30, color: "rgba(255,255,255,0.32)", fontSize: 15, fontWeight: "900" },
  cover: { width: 64, height: 64, borderRadius: 18, backgroundColor: COLORS.card },
  info: { flex: 1, marginLeft: 14 },
  trackTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  trackArtist: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", marginLeft: 5 },
  playCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  empty: { height: 260, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: COLORS.text, fontSize: 21, fontWeight: "900", marginTop: 18 },
  emptyText: { color: COLORS.textMuted, marginTop: 8, textAlign: "center" },
});
