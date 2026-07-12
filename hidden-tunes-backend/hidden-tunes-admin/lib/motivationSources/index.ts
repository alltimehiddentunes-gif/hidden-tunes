export type {
  MotivationDiscoveryCandidate,
  MotivationDiscoveryOptions,
  MotivationDiscoveryPage,
  MotivationMediaCandidate,
  MotivationSourceAdapter,
} from "@/lib/motivationSources/types";

export {
  ArchiveMotivationSource,
  ARCHIVE_MOTIVATION_QUERY_FAMILIES,
  buildArchiveMotivationCandidates,
  discoveryCandidateToGrowthCandidate,
  extractArchiveDurationSeconds,
} from "@/lib/motivationSources/archiveSource";

import { ArchiveMotivationSource } from "@/lib/motivationSources/archiveSource";
import {
  CreatorFeedMotivationSource,
  GovernmentArchiveMotivationSource,
  PublicSpeechMotivationSource,
  RssMotivationSource,
  UniversityOpenMediaMotivationSource,
} from "@/lib/motivationSources/stubAdapters";

export const MOTIVATION_SOURCE_ADAPTERS = [
  new ArchiveMotivationSource(),
  new GovernmentArchiveMotivationSource(),
  new UniversityOpenMediaMotivationSource(),
  new PublicSpeechMotivationSource(),
  new CreatorFeedMotivationSource(),
  new RssMotivationSource(),
];

export function getMotivationSourceAdapter(sourceKey: string) {
  return MOTIVATION_SOURCE_ADAPTERS.find((adapter) => adapter.sourceKey === sourceKey) || null;
}
