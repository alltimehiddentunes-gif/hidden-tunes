import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import LiveWaveform from "../components/LiveWaveform";
import NeonEQ from "../components/NeonEQ";
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

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const openQueue = useCallback(() => {
    router.push("/queue" as any);
  }, []);

  const handleSeekComplete = useCallback(
    (value: number) => {
      void seekTo(value);
    },
    [seekTo]
  );

  const handlePrevious = useCallback(() => {
    void previousSong();
  }, [previousSong]);

  const handleTogglePlayPause = useCallback(() => {
    void togglePlayPause();
  }, [togglePlayPause]);

  const handleNext = useCallback(() => {
    void nextSong();
  }, [nextSong]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.player} style={styles.container}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
        <View style={styles.glowCenter} />

        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
            <Ionicons name="chevron-down" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Now Playing</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {isPlaying ? "Live playback" : "Ready"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={openQueue}
          >
            <Ionicons name="list" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.artworkStage}>
            <View style={styles.artworkGlow} />
            <LinearGradient colors={GRADIENTS.neon} style={styles.artworkBorder}>
              <Image source={{ uri: artwork }} style={styles.artwork} />
            </LinearGradient>

            <View style={styles.eqBadge}>
              <NeonEQ isPlaying={isPlaying} size="medium" />
            </View>
          </View>

          <View style={styles.meta}>
            <View style={styles.statusPill}>
              <Ionicons
                name={isPlaying ? "radio" : "musical-notes"}
                size={13}
                color={COLORS.primaryGlow}
              />
              <Text style={styles.statusText}>
                {isPlaying ? "Playing" : currentSong ? "Paused" : "No track"}
              </Text>
            </View>

            <Text numberOfLines={2} style={styles.title}>{title}</Text>
            <Text numberOfLines={1} style={styles.artist}>{artist}</Text>
          </View>

          <View style={styles.waveformPanel}>
            <LiveWaveform
              isPlaying={isPlaying}
              size="large"
              color={COLORS.primaryGlow}
            />
          </View>

          <View style={styles.progressPanel}>
            <Slider
              value={position}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              minimumTrackTintColor={COLORS.primaryGlow}
              maximumTrackTintColor="rgba(255,255,255,0.16)"
              thumbTintColor={COLORS.primary}
              disabled={!currentSong || duration <= 0}
              onSlidingComplete={handleSeekComplete}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>

          <View style={styles.controlsDock}>
          <View style={styles.controls}>
            <TouchableOpacity
              accessibilityLabel="Previous track"
              style={styles.secondaryControl}
              disabled={!currentSong}
              onPress={handlePrevious}
            >
              <Ionicons name="play-skip-back" size={26} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Play or pause"
              style={[styles.primaryControl, !currentSong && styles.disabledControl]}
              disabled={!currentSong}
              onPress={handleTogglePlayPause}
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
              onPress={handleNext}
            >
              <Ionicons name="play-skip-forward" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
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
  glowCenter: {
    position: "absolute",
    top: 190,
    alignSelf: "center",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(168,85,247,0.12)",
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
  headerCopy: {
    alignItems: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  content: {
    paddingBottom: 28,
  },
  artworkStage: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 34,
  },
  artworkGlow: {
    position: "absolute",
    width: "78%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  artworkBorder: {
    width: "84%",
    aspectRatio: 1,
    borderRadius: 42,
    padding: 2,
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
    backgroundColor: COLORS.card,
  },
  eqBadge: {
    position: "absolute",
    right: 28,
    bottom: 18,
    minWidth: 54,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,4,24,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  meta: {
    marginTop: 24,
    alignItems: "center",
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  waveformPanel: {
    marginTop: 24,
    minHeight: 92,
    borderRadius: 28,
    paddingHorizontal: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  progressPanel: {
    marginTop: 24,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  controlsDock: {
    marginTop: 28,
    borderRadius: 32,
    paddingVertical: 18,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
