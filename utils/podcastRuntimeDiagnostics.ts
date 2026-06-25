import { isDevEnvironment } from "./devDiagnostics";

export const ENABLE_PODCAST_RUNTIME_DIAGNOSTICS = true;

export function isPodcastRuntimeDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_PODCAST_RUNTIME_DIAGNOSTICS;
}

type PodcastRuntimePayload = Record<
  string,
  string | number | boolean | null | undefined | string[] | boolean[]
>;

export function logPodcastRuntime(event: string, payload: PodcastRuntimePayload = {}) {
  if (!isPodcastRuntimeDiagnosticsEnabled()) return;
  console.log("[HTPodcastRuntime]", event, { at: Date.now(), ...payload });
}

type PodcastDiscoveryLogItem = {
  id?: string;
  title?: string;
  artwork_url?: string;
  artworkUrl?: string;
};

export function logPodcastDiscoveryBatch(
  surface: "home" | "category" | "search" | "show",
  details: {
    url?: string;
    status?: number;
    ok?: boolean;
    count?: number;
    items?: PodcastDiscoveryLogItem[];
    showId?: string;
    feedId?: string;
    error?: string;
  }
) {
  if (!isPodcastRuntimeDiagnosticsEnabled()) return;

  const items = details.items || [];
  const titles = items
    .slice(0, 20)
    .map((item) => String(item.title || "").trim())
    .filter(Boolean);
  const ids = items
    .slice(0, 20)
    .map((item) => String(item.id || "").trim())
    .filter(Boolean);
  const artworkUrls = items
    .slice(0, 20)
    .map((item) => String(item.artwork_url || item.artworkUrl || "").trim())
    .filter(Boolean);

  logPodcastRuntime(`${surface}_batch`, {
    url: details.url,
    status: details.status,
    ok: details.ok,
    count: details.count ?? items.length,
    showId: details.showId,
    feedId: details.feedId,
    error: details.error,
    titles,
    ids,
    artworkUrls,
  });
}

export function logPodcastEpisodeBatch(
  showId: string,
  details: {
    url?: string;
    status?: number;
    ok?: boolean;
    count?: number;
    titles?: string[];
    audioUrlsPresent?: boolean[];
    feedId?: string;
    error?: string;
  }
) {
  if (!isPodcastRuntimeDiagnosticsEnabled()) return;

  const titles = (details.titles || []).slice(0, 10);
  const audioUrlsPresent = (details.audioUrlsPresent || []).slice(0, 10);

  logPodcastRuntime("show_episodes", {
    showId,
    feedId: details.feedId,
    url: details.url,
    status: details.status,
    ok: details.ok,
    count: details.count ?? titles.length,
    error: details.error,
    titles,
    audioUrlsPresent,
  });
}
