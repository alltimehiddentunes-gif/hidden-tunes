type QueueSong = {
  id: string;
};

export type QueueRepairResult = {
  queue: QueueSong[];
  index: number;
  repaired: boolean;
  reason?: string;
  requestedIndex?: number;
  resolvedIndex?: number;
};

export function repairQueueIndexForSong<T extends QueueSong>(
  queue: T[],
  songId: string,
  requestedIndex?: number
): QueueRepairResult & { queue: T[] } {
  if (!queue.length) {
    return {
      queue,
      index: 0,
      repaired: false,
      reason: "queue_empty",
      requestedIndex,
      resolvedIndex: 0,
    };
  }

  const byIdIndex = queue.findIndex((item) => item.id === songId);
  const clampedRequested =
    requestedIndex === undefined
      ? -1
      : Math.max(0, Math.min(requestedIndex, queue.length - 1));

  if (byIdIndex >= 0) {
    if (clampedRequested >= 0 && clampedRequested !== byIdIndex) {
      const requestedSongId = queue[clampedRequested]?.id;

      if (requestedSongId !== songId) {
        return {
          queue,
          index: byIdIndex,
          repaired: true,
          reason: "index_repaired_by_song_id",
          requestedIndex: clampedRequested,
          resolvedIndex: byIdIndex,
        };
      }
    }

    return {
      queue,
      index: byIdIndex,
      repaired: false,
      requestedIndex: clampedRequested >= 0 ? clampedRequested : byIdIndex,
      resolvedIndex: byIdIndex,
    };
  }

  if (clampedRequested >= 0) {
    return {
      queue,
      index: clampedRequested,
      repaired: false,
      reason: "song_id_not_in_queue_using_requested_index",
      requestedIndex: clampedRequested,
      resolvedIndex: clampedRequested,
    };
  }

  return {
    queue,
    index: 0,
    repaired: true,
    reason: "song_id_missing_defaulted_to_zero",
    requestedIndex,
    resolvedIndex: 0,
  };
}

export function rebuildQueueFromAvailableContext<T extends QueueSong>(
  song: T,
  existingQueue: T[],
  currentSong: T | null
): { queue: T[]; rebuilt: boolean; reason?: string } {
  if (existingQueue.length) {
    return { queue: existingQueue, rebuilt: false };
  }

  if (!currentSong?.id) {
    return { queue: [song], rebuilt: true, reason: "single_song_fallback" };
  }

  if (currentSong.id === song.id) {
    return { queue: [song], rebuilt: true, reason: "current_song_only" };
  }

  return {
    queue: [currentSong, song],
    rebuilt: true,
    reason: "current_song_plus_target",
  };
}

export function shouldIgnoreDuplicatePlayRequest(
  songId: string,
  inFlightSongId: string | null,
  isChangingTrack: boolean,
  isLoadingTrack: boolean
) {
  return (
    Boolean(songId) &&
    songId === inFlightSongId &&
    (isChangingTrack || isLoadingTrack)
  );
}
