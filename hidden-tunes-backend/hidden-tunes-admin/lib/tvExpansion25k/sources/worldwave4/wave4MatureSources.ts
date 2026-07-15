import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";

/**
 * Mature Wave 4 source adapters — registry only until legal review approves each source.
 * No production import until approvalStatus === "approved" and mature_source_approved === true.
 */
export const WAVE4_MATURE_SOURCE_RECORDS = [] as const;

export const WORLDWAVE4_MATURE_SOURCE_ADAPTERS: TvExpansionSourceAdapter[] = [];

export const WAVE4_MATURE_APPROVED_SOURCE_IDS = [] as const;
