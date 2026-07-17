import type { AppSong } from "@/context/PlayerContext";
import {
  fetchMotivationItemPlayback,
  fetchMotivationProgramDetail,
} from "@/services/motivationCatalogApi";
import { recordMotivationRecentlyPlayed } from "@/services/motivationRecentlyPlayed";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import {
  buildMotivationQueueContext,
  isMotivationAudioPlayback,
  motivationItemSongId,
  motivationItemToAppSong,
  motivationItemToMetadataAppSong,
  MOTIVATION_MAX_AUTO_NEXT_FAILURES,
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
    const ordered = orderMotivationItems(input.items);

    createMotivationPlaybackSession({
      program: input.program,
      items: ordered,
      startItemId: input.startItemId,
      contextType: input.contextType,
      contextSlug: input.contextSlug,
      nextPage: (input.page || 1) + 1,
      hasMore: input.hasMore ?? false,
      queueGeneration: generation,
    });

    return this.playCurrentItem(requestId, generation);
  },

  async playCurrentItem(requestId = activeRequestId, generation?: number): Promise<boolean> {
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
      } catch {
        return this.skipToNext("playback_resolve_failed", requestId, generation);
      }
      if (!isMotivationAudioPlayback(resolved.mediaType, resolved.playableUrl)) {
        return this.skipToNext("unsupported_media", requestId, generation);
      }

      const queueSongs = session.loadedItems.map((entry) =>
        entry.id === item.id
          ? motivationItemToAppSong(session.program, entry, resolved.playableUrl)
          : motivationItemToMetadataAppSong(session.program, entry)
      );
      const playableSong = motivationItemToAppSong(session.program, item, resolved.playableUrl);

      await bindings.playSong(
        playableSong,
        queueSongs,
        session.currentItemIndex,
        buildMotivationQueueContext({
          contextType: session.contextType,
          contextId: session.programId,
          contextTitle: session.program.title,
          label: "Motivationals",
        })
      );

      void recordMotivationRecentlyPlayed(item);
      setMotivationActiveItem(item.id, session.currentItemIndex);
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

    if (session.skipFailures >= MOTIVATION_MAX_AUTO_NEXT_FAILURES) return false;

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

  /** Insert metadata-only songs after the current track. */
  async playNext(items: MotivationItem[], program: MotivationProgram) {
    if (!bindings?.playSong || !bindings.getActiveQueue || !bindings.getActiveQueueIndex) {
      throw new Error("Queue actions unavailable.");
    }
    const queue = bindings.getActiveQueue();
    const index = Math.max(0, bindings.getActiveQueueIndex());
    const current = queue[index] || bindings.getCurrentSongId();
    if (!current || !queue.length) {
      if (!items[0]) return false;
      return this.playItem({
        program,
        items,
        startItemId: items[0].id,
        contextType: "program",
      });
    }
    const currentSong = typeof current === "string" ? queue[index] : current;
    if (!currentSong) return false;
    const additions = orderMotivationItems(items).map((item) =>
      motivationItemToMetadataAppSong(program, item)
    );
    const nextQueue = dedupeSongsById([
      ...queue.slice(0, index + 1),
      ...additions,
      ...queue.slice(index + 1),
    ]);
    await bindings.playSong(
      currentSong,
      nextQueue,
      index,
      buildMotivationQueueContext({
        contextType: "program",
        contextId: program.id,
        contextTitle: program.title,
        label: "Motivationals",
      })
    );
    return true;
  },

  /** Append metadata-only songs to the end of the active queue. */
  async addToQueue(items: MotivationItem[], program: MotivationProgram) {
    if (!bindings?.playSong || !bindings.getActiveQueue || !bindings.getActiveQueueIndex) {
      throw new Error("Queue actions unavailable.");
    }
    const queue = bindings.getActiveQueue();
    const index = Math.max(0, bindings.getActiveQueueIndex());
    if (!queue.length) {
      if (!items[0]) return false;
      return this.playItem({
        program,
        items,
        startItemId: items[0].id,
        contextType: "program",
      });
    }
    const currentSong = queue[index];
    if (!currentSong) return false;
    const existing = new Set(queue.map((song) => song.id));
    const additions = orderMotivationItems(items)
      .map((item) => motivationItemToMetadataAppSong(program, item))
      .filter((song) => !existing.has(song.id));
    if (!additions.length) return true;
    const nextQueue = [...queue, ...additions];
    await bindings.playSong(
      currentSong,
      nextQueue,
      index,
      buildMotivationQueueContext({
        contextType: "program",
        contextId: program.id,
        contextTitle: program.title,
        label: "Motivationals",
      })
    );
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
  return MotivationPlaybackController.playItem({
    ...input,
    contextType: input.contextType || "program",
  });
}

export function motivationSongNeedsResolve(song?: AppSong | null) {
  if (!song?.id?.startsWith("motivation-item-")) return false;
  return !String(song.streamUrl || song.url || song.audioUrl || "").trim();
}

export { motivationItemSongId };
