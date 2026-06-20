import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import { fetchArchiveVideoDocuments, type ArchiveVideoSearchOptions } from "./archiveVideoApi";
import { archiveVideoDocumentsToTvVideos } from "./archiveVideoNormalizer";

export type { ArchiveVideoSearchOptions } from "./archiveVideoApi";

export async function fetchArchiveConcertVideos(
  options: ArchiveVideoSearchOptions = {}
): Promise<HiddenTunesTvVideo[]> {
  const docs = await fetchArchiveVideoDocuments(options);
  return archiveVideoDocumentsToTvVideos(docs);
}
