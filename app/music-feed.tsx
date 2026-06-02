import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import AppShell from "@/components/navigation/AppShell";
import NeonEQ from "@/components/NeonEQ";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "@/context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "@/services/hiddenTunes";

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setRefreshing(false);
  }, []);

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem) => {
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, []);

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem) => {
    router.push({
      pathname: "/genre",
      params: { title: genre.title, query: genre.title, id: genre.id, type: "genre" },
    } as any);
  }, []);

  const renderSurfaceCard = useCallback(
    ({
      id,
      title,
      subtitle,
      artwork,
      onPress,
    }: {
      id: string;
      title: string;
      subtitle: string;
      artwork: string;
      onPress: () => void;
    }) => (
      <TouchableOpacity
        key={id}
        activeOpacity={0.86}
        style={styles.surfaceCard}
        onPress={onPress}
      >
        <Image source={{ uri: artwork }} style={styles.surfaceCover} />
        <Text style={styles.surfaceTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.surfaceSubtitle} numberOfLines={1}>{subtitle}</Text>
      </TouchableOpacity>
    ),
    []
  );

  const keyExtractor = useCallback(
    (item: HiddenTunesSong, index: number) => `${item.id}-${index}`,
    []
  );

  const renderSongItem = useCallback(
    ({ item, index }: { item: HiddenTunesSong; index: number }) => {
      const active = isPlaying && currentSong?.id === String(item.id);

      return (
        <TouchableOpacity
          style={[styles.songCard, active && styles.songCardActive]}
          activeOpacity={0.88}
          onPress={() => playSong(item, songs, index)}
        >
          <LinearGradient colors={GRADIENTS.neon} style={styles.coverBorder}>
            <Image source={{ uri: item.cover }} style={styles.cover} />
          </LinearGradient>

          <View style={styles.songInfo}>
            <Text numberOfLines={1} style={styles.songTitle}>
              {item.title}
            </Text>

            <Text numberOfLines={1} style={styles.artist}>
              {item.artist}
            </Text>

            <View style={styles.row}>
              <Ionicons
                name={active ? "radio" : "cloud-outline"}
                size={15}
                color={active ? COLORS.cyan : COLORS.primary}
              />
              <Text style={styles.streamText}>
                {active ? "Now playing" : "Tap to play"}
              </Text>
            </View>
          </View>

          {active ? (
            <View style={styles.eqBox}>
              <NeonEQ isPlaying={isPlaying} size="small" />
            </View>
          ) : (
            <View style={styles.playButton}>
              <Ionicons name="play" size={20} color="#000" />
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [currentSong?.id, isPlaying, playSong, songs]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerTextBox}>
            <Text style={styles.title}>Hidden Tunes</Text>
            <Text style={styles.subtitle}>Songs, artists, albums and mixes</Text>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={refreshCatalog}>
            <Ionicons name="refresh" size={22} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your music...</Text>
          </View>
        ) : songs.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="musical-notes" size={58} color={COLORS.primary} />
            </View>

            <Text style={styles.emptyTitle}>Nothing here yet</Text>

            <Text style={styles.emptyText}>
              New releases will appear here as they are added to Hidden Tunes.
            </Text>
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshCatalog}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={
              <View>
                <View style={styles.feedHero}>
                  <LinearGradient colors={GRADIENTS.neon} style={styles.feedBorder}>
                    <View style={styles.feedInner}>
                      <View style={styles.feedCopy}>
                        <Text style={styles.feedLabel}>LATEST RELEASES</Text>
                        <Text style={styles.feedTitle}>
                          {songs.length} song{songs.length === 1 ? "" : "s"} available
                        </Text>
                        <Text style={styles.feedText}>
                          Explore the current Hidden Tunes catalog.
                        </Text>
                      </View>

                      <NeonEQ isPlaying={isPlaying} size="medium" />
                    </View>
                  </LinearGradient>
                </View>

                {artists.length > 0 && (
                  <View style={styles.surfaceSection}>
                    <Text style={styles.sectionTitle}>Artists</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                      {artists.map((artist) => renderSurfaceCard({
                        id: artist.id,
                        title: artist.name,
                        subtitle: `${artist.songs.length} song${artist.songs.length === 1 ? "" : "s"}`,
                        artwork: artist.artwork,
                        onPress: () => openArtist(artist),
                      }))}
                    </ScrollView>
                  </View>
                )}

                {albums.length > 0 && (
                  <View style={styles.surfaceSection}>
                    <Text style={styles.sectionTitle}>Albums</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                      {albums.map((album) => renderSurfaceCard({
                        id: album.id,
                        title: album.title,
                        subtitle: album.artist,
                        artwork: album.artwork,
                        onPress: () => openAlbum(album),
                      }))}
                    </ScrollView>
                  </View>
                )}

                {genres.length > 0 && (
                  <View style={styles.surfaceSection}>
                    <Text style={styles.sectionTitle}>Genres</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                      {genres.map((genre) => renderSurfaceCard({
                        id: genre.id,
                        title: genre.title,
                        subtitle: `${genre.songs.length} song${genre.songs.length === 1 ? "" : "s"}`,
                        artwork: genre.artwork,
                        onPress: () => openGenre(genre),
                      }))}
                    </ScrollView>
                  </View>
                )}

                {visiblePlaylists.length > 0 && (
                  <View style={styles.surfaceSection}>
                    <Text style={styles.sectionTitle}>Catalog Mixes</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                      {visiblePlaylists.map((playlist) => renderSurfaceCard({
                        id: playlist.id,
                        title: playlist.title,
                        subtitle: playlist.description,
                        artwork: playlist.artwork,
                        onPress: () => router.push("/cloud-playlists" as any),
                      }))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.sectionTitle}>Songs</Text>
              </View>
            }
            renderItem={renderSongItem}
          />
        )}
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  headerTextBox: { flex: 1 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(34,211,238,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontWeight: "700" },
  emptyIcon: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontWeight: "700",
  },
  list: { paddingBottom: 140 },
  feedHero: { marginBottom: 18 },
  feedBorder: { borderRadius: 28, padding: 2 },
  feedInner: {
    minHeight: 112,
    borderRadius: 26,
    padding: 18,
    backgroundColor: "rgba(18,7,31,0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feedCopy: { flex: 1, paddingRight: 12 },
  feedLabel: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  feedTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 7,
  },
  feedText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  surfaceSection: { marginBottom: 20 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  surfaceRow: { gap: 12, paddingRight: 18 },
  surfaceCard: { width: 132 },
  surfaceCover: {
    width: 132,
    height: 132,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  surfaceTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 9,
    lineHeight: 18,
  },
  surfaceSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 26,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  songCardActive: {
    backgroundColor: "rgba(168,85,247,0.13)",
    borderColor: "rgba(168,85,247,0.45)",
  },
  coverBorder: { width: 82, height: 82, borderRadius: 24, padding: 2 },
  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  songInfo: { flex: 1, marginLeft: 14 },
  songTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  artist: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
  },
  row: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  streamText: {
    color: COLORS.primary,
    marginLeft: 6,
    fontWeight: "800",
    fontSize: 12,
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  eqBox: { width: 58, alignItems: "center", justifyContent: "center" },
});
