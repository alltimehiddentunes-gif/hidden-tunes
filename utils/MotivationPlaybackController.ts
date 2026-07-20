import type { AppSong } from "@/context/PlayerContext";
import { claimExclusivePlayback } from "@/services/playback/PlaybackHandoffCoordinator";
import {
  fetchMotivationItemPlayback,
  fetchMotivationProgramDetail,
} from "@/services/motivationCatalogApi";
import { recordMotivationRecentlyPlayed } from "@/services/motivationRecentlyPlayed";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import {
  assertMotivationQueueIntegrity,
  buildHierarchicalMotivationItems,
  buildMotivationQueueContext,
  filterMotivationDomainSongs,
  isMotivationAudioPlayback,
  isMotivationItemAppSong,
  motivationItemSongId,
  motivationItemToAppSong,
  motivationItemToMetadataAppSong,
  motivationQueueLog,
  motivationTrace,
  MOTIVATION_MAX_AUTO_NEXT_FAILURES,
  MOTIVATION_PROGRAM_CONTEXT_TYPE,
  orderMotivationItems,
} from "@/utils/motivationPlaybackAdapter";
import {
  appendMotivationItemPage,
  createMotivationPlaybackSession,
  getMotivationPlaybackSession,
  setMotivationActiveItem,
} from "@/utils/motivationPlaybackSession";

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: ReturnType<typeof buildMotivationQueueContext>
) => Promise<void>;

type PlayerBindings = {
  playSong: PlaySongFn;
  getCurrentSongId: () => string | null;
  getActiveQueue?: () => AppSong[];
  getActiveQueueIndex?: () => number;
};

let bindings: PlayerBindings | null = null;
let activeRequestId = 0;
let resolveInFlightId: string | null = null;

function dedupeSongsById(songs: AppSong[]) {
  const seen = new Set<string>();
  const next: AppSong[] = [];
  for (const song of songs) {
    const id = String(song.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(song);
  }
  return next;
}

function resolveSpeakerName(program: MotivationProgram, items: MotivationItem[]) {
  return (
    items.find((item) => item.speaker_name || item.channel_name)?.speaker_name ||
    items.find((item) => item.channel_name)?.channel_name ||
    program.subtitle ||
    null
  );
}

export const MotivationPlaybackController = {
  bindPlayerActions(next: PlayerBindings | null) {
    bindings = next;
  },

  getSession() {
    return getMotivationPlaybackSession();
  },

  async playItem(input: {
    program: MotivationProgram;
    items: MotivationItem[];
    startItemId: string;
    contextType: string;
    contextSlug?: string;
    page?: number;
    hasMore?: boolean;
  }) {
    if (!bindings) throw new Error("Motivation player is unavailable.");

    const requestId = ++activeRequestId;
    const generation = (getMotivationPlaybackSession()?.queueGeneration || 0) + 1;
    const speakerName = resolveSpeakerName(input.program, input.items);
    const categorySlug = input.contextSlug || input.program.category_slug || null;

    await claimExclusivePlayback({
      owner: "shared-audio",
      contentKind: "motivational",
      mediaKey: String(input.startItemId || input.program.id),
    });
    if (requestId !== activeRequestId) return false;

    motivationTrace("TAP", {
      selectedItemId: input.startItemId,
      programId: input.program.id,
      speakerId: speakerName,
      categoryId: categorySlug,
      providedLength: input.items.length,
    });

    const hierarchical = await buildHierarchicalMotivationItems({
      program: input.program,
      programItems: input.items,
      startItemId: input.startItemId,
      speakerName,
      categorySlug,
    });

    motivationTrace("QUEUE_PROVIDED", {
      selectedItemId: input.startItemId,
      programId: hierarchical.programId,
      speakerId: hierarchical.speakerId,
      categoryId: hierarchical.categoryId,
      providedLength: input.items.length,
      finalLength: hierarchical.items.length,
      activeIndex: hierarchical.startIndex,
      continuationSource: hierarchical.continuationSource,
      expanded: false,
    });

    createMotivationPlaybackSession({
      program: input.program,
      items: hierarchical.items,
      startItemId: input.startItemId,
      contextType:
        hierarchical.items.length > 1 ? MOTIVATION_PROGRAM_CONTEXT_TYPE : input.contextType,
      contextSlug: categorySlug || undefined,
      nextPage: (input.page || 1) + 1,
      hasMore: Boolean(input.hasMore),
      queueGeneration: generation,
    });

    // Align session index with hierarchical start (selected item).
    setMotivationActiveItem(
      hierarchical.items[hierarchical.startIndex]?.id || input.startItemId,
      hierarchical.startIndex
    );

    return this.playCurrentItem(requestId, generation, {
      continuationSource: hierarchical.continuationSource,
      speakerId: hierarchical.speakerId,
      categoryId: hierarchical.categoryId,
    });
  },

  async playCurrentItem(
    requestId = activeRequestId,
    generation?: number,
    diagnostics?: {
      continuationSource?: string;
      speakerId?: string | null;
      categoryId?: string | null;
    }
  ): Promise<boolean> {
    const session = getMotivationPlaybackSession();
    if (!session || !bindings) return false;
    if (requestId !== activeRequestId) return false;

    const item = session.loadedItems[session.currentItemIndex];
    if (!item) return false;

    if (resolveInFlightId === item.id) return false;
    resolveInFlightId = item.id;

    try {
      let resolved: Awaited<ReturnType<typeof fetchMotivationItemPlayback>>;
      try {
        resolved = await fetchMotivationItemPlayback(item.id);
      } catch (error) {
        if (__DEV__) {
          console.warn("[motivation] playback resolve failed", {
            itemId: item.id,
            sessionKind: "motivation",
            operation: "fetchMotivationItemPlayback",
            endpoint: `/api/motivation/items/${item.id}/play`,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return this.skipToNext("playback_resolve_failed", requestId, generation);
      }
      if (!isMotivationAudioPlayback(resolved.mediaType, resolved.playableUrl)) {
        return this.skipToNext("unsupported_media", requestId, generation);
      }

      const queueSongs = assertMotivationQueueIntegrity(
        session.loadedItems.map((entry) =>
          entry.id === item.id
            ? motivationItemToAppSong(session.program, entry, resolved.playableUrl)
            : motivationItemToMetadataAppSong(session.program, entry)
        )
      );
      const playableSong = motivationItemToAppSong(session.program, item, resolved.playableUrl);
      const activeIndex = Math.max(
        0,
        queueSongs.findIndex((song) => song.id === playableSong.id)
      );
      const queueContext = buildMotivationQueueContext({
        contextType:
          queueSongs.length > 1 ? MOTIVATION_PROGRAM_CONTEXT_TYPE : session.contextType,
        contextId: session.programId,
        contextTitle: session.program.title,
        label: session.program.title || "Motivationals",
        artistName: item.speaker_name || item.channel_name || session.program.subtitle,
        categorySlug: session.contextSlug || session.program.category_slug,
        speakerId: diagnostics?.speakerId || item.speaker_name || item.channel_name,
      });

      motivationTrace("QUEUE_BUILT", {
        selectedItemId: item.id,
        programId: session.programId,
        speakerId: diagnostics?.speakerId || item.speaker_name || null,
        categoryId: session.contextSlug || session.program.category_slug || null,
        providedLength: session.loadedItems.length,
        finalLength: queueSongs.length,
        activeIndex,
        expanded: false,
        foreignItemCount: 0,
        continuationSource: diagnostics?.continuationSource || "session",
      });

      motivationQueueLog("accepted", {
        providedLength: session.loadedItems.length,
        finalLength: queueSongs.length,
        activeIndex,
        programId: session.programId,
        speakerId: diagnostics?.speakerId || item.speaker_name || null,
        categoryId: session.contextSlug || session.program.category_slug || null,
        expanded: false,
        foreignItemCount: 0,
      });

      // Single public playback entry: playSong only (PlayerContext may delegate to playQueue).
      try {
        await bindings.playSong(playableSong, queueSongs, activeIndex, queueContext);
      } catch (error) {
        if (__DEV__) {
          console.warn("[motivation] playSong failed", {
            itemId: item.id,
            sessionKind: "motivation",
            operation: "playCurrentItem",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }

      void recordMotivationRecentlyPlayed(item);
      setMotivationActiveItem(item.id, activeIndex);
      return true;
    } finally {
      if (resolveInFlightId === item.id) resolveInFlightId = null;
    }
  },

  async resolveCurrentIfNeeded(songId?: string | null) {
    const session = getMotivationPlaybackSession();
    if (!session || !bindings) return false;
    const itemId = String(songId || "").replace(/^motivation-item-/, "");
    if (!itemId) return false;
    const index = session.loadedItems.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    setMotivationActiveItem(session.loadedItems[index].id, index);
    return this.playCurrentItem();
  },

  async skipToNext(reason: string, requestId = activeRequestId, generation?: number): Promise<boolean> {
    const session = getMotivationPlaybackSession();
    if (!session || requestId !== activeRequestId) return false;
    if (generation != null && session.queueGeneration !== generation) return false;

    motivationTrace("NEXT_RESOLVE", {
      reason,
      programId: session.programId,
      providedLength: session.loadedItems.length,
      activeIndex: session.currentItemIndex,
      skipFailures: session.skipFailures,
    });

    if (session.skipFailures >= MOTIVATION_MAX_AUTO_NEXT_FAILURES) {
      console.log("[motivation] playback stopped: max_invalid_next_skips", {
        reason,
        skips: session.skipFailures,
      });
      return false;
    }

    const nextIndex = session.currentItemIndex + 1;
    if (nextIndex < session.loadedItems.length) {
      session.skipFailures += 1;
      setMotivationActiveItem(session.loadedItems[nextIndex].id, nextIndex);
      return this.playCurrentItem(requestId, session.queueGeneration);
    }

    if (session.hasMore && !String(session.programId).startsWith("synthetic:")) {
      try {
        const detail = await fetchMotivationProgramDetail(session.programId, {
          page: session.nextPage,
          limit: 40,
        });
        appendMotivationItemPage(
          session.programId,
          detail.items,
          {
            nextPage: (detail.pagination?.page || session.nextPage) + 1,
            hasMore: detail.pagination?.hasMore ?? false,
          },
          session.queueGeneration
        );
        const refreshed = getMotivationPlaybackSession();
        if (refreshed && refreshed.currentItemIndex + 1 < refreshed.loadedItems.length) {
          setMotivationActiveItem(
            refreshed.loadedItems[refreshed.currentItemIndex + 1].id,
            refreshed.currentItemIndex + 1
          );
          return this.playCurrentItem(requestId, refreshed.queueGeneration);
        }
      } catch {
        // Fall through to clean stop.
      }
    }

    console.log("[motivation] playback stopped:", reason);
    return false;
  },

  async nextItem() {
    const session = getMotivationPlaybackSession();
    if (!session) return false;
    motivationTrace("NEXT_RESOLVE", {
      reason: "manual_next",
      programId: session.programId,
      activeIndex: session.currentItemIndex,
      providedLength: session.loadedItems.length,
    });
    const nextIndex = session.currentItemIndex + 1;
    if (nextIndex >= session.loadedItems.length) {
      return this.skipToNext("manual_next");
    }
    setMotivationActiveItem(session.loadedItems[nextIndex].id, nextIndex);
    return this.playCurrentItem();
  },

  async previousItem() {
    const session = getMotivationPlaybackSession();
    if (!session || session.currentItemIndex <= 0) return false;
    setMotivationActiveItem(
      session.loadedItems[session.currentItemIndex - 1].id,
      session.currentItemIndex - 1
    );
    return this.playCurrentItem();
  },

  /** Insert metadata-only songs after the current track — Motivationals domain only. */
  async playNext(items: MotivationItem[], program: MotivationProgram) {
    if (!bindings?.playSong || !bindings.getActiveQueue || !bindings.getActiveQueueIndex) {
      throw new Error("Queue actions unavailable.");
    }
    const queue = filterMotivationDomainSongs(bindings.getActiveQueue());
    const index = Math.max(0, bindings.getActiveQueueIndex());
    const liveQueue = bindings.getActiveQueue();
    const liveCurrent = liveQueue[Math.max(0, Math.min(index, liveQueue.length - 1))];

    if (!queue.length || !liveCurrent || !isMotivationItemAppSong(liveCurrent)) {
      if (!items[0]) return false;
      return this.playItem({
        program,
        items,
        startItemId: items[0].id,
        contextType: MOTIVATION_PROGRAM_CONTEXT_TYPE,
        contextSlug: program.category_slug || undefined,
      });
    }

    const currentSong =
      queue.find((song) => song.id === liveCurrent.id) || queue[0];
    const currentIndex = Math.max(
      0,
      queue.findIndex((song) => song.id === currentSong.id)
    );
    const additions = orderMotivationItems(items).map((item) =>
      motivationItemToMetadataAppSong(program, item)
    );
    const nextQueue = assertMotivationQueueIntegrity(
      dedupeSongsById([...queue.slice(0, currentIndex + 1), ...additions, ...queue.slice(currentIndex + 1)])
    );
    const queueContext = buildMotivationQueueContext({
      contextType: MOTIVATION_PROGRAM_CONTEXT_TYPE,
      contextId: program.id,
      contextTitle: program.title,
      label: program.title || "Motivationals",
      artistName: program.subtitle,
      categorySlug: program.category_slug,
    });
    await bindings.playSong(currentSong, nextQueue, currentIndex, queueContext);
    return true;
  },

  /** Append metadata-only songs to the end of the active Motivationals queue. */
  async addToQueue(items: MotivationItem[], program: MotivationProgram) {
    if (!bindings?.playSong || !bindings.getActiveQueue || !bindings.getActiveQueueIndex) {
      throw new Error("Queue actions unavailable.");
    }
    const queue = filterMotivationDomainSongs(bindings.getActiveQueue());
    const liveQueue = bindings.getActiveQueue();
    const index = Math.max(0, bindings.getActiveQueueIndex());
    const liveCurrent = liveQueue[Math.max(0, Math.min(index, liveQueue.length - 1))];

    if (!queue.length || !liveCurrent || !isMotivationItemAppSong(liveCurrent)) {
      if (!items[0]) return false;
      return this.playItem({
        program,
        items,
        startItemId: items[0].id,
        contextType: MOTIVATION_PROGRAM_CONTEXT_TYPE,
        contextSlug: program.category_slug || undefined,
      });
    }

    const currentSong =
      queue.find((song) => song.id === liveCurrent.id) || queue[0];
    const currentIndex = Math.max(
      0,
      queue.findIndex((song) => song.id === currentSong.id)
    );
    const existing = new Set(queue.map((song) => song.id));
    const additions = orderMotivationItems(items)
      .map((item) => motivationItemToMetadataAppSong(program, item))
      .filter((song) => !existing.has(song.id));
    if (!additions.length) return true;
    const nextQueue = assertMotivationQueueIntegrity([...queue, ...additions]);
    const queueContext = buildMotivationQueueContext({
      contextType: MOTIVATION_PROGRAM_CONTEXT_TYPE,
      contextId: program.id,
      contextTitle: program.title,
      label: program.title || "Motivationals",
      artistName: program.subtitle,
      categorySlug: program.category_slug,
    });
    await bindings.playSong(currentSong, nextQueue, currentIndex, queueContext);
    return true;
  },
};

export async function playMotivationProgramItem(input: {
  program: MotivationProgram;
  items: MotivationItem[];
  startItemId: string;
  contextType?: string;
  contextSlug?: string;
  page?: number;
  hasMore?: boolean;
}) {
  const ok = await MotivationPlaybackController.playItem({
    ...input,
    contextType: input.contextType || MOTIVATION_PROGRAM_CONTEXT_TYPE,
  });
  if (!ok) {
    throw new Error("Couldn't resolve a playable Motivationals stream.");
  }
  return ok;
}

export function motivationSongNeedsResolve(song?: AppSong | null) {
  if (!song?.id?.startsWith("motivation-item-")) return false;
  return !String(song.streamUrl || song.url || song.audioUrl || "").trim();
}

export { motivationItemSongId };
