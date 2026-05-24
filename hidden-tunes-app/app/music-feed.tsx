import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import NeonEQ from "@/components/NeonEQ";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "@/context/PlayerContext";
import {
  fetchHiddenTunesSongs,
  HiddenTunesSong,
} from "@/services/hiddenTunes";

export default function MusicFeedScreen() {
  const { playAudiusTrack } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const [songs, setSongs] = useState<HiddenTunesSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    setLoading(true);
    const data = await fetchHiddenTunesSongs();
    setSongs(data);
    setLoading(false);
  };

  const refreshSongs = async () => {
    setRefreshing(true);
    const data = await fetchHiddenTunesSongs();
    setSongs(data);
    setRefreshing(false);
  };

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.title}>Hidden Tunes</Text>
          <Text style={styles.subtitle}>Curated streams from the catalog</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={refreshSongs}>
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
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshSongs}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.feedHero}>
              <LinearGradient colors={GRADIENTS.neon} style={styles.feedBorder}>
                <View style={styles.feedInner}>
                  <View>
                    <Text style={styles.feedLabel}>CATALOG STREAMS</Text>
                    <Text style={styles.feedTitle}>
                      {songs.length} tracks ready
                    </Text>
                    <Text style={styles.feedText}>
                      Stream the latest from Hidden Tunes.
                    </Text>
                  </View>

                  <NeonEQ isPlaying={isPlaying} size="medium" />
                </View>
              </LinearGradient>
            </View>
          }
          renderItem={({ item }) => {
            const active = currentSong?.id === String(item.id);

            return (
              <TouchableOpacity
                style={[styles.songCard, active && styles.songCardActive]}
                activeOpacity={0.88}
                onPress={() => playAudiusTrack(item)}
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
          }}
        />
      )}
    </LinearGradient>
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

  headerTextBox: {
    flex: 1,
  },

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

  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },

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

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontWeight: "700",
  },

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

  list: {
    paddingBottom: 140,
  },

  feedHero: {
    marginBottom: 18,
  },

  feedBorder: {
    borderRadius: 28,
    padding: 2,
  },

  feedInner: {
    minHeight: 112,
    borderRadius: 26,
    padding: 18,
    backgroundColor: "rgba(18,7,31,0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

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

  coverBorder: {
    width: 82,
    height: 82,
    borderRadius: 24,
    padding: 2,
  },

  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },

  songInfo: {
    flex: 1,
    marginLeft: 14,
  },

  songTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  artist: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

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

  eqBox: {
    width: 58,
    alignItems: "center",
    justifyContent: "center",
  },
});
