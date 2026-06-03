import { useMemo } from "react";
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

import AppShell from "../components/navigation/AppShell";
import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { useEmotionalFlowActive } from "../state/useEmotionalQueueSnapshot";
import { appSongToTrack } from "../utils/emotionalQueueTrackBridge";
import {
  buildEmotionalTransitionContext,
  explainEmotionalTransition,
} from "../utils/explainEmotionalTransition";
import { useEmotionalEngineSummary } from "../utils/useEmotionalEngineSummary";
import { useEmotionalIdentitySummary } from "../utils/useEmotionalIdentitySummary";

export default function QueueScreen() {
  const { playSong, nextSong, previousSong } = usePlayerActions();
  const { songs, onlineSongs, activeQueue, activeQueueIndex } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const emotionalFlowSettings = useEmotionalFlowSettings();
  const emotionalFlowActive = useEmotionalFlowActive();
  const identitySummary = useEmotionalIdentitySummary();
  const engineSummary = useEmotionalEngineSummary();

  const queueSongs = activeQueue.length ? activeQueue : [...onlineSongs, ...songs];
  const nextSongs = queueSongs
    .map((song, queueIndex) => ({ song, queueIndex }))
    .filter(({ song, queueIndex }) => {
      if (activeQueue.length) return queueIndex !== activeQueueIndex;
      return String(song.id) !== String(currentSong?.id);
    });

  const showSmartQueuePanel =
    emotionalFlowSettings.emotionalFlowEnabled &&
    (queueSongs.length > 0 || Boolean(currentSong));

  const engineInsightLines = useMemo(() => {
    if (!showSmartQueuePanel) {
      return [] as string[];
    }

    const lines: string[] = [];

    if (engineSummary.topWorld) {
      lines.push(`World · ${engineSummary.topWorld}`);
    }

    if (engineSummary.topMoods.length) {
      lines.push(`Mood · ${engineSummary.topMoods.slice(0, 2).join(" · ")}`);
    }

    if (engineSummary.flowStrength > 0) {
      lines.push(`Flow · ${Math.round(engineSummary.flowStrength * 100)}%`);
    }

    return lines;
  }, [engineSummary, showSmartQueuePanel]);

  const continuationByItemKey = useMemo(() => {
    if (!showSmartQueuePanel || nextSongs.length === 0) {
      return {} as Record<string, string>;
    }

    const context = buildEmotionalTransitionContext(emotionalFlowSettings);
    const reasons: Record<string, string> = {};
    let fromTrack = currentSong ? appSongToTrack(currentSong) : null;

    if (!fromTrack && activeQueue.length > 0) {
      const anchorIndex = Math.max(0, Math.min(activeQueueIndex, activeQueue.length - 1));
      fromTrack = appSongToTrack(activeQueue[anchorIndex]);
    }

    nextSongs.forEach(({ song, queueIndex }) => {
      if (!fromTrack) {
        return;
      }

      const toTrack = appSongToTrack(song);
      const reason = explainEmotionalTransition(fromTrack, toTrack, context);

      if (reason) {
        reasons[`${song.id}-${queueIndex}`] = reason;
      }

      fromTrack = toTrack;
    });

    return reasons;
  }, [
    activeQueue,
    activeQueueIndex,
    currentSong,
    emotionalFlowSettings,
    nextSongs,
    showSmartQueuePanel,
  ]);

  return (
    <AppShell>
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

        <View style={styles.headerControls}>
          <TouchableOpacity style={styles.iconButton} onPress={() => void previousSong()}>
            <Ionicons name="play-skip-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => void nextSong()}>
            <Ionicons name="play-skip-forward" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {showSmartQueuePanel ? (
          <View style={styles.smartPanel}>
            <View style={styles.smartPanelHeader}>
              <Ionicons name="sparkles" size={16} color={COLORS.cyan} />
              <Text style={styles.smartPanelTitle}>Smart Queue</Text>
              {emotionalFlowActive ? (
                <View style={styles.smartPill}>
                  <Text style={styles.smartPillText}>Flow active</Text>
                </View>
              ) : null}
            </View>

            {identitySummary ? (
              <Text style={styles.smartIdentity} numberOfLines={2}>
                {identitySummary}
              </Text>
            ) : null}

            {engineInsightLines.length > 0 ? (
              <View style={styles.engineInsightBlock}>
                {engineInsightLines.map((line) => (
                  <Text key={line} style={styles.engineInsightLine} numberOfLines={1}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {activeQueue.length > 0 ? (
              <Text style={styles.smartMeta}>
                {`Queue · ${activeQueue.length} tracks · position ${activeQueueIndex + 1}`}
              </Text>
            ) : queueSongs.length > 0 ? (
              <Text style={styles.smartMeta}>
                {`Catalog queue · ${queueSongs.length} tracks`}
              </Text>
            ) : null}
          </View>
        ) : null}

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

        <Text style={[styles.sectionLabel, { marginTop: 30 }]}>
          {showSmartQueuePanel && Object.keys(continuationByItemKey).length > 0
            ? "Smart Continuation"
            : "Next Songs"}
        </Text>

        {nextSongs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No songs in queue</Text>
          </View>
        ) : (
          nextSongs.map(({ song, queueIndex }, index) => {
            const itemKey = `${song.id}-${queueIndex}`;
            const continuationLabel = continuationByItemKey[itemKey];

            return (
            <TouchableOpacity
              key={`${song.id}-${index}`}
              style={styles.queueItem}
              activeOpacity={0.85}
              onPress={() => {
                void playSong(song, queueSongs, queueIndex, {
                  source: "queue",
                  label: "Queue",
                  artistName: song.artist || song.user?.name,
                  genre: song.genre,
                  mood: song.mood,
                }).catch((error) => {
                  if (__DEV__) console.log("Queue play error:", error);
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

                {continuationLabel ? (
                  <Text numberOfLines={2} style={styles.continuationLabel}>
                    {continuationLabel}
                  </Text>
                ) : null}
              </View>

              <Ionicons name="play-circle" size={29} color={COLORS.primary} />
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      </LinearGradient>
    </AppShell>
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

  headerControls: {
    flexDirection: "row",
    gap: 8,
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

  smartPanel: {
    marginBottom: 22,
    borderRadius: 28,
    padding: 16,
    backgroundColor: "rgba(34,211,238,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },

  smartPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  smartPanelTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },

  smartPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.4)",
  },

  smartPillText: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  smartIdentity: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    marginBottom: 8,
  },

  engineInsightBlock: {
    gap: 4,
    marginBottom: 8,
  },

  engineInsightLine: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: "800",
  },

  smartMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
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

  continuationLabel: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
    lineHeight: 15,
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
