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
  motivationItemToAppSong,
  motivationItemToMetadataAppSong,
  MOTIVATION_MAX_AUTO_NEXT_FAILURES,
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
};

let bindings: PlayerBindings | null = null;
let activeRequestId = 0;

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
    const generation =
      (getMotivationPlaybackSession()?.queueGeneration || 0) + 1;

    createMotivationPlaybackSession({
      program: input.program,
      items: input.items,
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

    const resolved = await fetchMotivationItemPlayback(item.id);
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

    if (session.hasMore) {
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
    }

    console.log("[motivation] playback stopped:", reason);
    return false;
  },

  async nextItem() {
    const session = getMotivationPlaybackSession();
    if (!session) return false;
    setMotivationActiveItem(
      session.loadedItems[Math.min(session.currentItemIndex + 1, session.loadedItems.length - 1)]?.id ||
        session.currentItemId,
      Math.min(session.currentItemIndex + 1, session.loadedItems.length - 1)
    );
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
