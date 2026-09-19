import type { TvValidationState } from "../types";

export type TvSourceConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "REJECT";
export type TvSourceHealth = "VERIFIED_HEALTHY" | "VERIFIED_STALE" | "TEMPORARILY_UNAVAILABLE" | "REFRESH_REQUIRED" | "IDENTITY_INVALIDATED" | "SOURCE_INVALIDATED";
export type TvRecoveryDecision = "DIRECT_CANDIDATE" | "PUBLIC_SESSION_CANDIDATE" | "EXTERNAL_PAGE_ONLY" | "ACCOUNT_REQUIRED" | "DRM_RESTRICTED" | "NO_SOURCE_FOUND" | "IDENTITY_UNCERTAIN";

export interface TvChannelIdentity { provider: string; providerChannelId: string; canonicalName: string; aliases: string[]; catalogOrigins: string[]; region: string[]; language: string[]; category: string[]; }
export interface TvPlaybackSourceCandidate { channelIdentity: string; sourceProvider: string; sourceType: string; sourceUrl: string; region: string | null; protocol: "hls" | "dash" | "other"; requiresHeaders: boolean; requiresPublicSession: boolean; requiresAccount: boolean; drm: boolean | "unknown"; confidence: TvSourceConfidence; provenance: string; discoveredAt: string; lastValidatedAt: string | null; validationStatus: TvValidationState; health?: TvSourceHealth; actualContentVerified?: boolean; continuitySeconds?: number; corsMode?: "direct" | "backend_delivery" | "unknown"; freshnessExpiresAt?: string | null; platformCompatibility: { mobile: boolean | null; desktop: boolean | null; smartTv: boolean | null }; }
export interface TvRecoveryQueueItem { identity: TvChannelIdentity; tier: "A" | "B" | "C"; broadcaster: string | null; decision: TvRecoveryDecision; candidates: TvPlaybackSourceCandidate[]; evidence: string[]; }
