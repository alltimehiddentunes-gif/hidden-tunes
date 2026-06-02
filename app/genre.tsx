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

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

export default function GenreScreen() {
  const params = useLocalSearchParams();
  const { playAudiusTrack } = usePlayerActions();

  const title = String(params.title || params.query || "Genre");
  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadGenreCatalog();
  }, [title]);

  async function loadGenreCatalog() {
    try {
      setLoading(true);
      setCatalog(await fetchHiddenTunesCatalog());
    } catch (error) {
      console.log("Genre catalog load error:", error);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }

  const tracks = useMemo(() => {
    const songs = catalog?.songs || [];
    const exactGenreMatches = songs.filter((song) => clean(song.genre || "") === clean(title));
    if (exactGenreMatches.length) return exactGenreMatches;

    return songs.filter((song) => {
      return clean(song.genre || "").includes(clean(title)) || clean(song.mood || "").includes(clean(title));
    });
  }, [catalog?.songs, title]);

  const albums = useMemo<HiddenTunesAlbumCatalogItem[]>(() => {
    const trackIds = new Set(tracks.map((song) => song.id));
    return (catalog?.albums || []).filter((album) => album.songs.some((song) => trackIds.has(song.id)));
  }, [catalog?.albums, tracks]);

  function playSong(song: HiddenTunesSong) {
    void playAudiusTrack(song);
  }

  function openAlbum(album: HiddenTunesAlbumCatalogItem) {
    router.push({
      pathname: "/album",
      params: { album: album.title, artist: album.artist, thumbnail: album.artwork },
    } as any);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>GENRE</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Songs tagged in the current catalog</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={loadGenreCatalog} activeOpacity={0.85}>
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading {title}...</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {albums.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Albums</Text>
                    <Text style={styles.sectionSub}>Releases connected to this tag</Text>
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
                <Text style={styles.sectionSub}>
                  {tracks.length} song{tracks.length === 1 ? "" : "s"} found
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={58} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyText}>No current songs include this genre or mood tag.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => playSong(item)}>
              <Image source={{ uri: item.cover }} style={styles.cover} />
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.trackTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.trackArtist}>{item.artist}</Text>
              </View>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color="#000" />
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
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 2 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },
  albumSection: { marginBottom: 10 },
  sectionHeader: { marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  sectionSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  albumRow: { gap: 12, paddingBottom: 8 },
  albumCard: { width: 132 },
  albumCover: { width: 132, height: 132, borderRadius: 18, marginBottom: 8, backgroundColor: COLORS.card },
  albumTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  albumArtist: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  trackCard: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, padding: 10, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)" },
  cover: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.card },
  info: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  trackArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, fontWeight: "700" },
  playCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
});
