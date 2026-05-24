import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";

export default function QueueScreen() {
  const { playSong, playAudiusTrack } = usePlayerActions();
  const { songs, onlineSongs } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const queueSongs = [...onlineSongs, ...songs];
  const nextSongs = queueSongs.filter(
    (song) => String(song.id) !== String(currentSong?.id)
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Queue</Text>
          <Text style={styles.headerSubtitle}>Up next</Text>
        </View>

        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionLabel}>Now Playing</Text>

        {currentSong ? (
          <View style={styles.nowPlayingCard}>
            <LinearGradient colors={GRADIENTS.neon} style={styles.nowCoverBorder}>
              <Image
                source={
                  typeof currentSong.cover === "string"
                    ? { uri: currentSong.cover }
                    : currentSong.cover
                }
                style={styles.nowCover}
              />
            </LinearGradient>

            <View style={styles.nowInfo}>
              <Text numberOfLines={1} style={styles.nowTitle}>
                {currentSong.title}
              </Text>

              <Text numberOfLines={1} style={styles.nowArtist}>
                {currentSong.artist || currentSong.user?.name || "Unknown Artist"}
              </Text>

              <View style={styles.liveBadge}>
                <NeonEQ isPlaying={isPlaying} size="small" />
                <Text style={styles.liveText}>
                  {isPlaying ? "Playing now" : "Paused"}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="musical-notes" size={34} color={COLORS.primary} />
            <Text style={styles.emptyText}>No song playing</Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 30 }]}>Next Songs</Text>

        {nextSongs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No songs in queue</Text>
          </View>
        ) : (
          nextSongs.map((song, index) => (
            <TouchableOpacity
              key={`${song.id}-${index}`}
              style={styles.queueItem}
              activeOpacity={0.85}
              onPress={() => {
                if (song.isOnline || song.streamUrl) {
                  void playAudiusTrack(song).catch((error) => {
                    if (__DEV__) console.log("Legacy queue Audius play error:", error);
                  });
                  return;
                }

                void playSong(song).catch((error) => {
                  if (__DEV__) console.log("Legacy queue play error:", error);
                });
              }}
            >
              <Text style={styles.queueNumber}>{index + 1}</Text>

              <Image
                source={
                  typeof song.cover === "string" ? { uri: song.cover } : song.cover
                }
                style={styles.queueCover}
              />

              <View style={styles.queueInfo}>
                <Text numberOfLines={1} style={styles.queueTitle}>
                  {song.title}
                </Text>

                <Text numberOfLines={1} style={styles.queueArtist}>
                  {song.artist || song.user?.name || "Unknown Artist"}
                </Text>
              </View>

              <Ionicons name="play-circle" size={29} color={COLORS.primary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
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
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
    fontWeight: "700",
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 130,
  },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  nowPlayingCard: {
    borderRadius: 32,
    padding: 16,
    backgroundColor: "rgba(168,85,247,0.13)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.38)",
    flexDirection: "row",
    alignItems: "center",
  },

  nowCoverBorder: {
    width: 96,
    height: 96,
    borderRadius: 26,
    padding: 2,
  },

  nowCover: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    backgroundColor: COLORS.card,
  },

  nowInfo: {
    flex: 1,
    marginLeft: 16,
  },

  nowTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  nowArtist: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },

  liveBadge: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.32)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  liveText: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: "900",
  },

  queueItem: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },

  queueNumber: {
    width: 26,
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },

  queueCover: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },

  queueInfo: {
    flex: 1,
    marginLeft: 14,
  },

  queueTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  queueArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },

  emptyCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyText: {
    color: COLORS.textMuted,
    fontWeight: "800",
    marginTop: 8,
  },
});