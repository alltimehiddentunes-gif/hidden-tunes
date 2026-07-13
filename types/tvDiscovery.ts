import type { TvCatalogQuery } from "@/services/tvCatalogApi";
import type { TvStationMetadataMode } from "@/utils/tvPlayabilityGate";

export type TvContextType =
  | "tv-search"
  | "tv-category"
  | "tv-subcategory"
  | "tv-country"
  | "tv-region"
  | "tv-language"
  | "tv-genre"
  | "tv-featured"
  | "tv-favorites"
  | "tv-recent"
  | "tv-related"
  | "tv-broadcaster"
  | "tv-global"
  | "tv-discovery";

export type TvQueueItem = {
  stationId: string;
  stationName: string;
  artwork: string;
  country: string;
  countryCode: string;
  region: string;
  language: string;
  category: string;
  subcategory: string;
  genre: string;
  broadcaster: string;
  verified: boolean;
  playable: boolean;
  public: boolean;
  sourceType: string;
  description: string;
  tags: string[];
  reliabilityScore: number;
  metadataMode?: TvStationMetadataMode;
  hierarchyLevel: number;
  hierarchyLabel: string;
};

export type TvHierarchyLayer = {
  level: number;
  label: string;
  query: TvCatalogQuery;
  page: number;
  hasMore: boolean;
  exhausted: boolean;
  loading: boolean;
  metadataMode?: TvStationMetadataMode;
};

export type TvDiscoveryLaunchContext = {
  contextType: TvContextType;
  contextId: string;
  contextTitle: string;
  sourceContextType?: TvContextType;
  sourceContextId?: string;
  sourceContextTitle?: string;
  originalSearchQuery?: string;
  originalCategory?: string;
  originalCountry?: string;
  originalLanguage?: string;
  originalRegion?: string;
  browseReturnPath?: string;
  metadataMode?: TvStationMetadataMode;
};

export type TvDiscoverySession = {
  queueType: "tv";
  contextType: TvContextType;
  contextId: string;
  contextTitle: string;
  sourceContextType: TvContextType;
  sourceContextId: string;
  sourceContextTitle: string;
  originalContext: TvDiscoveryLaunchContext;
  items: TvQueueItem[];
  currentIndex: number;
  hierarchyLayers: TvHierarchyLayer[];
  activeLayerLabel: string;
  hierarchyPath: string[];
  metadataMode: TvStationMetadataMode;
  seenStationIds: Record<string, true>;
  failedStationIds: Record<string, string>;
  playedStationIds: string[];
  playedHistory: string[];
  playedHistoryIndex: number;
  resolutionSequence: number;
  transitionGeneration: number;
  confirmedActiveStation: TvQueueItem | null;
  confirmedStreamUrl: string;
  confirmedSourceType: string;
  pendingCandidateStation: TvQueueItem | null;
  pendingCandidateIndex: number;
  pendingStreamUrl: string;
  pendingSourceType: string;
};

export type TvStationPlayResult =
  | {
      ok: true;
      station: TvQueueItem;
      streamUrl: string;
      sourceType: string;
      resolutionSequence: number;
      candidateIndex: number;
      pendingOnly: true;
    }
  | {
      ok: false;
      error: string;
      exhausted?: boolean;
      attempts?: number;
    };
