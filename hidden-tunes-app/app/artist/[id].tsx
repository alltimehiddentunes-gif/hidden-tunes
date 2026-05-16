import { useEffect, useMemo, useState } from "react";
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

import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import NeonEQ from "../../components/NeonEQ";
import AddToPlaylistButton from "../../components/AddToPlaylistButton";

import { COLORS, GRADIENTS } from "../../constants/theme";
import { usePlayer } from "../../context/PlayerContext";
import {
  getHiddenTunesArtistById,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { FALLBACK_ARTWORK } from "../../utils/artwork";

function getArtwork(item: any) {
  return item?.artwork || item?.cover || item?.thumbnail || FALLBACK_ARTWORK;
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

export default function ArtistScreen() {
  const { id } = useLocalSearchParams();
  const { playSong, currentSong, isPlaying } = usePlayer() as any;

  const [artist, setArtist] = useState<HiddenTunesArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tracks = useMemo(
    () => (artist?.tracks || []).map(safeSong),
    [artist?.tracks]
  );

  const albums = useMemo(() => artist?.albums || [], [artist?.albums]);

  useEffect(() => {
    loadArtist(true);
  }, [id]);

  async function loadArtist(showLoader = true) {
    try {
      if (showLoader) setLoading(true);

      const data = await getHiddenTunesArtistById(String(id));
      setArtist(data);
    } catch (error) {
      console.log("Load artist error:", error);
      setArtist(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadArtist(false);
  }

  async function handlePlay(track: HiddenTunesNormalizedSong) {
    const normalized = safeSong(track);

    const startIndex = Math.max(
      0,
      tracks.findIndex((item) => item.id === normalized.id)
    );

    await playSong(normalized as any, tracks as any, startIndex);
    router.push("/player" as any);
  }

  async function playArtist() {
    if (!tracks.length) return;

    await playSong(tracks[0] as any, tracks as any, 0);
    router.push("/player" as any);
  }

  async function playShuffle() {
    if (!tracks.length) return;

    const shuffled = shuffleSongs(tracks);
    await playSong(shuffled[0] as any, shuffled as any, 0);
    router.push("/player" as any);
  }

  function openAlbum(album: HiddenTunesAlbum) {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    } as any);
  }

  if (loading) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Opening artist world...</Text>
      </LinearGradient>
    );
  }

  if (!artist) {
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

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.screen}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={COLORS.primary}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      >
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
            <Image
              source={{ uri: artist.artwork || getArtwork(tracks[0]) }}
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
              keyExtractor={(item, index) => `${item.id}-${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.albumCard}
                  activeOpacity={0.86}
                  onPress={() => openAlbum(item)}
                >
                  <Image
                    source={{ uri: item.artwork || getArtwork(item.tracks?.[0]) }}
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

        {tracks.length === 0 ? (
          <View style={styles.emptyTracks}>
            <Ionicons name="musical-notes-outline" size={52} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No songs here yet</Text>
            <Text style={styles.emptyText}>
              This artist world is still waiting for tracks.
            </Text>
          </View>
        ) : (
          tracks.map((track, index) => {
            const active = currentSong?.id === track.id;

            return (
              <TouchableOpacity
                key={`${track.id}-${index}`}
                style={[styles.trackRow, active && styles.trackRowActive]}
                onPress={() => handlePlay(track)}
                activeOpacity={0.86}
              >
                <View style={styles.trackNumberBox}>
                  {active ? (
                    <NeonEQ isPlaying={isPlaying} size="small" />
                  ) : (
                    <Text style={styles.trackNumber}>{index + 1}</Text>
                  )}
                </View>

                <Image source={{ uri: getArtwork(track) }} style={styles.trackCover} />

                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>

                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.album || artist.name}{" "}
                    {track.duration ? `• ${formatDuration(track.duration)}` : ""}
                  </Text>
                </View>

                <AddToPlaylistButton track={track as any} />

                <Ionicons
                  name={active && isPlaying ? "pause-circle" : "play-circle"}
                  size={30}
                  color={COLORS.primary}
                  style={styles.playIcon}
                />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
