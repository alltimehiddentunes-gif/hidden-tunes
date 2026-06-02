import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
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

export default function ArtistScreen() {
  const params = useLocalSearchParams();
  const { playAudiusTrack } = usePlayerActions();
  const artistName = String(params.artist || "Unknown Artist");

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadArtistCatalog();
  }, [artistName]);

  async function loadArtistCatalog() {
    try {
      setLoading(true);
      setCatalog(await fetchHiddenTunesCatalog());
    } catch (error) {
      console.log("Artist catalog load error:", error);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }

  const artist = useMemo(() => {
    const artists = catalog?.artists || [];
    return artists.find((item) => clean(item.name) === clean(artistName));
  }, [artistName, catalog?.artists]);

  const tracks = artist?.songs || [];
  const albums = artist?.albums || [];
  const artistImage = artist?.artwork || tracks[0]?.cover || "https://hiddentunes.com/covers/zangu-done.png";

  function openAlbum(album: HiddenTunesAlbumCatalogItem) {
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }

  function playSong(song: HiddenTunesSong) {
    void playAudiusTrack(song);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconButton} onPress={loadArtistCatalog}>
                <Ionicons name="refresh" size={21} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.hero}>
              <Image source={{ uri: artistImage }} style={styles.artistImage} />

              <Text style={styles.kicker}>ARTIST</Text>
              <Text style={styles.artistName} numberOfLines={2}>{artist?.name || artistName}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {tracks.length} song{tracks.length === 1 ? "" : "s"} from the catalog
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.playButton, tracks.length === 0 && styles.disabledPlayButton]}
                  disabled={tracks.length === 0}
                  onPress={() => tracks[0] && playSong(tracks[0])}
                >
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.playButtonText}>Play Top Song</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading {artistName}...</Text>
              </View>
            ) : (
              <>
                {albums.length > 0 && (
                  <View style={styles.albumSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Albums</Text>
                      <Text style={styles.sectionSub}>Derived from this artist's songs</Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                      {albums.map((album) => (
                        <TouchableOpacity key={album.id} activeOpacity={0.86} style={styles.albumCard} onPress={() => openAlbum(album)}>
                          <Image source={{ uri: album.artwork }} style={styles.albumCover} />
                          <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                          <Text style={styles.albumArtist} numberOfLines={1}>{album.artist}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Songs</Text>
                  <Text style={styles.sectionSub}>Playable Hidden Tunes tracks</Text>
                </View>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="person-circle-outline" size={60} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyText}>This artist has no songs in the current catalog source.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (loading) return null;

          return (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => playSong(item)}>
              <Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text>
              <Image source={{ uri: item.cover || artistImage }} style={styles.cover} />

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
          );
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 165 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  hero: { alignItems: "center", paddingTop: 26, paddingBottom: 28 },
  artistImage: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 22 },
  artistName: { color: COLORS.text, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 8, lineHeight: 40 },
  subtitle: { color: COLORS.textMuted, fontSize: 14, marginTop: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  disabledPlayButton: { opacity: 0.45 },
  playButtonText: { color: "#000", fontSize: 14, fontWeight: "900", marginLeft: 8 },
  loader: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  loadingText: { color: COLORS.textMuted, marginTop: 14 },
  albumSection: { marginBottom: 30 },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sectionSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  albumRow: { gap: 14, paddingRight: 20 },
  albumCard: { width: 145 },
  albumCover: { width: 145, height: 145, borderRadius: 26, backgroundColor: COLORS.card },
  albumTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900", marginTop: 10, lineHeight: 18 },
  albumArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 5 },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 26,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  rank: { width: 30, color: "rgba(255,255,255,0.32)", fontSize: 15, fontWeight: "900" },
  cover: { width: 66, height: 66, borderRadius: 18, backgroundColor: COLORS.card },
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
