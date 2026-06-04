import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../components/HTImage";
import { COLORS, GRADIENTS } from "../constants/theme";
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

function getSongDurationSeconds(song: HiddenTunesSong) {
  const raw = (song as any).raw || {};
  const value = (song as any).duration ?? (song as any).durationSeconds ?? raw.duration ?? raw.durationSeconds;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10000 ? Math.round(parsed / 1000) : Math.round(parsed);
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "Hidden Tunes";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function GenreScreen() {
  const params = useLocalSearchParams();
  const { playSong } = usePlayerActions();

  const title = String(params.title || params.query || "Genre");
  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadGenreCatalog();
  }, [title]);

  async function loadGenreCatalog() {
    try {
      setLoading(true);
      setCatalog(getCachedHiddenTunesCatalog() || (await fetchHiddenTunesCatalog()));
    } catch (error) {
      console.log("Genre catalog load error:", error);
      setCatalog(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadGenreCatalog();
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

  const artists = useMemo(() => {
    const seen = new Map<string, { name: string; songCount: number; artworkSource: HiddenTunesSong }>();
    tracks.forEach((song) => {
      const name = String(song.artist || (song as any).user?.name || "Hidden Tunes").trim();
      if (!name) return;
      const key = clean(name);
      const existing = seen.get(key);
      if (existing) {
        existing.songCount += 1;
      } else {
        seen.set(key, { name, songCount: 1, artworkSource: song });
      }
    });
    return Array.from(seen.values()).slice(0, 12);
  }, [tracks]);

  const heroArtwork = useMemo(
    () => resolveEntityArtwork({ title, genre: title, mood: title }, tracks),
    [title, tracks]
  );

  const featuredSongs = useMemo(() => tracks.slice(0, 6), [tracks]);

  function handlePlaySong(song: HiddenTunesSong, queueIndex: number) {
    void playSong(song, tracks, queueIndex, {
      source: String(params.type || "genre") === "mood" ? "mood" : "genre",
      label: title,
      genre: String(params.type || "genre") === "mood" ? song.genre : title,
      mood: String(params.type || "genre") === "mood" ? title : song.mood,
    });
  }

  function playGenre() {
    if (tracks[0]) handlePlaySong(tracks[0], 0);
  }

  function openArtist(name: string) {
    router.push({ pathname: "/artist", params: { artist: name } } as any);
  }

  function openAlbum(album: HiddenTunesAlbumCatalogItem) {
    router.push({
      pathname: "/album",
      params: { album: album.title, artist: album.artist, thumbnail: album.artwork },
    } as any);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View pointerEvents="none" style={styles.glowPurple} />
      <View pointerEvents="none" style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>GENRE</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Songs tagged in the current catalog</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.85}>
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
          refreshControl={<RefreshControl tintColor={COLORS.primary} refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <>
              <LinearGradient colors={GRADIENTS.card} style={styles.hero}>
                <View style={styles.heroArtworkWrap}>
                  <HTImage
                    source={{ title, genre: title, mood: title, artwork: heroArtwork }}
                    candidates={tracks}
                    style={styles.heroArtwork}
                    contentFit="cover"
                  />
                </View>
                <View style={styles.roomBadge}>
                  <Ionicons name={String(params.type || "genre") === "mood" ? "sparkles" : "radio"} size={13} color={COLORS.primaryGlow} />
                  <Text style={styles.roomBadgeText}>{String(params.type || "genre") === "mood" ? "MOOD ROOM" : "GENRE ROOM"}</Text>
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>
                  {tracks.length} song{tracks.length === 1 ? "" : "s"} • {artists.length} artist{artists.length === 1 ? "" : "s"} • {albums.length} release{albums.length === 1 ? "" : "s"}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.playButton, tracks.length === 0 && styles.disabledButton]}
                  disabled={tracks.length === 0}
                  onPress={playGenre}
                >
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.playButtonText}>Play {String(params.type || "genre") === "mood" ? "Mood" : "Genre"}</Text>
                </TouchableOpacity>
              </LinearGradient>

              {featuredSongs.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Featured</Text>
                    <Text style={styles.sectionSub}>Artwork-rich starters for this room</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {featuredSongs.map((song, index) => (
                      <TouchableOpacity key={`${song.id}-${index}`} activeOpacity={0.86} style={styles.albumCard} onPress={() => handlePlaySong(song, index)}>
                        <HTImage source={song} style={styles.albumCover} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={2}>{song.title}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {albums.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Albums</Text>
                    <Text style={styles.sectionSub}>Releases connected to this tag</Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {albums.map((album) => (
                      <TouchableOpacity key={album.id} activeOpacity={0.86} style={styles.albumCard} onPress={() => openAlbum(album)}>
                        <HTImage source={album} style={styles.albumCover} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{album.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {artists.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Artists In The Room</Text>
                    <Text style={styles.sectionSub}>Creators represented in this sound</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {artists.map((artist) => (
                      <TouchableOpacity key={artist.name} activeOpacity={0.86} style={styles.artistCard} onPress={() => openArtist(artist.name)}>
                        <HTImage source={artist.artworkSource} candidates={tracks} style={styles.artistImage} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={1}>{artist.name}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{artist.songCount} song{artist.songCount === 1 ? "" : "s"}</Text>
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
          renderItem={({ item, index }) => {
            const duration = getSongDurationSeconds(item);

            return (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => handlePlaySong(item, index)}>
              <HTImage source={item} style={styles.cover} contentFit="cover" />
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.trackTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.trackArtist}>{item.artist}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="pricetag" size={13} color={COLORS.primaryGlow} />
                  <Text style={styles.metaText}>{duration ? formatDuration(duration) : item.genre || item.mood || "Hidden Tunes"}</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowPurple: { position: "absolute", top: 30, left: -125, width: 290, height: 290, borderRadius: 145, backgroundColor: "rgba(168,85,247,0.18)" },
  glowCyan: { position: "absolute", top: 340, right: -150, width: 330, height: 330, borderRadius: 165, backgroundColor: "rgba(34,211,238,0.1)" },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 2 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  listContent: { paddingHorizontal: 18, paddingBottom: 150 },
  hero: { alignItems: "center", borderRadius: 30, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", overflow: "hidden", marginBottom: 24 },
  heroArtworkWrap: { width: 198, height: 198, borderRadius: 34, padding: 4, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  heroArtwork: { width: "100%", height: "100%", borderRadius: 30, backgroundColor: COLORS.card },
  roomBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.075)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginTop: 18 },
  roomBadgeText: { color: COLORS.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: { color: COLORS.text, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 12, lineHeight: 40 },
  heroSubtitle: { color: COLORS.textMuted, fontSize: 13, fontWeight: "700", marginTop: 10, textAlign: "center", lineHeight: 19 },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, gap: 8, marginTop: 18 },
  disabledButton: { opacity: 0.45 },
  playButtonText: { color: "#000", fontSize: 14, fontWeight: "900" },
  albumSection: { marginBottom: 10 },
  sectionHeader: { marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sectionSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  albumRow: { gap: 12, paddingBottom: 8 },
  albumCard: { width: 132 },
  artistCard: { width: 124, alignItems: "center" },
  artistImage: { width: 104, height: 104, borderRadius: 52, backgroundColor: COLORS.card, marginBottom: 8 },
  albumCover: { width: 132, height: 132, borderRadius: 18, marginBottom: 8, backgroundColor: COLORS.card },
  albumTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  albumArtist: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  trackCard: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, padding: 10, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)" },
  cover: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.card },
  info: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  trackArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 },
  metaText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "800" },
  playCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
});
