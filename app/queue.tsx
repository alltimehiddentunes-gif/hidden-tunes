import { useEffect, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import HTImage from "../components/HTImage";
import AppShell from "../components/navigation/AppShell";
import { getMobileScrollTailPadding } from "../components/navigation/navigationConfig";
import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
import { logPlaybackUxSync } from "../utils/playbackDiagnostics";
import { isAudiobookChapterAppSong } from "../utils/audiobookPlaybackAdapter";
import {
  isEducationalQueueContext,
  isEducationalSessionAppSong,
} from "../utils/educationalPlaybackAdapter";
import {
  isPodcastAppSong,
  isPodcastQueueContext,
} from "../utils/podcastPlaybackAdapter";
import {
  getQueueLabels,
  type QueueContentKind,
} from "../utils/queueLabels";

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

function formatDuration(value: AppSong["duration"]) {
  if (value == null || value === "") return "";
  const raw = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(raw) || raw <= 0) return "";
  const seconds = raw > 10000 ? Math.round(raw / 1000) : Math.round(raw);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function isMotivationContext(context: PlaybackQueueContext) {
  return (
    context.source === "motivation" ||
    context.queueType === "motivation" ||
    clean(context.label).toLowerCase() === "motivationals"
  );
}

function resolveQueueContentKind(
  context: PlaybackQueueContext,
  currentSong: AppSong | null
): QueueContentKind {
  if (isPodcastQueueContext(context) || isPodcastAppSong(currentSong)) {
    return "podcast";
  }
  if (isAudiobookChapterAppSong(currentSong)) {
    return "audiobook";
  }
  if (
    isEducationalQueueContext(context) ||
    isEducationalSessionAppSong(currentSong)
  ) {
    return "lecture";
  }
  if (isMotivationContext(context)) {
    return "motivation";
  }
  if (clean(currentSong?.sourceName).toLowerCase() === "audiobook") {
    return "audiobook";
  }
  return "music";
}

/** Human session title — never expose raw "unknown" / debug sources. */
function getSessionContextLabel(
  context: PlaybackQueueContext,
  currentSong: AppSong | null,
  kind: QueueContentKind
) {
  const candidates = [
    context.contextTitle,
    context.albumTitle,
    context.label,
    context.artistName,
    currentSong?.album,
    currentSong?.channelTitle,
    currentSong?.artist,
    currentSong?.user?.name,
    context.genre,
    context.mood,
  ]
    .map(clean)
    .filter(Boolean)
    .filter((value) => {
      const lower = value.toLowerCase();
      return lower !== "unknown" && lower !== "null" && lower !== "undefined";
    });

  if (candidates.length) return candidates[0];

  if (kind === "podcast") return "Podcast";
  if (kind === "audiobook") return "Audiobook";
  if (kind === "motivation") return "Motivationals";
  if (kind === "lecture") return "Lectures";
  return "Hidden Tunes";
}

function buildFallbackQueue(
  currentSong: AppSong | null,
  onlineSongs: AppSong[],
  songs: AppSong[]
) {
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
  const insets = useSafeAreaInsets();
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
    return activeQueue.length
      ? activeQueue
      : buildFallbackQueue(currentSong, onlineSongs, songs);
  }, [activeQueue, currentSong, onlineSongs, songs]);

  const currentIndex = useMemo(() => {
    if (currentSong?.id && queueSongs.length) {
      const byId = queueSongs.findIndex(
        (song) => String(song.id) === String(currentSong.id)
      );
      if (byId >= 0) return byId;
    }
    if (
      activeQueue.length &&
      activeQueueIndex >= 0 &&
      activeQueueIndex < queueSongs.length
    ) {
      return activeQueueIndex;
    }
    if (!currentSong) return -1;
    return queueSongs.findIndex(
      (song) => String(song.id) === String(currentSong.id)
    );
  }, [activeQueue.length, activeQueueIndex, currentSong, queueSongs]);

  const rows = useMemo<QueueRow[]>(() => {
    return queueSongs.map((song, queueIndex) => ({
      song,
      queueIndex,
      isCurrent:
        queueIndex === currentIndex ||
        (Boolean(currentSong?.id) &&
          String(song.id) === String(currentSong?.id)),
    }));
  }, [currentIndex, currentSong?.id, queueSongs]);

  const currentRow = useMemo(
    () => rows.find((row) => row.isCurrent) || null,
    [rows]
  );
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

  const queueContext = activeQueueContext || { source: "queue" as const };
  const contentKind = resolveQueueContentKind(queueContext, currentSong);
  const labels = getQueueLabels(contentKind);
  const sessionContextLabel = getSessionContextLabel(
    queueContext,
    currentSong,
    contentKind
  );
  const sessionCount = queueSongs.length;
  const smartOn = smartAutoplayEnabled || activeQueueMode === "smart";
  const positionText =
    currentIndex >= 0 && sessionCount > 0
      ? labels.positionLabel(currentIndex + 1, sessionCount)
      : `${sessionCount} ${sessionCount === 1 ? labels.singular.toLowerCase() : labels.plural.toLowerCase()}`;
  const scrollTail = getMobileScrollTailPadding(insets.bottom);
  const sessionArtwork = currentRow?.song || currentSong;

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

    void playSong(row.song, queueSongs, row.queueIndex, context).catch(
      (error) => {
        if (__DEV__) console.log("Queue play error:", error);
      }
    );
    router.push("/player" as any);
  }

  function renderQueueRow(
    row: QueueRow,
    displayIndex: number,
    section: "current" | "next" | "previous"
  ) {
    const tag = row.isCurrent
      ? "NOW"
      : section === "next"
        ? String(displayIndex + 1).padStart(2, "0")
        : String(row.queueIndex + 1).padStart(2, "0");
    const durationText = formatDuration(row.song.duration);
    const subtitle =
      contentKind === "podcast" || contentKind === "audiobook"
        ? row.song.album || getArtist(row.song)
        : getArtist(row.song);

    return (
      <TouchableOpacity
        key={`${section}-${row.song.id}-${row.queueIndex}`}
        style={[styles.queueItem, row.isCurrent && styles.queueItemActive]}
        activeOpacity={0.86}
        onPress={() => playQueueRow(row)}
        accessibilityRole="button"
        accessibilityLabel={`${row.song.title}, ${subtitle}`}
      >
        <Text
          style={[styles.queueNumber, row.isCurrent && styles.queueNumberActive]}
        >
          {tag}
        </Text>

        <View
          style={[
            styles.queueCoverWrap,
            row.isCurrent && styles.queueCoverWrapActive,
          ]}
        >
          <HTImage
            source={row.song}
            style={styles.queueCover}
            contentFit="cover"
          />
        </View>

        <View style={styles.queueInfo}>
          <Text numberOfLines={2} style={styles.queueTitle}>
            {row.song.title}
          </Text>
          <Text numberOfLines={1} style={styles.queueArtist}>
            {subtitle}
          </Text>
          {durationText ? (
            <Text numberOfLines={1} style={styles.queueDuration}>
              {durationText}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.queuePlayButton,
            row.isCurrent && styles.queuePlayButtonActive,
          ]}
        >
          {row.isCurrent && isPlaying ? (
            <NeonEQ isPlaying={isPlaying} size="small" />
          ) : (
            <Ionicons
              name={row.isCurrent ? "pause" : "play"}
              size={15}
              color={row.isCurrent ? "#000" : COLORS.text}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, 12) + 4 },
          ]}
        >
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/library" as any);
            }}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Queue</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {labels.sessionLabel}
            </Text>
          </View>

          <View style={styles.headerControls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => void previousSong()}
              accessibilityLabel="Previous"
            >
              <Ionicons name="play-skip-back" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => void nextSong()}
              accessibilityLabel="Next"
            >
              <Ionicons
                name="play-skip-forward"
                size={18}
                color={COLORS.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollTail },
          ]}
        >
          <View style={styles.sessionCard}>
            {sessionArtwork ? (
              <HTImage
                source={sessionArtwork}
                style={styles.sessionArt}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.sessionArt, styles.sessionArtFallback]}>
                <Ionicons
                  name={
                    contentKind === "podcast"
                      ? "mic"
                      : contentKind === "audiobook"
                        ? "book"
                        : "list"
                  }
                  size={20}
                  color={COLORS.cyan}
                />
              </View>
            )}

            <View style={styles.sessionCopy}>
              <Text numberOfLines={1} style={styles.sessionTitle}>
                {sessionContextLabel}
              </Text>
              <Text numberOfLines={1} style={styles.sessionMeta}>
                {positionText}
                {" · "}
                {sessionCount}{" "}
                {sessionCount === 1
                  ? labels.singular.toLowerCase()
                  : labels.plural.toLowerCase()}
              </Text>
              <View style={styles.smartRow}>
                <Text style={styles.smartLabel}>Smart Queue</Text>
                <Text
                  style={[
                    styles.smartValue,
                    smartOn && styles.smartValueOn,
                  ]}
                >
                  {smartOn ? "On" : "Off"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{labels.currentLabel}</Text>
          {currentRow ? (
            renderQueueRow(currentRow, 0, "current")
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="musical-notes" size={28} color={COLORS.primary} />
              <Text style={styles.emptyText}>{labels.emptyCurrent}</Text>
              <Text style={styles.emptySubtext}>
                Start playback to build a session.
              </Text>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.sectionLabel, styles.sectionLabelFlush]}>
                {labels.upNext}
              </Text>
              <Text style={styles.sectionSubLabel}>
                {labels.remainingLabel(upNextRows.length)}
              </Text>
            </View>
          </View>

          {upNextRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="list" size={26} color={COLORS.cyan} />
              <Text style={styles.emptyText}>{labels.emptyNext}</Text>
              <Text style={styles.emptySubtext}>{labels.emptyNextHint}</Text>
            </View>
          ) : (
            upNextRows.map((row, index) => renderQueueRow(row, index, "next"))
          )}

          {previousRows.length > 0 ? (
            <View style={styles.previousSection}>
              <Text style={styles.sectionLabel}>{labels.playedEarlier}</Text>
              {previousRows
                .slice(-5)
                .map((row, index) => renderQueueRow(row, index, "previous"))}
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
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 6,
    minWidth: 0,
  },
  headerControls: {
    flexDirection: "row",
    gap: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sessionArt: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  sessionArtFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
    backgroundColor: "rgba(34,211,238,0.08)",
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sessionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  smartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  smartLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  smartValue: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  smartValueOn: {
    color: COLORS.primaryGlow,
  },
  sectionHeaderRow: {
    marginTop: 18,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionLabelFlush: {
    marginBottom: 2,
  },
  sectionSubLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  queueItem: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flexDirection: "row",
    alignItems: "center",
  },
  queueItemActive: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(34,211,238,0.28)",
  },
  queueNumber: {
    width: 32,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  queueNumberActive: {
    color: COLORS.cyan,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  queueCoverWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  queueCoverWrapActive: {
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
  },
  queueCover: {
    width: "100%",
    height: "100%",
  },
  queueInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
  },
  queueTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  queueArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  queueDuration: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.85,
  },
  queuePlayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  queuePlayButtonActive: {
    backgroundColor: COLORS.cyan,
    borderColor: "rgba(255,255,255,0.28)",
  },
  previousSection: {
    marginTop: 14,
    opacity: 0.7,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text,
    fontWeight: "800",
    marginTop: 8,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 260,
    textAlign: "center",
  },
});
