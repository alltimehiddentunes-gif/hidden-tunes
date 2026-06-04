import { useEffect, useMemo } from "react";
import { logPlaybackUxSync } from "../utils/playbackDiagnostics";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import HTImage from "../components/HTImage";
import AppShell from "../components/navigation/AppShell";
import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";

type QueueRow = {
  song: AppSong;
  queueIndex: number;
  isCurrent: boolean;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function getArtist(song: AppSong) {
  return song.artist || song.user?.name || "Hidden Tunes";
}

function getSessionContextLabel(context: PlaybackQueueContext, currentSong: AppSong | null) {
  if (context.albumTitle) return context.albumTitle;
  if (context.label) return context.label;
  if (context.genre) return context.genre;
  if (context.mood) return context.mood;
  if (currentSong?.album) return currentSong.album;
  return "Hidden Tunes Session";
}

function getSessionKind(context: PlaybackQueueContext) {
  if (context.source === "album") return "Album Session";
  if (context.source === "radio") return "Radio Session";
  if (context.source === "genre") return "Genre Station";
  if (context.source === "mood") return "Mood Room";
  if (context.source === "search") return "Search Session";
  if (context.source === "playlist") return "Playlist Session";
  if (context.source === "smart_queue") return "Smart Session";
  return "Track Session";
}

function buildFallbackQueue(currentSong: AppSong | null, onlineSongs: AppSong[], songs: AppSong[]) {
  const seen = new Set<string>();
  const queue: AppSong[] = [];
  [currentSong, ...onlineSongs, ...songs].forEach((song) => {
    if (!song) return;
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return;
    seen.add(id);
    queue.push(song);
  });
  return queue;
}

export default function QueueScreen() {
  const { playSong, nextSong, previousSong } = usePlayerActions();
  const {
    songs,
    onlineSongs,
    activeQueue,
    activeQueueIndex,
    activeQueueContext,
    activeQueueMode,
    smartAutoplayEnabled,
  } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const queueSongs = useMemo(() => {
    return activeQueue.length ? activeQueue : buildFallbackQueue(currentSong, onlineSongs, songs);
  }, [activeQueue, currentSong, onlineSongs, songs]);

  const currentIndex = useMemo(() => {
    if (currentSong?.id && queueSongs.length) {
      const byId = queueSongs.findIndex(
        (song) => String(song.id) === String(currentSong.id)
      );
      if (byId >= 0) return byId;
    }
    if (activeQueue.length && activeQueueIndex >= 0 && activeQueueIndex < queueSongs.length) {
      return activeQueueIndex;
    }
    if (!currentSong) return -1;
    return queueSongs.findIndex((song) => String(song.id) === String(currentSong.id));
  }, [activeQueue.length, activeQueueIndex, currentSong, queueSongs]);

  const rows = useMemo<QueueRow[]>(() => {
    return queueSongs.map((song, queueIndex) => ({
      song,
      queueIndex,
      isCurrent:
        queueIndex === currentIndex ||
        (Boolean(currentSong?.id) && String(song.id) === String(currentSong?.id)),
    }));
  }, [currentIndex, currentSong?.id, queueSongs]);

  const currentRow = useMemo(() => rows.find((row) => row.isCurrent) || null, [rows]);
  const upNextRows = useMemo(
    () => rows.filter((row) => row.queueIndex > Math.max(currentIndex, -1)),
    [currentIndex, rows]
  );
  const previousRows = useMemo(
    () => rows.filter((row) => row.queueIndex < Math.max(currentIndex, 0)),
    [currentIndex, rows]
  );

  useEffect(() => {
    if (!currentSong?.id || currentIndex < 0) return;
    logPlaybackUxSync("queue_active_track_sync_confirmed", {
      songId: currentSong.id,
      currentIndex,
      queueLength: queueSongs.length,
      activeQueueIndex,
    });
  }, [activeQueueIndex, currentIndex, currentSong?.id, queueSongs.length]);

  const predictedNext = useMemo(() => {
    if (currentIndex < 0 || currentIndex + 1 >= queueSongs.length) return null;
    return queueSongs[currentIndex + 1] || null;
  }, [currentIndex, queueSongs]);
  const queueContext = activeQueueContext || { source: "queue" as const };
  const sessionKind = getSessionKind(queueContext);
  const sessionContextLabel = getSessionContextLabel(queueContext, currentSong);
  const sessionCount = queueSongs.length;
  const smartOn = smartAutoplayEnabled || activeQueueMode === "smart";

  function playQueueRow(row: QueueRow) {
    const context: PlaybackQueueContext = activeQueue.length
      ? queueContext
      : {
          source: "queue",
          label: "Queue",
          artistName: getArtist(row.song),
          genre: row.song.genre,
          mood: row.song.mood,
        };

    void playSong(row.song, queueSongs, row.queueIndex, context).catch((error) => {
      if (__DEV__) console.log("Queue play error:", error);
    });
    router.push("/player" as any);
  }

  function renderQueueRow(row: QueueRow, displayIndex: number, section: "current" | "next" | "previous") {
    const tag = row.isCurrent ? "NOW" : section === "next" ? String(displayIndex + 1).padStart(2, "0") : "PLAYED";

    return (
      <TouchableOpacity
        key={`${section}-${row.song.id}-${row.queueIndex}`}
        style={[styles.queueItem, row.isCurrent && styles.queueItemActive]}
        activeOpacity={0.86}
        onPress={() => playQueueRow(row)}
      >
        <Text style={[styles.queueNumber, row.isCurrent && styles.queueNumberActive]}>{tag}</Text>

        <LinearGradient
          colors={row.isCurrent ? GRADIENTS.neon : GRADIENTS.card}
          style={styles.queueCoverBorder}
        >
          <HTImage source={row.song} style={styles.queueCover} contentFit="cover" />
        </LinearGradient>

        <View style={styles.queueInfo}>
          <Text numberOfLines={1} style={styles.queueTitle}>{row.song.title}</Text>
          <Text numberOfLines={1} style={styles.queueArtist}>{getArtist(row.song)}</Text>
          <View style={styles.rowMetaLine}>
            {row.song.album ? <Text numberOfLines={1} style={styles.rowMetaText}>{row.song.album}</Text> : null}
            {row.song.genre ? <Text numberOfLines={1} style={styles.rowMetaText}>{row.song.genre}</Text> : null}
          </View>
        </View>

        <View style={[styles.queuePlayButton, row.isCurrent && styles.queuePlayButtonActive]}>
          {row.isCurrent && isPlaying ? (
            <NeonEQ isPlaying={isPlaying} size="small" />
          ) : (
            <Ionicons name={row.isCurrent ? "pause" : "play"} size={17} color={row.isCurrent ? "#000" : COLORS.text} />
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View pointerEvents="none" style={styles.glowPurple} />
        <View pointerEvents="none" style={styles.glowCyan} />
        <View pointerEvents="none" style={styles.glowCenter} />

        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Queue</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{sessionKind}</Text>
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

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.sessionBorder}>
            <View style={styles.sessionHero}>
              <View style={styles.sessionHeroGlow} pointerEvents="none" />
              <View style={styles.sessionHeaderRow}>
                <View style={styles.sessionIcon}>
                  <Ionicons name={queueContext.source === "album" ? "albums" : queueContext.source === "radio" ? "radio" : "list"} size={22} color={COLORS.cyan} />
                </View>
                <View style={styles.sessionCopy}>
                  <Text style={styles.sessionEyebrow}>{clean(queueContext.source).toUpperCase() || "QUEUE"}</Text>
                  <Text numberOfLines={1} style={styles.sessionTitle}>{sessionContextLabel}</Text>
                </View>
              </View>

              <View style={styles.sessionStatsRow}>
                <Text style={styles.sessionPill}>{sessionCount} Track Session</Text>
                <Text style={styles.sessionPill}>Position {currentIndex >= 0 ? currentIndex + 1 : 0}/{sessionCount}</Text>
                <Text style={[styles.sessionPill, smartOn && styles.smartPillActive]}>{smartOn ? "Smart On" : "Smart Off"}</Text>
              </View>

              {predictedNext ? (
                <View style={styles.predictedBox}>
                  <Text style={styles.predictedLabel}>UP NEXT</Text>
                  <Text numberOfLines={1} style={styles.predictedTitle}>{predictedNext.title}</Text>
                  <Text numberOfLines={1} style={styles.predictedArtist}>{getArtist(predictedNext)}</Text>
                </View>
              ) : (
                <View style={styles.predictedBox}>
                  <Text style={styles.predictedLabel}>UP NEXT</Text>
                  <Text style={styles.predictedTitle}>Session ending</Text>
                  <Text style={styles.predictedArtist}>Smart continuation can extend after the queue.</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          <Text style={styles.sectionLabel}>Current Track</Text>
          {currentRow ? (
            renderQueueRow(currentRow, 0, "current")
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="musical-notes" size={34} color={COLORS.primary} />
              <Text style={styles.emptyText}>No song playing</Text>
              <Text style={styles.emptySubtext}>Start a room, album, station, or track to build a session.</Text>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>Up Next</Text>
              <Text style={styles.sectionSubLabel}>{upNextRows.length} track{upNextRows.length === 1 ? "" : "s"} remaining</Text>
            </View>
            {smartOn ? (
              <View style={styles.smartBadge}>
                <Ionicons name="sparkles" size={12} color={COLORS.primaryGlow} />
                <Text style={styles.smartBadgeText}>Smart On</Text>
              </View>
            ) : null}
          </View>

          {upNextRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="list" size={30} color={COLORS.cyan} />
              <Text style={styles.emptyText}>Nothing queued next</Text>
              <Text style={styles.emptySubtext}>Album and radio sessions will appear here in playback order.</Text>
            </View>
          ) : (
            upNextRows.map((row, index) => renderQueueRow(row, index, "next"))
          )}

          {previousRows.length > 0 ? (
            <View style={styles.previousSection}>
              <Text style={styles.sectionLabel}>Played Earlier</Text>
              {previousRows.slice(-5).map((row, index) => renderQueueRow(row, index, "previous"))}
            </View>
          ) : null}
        </ScrollView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 54,
  },
  glowPurple: {
    position: "absolute",
    top: 24,
    left: -112,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  glowCyan: {
    position: "absolute",
    top: 310,
    right: -140,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  glowCenter: {
    position: "absolute",
    top: 146,
    alignSelf: "center",
    width: 240,
    height: 190,
    borderRadius: 120,
    backgroundColor: "rgba(168,85,247,0.11)",
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  headerControls: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3,
    textAlign: "center",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.3,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 168,
  },
  sessionBorder: {
    borderRadius: 30,
    padding: 1.5,
    marginBottom: 24,
  },
  sessionHero: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: "rgba(8,6,16,0.94)",
    overflow: "hidden",
  },
  sessionHeroGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -62,
    top: -70,
    backgroundColor: "rgba(34,211,238,0.14)",
  },
  sessionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sessionIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,211,238,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  sessionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },
  sessionStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 15,
  },
  sessionPill: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  smartPillActive: {
    color: COLORS.primaryGlow,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(168,85,247,0.28)",
  },
  predictedBox: {
    marginTop: 15,
    borderRadius: 20,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  predictedLabel: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  predictedTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 6,
  },
  predictedArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  sectionHeaderRow: {
    marginTop: 26,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  sectionSubLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: -6,
  },
  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  smartBadgeText: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  queueItem: {
    marginBottom: 12,
    padding: 11,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  queueItemActive: {
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(34,211,238,0.34)",
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  queueNumber: {
    width: 42,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  queueNumberActive: {
    color: COLORS.cyan,
    fontSize: 10,
  },
  queueCoverBorder: {
    width: 68,
    height: 68,
    borderRadius: 22,
    padding: 2,
  },
  queueCover: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  queueInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 13,
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
  rowMetaLine: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    overflow: "hidden",
  },
  rowMetaText: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "800",
    maxWidth: 110,
  },
  queuePlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  queuePlayButtonActive: {
    backgroundColor: COLORS.cyan,
    borderColor: "rgba(255,255,255,0.32)",
  },
  previousSection: {
    marginTop: 18,
    opacity: 0.72,
  },
  emptyCard: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text,
    fontWeight: "900",
    marginTop: 10,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 260,
    textAlign: "center",
  },
});
