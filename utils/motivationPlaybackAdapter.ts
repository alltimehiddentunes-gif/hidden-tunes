import type { AppSong } from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import {
  fetchMotivationCategoryPage,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import { orderMotivationEpisodes } from "@/utils/motivationGrouping";
import {
  extractMotivationProgramTitle,
  formatMotivationEpisodeTitle,
} from "@/utils/motivationPresentation";

export const MOTIVATION_ITEM_SONG_PREFIX = "motivation-item-";
export const MOTIVATION_QUEUE_TYPE = "motivation";
export const MOTIVATION_PROGRAM_CONTEXT_TYPE = "motivational-program";
export const MOTIVATION_MAX_AUTO_NEXT_FAILURES = 5;
export const MOTIVATION_MAX_QUEUE_ITEMS = 48;
export const MOTIVATION_CONTINUATION_FETCH_MS = 2200;

type MotivationTracePayload = Record<string, string | number | boolean | null | undefined>;

export function motivationTrace(event: string, payload: MotivationTracePayload = {}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[MOTIVATIONAL_TRACE] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

export function motivationQueueLog(
  event: "accepted" | "rejected_foreign_items",
  payload: MotivationTracePayload = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[MOTIVATIONAL_QUEUE] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

export function motivationItemSongId(itemId: string) {
  return `${MOTIVATION_ITEM_SONG_PREFIX}${itemId}`;
}

export function parseMotivationItemSongId(songId?: string | null) {
  const clean = String(songId || "");
  if (!clean.startsWith(MOTIVATION_ITEM_SONG_PREFIX)) return null;
  return clean.slice(MOTIVATION_ITEM_SONG_PREFIX.length) || null;
}

export function isMotivationItemAppSong(song?: AppSong | null) {
  return Boolean(parseMotivationItemSongId(song?.id));
}

export function isMotivationAudioPlayback(mediaType: string, playableUrl: string) {
  const type = String(mediaType || "").toLowerCase();
  const url = String(playableUrl || "");
  if (!url.startsWith("http")) return false;
  // Shared HiddenAudio path can play progressive audio and progressive mp4 audio tracks.
  if (type === "audio") return true;
  if (/\.(mp3|m4a|aac|wav|ogg|flac)(?:\?|$)/i.test(url)) return true;
  if (/\.(mp4|m4v)(?:\?|$)/i.test(url)) return true;
  if (type === "video" && /archive\.org\/download\//i.test(url)) return true;
  return false;
}

function motivationDisplayArtist(item: MotivationItem) {
  return item.speaker_name || item.channel_name || "Hidden Tunes Motivationals";
}

function motivationDisplayTitle(item: MotivationItem) {
  const formatted = formatMotivationEpisodeTitle(item.title);
  const program = extractMotivationProgramTitle(item.title);
  // Prefer a meaningful work title over a generic "Episode N" label.
  if (/^episode\s+\d+$/i.test(formatted) && program) return program;
  return formatted || program || "Motivation";
}

function normalizeSpeakerKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeMotivationItems(items: MotivationItem[]): MotivationItem[] {
  const seen = new Set<string>();
  const next: MotivationItem[] = [];
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(item);
  }
  return next;
}

function itemMatchesSpeaker(item: MotivationItem, speakerKey: string) {
  if (!speakerKey) return false;
  return (
    normalizeSpeakerKey(item.speaker_name) === speakerKey ||
    normalizeSpeakerKey(item.channel_name) === speakerKey
  );
}

function itemMatchesCategory(item: MotivationItem, categorySlug: string) {
  if (!categorySlug) return false;
  const slug = String(item.category_slug || "").trim();
  const name = String(item.category || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return slug === categorySlug || name === categorySlug;
}

export function motivationItemToAppSong(
  program: Pick<MotivationProgram, "id" | "title" | "artwork_url" | "category_slug">,
  item: MotivationItem,
  playableUrl: string
): AppSong {
  const artist = motivationDisplayArtist(item);
  const artwork = item.artwork || program.artwork_url || "";
  const title = motivationDisplayTitle(item);
  const programId = String(item.program_id || program.id || "").trim();

  return {
    id: motivationItemSongId(item.id),
    title,
    artist,
    album: program.title || extractMotivationProgramTitle(item.title),
    albumId: programId || undefined,
    user: { name: artist },
    channelTitle: program.title || extractMotivationProgramTitle(item.title),
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: playableUrl,
    url: playableUrl,
    audioUrl: playableUrl,
    duration: item.duration_seconds || undefined,
    genre: item.category_slug || program.category_slug || "Motivationals",
    source: "hidden-tunes",
    sourceName: "Motivationals",
    type: "r2",
    isOnline: true,
  };
}

export function motivationItemToMetadataAppSong(
  program: Pick<MotivationProgram, "id" | "title" | "artwork_url" | "category_slug">,
  item: MotivationItem
): AppSong {
  const artist = motivationDisplayArtist(item);
  const artwork = item.artwork || program.artwork_url || "";
  const title = motivationDisplayTitle(item);
  const programId = String(item.program_id || program.id || "").trim();
  return {
    id: motivationItemSongId(item.id),
    title,
    artist,
    album: program.title || extractMotivationProgramTitle(item.title),
    albumId: programId || undefined,
    user: { name: artist },
    channelTitle: program.title || extractMotivationProgramTitle(item.title),
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: "",
    url: "",
    audioUrl: "",
    duration: item.duration_seconds || undefined,
    genre: item.category_slug || program.category_slug || "Motivationals",
    source: "hidden-tunes",
    sourceName: "Motivationals",
    type: "r2",
    isOnline: true,
  };
}

export type MotivationQueueContext = PlaybackQueueContext & {
  queueType?: typeof MOTIVATION_QUEUE_TYPE;
  contextType?: string;
  contextId?: string;
  contextTitle?: string;
};

export function buildMotivationQueueContext(input: {
  contextType: string;
  contextId?: string;
  contextTitle?: string;
  label?: string;
  artistName?: string | null;
  categorySlug?: string | null;
  speakerId?: string | null;
}): MotivationQueueContext {
  const programTitle = String(input.contextTitle || "").trim();
  const categorySlug = String(input.categorySlug || "").trim();
  const speakerId = String(input.speakerId || "").trim();
  const resolvedContextType =
    input.contextType === "program" || input.contextType === "motivational-program"
      ? MOTIVATION_PROGRAM_CONTEXT_TYPE
      : input.contextType;
  return {
    source: "motivation",
    label: input.label || programTitle || "Motivationals",
    albumId: input.contextId,
    albumTitle: programTitle || undefined,
    artistId: speakerId || undefined,
    artistName: input.artistName || undefined,
    genre: categorySlug || undefined,
    queueType: MOTIVATION_QUEUE_TYPE,
    contextType: resolvedContextType,
    contextId: input.contextId,
    contextTitle: programTitle || undefined,
  };
}

export function isMotivationQueueContext(
  context?: PlaybackQueueContext | null
): context is MotivationQueueContext {
  if (!context) return false;
  if ((context as MotivationQueueContext).queueType === MOTIVATION_QUEUE_TYPE) return true;
  if (context.source === "motivation") return true;
  if ((context as MotivationQueueContext).contextType === MOTIVATION_PROGRAM_CONTEXT_TYPE) {
    return true;
  }
  if (String(context.label || "").toLowerCase() === "motivationals") return true;
  return false;
}

export function filterMotivationDomainSongs(queue: AppSong[]): AppSong[] {
  const seen = new Set<string>();
  const next: AppSong[] = [];
  for (const song of queue) {
    if (!isMotivationItemAppSong(song)) continue;
    const id = String(song.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(song);
  }
  return next;
}

export function assertMotivationQueueIntegrity(
  queue: AppSong[],
  context?: PlaybackQueueContext | null
): AppSong[] {
  const domainOnly = filterMotivationDomainSongs(queue);
  const foreignCount = Math.max(0, queue.length - domainOnly.length);
  if (foreignCount > 0) {
    motivationQueueLog("rejected_foreign_items", {
      foreignItemCount: foreignCount,
      providedLength: queue.length,
      finalLength: domainOnly.length,
      programId: context?.albumId || (context as MotivationQueueContext)?.contextId || null,
      queueType: (context as MotivationQueueContext)?.queueType || null,
    });
  }
  return domainOnly;
}

export function orderMotivationItems(items: MotivationItem[]) {
  return orderMotivationEpisodes(items);
}

async function fetchWithBudget<T>(factory: () => Promise<T>, budgetMs: number): Promise<T | null> {
  try {
    return await Promise.race([
      factory(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), budgetMs);
      }),
    ]);
  } catch {
    return null;
  }
}

/**
 * Deterministic Motivationals queue:
 * selected program (ordered) → same speaker → same category → closely related.
 * Never includes non-Motivational domains.
 */
export async function buildHierarchicalMotivationItems(input: {
  program: MotivationProgram;
  programItems: MotivationItem[];
  startItemId: string;
  speakerName?: string | null;
  categorySlug?: string | null;
}): Promise<{
  items: MotivationItem[];
  startIndex: number;
  continuationSource: string;
  programId: string;
  speakerId: string | null;
  categoryId: string | null;
}> {
  const programId = String(input.program.id || "").trim();
  const speakerName = String(input.speakerName || "").trim();
  const speakerKey = normalizeSpeakerKey(speakerName);
  const categorySlug = String(
    input.categorySlug || input.program.category_slug || ""
  ).trim();

  const programOrdered = orderMotivationItems(dedupeMotivationItems(input.programItems));
  const selectedId = String(input.startItemId || "").trim();
  let startIndex = Math.max(
    0,
    programOrdered.findIndex((item) => item.id === selectedId)
  );
  if (programOrdered.length && startIndex < 0) startIndex = 0;

  const seen = new Set(programOrdered.map((item) => item.id));
  const sources: string[] = ["program"];
  let queue = [...programOrdered];

  const appendGroup = (group: MotivationItem[], source: string) => {
    const ordered = orderMotivationItems(dedupeMotivationItems(group));
    let added = 0;
    for (const item of ordered) {
      if (queue.length >= MOTIVATION_MAX_QUEUE_ITEMS) break;
      const id = String(item.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      queue.push(item);
      added += 1;
    }
    if (added > 0) sources.push(source);
  };

  const relatedQuery =
    extractMotivationProgramTitle(input.program.title) ||
    String(input.program.title || "").trim();

  const [speakerResult, categoryResult, relatedResult] = await Promise.all([
    speakerKey && queue.length < MOTIVATION_MAX_QUEUE_ITEMS
      ? fetchWithBudget(
          () =>
            searchMotivationItems(speakerName, {
              page: 1,
              limit: 24,
              categorySlug: categorySlug || undefined,
            }),
          MOTIVATION_CONTINUATION_FETCH_MS
        )
      : Promise.resolve(null),
    categorySlug && queue.length < MOTIVATION_MAX_QUEUE_ITEMS
      ? fetchWithBudget(
          () => fetchMotivationCategoryPage(categorySlug, { page: 1, limit: 24 }),
          MOTIVATION_CONTINUATION_FETCH_MS
        )
      : Promise.resolve(null),
    relatedQuery.length >= 2 && queue.length < MOTIVATION_MAX_QUEUE_ITEMS
      ? fetchWithBudget(
          () =>
            searchMotivationItems(relatedQuery, {
              page: 1,
              limit: 16,
              categorySlug: categorySlug || undefined,
            }),
          MOTIVATION_CONTINUATION_FETCH_MS
        )
      : Promise.resolve(null),
  ]);

  // Append in hierarchy order: speaker → category → related (never interleaved).
  if (speakerResult?.items?.length) {
    appendGroup(
      speakerResult.items.filter((item) => itemMatchesSpeaker(item, speakerKey)),
      "speaker"
    );
  }
  if (categoryResult?.items?.length) {
    appendGroup(
      categoryResult.items.filter((item) => itemMatchesCategory(item, categorySlug)),
      "category"
    );
  }
  if (relatedResult?.items?.length) {
    appendGroup(relatedResult.items, "related");
  }

  queue = queue.slice(0, MOTIVATION_MAX_QUEUE_ITEMS);
  startIndex = Math.max(
    0,
    queue.findIndex((item) => item.id === selectedId)
  );
  if (startIndex < 0) startIndex = 0;

  return {
    items: queue,
    startIndex,
    continuationSource: sources.join(">"),
    programId,
    speakerId: speakerKey || null,
    categoryId: categorySlug || null,
  };
}
