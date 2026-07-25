import { useEffect, useRef } from "react";

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
  educationalSongNeedsResolve,
  isEducationalQueueContext,
  isEducationalSessionAppSong,
  parseEducationalSessionSongId,
} from "@/utils/educationalPlaybackAdapter";
import { saveEducationalProgress } from "@/services/educationalProgress";

const SAVE_INTERVAL_MS = 7000;
const COMPLETION_REMAINING_MS = 30_000;
const COMPLETION_PERCENT = 95;

/** Shared position for controller previous/restart without layout progress subscription. */
let educationalPositionMillis = 0;

type UseEducationalProgressTrackerArgs = {
  programId?: string | null;
  programTitle?: string | null;
  programArtwork?: string | null;
  educatorName?: string | null;
  sessions?: EducationalSession[];
  enabled?: boolean;
};

/**
 * Layout host: binds playSong + resolve-on-demand without progress subscription,
 * so lecture browse screens do not re-render on position ticks.
 */
export function EducationalPlaybackBinding() {
  useEducationalPlaybackBinding();
  return null;
}

export function EducationalProgressPersistence(args?: UseEducationalProgressTrackerArgs) {
  useEducationalProgressTracker(args);
  return null;
}

export function useEducationalPlaybackBinding() {
  const { playSong, seekTo } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { activeQueueContext } = usePlayerState();

  const currentSongRef = useRef(currentSong);
  const resolvingRef = useRef<string | null>(null);

  currentSongRef.current = currentSong;

  useEffect(() => {
    EducationalPlaybackController.bindPlayerActions({
      playSong,
      seekTo,
      getCurrentSongId: () => currentSongRef.current?.id || null,
      getPositionMillis: () => Math.max(0, Math.floor(educationalPositionMillis || 0)),
    });

    return () => {
      EducationalPlaybackController.bindPlayerActions(null);
    };
  }, [playSong, seekTo]);

  // MiniPlayer next/prev may land on metadata-only lecture rows — resolve on demand.
  useEffect(() => {
    if (!isEducationalSessionAppSong(currentSong)) return;
    if (!isEducationalQueueContext(activeQueueContext)) return;
    if (!educationalSongNeedsResolve(currentSong)) return;
    const songId = currentSong?.id || null;
    if (!songId || resolvingRef.current === songId) return;
    resolvingRef.current = songId;
    void EducationalPlaybackController.resolveCurrentIfNeeded(songId)
      .catch((error) => {
        if (__DEV__) {
          console.warn("[lecture] resolve-on-demand failed", {
            songId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (resolvingRef.current === songId) resolvingRef.current = null;
      });
  }, [
    activeQueueContext,
    currentSong,
    currentSong?.id,
    currentSong?.streamUrl,
    currentSong?.url,
  ]);
}

export function useEducationalProgressTracker(args?: UseEducationalProgressTrackerArgs) {
  const { currentSong } = usePlayerNowPlaying();
  const { position } = usePlayerProgress();
  const { activeQueueContext } = usePlayerState();
  const lastSavedAtRef = useRef(0);
  const sessionsRef = useRef(args?.sessions || []);

  educationalPositionMillis = Math.max(0, Math.floor(position || 0));

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
    activeQueueContext,
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
