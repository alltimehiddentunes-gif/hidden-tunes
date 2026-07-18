import { useEffect, useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, useSegments } from "expo-router";

import HTImage from "../components/HTImage";
import AppShell from "../components/navigation/AppShell";
import { getMobileShellContentPaddingBottom } from "../components/navigation/navigationConfig";
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

/** Display-only title cleanup (does not mutate playback metadata). */
function formatQueueTitle(title: string) {
  return clean(title).replace(/\bEoisode\b/gi, "Episode");
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

function looksLikeMotivationSong(song?: AppSong | null) {
  if (!song) return false;
  const id = clean(song.id).toLowerCase();
  if (id.startsWith("motivation-item-")) return true;
  return clean(song.sourceName).toLowerCase() === "motivationals";
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
  if (isMotivationContext(context) || looksLikeMotivationSong(currentSong)) {
    return "motivation";
  }
  return "music";
}

function songBelongsToKind(song: AppSong, kind: QueueContentKind) {
  if (kind === "music") return true;
  if (kind === "podcast") return looksLikePodcastSong(song);
  if (kind === "audiobook") {
    return (
      isAudiobookChapterAppSong(song) ||
      clean(song.sourceName).toLowerCase() === "audiobook"
    );
  }
  if (kind === "lecture") return isEducationalSessionAppSong(song);
  if (kind === "motivation") return looksLikeMotivationSong(song);
  return true;
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

const QUEUE_PROBE_HEAD = "eaac165";

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments();
  const probeLoggedRef = useRef(false);
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

  const queueContext = activeQueueContext || { source: "queue" as const };
  const contentKind = resolveQueueContentKind(
    queueContext,
    currentSong,
    queueSongs
  );
  const labels = getQueueLabels(contentKind);

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

  /**
   * Presentation filter only: when a vertical session is active, hide foreign
   * Smart Queue / catalog bleed from the episode list. Does not mutate PlayerContext.
   */
  const displayRows = useMemo<QueueRow[]>(() => {
    return queueSongs
      .map((song, queueIndex) => ({
        song,
        queueIndex,
        isCurrent:
          queueIndex === currentIndex ||
          (Boolean(currentSong?.id) &&
            String(song.id) === String(currentSong?.id)),
      }))
      .filter((row) => songBelongsToKind(row.song, contentKind));
  }, [contentKind, currentIndex, currentSong?.id, queueSongs]);

  const foreignHiddenCount = Math.max(
    0,
    queueSongs.length - displayRows.length
  );

  const displayCurrentIndex = useMemo(() => {
    const idx = displayRows.findIndex((row) => row.isCurrent);
    return idx;
  }, [displayRows]);

  const listRows = useMemo(() => {
    if (displayCurrentIndex < 0) return displayRows;
    return displayRows.slice(displayCurrentIndex);
  }, [displayCurrentIndex, displayRows]);

  const upNextCount = Math.max(0, listRows.length - (displayCurrentIndex >= 0 ? 1 : 0));

  useEffect(() => {
    if (!currentSong?.id || currentIndex < 0) return;
    logPlaybackUxSync("queue_active_track_sync_confirmed", {
      songId: currentSong.id,
      currentIndex,
      queueLength: queueSongs.length,
      activeQueueIndex,
    });
  }, [activeQueueIndex, currentIndex, currentSong?.id, queueSongs.length]);

  const sessionContextLabel = getSessionContextLabel(
    queueContext,
    currentSong,
    contentKind
  );
  const sessionCount = displayRows.length;
  const smartOn = smartAutoplayEnabled || activeQueueMode === "smart";
  const positionText =
    displayCurrentIndex >= 0 && sessionCount > 0
      ? labels.positionLabel(displayCurrentIndex + 1, sessionCount)
      : `${sessionCount} ${
          sessionCount === 1
            ? labels.singular.toLowerCase()
            : labels.plural.toLowerCase()
        }`;
  // AppShell already reserves MiniPlayer + nav; add extra so last rows clear the pill.
  const scrollTail =
    getMobileShellContentPaddingBottom(insets.bottom, true) + 24;

  useEffect(() => {
    if (!__DEV__ || probeLoggedRef.current) return;
    probeLoggedRef.current = true;
    console.log("[QUEUE_PROBE]", {
      pathname,
      segments,
      component: "QueueScreen",
      head: QUEUE_PROBE_HEAD,
      contentKind,
      queueItemCount: queueSongs.length,
      displayItemCount: sessionCount,
      foreignHiddenCount,
      currentItemTitle: currentSong?.title || null,
      source: queueContext.source || null,
      sourceName: currentSong?.sourceName || null,
      queueType: queueContext.queueType || null,
      sessionLabel: labels.sessionLabel,
      executionEnvironment: Constants.executionEnvironment || null,
      appOwnership: Constants.appOwnership || null,
    });
  }, [
    contentKind,
    currentSong?.sourceName,
    currentSong?.title,
    foreignHiddenCount,
    labels.sessionLabel,
    pathname,
    queueContext.queueType,
    queueContext.source,
    queueSongs.length,
    segments,
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

  function renderQueueRow(row: QueueRow, displayIndex: number) {
    const tag = row.isCurrent ? "NOW" : String(displayIndex).padStart(2, "0");
    const durationText = formatDuration(row.song.duration);
    const subtitle =
      contentKind === "podcast" || contentKind === "audiobook"
        ? row.song.album || getArtist(row.song)
        : getArtist(row.song);
    const title = formatQueueTitle(row.song.title || "");

    return (
      <TouchableOpacity
        key={`row-${row.song.id}-${row.queueIndex}`}
        style={[styles.queueItem, row.isCurrent && styles.queueItemActive]}
        activeOpacity={0.86}
        onPress={() => playQueueRow(row)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
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
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.queueArtist}>
            {subtitle}
            {durationText ? `  ·  ${durationText}` : ""}
          </Text>
        </View>

        {row.isCurrent ? (
          <View style={[styles.queuePlayButton, styles.queuePlayButtonActive]}>
            {isPlaying ? (
              <NeonEQ isPlaying={isPlaying} size="small" />
            ) : (
              <Ionicons name="pause" size={14} color="#000" />
            )}
          </View>
        ) : (
          <Ionicons
            name="play"
            size={16}
            color={COLORS.textMuted}
            style={styles.queuePlayIcon}
          />
        )}
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
            <Text numberOfLines={1} style={styles.sessionTitle}>
              {sessionContextLabel}
            </Text>
            <Text numberOfLines={2} style={styles.sessionMeta}>
              {positionText}
              {"  ·  "}
              {sessionCount}{" "}
              {sessionCount === 1
                ? labels.singular.toLowerCase()
                : labels.plural.toLowerCase()}
              {"  ·  "}
              Smart Queue {smartOn ? "On" : "Off"}
            </Text>
            {foreignHiddenCount > 0 ? (
              <Text numberOfLines={1} style={styles.sessionHint}>
                Hiding {foreignHiddenCount} non-
                {labels.singular.toLowerCase()} item
                {foreignHiddenCount === 1 ? "" : "s"} from this list
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, styles.sectionLabelFlush]}>
              {labels.plural}
            </Text>
            <Text style={styles.sectionSubLabel}>
              {upNextCount > 0
                ? labels.remainingLabel(upNextCount)
                : labels.currentLabel}
            </Text>
          </View>

          {listRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="list" size={24} color={COLORS.cyan} />
              <Text style={styles.emptyText}>{labels.emptyCurrent}</Text>
              <Text style={styles.emptySubtext}>{labels.emptyNextHint}</Text>
            </View>
          ) : (
            listRows.map((row, index) =>
              renderQueueRow(row, row.isCurrent ? 0 : index)
            )
          )}
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
    paddingBottom: 6,
    paddingRight: 72,
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
    width: 36,
    height: 36,
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
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
    lineHeight: 15,
  },
  sessionHint: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 5,
  },
  sectionHeaderRow: {
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
    marginBottom: 5,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
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
    width: 40,
    height: 40,
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
    width: 30,
    height: 30,
    borderRadius: 15,
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
  queuePlayIcon: {
    marginRight: 6,
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
