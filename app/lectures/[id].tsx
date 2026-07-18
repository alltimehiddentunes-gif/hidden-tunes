import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, GRADIENTS } from "@/constants/theme";
import { usePlayerState } from "@/context/PlayerContext";
import {
  fetchEducationalProgramDetail,
  formatEducationalDuration,
} from "@/services/lecturesCatalogApi";
import {
  loadEducationalProgress,
  type EducationalProgressEntry,
} from "@/services/educationalProgress";
import type { EducationalProgram, EducationalSession } from "@/types/education";
import {
  isEducationalSessionAppSong,
  parseEducationalSessionSongId,
} from "@/utils/educationalPlaybackAdapter";
import {
  EducationalPlaybackController,
  isEducationalPlayGenerationStale,
  nextEducationalPlayGeneration,
} from "@/utils/educationalPlayback";
import { mergeEducationalSessions } from "@/utils/educationalOrdering";
import { goBackWithinLectures } from "@/utils/lectureNavigation";
import { joinLectureRequest, lecturePageTrace } from "@/utils/lectureRequestJoin";
import { lectureTrace } from "@/utils/lectureTapTrace";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "@/utils/tapPressGuard";

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const playSessionTapGuard = createTapGuardState();

const SessionRow = memo(function SessionRow({
  session,
  isPlaying,
  isLoading,
  hasResume,
  onPress,
}: {
  session: EducationalSession;
  isPlaying: boolean;
  isLoading: boolean;
  hasResume?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.sessionRow, isPlaying && styles.sessionRowActive]}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={[styles.sessionBadge, isPlaying && styles.sessionBadgeActive]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={isPlaying ? "#00130D" : COLORS.primary} />
        ) : isPlaying ? (
          <Ionicons name="volume-high" size={16} color="#00130D" />
        ) : (
          <Text style={styles.sessionNumber}>{session.lessonNumber ?? session.sequenceNumber}</Text>
        )}
      </View>
      <View style={styles.sessionCopy}>
        <Text numberOfLines={2} style={[styles.sessionTitle, isPlaying && styles.sessionTitleActive]}>
          {session.title}
        </Text>
        <Text style={styles.sessionMeta}>
          {formatEducationalDuration(session.durationSeconds) || "Lesson"}
          {hasResume ? " · Resume" : ""}
        </Text>
      </View>
      <Ionicons
        name={isPlaying ? "pause-circle" : "play-circle"}
        size={24}
        color={isPlaying ? COLORS.primary : COLORS.textMuted}
      />
    </TouchableOpacity>
  );
});

export default function EducationalProgramDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const programId = String(params.id || "").trim();
  const { currentSong } = usePlayerState();
  const insets = useSafeAreaInsets();

  const [program, setProgram] = useState<EducationalProgram | null>(null);
  const [sessions, setSessions] = useState<EducationalSession[]>([]);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionHasMore, setSessionHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [playErrorText, setPlayErrorText] = useState<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [savedProgress, setSavedProgress] = useState<EducationalProgressEntry | null>(null);
  const [loadedPageNumbers, setLoadedPageNumbers] = useState<number[]>([1]);
  const [nextSessionPage, setNextSessionPage] = useState(2);
  const playControllerRef = useRef<AbortController | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const playGenerationRef = useRef(0);
  const hasDetailContentRef = useRef(false);

  const loadDetail = useCallback(
    async (options?: { page?: number; reset?: boolean; signal?: AbortSignal }) => {
      const page = options?.page || 1;
      const reset = options?.reset === true;
      const requestKey = `lecture:${programId}:page:${page}`;

      const detail = await joinLectureRequest(requestKey, () =>
        fetchEducationalProgramDetail(programId, {
          sessionPage: page,
          sessionLimit: 40,
          signal: options?.signal,
        })
      );

      setProgram(detail.program);
      setSessions((current) => {
        const merged = reset
          ? detail.sessions
          : mergeEducationalSessions(current, detail.sessions);
        return merged;
      });
      setSessionPage(detail.pagination.page);
      setSessionHasMore(detail.pagination.hasMore);
      setLoadedPageNumbers((current) => {
        const pages = reset ? [page] : [...new Set([...current, page])].sort((a, b) => a - b);
        return pages;
      });
      setNextSessionPage(detail.pagination.hasMore ? page + 1 : page);
      hasDetailContentRef.current = true;
      EducationalPlaybackController.mergeProgramSessions(detail.program.id, detail.sessions, {
        loadedPage: page,
        hasMore: detail.pagination.hasMore,
        direction: reset ? "append" : "append",
      });
    },
    [programId]
  );

  useEffect(() => {
    lecturePageTrace("mount", { screen: "lectures/detail", programId });
    return () => lecturePageTrace("unmount", { screen: "lectures/detail", programId });
  }, [programId]);

  useEffect(() => {
    if (!programId) {
      setLoading(false);
      setError(true);
      return undefined;
    }

    const controller = new AbortController();
    playControllerRef.current?.abort();
    // Keep rendered course content visible while refreshing the same program.
    if (!hasDetailContentRef.current) {
      setLoading(true);
    }
    setError(false);
    setSessionPage(1);
    setLoadedPageNumbers([1]);
    setNextSessionPage(2);

    void loadDetail({ page: 1, reset: true, signal: controller.signal })
      .catch((loadError) => {
        if (hasAbortError(loadError)) {
          lecturePageTrace("fetch_aborted", { key: `lecture:${programId}` });
          return;
        }
        if (!hasDetailContentRef.current) {
          setProgram(null);
          setSessions([]);
          setError(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [loadDetail, programId]);

  useEffect(
    () => () => {
      playControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!program?.id) {
      setSavedProgress(null);
      return;
    }

    let cancelled = false;
    void loadEducationalProgress(program.id).then((entry) => {
      if (!cancelled) setSavedProgress(entry);
    });

    return () => {
      cancelled = true;
    };
  }, [program?.id]);

  const activeSessionId = useMemo(() => {
    if (!isEducationalSessionAppSong(currentSong)) return null;
    return parseEducationalSessionSongId(currentSong?.id);
  }, [currentSong]);

  const meta = useMemo(
    () =>
      [
        program?.educatorName,
        program?.institutionName,
        formatEducationalDuration(program?.totalDurationSeconds),
        program?.sessionCount ? `${program.sessionCount} lessons` : null,
        program?.language?.toUpperCase(),
      ]
        .filter(Boolean)
        .join(" · "),
    [program]
  );

  const playSession = useCallback(
    async (sessionId: string, startPositionMillis = 0) => {
      if (!program || !sessionId || loadingSessionId) return;
      if (shouldIgnoreDuplicateTap(playSessionTapGuard, `lecture-play:${sessionId}`)) {
        return;
      }

      playControllerRef.current?.abort();
      const controller = new AbortController();
      playControllerRef.current = controller;
      const generation = nextEducationalPlayGeneration();
      playGenerationRef.current = generation;

      setLoadingSessionId(sessionId);
      setPlayError(false);
      setPlayErrorText(null);

      const tapId = `lecture-${Date.now()}-${sessionId.slice(0, 8)}`;
      lectureTrace("LECTURE_TAP", tapId, {
        lectureId: program.id,
        sessionId,
        source: "detail_session_row",
      });

      try {
        const session = sessions.find((entry) => entry.id === sessionId);
        if (!session) return;

        // Single authoritative entry: EducationalPlaybackController → playSong only.
        // PlayerContext may call playQueue internally; Lectures must not call playQueue separately.
        const result = await EducationalPlaybackController.playSessionFromProgram({
          program,
          sessions,
          startSessionId: sessionId,
          loadedPageNumbers,
          nextPage: nextSessionPage,
          minLoadedPage: loadedPageNumbers[0] || 1,
          hasMore: sessionHasMore,
          startPositionMillis,
          signal: controller.signal,
          playGeneration: generation,
          tapId,
        });

        if (controller.signal.aborted || isEducationalPlayGenerationStale(generation)) return;

        if (!result.ok) {
          // Never fall back to /tv-player for lectures — that opens Hidden Tunes TV
          // with no TV session ("No more playable stations...").
          setPlayError(true);
          setPlayErrorText(
            result.error ||
              "This lesson could not start right now. Progressive lectures play in the audio player."
          );
          return;
        }

        router.push("/player");
      } catch (loadError) {
        if (hasAbortError(loadError) || isEducationalPlayGenerationStale(generation)) return;
        setPlayError(true);
        setPlayErrorText(
          loadError instanceof Error
            ? loadError.message
            : "This lesson could not start right now."
        );
      } finally {
        if (!controller.signal.aborted && playGenerationRef.current === generation) {
          setLoadingSessionId(null);
        }
      }
    },
    [
      loadedPageNumbers,
      loadingSessionId,
      nextSessionPage,
      program,
      sessionHasMore,
      sessions,
    ]
  );

  const loadMoreSessions = useCallback(async () => {
    if (!sessionHasMore || loadingMore) return;
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    try {
      await loadDetail({ page: sessionPage + 1, reset: false, signal: controller.signal });
    } catch (error) {
      if (!hasAbortError(error)) throw error;
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [loadDetail, loadingMore, sessionHasMore, sessionPage]);

  const firstSession = sessions[0] || null;
  const resumeSessionId = savedProgress?.sessionId || firstSession?.id || null;

  // Only block the whole screen on the first load — never flash away cached course content.
  if (loading && !program) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </LinearGradient>
    );
  }

  if ((error || !program) && !loading) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.center}>
        <Text style={styles.errorTitle}>Course unavailable</Text>
        <TouchableOpacity style={styles.backPill} onPress={goBackWithinLectures}>
          <Text style={styles.backPillText}>Go back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (!program) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(12, insets.top) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBackWithinLectures}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {program.title}
        </Text>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onEndReached={() => void loadMoreSessions()}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.hero}>
            {program.artworkUrl ? (
              <Image source={{ uri: program.artworkUrl }} style={styles.heroArt} contentFit="cover" />
            ) : (
              <View style={[styles.heroArt, styles.heroArtFallback]}>
                <Ionicons name="school" size={42} color={COLORS.cyan} />
              </View>
            )}
            <Text style={styles.title}>{program.title}</Text>
            {program.subtitle ? <Text style={styles.subtitle}>{program.subtitle}</Text> : null}
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            {program.description ? <Text style={styles.description}>{program.description}</Text> : null}
            {program.rightsType ? (
              <Text style={styles.rights}>Rights: {program.rightsType}</Text>
            ) : null}

            {savedProgress && resumeSessionId ? (
              <TouchableOpacity
                style={styles.continueCard}
                onPress={() =>
                  void playSession(resumeSessionId, savedProgress.positionMillis || 0)
                }
              >
                <Text style={styles.continueKicker}>CONTINUE LEARNING</Text>
                <Text style={styles.continueTitle} numberOfLines={2}>
                  {savedProgress.sessionTitle || "Resume lesson"}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => firstSession && void playSession(firstSession.id)}
              >
                <Ionicons name="play" size={18} color="#00130D" />
                <Text style={styles.primaryActionText}>Start course</Text>
              </TouchableOpacity>
            </View>

            {playError ? (
              <Text style={styles.playError}>
                {playErrorText || "This lesson could not start right now."}
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Lessons</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            isPlaying={activeSessionId === item.id}
            isLoading={loadingSessionId === item.id}
            hasResume={savedProgress?.sessionId === item.id && (savedProgress.positionMillis || 0) > 0}
            onPress={() => void playSession(item.id)}
          />
        )}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "800" },
  listContent: { paddingHorizontal: 18, paddingBottom: 120 },
  hero: { paddingBottom: 12 },
  heroArt: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 22,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroArtFallback: { alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 15, marginTop: 6 },
  meta: { color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  description: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: 12 },
  rights: { color: COLORS.textMuted, fontSize: 12, marginTop: 8, fontStyle: "italic" },
  continueCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(56,189,248,0.12)",
  },
  continueKicker: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  continueTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 6 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.cyan,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryActionText: { color: "#001018", fontWeight: "800" },
  playError: { color: COLORS.primary, marginTop: 10, fontSize: 13 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 20,
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  sessionRowActive: { backgroundColor: "rgba(56,189,248,0.06)" },
  sessionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sessionBadgeActive: { backgroundColor: COLORS.cyan },
  sessionNumber: { color: COLORS.text, fontWeight: "800", fontSize: 12 },
  sessionCopy: { flex: 1 },
  sessionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  sessionTitleActive: { color: COLORS.cyan },
  sessionMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  footerLoader: { paddingVertical: 18, alignItems: "center" },
  errorTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginBottom: 12 },
  backPill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backPillText: { color: COLORS.text, fontWeight: "700" },
});
