import type { DiscoveredSourceItem, ProviderId, RightsEvaluationInput, SourceDiscoveryRequest, SourceHealth, SourceRateLimitPolicy } from "./types";
export type SourceMetadata = Record<string, unknown>;
export type ResolvedMedia = { mediaUrl: string; contentType?: string | null; expiresAt?: string | null };
export interface ExternalCatalogSourceAdapter {
  readonly providerId: ProviderId;
  discover(request: SourceDiscoveryRequest): Promise<readonly DiscoveredSourceItem[]>;
  fetchMetadata(sourceItemId: string): Promise<SourceMetadata>;
  fetchRights(sourceItemId: string): Promise<RightsEvaluationInput>;
  resolveMedia(sourceItemId: string): Promise<ResolvedMedia>;
  normalize(metadata: SourceMetadata): SourceMetadata;
  healthCheck(): Promise<SourceHealth>;
  rateLimitPolicy(): SourceRateLimitPolicy;
}

