/**
 * Podcast session-finished continuation.
 * Same-show next → bounded same-category fallback → mature/general isolation.
 * Does not own HiddenAudio / PlayerContext / MiniPlayer.
 */
import type { AppSong, PlaybackQueueContext } from "@/context/PlayerContext";
import {
  fetchPodcastEpisodePlay,
  fetchPodcastEpisodesByCategory,
  fetchPodcastEpisodesByShow,
  PODCAST_CATALOG_PAGE_LIMIT,
  PODCAST_MATURE_CATEGORY_SLUG,
  resolveBackendPodcastCategorySlug,
  type PodcastCatalogEpisodeMetadata,
} from "@/services/podcastCatalogApi";
import type { PodcastEpisode } from "@/types/podcast";
import { shouldIncludeMaturePodcasts } from "@/utils/maturePodcastSettings";
import {
  assertPodcastQueueIntegrity,
  buildPodcastQueueContext,
  isPodcastAppSong,
  isPodcastQueueContext,
  parsePodcastEpisodeSongId,
  podcastEpisodeToAppSong,
  podcastTrace,
  type PodcastQueueContext,
} from "@/utils/podcastPlaybackAdapter";
import {
  bumpPodcastSkipFailure,
  canPodcastSkipInvalidNext,
  resetPodcastSkipFailures,
} from "@/utils/podcastPlayback";

export type PodcastContinuationScope = "mature_only" | "general_only";

const CATEGORY_CANDIDATE_LIMIT = 16;
const MAX_CONTINUATION_CANDIDATES = 3;
const RECENT_IDS_CAP = 24;

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: ReturnType<typeof buildPodcastQueueContext>,
  queueMode?: "standard"
) => Promise<void>;

export type PodcastFinishedBindings = {
  playSong: PlaySongFn;
  getCurrentSong: () => AppSong | null | undefined;
  getQueue: () => AppSong[];
  getQueueContext: () => PlaybackQueueContext | null | undefined;
};

type ContinuationSession = {
  generation: number;
  completedIds: string[];
  failedIds: string[];
};

let session: ContinuationSession = {
  generation: 0,
  completedIds: [],
  failedIds: [],
};
let continuationMutex = false;

function clean(value: unknown) {
  return String(value || "").trim();
}

function pushBounded(list: string[], id: string) {
  const next = id ? [...list.filter((entry) => entry !== id), id] : [...list];
  if (next.length > RECENT_IDS_CAP) next.splice(0, next.length - RECENT_IDS_CAP);
  return next;
}

export function resetPodcastContinuationSession() {
  session = { generation: session.generation + 1, completedIds: [], failedIds: [] };
  continuationMutex = false;
}

export function getPodcastContinuationScope(
  context?: PlaybackQueueContext | null,
  song?: AppSong | null
): PodcastContinuationScope {
  const typed = context as PodcastQueueContext | null | undefined;
  const explicit = clean((typed as { continuationScope?: string } | null)?.continuationScope);
  if (explicit === "mature_only" || explicit === "general_only") {
    return explicit;
  }
  const genre = clean(context?.genre).toLowerCase();
  if (genre === PODCAST_MATURE_CATEGORY_SLUG || genre.includes("adult")) {
    return "mature_only";
  }
  const label = clean(context?.label).toLowerCase();
  if (label.includes("mature") || label.includes("+18")) {
    return "mature_only";
  }
  void song;
  return "general_only";
}

function metadataToEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  showTitle: string,
  categories: string[]
): PodcastEpisode {
  return {
    id: metadata.id,
    showId: metadata.showId,
    showTitle,
    title: metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: "",
    durationSeconds: metadata.durationSeconds,
    publishedAt: metadata.publishedAt,
    language: "unknown",
    categories,
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

async function resolveAndPlayEpisode(args: {
  metadata: PodcastCatalogEpisodeMetadata;
  showTitle: string;
  categoryId: string | null;
  scope: PodcastContinuationScope;
  bindings: PodcastFinishedBindings;
  seedQueue: AppSong[];
}): Promise<boolean> {
  const { metadata, showTitle, categoryId, scope, bindings, seedQueue } = args;
  const includeMature = scope === "mature_only";

  if (includeMature && !shouldIncludeMaturePodcasts()) {
    podcastTrace("CONTINUATION_STOP", { reason: "mature_eligibility_lost" });
    return false;
  }

  const resolved = await fetchPodcastEpisodePlay(metadata.id, { includeMature });
  if (!resolved.success || !resolved.play?.audioUrl) {
    session.failedIds = pushBounded(session.failedIds, metadata.id);
    bumpPodcastSkipFailure();
    return false;
  }

  const episode: PodcastEpisode = {
    id: resolved.play.id || metadata.id,
    showId: resolved.play.showId || metadata.showId,
    showTitle,
    title: resolved.play.title || metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: resolved.play.audioUrl,
    durationSeconds: resolved.play.durationSeconds ?? metadata.durationSeconds,
    publishedAt: resolved.play.publishedAt ?? metadata.publishedAt,
    language: "unknown",
    categories: categoryId ? [categoryId] : [],
    isExplicit: includeMature,
    matureLevel: includeMature ? "adult" : "safe",
    source: "podcast_rss",
  };

  const playable = podcastEpisodeToAppSong(episode);
  const context = buildPodcastQueueContext({
    showId: episode.showId,
    showTitle: episode.showTitle,
    categoryId,
    label: episode.showTitle || "Podcasts",
    continuationScope: scope,
  });

  const mergedQueue = assertPodcastQueueIntegrity(
    [
      ...seedQueue.filter((entry) => entry.id !== playable.id),
      playable,
    ],
    context
  );
  const index = Math.max(
    0,
    mergedQueue.findIndex((entry) => entry.id === playable.id)
  );

  resetPodcastSkipFailures();
  await bindings.playSong(playable, mergedQueue, index, context, "standard");
  podcastTrace("CONTINUATION_PLAY", {
    episodeId: episode.id,
    showId: episode.showId,
    scope,
    reason: "session_finished",
  });
  return true;
}

async function trySameShowContinuation(args: {
  showId: string;
  showTitle: string;
  categoryId: string | null;
  scope: PodcastContinuationScope;
  currentEpisodeId: string;
  queue: AppSong[];
  bindings: PodcastFinishedBindings;
}): Promise<boolean> {
  const { showId, showTitle, categoryId, scope, currentEpisodeId, queue, bindings } = args;
  const includeMature = scope === "mature_only";
  const knownIds = new Set(
    queue
      .map((song) => parsePodcastEpisodeSongId(song.id))
      .filter((id): id is string => Boolean(id))
  );
  knownIds.add(currentEpisodeId);
  for (const id of session.failedIds) knownIds.add(id);
  for (const id of session.completedIds) knownIds.add(id);

  // Page 1 may already be in the queue; walk a few pages for the next unseen episode.
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetchPodcastEpisodesByShow(showId, page, PODCAST_CATALOG_PAGE_LIMIT, {
      includeMature,
    });
    if (!response.success) break;

    const candidates = response.episodes.filter((entry) => {
      const id = clean(entry.id);
      if (!id || knownIds.has(id)) return false;
      if (clean(entry.showId) && clean(entry.showId) !== showId) return false;
      return true;
    });

    let failures = 0;
    for (const candidate of candidates.slice(0, MAX_CONTINUATION_CANDIDATES)) {
      if (!canPodcastSkipInvalidNext() && failures > 0) break;
      const played = await resolveAndPlayEpisode({
        metadata: candidate,
        showTitle,
        categoryId,
        scope,
        bindings,
        seedQueue: queue,
      });
      if (played) return true;
      failures += 1;
      knownIds.add(candidate.id);
    }

    if (!response.pagination.hasMore) break;
  }

  return false;
}

async function tryCategoryContinuation(args: {
  showId: string;
  showTitle: string;
  categoryId: string | null;
  scope: PodcastContinuationScope;
  currentEpisodeId: string;
  bindings: PodcastFinishedBindings;
}): Promise<boolean> {
  const { showId, categoryId, scope, currentEpisodeId, bindings } = args;
  const includeMature = scope === "mature_only";

  if (includeMature && !shouldIncludeMaturePodcasts()) {
    podcastTrace("CONTINUATION_STOP", { reason: "mature_eligibility_lost_before_category" });
    return false;
  }

  let slug =
    resolveBackendPodcastCategorySlug(categoryId || "") ||
    (includeMature ? PODCAST_MATURE_CATEGORY_SLUG : null);

  if (includeMature) {
    // Mature sessions never fall into general catalog categories.
    slug = PODCAST_MATURE_CATEGORY_SLUG;
  }
  if (!slug) {
    podcastTrace("CONTINUATION_STOP", { reason: "no_category_slug", categoryId });
    return false;
  }

  const response = await fetchPodcastEpisodesByCategory(slug, 1, CATEGORY_CANDIDATE_LIMIT, {
    includeMature,
  });
  if (!response.success || !response.episodes.length) {
    podcastTrace("CONTINUATION_STOP", { reason: "category_empty", slug });
    return false;
  }

  const blocked = new Set<string>([
    currentEpisodeId,
    ...session.completedIds,
    ...session.failedIds,
  ]);

  const candidates = response.episodes.filter((entry) => {
    const id = clean(entry.id);
    if (!id || blocked.has(id)) return false;
    // Prefer other shows once the current show is exhausted.
    if (clean(entry.showId) === showId) return false;
    return true;
  });

  let failures = 0;
  for (const candidate of candidates.slice(0, MAX_CONTINUATION_CANDIDATES)) {
    if (!canPodcastSkipInvalidNext() && failures > 0) break;
    const played = await resolveAndPlayEpisode({
      metadata: candidate,
      showTitle: clean(candidate.showId) ? "Podcast" : args.showTitle,
      categoryId: slug,
      scope,
      bindings,
      seedQueue: [podcastEpisodeToAppSong(metadataToEpisode(candidate, "Podcast", [slug]))],
    });
    if (played) return true;
    failures += 1;
  }

  return false;
}

/**
 * Called only after natural track finish when the in-queue next index is exhausted.
 * Returns true when a continuation episode was started.
 */
export async function handlePodcastSessionFinished(
  bindings: PodcastFinishedBindings
): Promise<boolean> {
  if (continuationMutex) {
    podcastTrace("CONTINUATION_SKIP", { reason: "mutex" });
    return false;
  }

  const current = bindings.getCurrentSong();
  const context = bindings.getQueueContext();
  const queue = bindings.getQueue() || [];

  if (!current || !isPodcastAppSong(current)) return false;
  if (context && !isPodcastQueueContext(context) && !isPodcastAppSong(current)) return false;

  const episodeId = parsePodcastEpisodeSongId(current.id);
  if (!episodeId) return false;

  const scope = getPodcastContinuationScope(context, current);
  if (scope === "mature_only" && !shouldIncludeMaturePodcasts()) {
    podcastTrace("CONTINUATION_STOP", { reason: "mature_eligibility_lost" });
    return false;
  }

  const showId = clean(context?.albumId || context?.contextId || current.albumId);
  const showTitle = clean(context?.albumTitle || context?.contextTitle || current.album || current.artist) || "Podcast";
  const categoryId = clean(context?.genre) || null;

  continuationMutex = true;
  const generation = session.generation;
  session.completedIds = pushBounded(session.completedIds, episodeId);

  try {
    podcastTrace("CONTINUATION_START", {
      episodeId,
      showId,
      categoryId,
      scope,
      queueLength: queue.length,
    });

    if (showId) {
      const sameShow = await trySameShowContinuation({
        showId,
        showTitle,
        categoryId,
        scope,
        currentEpisodeId: episodeId,
        queue,
        bindings,
      });
      if (generation !== session.generation) return false;
      if (sameShow) return true;
    }

    const category = await tryCategoryContinuation({
      showId,
      showTitle,
      categoryId,
      scope,
      currentEpisodeId: episodeId,
      bindings,
    });
    if (generation !== session.generation) return false;
    return category;
  } finally {
    continuationMutex = false;
  }
}
