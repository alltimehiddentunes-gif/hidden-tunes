import { useCallback, useEffect, useRef } from "react";

import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
} from "@/context/PlayerContext";
import type { EducationalSession } from "@/types/education";
import {
  EducationalPlaybackController,
} from "@/utils/EducationalPlaybackController";
import {
  isEducationalQueueContext,
  isEducationalSessionAppSong,
  parseEducationalSessionSongId,
} from "@/utils/educationalPlaybackAdapter";
import { saveEducationalProgress } from "@/services/educationalProgress";

const SAVE_INTERVAL_MS = 7000;
const COMPLETION_REMAINING_MS = 30_000;
const COMPLETION_PERCENT = 95;

type UseEducationalProgressTrackerArgs = {
  programId?: string | null;
  programTitle?: string | null;
  programArtwork?: string | null;
  educatorName?: string | null;
  sessions?: EducationalSession[];
  enabled?: boolean;
};

export function useEducationalPlaybackBinding() {
  const { playSong, seekTo } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { position } = usePlayerProgress();

  const currentSongRef = useRef(currentSong);
  const positionRef = useRef(position);

  currentSongRef.current = currentSong;
  positionRef.current = position;

  useEffect(() => {
    EducationalPlaybackController.bindPlayerActions({
      playSong,
      seekTo,
      getCurrentSongId: () => currentSongRef.current?.id || null,
      getPositionMillis: () => Math.max(0, Math.floor(positionRef.current || 0)),
    });

    return () => {
      EducationalPlaybackController.bindPlayerActions(null);
    };
  }, [playSong, seekTo]);

  useEducationalProgressTracker();
}

export function useEducationalProgressTracker(args?: UseEducationalProgressTrackerArgs) {
  const { currentSong } = usePlayerNowPlaying();
  const { position } = usePlayerProgress();
  const { activeQueueContext } = usePlayerState();
  const lastSavedAtRef = useRef(0);
  const sessionsRef = useRef(args?.sessions || []);

  useEffect(() => {
    sessionsRef.current = args?.sessions || [];
  }, [args?.sessions]);

  useEffect(() => {
    const controllerSession = EducationalPlaybackController.getSession();
    const programId = args?.programId ?? controllerSession?.programId ?? null;
    const programTitle = args?.programTitle ?? controllerSession?.program.title ?? null;
    const enabled = args?.enabled !== false;

    if (!enabled || !programId || !programTitle) return;
    if (!isEducationalSessionAppSong(currentSong)) return;
    if (!isEducationalQueueContext(activeQueueContext)) return;

    const sessionId = parseEducationalSessionSongId(currentSong?.id);
    if (!sessionId) return;

    const session = sessionsRef.current.find((item) => item.id === sessionId);
    const resolvedSession =
      session ||
      controllerSession?.loadedSessions.find((item) => item.id === sessionId) ||
      null;

    const now = Date.now();
    if (now - lastSavedAtRef.current < SAVE_INTERVAL_MS) return;

    lastSavedAtRef.current = now;
    const durationMillis = resolvedSession?.durationSeconds
      ? resolvedSession.durationSeconds * 1000
      : null;
    const completion =
      durationMillis && durationMillis > 0
        ? Math.round((Math.max(0, position || 0) / durationMillis) * 100)
        : 0;
    const remainingMillis =
      durationMillis && durationMillis > 0
        ? Math.max(0, durationMillis - Math.max(0, position || 0))
        : null;
    const completed =
      Boolean(durationMillis && durationMillis > 60_000) &&
      (completion >= COMPLETION_PERCENT ||
        (remainingMillis !== null && remainingMillis <= COMPLETION_REMAINING_MS));

    void saveEducationalProgress({
      programId,
      programTitle,
      programArtwork: args?.programArtwork ?? controllerSession?.program.artworkUrl ?? null,
      educatorName: args?.educatorName ?? controllerSession?.program.educatorName ?? null,
      sessionId,
      sessionTitle: resolvedSession?.title || currentSong?.title || null,
      sequenceNumber: resolvedSession?.sequenceNumber ?? null,
      positionMillis: Math.max(0, Math.floor(position || 0)),
      durationMillis,
      programCompletionPercentage: completion,
      completed,
      updatedAt: now,
    });
  }, [
    activeQueueContext?.contextId,
    args?.educatorName,
    args?.enabled,
    args?.programArtwork,
    args?.programId,
    args?.programTitle,
    currentSong?.id,
    currentSong?.title,
    position,
  ]);
}

export function useEducationalPlaybackActions() {
  const { playSong, seekTo } = usePlayerActions();
  return { playSong, seekTo };
}

export function useEducationalPlayback() {
  const { currentSong } = usePlayerNowPlaying();
  const session = EducationalPlaybackController.getSession();
  const isEducationalMode = isEducationalSessionAppSong(currentSong);

  return {
    isEducationalMode,
    session,
    nextSession: () => EducationalPlaybackController.nextSession(),
    previousSession: () => EducationalPlaybackController.previousSession(),
    mergeProgramSessions: EducationalPlaybackController.mergeProgramSessions.bind(
      EducationalPlaybackController
    ),
  };
}
