export type MotivationMediaCandidate = {
  url: string;
  mediaType: "audio" | "video" | "stream";
  mimeType?: string | null;
  fileName?: string | null;
  durationSeconds?: number | null;
  isPrimary?: boolean;
};

export type MotivationDiscoveryCandidate = {
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  canonicalSourceUrl: string;
  title: string;
  description?: string;
  creator?: string;
  speaker?: string;
  channel?: string;
  tags: string[];
  subjects: string[];
  language?: string;
  country?: string;
  publishedAt?: string;
  durationSeconds?: number | null;
  artworkUrl?: string;
  mediaCandidates: MotivationMediaCandidate[];
  license?: string;
  rightsEvidence?: unknown;
  rawMetadata?: unknown;
  collection?: string;
  provider?: string;
  category?: string;
  subcategory?: string;
};

export type MotivationDiscoveryOptions = {
  target?: number;
  queryFamily?: string;
  language?: string;
  categorySlug?: string;
  page?: number;
  cursor?: string;
  rowsPerPage?: number;
  maxPages?: number;
  concurrency?: number;
};

export type MotivationDiscoveryPage = {
  candidates: MotivationDiscoveryCandidate[];
  nextPage: number | null;
  nextCursor: string | null;
  queryFamily: string;
  provider: string;
};

export type MotivationSourceAdapter = {
  sourceKey: string;
  provider: string;
  discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage>;
};
