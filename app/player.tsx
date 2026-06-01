import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AppShell from "../components/navigation/AppShell";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
} from "../context/PlayerContext";
import { FALLBACK_ARTWORK, getArtworkValue } from "../utils/artwork";

function formatTime(millis: number) {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

export default function PlayerScreen() {
  const { currentSong, isPlaying, isLoading } = usePlayerNowPlaying();
  const { positionMillis, durationMillis } = usePlayerProgress();
  const { togglePlayPause, nextSong, previousSong, seekTo } = usePlayerActions();

  const artwork = useMemo(() => {
    return getArtworkValue(currentSong) || FALLBACK_ARTWORK;
  }, [currentSong]);

  const title = currentSong?.title || "No track selected";
  const artist =
    currentSong?.artist || currentSong?.user?.name || "Hidden Tunes";
  const duration = Math.max(0, durationMillis || 0);
  const position = Math.max(0, Math.min(positionMillis || 0, duration || positionMillis || 0));

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.player} style={styles.container}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Now Playing</Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push("/queue" as any)}
          >
            <Ionicons name="list" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.artworkShell}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.artworkBorder}>
            <Image source={{ uri: artwork }} style={styles.artwork} />
          </LinearGradient>
        </View>

        <View style={styles.meta}>
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{artist}</Text>
        </View>

        <View style={styles.progressBlock}>
          <Slider
            value={position}
            minimumValue={0}
            maximumValue={duration > 0 ? duration : 1}
            minimumTrackTintColor={COLORS.primaryGlow}
            maximumTrackTintColor="rgba(255,255,255,0.16)"
            thumbTintColor={COLORS.primary}
            disabled={!currentSong || duration <= 0}
            onSlidingComplete={(value) => {
              void seekTo(value);
            }}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            accessibilityLabel="Previous track"
            style={styles.secondaryControl}
            disabled={!currentSong}
            onPress={() => void previousSong()}
          >
            <Ionicons name="play-skip-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Play or pause"
            style={[styles.primaryControl, !currentSong && styles.disabledControl]}
            disabled={!currentSong}
            onPress={() => void togglePlayPause()}
          >
            <Ionicons
              name={isLoading ? "sync" : isPlaying ? "pause" : "play"}
              size={34}
              color="#000"
            />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Next track"
            style={styles.secondaryControl}
            disabled={!currentSong}
            onPress={() => void nextSong()}
          >
            <Ionicons name="play-skip-forward" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
    paddingHorizontal: 22,
    paddingBottom: 130,
  },
  glowTop: {
    position: "absolute",
    top: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(168,85,247,0.22)",
  },
  glowBottom: {
    position: "absolute",
    right: -110,
    bottom: 130,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  artworkShell: {
    alignItems: "center",
    marginTop: 48,
  },
  artworkBorder: {
    width: "86%",
    aspectRatio: 1,
    borderRadius: 38,
    padding: 2,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
    backgroundColor: COLORS.card,
  },
  meta: {
    marginTop: 32,
    alignItems: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  progressBlock: {
    marginTop: 34,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  controls: {
    marginTop: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  secondaryControl: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  primaryControl: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  disabledControl: {
    opacity: 0.45,
  },
});
