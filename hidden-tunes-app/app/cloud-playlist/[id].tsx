import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import HTImage from "../../components/HTImage";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";
import {
  getHiddenTunesCloudPlaylistById,
  type HiddenTunesCloudPlaylist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";

function safeSong(song: HiddenTunesNormalizedSong) {
  const streamUrl = song.streamUrl || song.url || "";
  return {
    ...song,
    streamUrl,
    url: song.url || streamUrl,
    sourceName: "Hidden Tunes" as const,
  };
}

export default function CloudPlaylistScreen() {
  const { id } = useLocalSearchParams();
  const playlistId = String(id || "");

  const { playSong, playQueue } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const [playlist, setPlaylist] = useState<HiddenTunesCloudPlaylist | null>(null);
  const [loading, setLoading] = useState(true);

  const tracks = useMemo(
    () => (playlist?.tracks || []).map(safeSong).filter((song) => song.streamUrl || song.url),
    [playlist]
  );

  const loadPlaylist = useCallback(async () => {
    if (!playlistId) {
      setPlaylist(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getHiddenTunesCloudPlaylistById(playlistId);
      setPlaylist(data);
    } catch (error) {
      if (__DEV__) console.log("Load cloud playlist error:", error);
      setPlaylist(null);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useFocusEffect(
    useCallback(() => {
      void loadPlaylist();
    }, [loadPlaylist])
  );

  function handlePlayTrack(track: HiddenTunesNormalizedSong, index: number) {
    if (!tracks.length) return;

    void playSong(track as any, tracks as any, index).catch((error: unknown) => {
      if (__DEV__) console.log("Cloud playlist play error:", error);
    });
  }

  function handlePlayAll() {
    if (!tracks.length) return;

    if (playQueue) {
      void playQueue(tracks as any, 0).catch((error: unknown) => {
        if (__DEV__) console.log("Cloud playlist play-all error:", error);
      });
      return;
    }

    handlePlayTrack(tracks[0], 0);
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Hidden Tunes Playlist</Text>
          <Text style={styles.title} numberOfLines={2}>
            {playlist?.title || "Playlist"}
          </Text>
          {playlist?.description ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {playlist.description}
            </Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !playlist || !tracks.length ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This playlist is warming up</Text>
          <Text style={styles.emptyCopy}>
            Check back soon or browse Featured Playlists on Home.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.heroRow}>
            <HTImage uri={playlist.artwork} style={styles.artwork} />
            <View style={styles.heroMeta}>
              <Text style={styles.metaText}>
                {tracks.length} song{tracks.length === 1 ? "" : "s"}
              </Text>
              <TouchableOpacity style={styles.playButton} onPress={handlePlayAll}>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.playButtonText}>Play All</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={tracks}
            keyExtractor={(item, index) => String(item.id || `${item.title}-${index}`)}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const active =
                isPlaying &&
                String(currentSong?.id || "") === String(item.id || "");

              return (
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.trackRow, active && styles.trackRowActive]}
                  onPress={() => handlePlayTrack(item, index)}
                >
                  <Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text>
                  <HTImage uri={item.artwork} style={styles.trackArt} />
                  <View style={styles.trackCopy}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.title || "Unknown Song"}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.artist || "Hidden Tunes"}
                    </Text>
                  </View>
                  <Ionicons
                    name={active ? "pause-circle" : "play-circle-outline"}
                    size={24}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 58 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900", marginTop: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 6 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyCopy: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  heroRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  artwork: {
    width: 112,
    height: 112,
    borderRadius: 18,
  },
  heroMeta: {
    flex: 1,
    justifyContent: "flex-end",
    gap: 12,
  },
  metaText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "700" },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
  },
  playButtonText: { color: "#000", fontWeight: "900", fontSize: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 130 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  trackRowActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  rank: {
    width: 24,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  trackArt: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  trackCopy: { flex: 1 },
  trackTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  trackArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
});
