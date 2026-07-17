import type { AppSong } from "@/context/PlayerContext";
import type { EducationalProgram, EducationalSession, EducationalSessionPlayItem } from "@/types/education";
import { fetchEducationalProgramDetail, fetchEducationalSessionPlayback } from "@/services/lecturesCatalogApi";
import { recordEducationalRecentlyPlayed } from "@/services/educationalRecentlyPlayed";
import { findEducationalSessionIndex } from "@/utils/educationalOrdering";
import {
  buildEducationalQueueContext,
  buildEducationalSessionQueueSongs,
  EDUCATIONAL_MAX_AUTO_NEXT_FAILURES,
  EDUCATIONAL_RESTART_THRESHOLD_MS,
  educationalSessionSongId,
  educationalSessionToAppSong,
  isEducationalAudioPlayback,
  parseEducationalSessionSongId,
} from "@/utils/educationalPlaybackAdapter";
import { lectureTrace, lectureUrlDiagnostics } from "@/utils/lectureTapTrace";
import {
  appendEducationalSessionPage,
  bumpEducationalQueueGeneration,
  clearEducationalPlaybackSession,
  createEducationalPlaybackSession,
  getEducationalPlaybackSession,
  getEducationalSessionIndex,
  mergeEducationalProgramSessions,
  prependEducationalSessionPage,
  setEducationalSessionActive,
  updateEducationalPlaybackSession,
} from "@/utils/educationalPlaybackSession";

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: ReturnType<typeof buildEducationalQueueContext>,
  queueMode?: "standard"
) => Promise<void>;

type SeekToFn = (millis: number) => Promise<void>;

export type EducationalPlayerBindings = {
  playSong: PlaySongFn;
  seekTo?: SeekToFn;
  getCurrentSongId: () => string | null;
  getPositionMillis: () => number;
};

let playerBindings: EducationalPlayerBindings | null = null;
let activePlayRequestId = 0;
let navigationInFlight = false;
let activePlayGeneration = 0;

export function nextEducationalPlayGeneration() {
  activePlayGeneration += 1;
  bumpEducationalQueueGeneration();
  return activePlayGeneration;
}

export function isEducationalPlayGenerationStale(generation?: number) {
  return typeof generation === "number" && generation !== activePlayGeneration;
}

function parseSessionIdFromSongId(songId?: string | null) {
  return parseEducationalSessionSongId(songId);
}

async function resolveEducationalSessionPlayItem(
  program: EducationalProgram,
  session: EducationalSession,
  signal?: AbortSignal
): Promise<EducationalSessionPlayItem | null> {
  const resolved = await fetchEducationalSessionPlayback(program.id, session.id, signal);
  if (!isEducationalAudioPlayback(resolved.mediaType, resolved.playableUrl, resolved.mimeType)) {
    return null;
  }

  return {
    ...session,
    playableUrl: resolved.playableUrl,
    mediaType: "audio",
    mimeType: resolved.mimeType || null,
  };
}

function isSessionGuardStale(input: {
  programId: string;
  queueGeneration: number;
  requestId: number;
}) {
  const session = getEducationalPlaybackSession();
  if (!session) return true;
  if (session.programId !== input.programId) return true;
  if (session.queueGeneration !== input.queueGeneration) return true;
  if (input.requestId !== activePlayRequestId) return true;
  return false;
}

async function fetchAndAppendNextPage(
  session: NonNullable<ReturnType<typeof getEducationalPlaybackSession>>,
  queueGeneration: number,
  signal?: AbortSignal
) {
  if (!session.hasMore || session.pendingPageRequest !== null) return false;

  const requestedPage = session.nextPage;
  const requestedProgramId = session.programId;

  updateEducationalPlaybackSession({
    pendingPageRequest: requestedPage,
    isLoadingMore: true,
  });

  try {
    const detail = await fetchEducationalProgramDetail(requestedProgramId, {
      sessionPage: requestedPage,
      sessionLimit: 40,
      signal,
    });

    const current = getEducationalPlaybackSession();
    if (
      !current ||
      current.programId !== requestedProgramId ||
      current.queueGeneration !== queueGeneration ||
      current.pendingPageRequest !== requestedPage
    ) {
      return false;
    }

    appendEducationalSessionPage(
      requestedProgramId,
      detail.sessions,
      {
        loadedPage: requestedPage,
        hasMore: detail.pagination.hasMore,
        nextPage: detail.pagination.hasMore ? requestedPage + 1 : requestedPage,
      },
      queueGeneration
    );

    return true;
  } catch {
    updateEducationalPlaybackSession({ pendingPageRequest: null, isLoadingMore: false });
    return false;
  }
}

async function fetchAndPrependPreviousPage(
  session: NonNullable<ReturnType<typeof getEducationalPlaybackSession>>,
  queueGeneration: number,
  signal?: AbortSignal
) {
  if (session.minLoadedPage <= 1 || session.pendingPageRequest !== null) return false;

  const requestedPage = session.minLoadedPage - 1;
  const requestedProgramId = session.programId;

  updateEducationalPlaybackSession({
    pendingPageRequest: requestedPage,
    isLoadingMore: true,
  });

  try {
    const detail = await fetchEducationalProgramDetail(requestedProgramId, {
      sessionPage: requestedPage,
      sessionLimit: 40,
      signal,
    });

    const current = getEducationalPlaybackSession();
    if (
      !current ||
      current.programId !== requestedProgramId ||
      current.queueGeneration !== queueGeneration ||
      current.pendingPageRequest !== requestedPage
    ) {
      return false;
    }

    prependEducationalSessionPage(
      requestedProgramId,
      detail.sessions,
      {
        loadedPage: requestedPage,
        minLoadedPage: requestedPage,
      },
      queueGeneration
    );

    return true;
  } catch {
    updateEducationalPlaybackSession({ pendingPageRequest: null, isLoadingMore: false });
    return false;
  }
}

export const EducationalPlaybackController = {
  bindPlayerActions(bindings: EducationalPlayerBindings | null) {
    playerBindings = bindings;
  },

  getSession() {
    return getEducationalPlaybackSession();
  },

  mergeProgramSessions(
    programId: string,
    sessions: EducationalSession[],
    pagination?: { loadedPage?: number; hasMore?: boolean; direction?: "append" | "prepend" }
  ) {
    return mergeEducationalProgramSessions(programId, sessions, pagination);
  },

  clearSession() {
    clearEducationalPlaybackSession();
    activePlayRequestId += 1;
    navigationInFlight = false;
  },

  async playSessionFromProgram(input: {
    program: EducationalProgram;
    sessions: EducationalSession[];
    startSessionId: string;
    loadedPageNumbers: number[];
    nextPage: number;
    minLoadedPage: number;
    hasMore: boolean;
    startPositionMillis?: number;
    signal?: AbortSignal;
    playGeneration?: number;
    tapId?: string;
  }) {
    const requestId = ++activePlayRequestId;
    const generation = input.playGeneration ?? nextEducationalPlayGeneration();
    const tapId = input.tapId || `lecture-${Date.now()}`;

    createEducationalPlaybackSession({
      program: input.program,
      sessions: input.sessions,
      startSessionId: input.startSessionId,
      loadedPageNumbers: input.loadedPageNumbers,
      nextPage: input.nextPage,
      minLoadedPage: input.minLoadedPage,
      hasMore: input.hasMore,
      queueGeneration: generation,
    });

    const startIndex = getEducationalSessionIndex(input.startSessionId);
    const result = await this.playSessionIndex(startIndex, requestId, {
      startPositionMillis: input.startPositionMillis,
      signal: input.signal,
      playGeneration: generation,
      tapId,
    });

    if (requestId !== activePlayRequestId) {
      lectureTrace("LECTURE_ERROR", tapId, { error: "Playback request was superseded." });
      return { ok: false as const, error: "Playback request was superseded." };
    }

    return result;
  },

  async playSessionIndex(
    index: number,
    requestId = ++activePlayRequestId,
    options?: {
      startPositionMillis?: number;
      signal?: AbortSignal;
      playGeneration?: number;
      tapId?: string;
    }
  ): Promise<
    | { ok: true; session: EducationalSessionPlayItem; song: AppSong }
    | { ok: false; error: string; session?: EducationalSession }
  > {
    const tapId = options?.tapId || `lecture-${Date.now()}`;

    if (navigationInFlight && requestId !== activePlayRequestId) {
      lectureTrace("LECTURE_ERROR", tapId, { error: "Playback request was superseded." });
      return { ok: false, error: "Playback request was superseded." };
    }

    navigationInFlight = true;

    try {
      const session = getEducationalPlaybackSession();
      const bindings = playerBindings;

      if (!session || !bindings?.playSong) {
        lectureTrace("LECTURE_ERROR", tapId, {
          error: "Educational session unavailable.",
          hasSession: Boolean(session),
          hasBindings: Boolean(bindings?.playSong),
        });
        return {
          ok: false,
          error:
            "Educational session unavailable. Lectures playback binding is not active.",
        };
      }

      if (index < 0 || index >= session.loadedSessions.length) {
        lectureTrace("LECTURE_ERROR", tapId, { error: "This lesson is unavailable.", index });
        return { ok: false, error: "This lesson is unavailable." };
      }

      const metadata = session.loadedSessions[index];
      const generation = options?.playGeneration ?? session.queueGeneration;

      if (isSessionGuardStale({
        programId: session.programId,
        queueGeneration: generation,
        requestId,
      })) {
        lectureTrace("LECTURE_ERROR", tapId, { error: "Playback request was superseded." });
        return { ok: false, error: "Playback request was superseded." };
      }

      lectureTrace("LECTURE_RESOLVE_START", tapId, {
        lectureId: session.program.id,
        sessionId: metadata.id,
        mediaType: metadata.contentFormat,
      });

      const resolved = await fetchEducationalSessionPlayback(
        session.program.id,
        metadata.id,
        options?.signal
      );

      lectureTrace("LECTURE_RESOLVE_RESULT", tapId, {
        lectureId: resolved.programId,
        sessionId: resolved.sessionId,
        mediaType: resolved.mediaType,
        mimeType: resolved.mimeType,
        duration: resolved.durationSeconds,
        ...lectureUrlDiagnostics(resolved.playableUrl),
      });

      if (isSessionGuardStale({
        programId: session.programId,
        queueGeneration: generation,
        requestId,
      })) {
        lectureTrace("LECTURE_SOURCE_REPLACED", tapId, { reason: "stale_after_resolve" });
        return { ok: false, error: "Playback request was superseded." };
      }

      if (!isEducationalAudioPlayback(resolved.mediaType, resolved.playableUrl, resolved.mimeType)) {
        lectureTrace("LECTURE_ERROR", tapId, {
          error: "unsupported_lecture_media",
          mediaType: resolved.mediaType,
          mimeType: resolved.mimeType,
          ...lectureUrlDiagnostics(resolved.playableUrl),
        });
        return {
          ok: false,
          error:
            "This lesson format is not supported in Lectures playback yet. Progressive MP3/MP4 lectures play as audio.",
          session: metadata,
        };
      }

      const playable: EducationalSessionPlayItem = {
        ...metadata,
        playableUrl: resolved.playableUrl,
        mediaType: "audio",
        mimeType: resolved.mimeType || null,
      };

      const activeSong = educationalSessionToAppSong(session.program, playable);
      lectureTrace("LECTURE_ITEM_MAPPED", tapId, {
        canonicalId: activeSong.id,
        playerKind: activeSong.type,
        source: activeSong.source,
        duration: activeSong.duration,
        ...lectureUrlDiagnostics(activeSong.audioUrl || activeSong.streamUrl),
      });

      const queueContext = buildEducationalQueueContext(session.program);
      const queueSongs = buildEducationalSessionQueueSongs(
        session.program,
        session.loadedSessions,
        metadata.id,
        activeSong
      );

      lectureTrace("LECTURE_PLAYER_CALL", tapId, {
        canonicalId: activeSong.id,
        queueLength: queueSongs.length,
        startIndex: index,
      });

      lectureTrace("LECTURE_NATIVE_LOAD_START", tapId, {
        canonicalId: activeSong.id,
        ...lectureUrlDiagnostics(activeSong.audioUrl || activeSong.streamUrl),
      });

      await bindings.playSong(activeSong, queueSongs, index, queueContext, "standard");

      lectureTrace("LECTURE_PLAYER_RECEIVED", tapId, {
        canonicalId: activeSong.id,
        result: "playSong_resolved",
      });
      lectureTrace("LECTURE_NATIVE_STATUS", tapId, {
        canonicalId: activeSong.id,
        status: "playSong_completed",
      });

      if (isSessionGuardStale({
        programId: session.programId,
        queueGeneration: generation,
        requestId,
      })) {
        lectureTrace("LECTURE_SOURCE_REPLACED", tapId, { reason: "stale_after_playSong" });
        return { ok: false, error: "Playback request was superseded." };
      }

      setEducationalSessionActive(metadata.id);

      const resumeMs = Math.max(0, Math.floor(options?.startPositionMillis || 0));
      if (resumeMs > 0 && bindings.seekTo) {
        await bindings.seekTo(resumeMs);
      }

      void recordEducationalRecentlyPlayed({
        programId: session.program.id,
        programTitle: session.program.title,
        programArtwork: session.program.artworkUrl || null,
        educatorName: session.program.educatorName || null,
        sessionId: metadata.id,
        sessionTitle: metadata.title,
      });

      return { ok: true, session: playable, song: activeSong };
    } catch (error) {
      const message = String((error as Error)?.message || "This lesson is unavailable.");
      lectureTrace("LECTURE_ERROR", tapId, {
        error: message,
        errorName: error instanceof Error ? error.name : "Error",
      });
      return {
        ok: false,
        error: message,
      };
    } finally {
      navigationInFlight = false;
    }
  },

  async ensureNextSessionAvailable(
    queueGeneration: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    let session = getEducationalPlaybackSession();
    if (!session) return false;

    const currentIndex = findEducationalSessionIndex(session.loadedSessions, session.currentSessionId);
    if (currentIndex < 0) return false;

    const nextIndex = currentIndex + 1;
    if (nextIndex < session.loadedSessions.length) return true;

    if (!session.hasMore) return false;

    await fetchAndAppendNextPage(session, queueGeneration, signal);
    session = getEducationalPlaybackSession();
    if (!session || session.queueGeneration !== queueGeneration) return false;

    return nextIndex < session.loadedSessions.length;
  },

  async ensurePreviousSessionAvailable(
    queueGeneration: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    let session = getEducationalPlaybackSession();
    if (!session) return false;

    const currentIndex = findEducationalSessionIndex(session.loadedSessions, session.currentSessionId);
    if (currentIndex <= 0 && session.minLoadedPage <= 1) return currentIndex > 0;

    if (currentIndex > 0) return true;
    if (session.minLoadedPage <= 1) return false;

    await fetchAndPrependPreviousPage(session, queueGeneration, signal);
    session = getEducationalPlaybackSession();
    if (!session || session.queueGeneration !== queueGeneration) return false;

    const refreshedIndex = findEducationalSessionIndex(session.loadedSessions, session.currentSessionId);
    return refreshedIndex > 0;
  },

  async nextSession(): Promise<boolean> {
    if (navigationInFlight) return false;

    const session = getEducationalPlaybackSession();
    const bindings = playerBindings;
    if (!session || !bindings) return false;

    const requestId = ++activePlayRequestId;
    const queueGeneration = session.queueGeneration;

    const currentSessionId =
      parseSessionIdFromSongId(bindings.getCurrentSongId()) || session.currentSessionId;
    let currentIndex = findEducationalSessionIndex(session.loadedSessions, currentSessionId);
    if (currentIndex < 0) return false;

    let nextIndex = currentIndex + 1;
    if (nextIndex >= session.loadedSessions.length) {
      const expanded = await this.ensureNextSessionAvailable(queueGeneration);
      const refreshed = getEducationalPlaybackSession();
      if (!refreshed || refreshed.queueGeneration !== queueGeneration) return false;
      currentIndex = findEducationalSessionIndex(refreshed.loadedSessions, currentSessionId);
      nextIndex = currentIndex + 1;
      if (!expanded || nextIndex >= refreshed.loadedSessions.length) return true;
    }

    const result = await this.playSessionIndex(nextIndex, requestId, { playGeneration: queueGeneration });
    return requestId === activePlayRequestId && result.ok;
  },

  async previousSession(): Promise<boolean> {
    if (navigationInFlight) return false;

    const session = getEducationalPlaybackSession();
    const bindings = playerBindings;
    if (!session || !bindings) return false;

    const requestId = ++activePlayRequestId;
    const queueGeneration = session.queueGeneration;
    const position = Math.max(0, bindings.getPositionMillis() || 0);

    if (position > EDUCATIONAL_RESTART_THRESHOLD_MS && bindings.seekTo) {
      await bindings.seekTo(0);
      return true;
    }

    const currentSessionId =
      parseSessionIdFromSongId(bindings.getCurrentSongId()) || session.currentSessionId;
    let currentIndex = findEducationalSessionIndex(session.loadedSessions, currentSessionId);
    if (currentIndex < 0) return false;

    if (currentIndex <= 0) {
      const expanded = await this.ensurePreviousSessionAvailable(queueGeneration);
      const refreshed = getEducationalPlaybackSession();
      if (!refreshed || refreshed.queueGeneration !== queueGeneration) return false;
      currentIndex = findEducationalSessionIndex(refreshed.loadedSessions, currentSessionId);
      if (!expanded || currentIndex <= 0) {
        if (bindings.seekTo) await bindings.seekTo(0);
        return true;
      }
    }

    const result = await this.playSessionIndex(currentIndex - 1, requestId, {
      playGeneration: queueGeneration,
    });
    return requestId === activePlayRequestId && result.ok;
  },

  async handleSessionFinished(): Promise<boolean> {
    const session = getEducationalPlaybackSession();
    const bindings = playerBindings;
    if (!session || !bindings) return false;

    const currentSessionId = parseSessionIdFromSongId(bindings.getCurrentSongId());
    if (!currentSessionId) return false;

    const queueGeneration = session.queueGeneration;
    let currentIndex = findEducationalSessionIndex(session.loadedSessions, currentSessionId);
    if (currentIndex < 0) return false;

    let failures = 0;
    let nextIndex = currentIndex + 1;

    while (failures < EDUCATIONAL_MAX_AUTO_NEXT_FAILURES) {
      let active = getEducationalPlaybackSession();
      if (!active || active.queueGeneration !== queueGeneration) return false;

      if (nextIndex >= active.loadedSessions.length) {
        if (!active.hasMore) break;
        const expanded = await this.ensureNextSessionAvailable(queueGeneration);
        active = getEducationalPlaybackSession();
        if (!active || active.queueGeneration !== queueGeneration) return false;
        if (!expanded || nextIndex >= active.loadedSessions.length) break;
      }

      const requestId = ++activePlayRequestId;
      const result = await this.playSessionIndex(nextIndex, requestId, { playGeneration: queueGeneration });
      if (requestId !== activePlayRequestId) return false;
      if (result.ok) return true;

      failures += 1;
      nextIndex += 1;
    }

    return false;
  },
};

export async function handleEducationalSessionFinished() {
  return EducationalPlaybackController.handleSessionFinished();
}

export async function handleEducationalSessionNext() {
  return EducationalPlaybackController.nextSession();
}

export async function handleEducationalSessionPrevious() {
  return EducationalPlaybackController.previousSession();
}

export function getEducationalSessionIndexById(sessionId: string) {
  return getEducationalSessionIndex(sessionId);
}

export { educationalSessionSongId };
