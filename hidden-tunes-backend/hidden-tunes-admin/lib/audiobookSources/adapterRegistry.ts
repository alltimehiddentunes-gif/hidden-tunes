import {
  resolveInternetArchiveQuery,
  INTERNET_ARCHIVE_AUDIOBOOK_QUERIES,
} from "@/lib/audiobookSources/internetArchiveQueries";
import {
  discoverInternetArchiveAudiobooks,
  fetchInternetArchiveAudiobookCandidate,
} from "@/lib/audiobookSources/internetArchiveAudiobookSource";
import type { AudiobookSourceAdapter } from "@/lib/audiobookSources/types";

function createInternetArchiveAdapter(family: string): AudiobookSourceAdapter | null {
  const definition = resolveInternetArchiveQuery(family);
  if (!definition) return null;

  return {
    sourceKey: definition.sourceKey,
    sourceName: definition.sourceName,
    catalogLane: definition.catalogLane,
    async discover(input) {
      const page = await discoverInternetArchiveAudiobooks({
        queryFamily: definition.family,
        page: input.page,
        limit: input.limit,
        signal: input.signal,
      });
      return {
        identifiers: page.identifiers,
        hasMore: page.hasMore,
        nextPage: page.nextPage,
        nextCursor: String(page.nextPage),
      };
    },
    async fetchCandidate(input) {
      return fetchInternetArchiveAudiobookCandidate({
        identifier: input.identifier,
        queryFamily: definition.family,
        signal: input.signal,
      });
    },
  };
}

const adapters = new Map<string, AudiobookSourceAdapter>();

for (const definition of Object.values(INTERNET_ARCHIVE_AUDIOBOOK_QUERIES)) {
  const adapter = createInternetArchiveAdapter(definition.family);
  if (adapter) adapters.set(adapter.sourceKey, adapter);
}

export function getAudiobookSourceAdapter(
  sourceKey: string
): AudiobookSourceAdapter | null {
  return adapters.get(sourceKey) || null;
}

export function listAudiobookSourceAdapters(lane?: "general" | "mature") {
  const values = [...adapters.values()];
  if (!lane) return values;
  return values.filter((adapter) => adapter.catalogLane === lane);
}

export function listAudiobookAdapterSourceKeys(lane?: "general" | "mature") {
  return listAudiobookSourceAdapters(lane).map((adapter) => adapter.sourceKey);
}
