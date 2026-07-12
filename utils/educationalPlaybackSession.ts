import type { EducationalProgram, EducationalSession } from "@/types/education";
import { findEducationalSessionIndex, mergeEducationalSessions } from "@/utils/educationalOrdering";

export type EducationalPlaybackSession = {
  programId: string;
  program: EducationalProgram;
  loadedSessions: EducationalSession[];
  loadedPageNumbers: number[];
  nextPage: number;
  minLoadedPage: number;
  hasMore: boolean;
  currentSessionId: string;
  currentSessionIndex: number;
  queueGeneration: number;
  pendingPageRequest: number | null;
  isLoadingMore: boolean;
};

let activeSession: EducationalPlaybackSession | null = null;

export function getEducationalPlaybackSession() {
  return activeSession;
}

export function clearEducationalPlaybackSession() {
  activeSession = null;
}

export function createEducationalPlaybackSession(input: {
  program: EducationalProgram;
  sessions: EducationalSession[];
  startSessionId: string;
  loadedPageNumbers: number[];
  nextPage: number;
  minLoadedPage: number;
  hasMore: boolean;
  queueGeneration: number;
}) {
  const merged = mergeEducationalSessions([], input.sessions);
  const startIndex = findEducationalSessionIndex(merged, input.startSessionId);
  const safeIndex = Math.max(0, startIndex >= 0 ? startIndex : 0);
  const activeSessionMeta = merged[safeIndex];

  activeSession = {
    programId: input.program.id,
    program: input.program,
    loadedSessions: merged,
    loadedPageNumbers: [...new Set(input.loadedPageNumbers)].sort((a, b) => a - b),
    nextPage: input.nextPage,
    minLoadedPage: input.minLoadedPage,
    hasMore: input.hasMore,
    currentSessionId: activeSessionMeta?.id || input.startSessionId,
    currentSessionIndex: safeIndex,
    queueGeneration: input.queueGeneration,
    pendingPageRequest: null,
    isLoadingMore: false,
  };

  return activeSession;
}

export function updateEducationalPlaybackSession(patch: Partial<EducationalPlaybackSession>) {
  if (!activeSession) return null;
  activeSession = { ...activeSession, ...patch };
  return activeSession;
}

export function appendEducationalSessionPage(
  programId: string,
  sessions: EducationalSession[],
  pagination: { loadedPage: number; hasMore: boolean; nextPage: number },
  queueGeneration: number
) {
  if (!activeSession || activeSession.programId !== programId) return activeSession;
  if (activeSession.queueGeneration !== queueGeneration) return activeSession;
  if (activeSession.pendingPageRequest !== pagination.loadedPage) return activeSession;

  const merged = mergeEducationalSessions(activeSession.loadedSessions, sessions);
  const activeIndex = findEducationalSessionIndex(merged, activeSession.currentSessionId);

  activeSession = {
    ...activeSession,
    loadedSessions: merged,
    loadedPageNumbers: [...new Set([...activeSession.loadedPageNumbers, pagination.loadedPage])].sort(
      (a, b) => a - b
    ),
    nextPage: pagination.nextPage,
    hasMore: pagination.hasMore,
    currentSessionIndex: activeIndex >= 0 ? activeIndex : activeSession.currentSessionIndex,
    pendingPageRequest: null,
    isLoadingMore: false,
  };

  return activeSession;
}

export function prependEducationalSessionPage(
  programId: string,
  sessions: EducationalSession[],
  pagination: { loadedPage: number; minLoadedPage: number },
  queueGeneration: number
) {
  if (!activeSession || activeSession.programId !== programId) return activeSession;
  if (activeSession.queueGeneration !== queueGeneration) return activeSession;
  if (activeSession.pendingPageRequest !== pagination.loadedPage) return activeSession;

  const merged = mergeEducationalSessions(sessions, activeSession.loadedSessions);
  const activeIndex = findEducationalSessionIndex(merged, activeSession.currentSessionId);

  activeSession = {
    ...activeSession,
    loadedSessions: merged,
    loadedPageNumbers: [...new Set([pagination.loadedPage, ...activeSession.loadedPageNumbers])].sort(
      (a, b) => a - b
    ),
    minLoadedPage: pagination.minLoadedPage,
    currentSessionIndex: activeIndex >= 0 ? activeIndex : activeSession.currentSessionIndex,
    pendingPageRequest: null,
    isLoadingMore: false,
  };

  return activeSession;
}

export function mergeEducationalProgramSessions(
  programId: string,
  sessions: EducationalSession[],
  pagination?: { loadedPage?: number; hasMore?: boolean; direction?: "append" | "prepend" }
) {
  if (!activeSession || activeSession.programId !== programId) return activeSession;
  if (!sessions.length) return activeSession;

  const merged =
    pagination?.direction === "prepend"
      ? mergeEducationalSessions(sessions, activeSession.loadedSessions)
      : mergeEducationalSessions(activeSession.loadedSessions, sessions);

  const activeIndex = findEducationalSessionIndex(merged, activeSession.currentSessionId);
  const loadedPage = pagination?.loadedPage;

  activeSession = {
    ...activeSession,
    loadedSessions: merged,
    loadedPageNumbers:
      typeof loadedPage === "number"
        ? [...new Set([...activeSession.loadedPageNumbers, loadedPage])].sort((a, b) => a - b)
        : activeSession.loadedPageNumbers,
    minLoadedPage:
      typeof loadedPage === "number"
        ? Math.min(activeSession.minLoadedPage, loadedPage)
        : activeSession.minLoadedPage,
    nextPage:
      typeof loadedPage === "number" && pagination?.direction !== "prepend"
        ? loadedPage + 1
        : activeSession.nextPage,
    hasMore: pagination?.hasMore ?? activeSession.hasMore,
    currentSessionIndex: activeIndex >= 0 ? activeIndex : activeSession.currentSessionIndex,
  };

  return activeSession;
}

export function setEducationalSessionActive(sessionId: string) {
  if (!activeSession) return null;
  const index = findEducationalSessionIndex(activeSession.loadedSessions, sessionId);
  if (index < 0) return activeSession;

  activeSession = {
    ...activeSession,
    currentSessionId: sessionId,
    currentSessionIndex: index,
  };

  return activeSession;
}

export function getEducationalSessionIndex(sessionId: string) {
  if (!activeSession) return -1;
  return findEducationalSessionIndex(activeSession.loadedSessions, sessionId);
}

export function bumpEducationalQueueGeneration() {
  if (!activeSession) return 0;
  activeSession = {
    ...activeSession,
    queueGeneration: activeSession.queueGeneration + 1,
    pendingPageRequest: null,
    isLoadingMore: false,
  };
  return activeSession.queueGeneration;
}
