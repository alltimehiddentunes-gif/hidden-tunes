export type YouTubeNavigationQueueItem = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  channelTitle?: string;
  thumbnail?: string;
};

let pendingQueue: YouTubeNavigationQueueItem[] | null = null;

/** Store a YouTube queue in memory before navigating — avoids huge route params. */
export function setPendingYouTubeQueue(queue: YouTubeNavigationQueueItem[]) {
  pendingQueue = queue.length ? queue : null;
}

/** Read and clear the pending queue (call once on the destination screen). */
export function consumePendingYouTubeQueue(): YouTubeNavigationQueueItem[] | null {
  const queue = pendingQueue;
  pendingQueue = null;
  return queue;
}
