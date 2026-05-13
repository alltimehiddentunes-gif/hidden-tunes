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

import { COLORS, GRADIENTS } from "../constants/theme";

const downloadedSongs = [
  {
    id: "1",
    title: "Lonely Road",
    artist: "Caasi Wills",
    cover: require("../assets/images/cover1.jpg"),
    size: "8.4 MB",
  },
  {
    id: "2",
    title: "Midnight Drive",
    artist: "Hidden Tunes",
    cover: require("../assets/images/cover2.jpg"),
    size: "6.1 MB",
  },
  {
    id: "3",
    title: "Porch Light Still On",
    artist: "Caasi Wills",
    cover: require("../assets/images/cover3.jpg"),
    size: "7.3 MB",
  },
];

export default function DownloadsScreen() {
  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Offline</Text>
          <Text style={styles.headerSubtitle}>Saved music</Text>
        </View>

        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="download-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <LinearGradient colors={GRADIENTS.neon} style={styles.storageBorder}>
          <View style={styles.storageCard}>
            <View>
              <Text style={styles.storageLabel}>Storage</Text>
              <Text style={styles.storageValue}>21.8 MB</Text>
            </View>

            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Downloaded</Text>

        {downloadedSongs.map((song) => (
          <TouchableOpacity key={song.id} style={styles.songCard}>
            <Image source={song.cover} style={styles.cover} />

            <View style={styles.songInfo}>
              <Text numberOfLines={1} style={styles.songTitle}>
                {song.title}
              </Text>

              <Text numberOfLines={1} style={styles.artist}>
                {song.artist}
              </Text>

              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-done" size={12} color={COLORS.cyan} />
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            </View>

            <View style={styles.rightSection}>
              <Text style={styles.size}>{song.size}</Text>

              <TouchableOpacity style={styles.moreButton}>
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
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
    paddingBottom: 120,
  },

  storageBorder: {
    borderRadius: 30,
    padding: 2,
    marginBottom: 28,
  },

  storageCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: "rgba(18,7,31,0.95)",
  },

  storageLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  storageValue: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
  },

  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 18,
    overflow: "hidden",
  },

  progressFill: {
    width: "38%",
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 18,
  },

  songCard: {
    marginBottom: 14,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },

  cover: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },

  songInfo: {
    flex: 1,
    marginLeft: 14,
  },

  songTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  artist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
  },

  offlineBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(34,211,238,0.11)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  offlineText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
  },

  rightSection: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 72,
  },

  size: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  moreButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});