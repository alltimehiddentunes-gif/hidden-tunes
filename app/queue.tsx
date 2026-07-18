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
  PODCAST_EPISODE_SONG_PREFIX,
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

function isJunkLabel(value: string) {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower === "unknown" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "hidden tunes" ||
    lower === "queue"
  );
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

function looksLikePodcastSong(song?: AppSong | null) {
  if (!song) return false;
  if (isPodcastAppSong(song)) return true;
  const id = clean(song.id).toLowerCase();
  if (id.startsWith(PODCAST_EPISODE_SONG_PREFIX)) return true;
  const sourceName = clean(song.sourceName).toLowerCase();
  if (sourceName === "podcast" || sourceName === "podcasts") return true;
  const genre = clean(song.genre).toLowerCase();
  if (genre === "podcast" || genre === "podcasts") return true;
  return false;
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
  currentSong: AppSong | null,
  queueSongs: AppSong[]
): QueueContentKind {
  if (
    isPodcastQueueContext(context) ||
    looksLikePodcastSong(currentSong) ||
    queueSongs.some(looksLikePodcastSong)
  ) {
    return "podcast";
  }
  if (
    isAudiobookChapterAppSong(currentSong) ||
    queueSongs.some((song) => isAudiobookChapterAppSong(song)) ||
    clean(currentSong?.sourceName).toLowerCase() === "audiobook"
  ) {
    return "audiobook";
  }
  if (
    isEducationalQueueContext(context) ||
    isEducationalSessionAppSong(currentSong) ||
    queueSongs.some((song) => isEducationalSessionAppSong(song))
  ) {
    return "lecture";
  }
  if (isMotivationContext(context)) {
    return "motivation";
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
    kind === "podcast" ? null : context.label,
    context.artistName,
    currentSong?.album,
    currentSong?.channelTitle,
    currentSong?.artist,
    currentSong?.user?.name,
    context.label,
    context.genre,
    context.mood,
  ]
    .map(clean)
    .filter((value) => !isJunkLabel(value));

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
  const { playSong } = usePlayerActions();
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
  const contentKind = resolveQueueContentKind(
    queueContext,
    currentSong,
    queueSongs
  );
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
      : `${sessionCount} ${
          sessionCount === 1
            ? labels.singular.toLowerCase()
            : labels.plural.toLowerCase()
        }`;
  // Extra room so last rows clear MiniPlayer + bottom nav on device.
  const scrollTail = getMobileScrollTailPadding(insets.bottom) + 28;

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[QUEUE_UI]", {
      contentKind,
      sessionLabel: labels.sessionLabel,
      sessionTitle: sessionContextLabel,
      source: queueContext.source,
      queueType: queueContext.queueType,
      contextType: queueContext.contextType,
      currentId: currentSong?.id || null,
      sourceName: currentSong?.sourceName || null,
      queueLength: sessionCount,
    });
  }, [
    contentKind,
    currentSong?.id,
    currentSong?.sourceName,
    labels.sessionLabel,
    queueContext.contextType,
    queueContext.queueType,
    queueContext.source,
    sessionContextLabel,
    sessionCount,
  ]);

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
            {durationText ? `  ·  ${durationText}` : ""}
          </Text>
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
              size={14}
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
            { paddingTop: Math.max(insets.top, 12) + 2 },
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

          {/* Spacer keeps title centered and clears floating settings/dev controls. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollTail },
          ]}
        >
          <View style={styles.sessionStrip}>
            <View style={styles.sessionCopy}>
              <Text numberOfLines={1} style={styles.sessionTitle}>
                {sessionContextLabel}
              </Text>
              <Text numberOfLines={1} style={styles.sessionMeta}>
                {positionText}
                {"  ·  "}
                {sessionCount}{" "}
                {sessionCount === 1
                  ? labels.singular.toLowerCase()
                  : labels.plural.toLowerCase()}
                {"  ·  "}
                Smart Queue {smartOn ? "On" : "Off"}
              </Text>
            </View>
          </View>

          {currentRow ? (
            <View style={styles.nowPlayingBlock}>
              <Text style={styles.sectionLabel}>{labels.currentLabel}</Text>
              {renderQueueRow(currentRow, 0, "current")}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="musical-notes" size={24} color={COLORS.primary} />
              <Text style={styles.emptyText}>{labels.emptyCurrent}</Text>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, styles.sectionLabelFlush]}>
              {labels.upNext}
            </Text>
            <Text style={styles.sectionSubLabel}>
              {labels.remainingLabel(upNextRows.length)}
            </Text>
          </View>

          {upNextRows.length === 0 ? (
            <View style={styles.emptyCard}>
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
                .slice(-4)
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
    paddingHorizontal: 14,
    paddingBottom: 8,
    paddingRight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  headerSpacer: {
    width: 40,
    height: 40,
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
    fontSize: 17,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 1,
    textAlign: "center",
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 14,
  },
  sessionStrip: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  sessionCopy: {
    minWidth: 0,
  },
  sessionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  sessionMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  nowPlayingBlock: {
    marginBottom: 4,
  },
  sectionHeaderRow: {
    marginTop: 10,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  sectionLabelFlush: {
    marginBottom: 0,
  },
  sectionSubLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  queueItem: {
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
  },
  queueItemActive: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(34,211,238,0.28)",
  },
  queueNumber: {
    width: 30,
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  queueNumberActive: {
    color: COLORS.cyan,
    letterSpacing: 0.3,
  },
  queueCoverWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
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
    marginLeft: 8,
    marginRight: 6,
  },
  queueTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  queueArtist: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  queuePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  queuePlayButtonActive: {
    backgroundColor: COLORS.cyan,
    borderColor: "rgba(255,255,255,0.28)",
  },
  previousSection: {
    marginTop: 12,
    opacity: 0.68,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text,
    fontWeight: "800",
    marginTop: 6,
    fontSize: 13,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 260,
    textAlign: "center",
  },
});
