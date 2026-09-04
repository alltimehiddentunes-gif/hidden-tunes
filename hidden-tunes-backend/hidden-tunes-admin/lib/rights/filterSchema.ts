import { createHash } from "node:crypto";

import {
  RIGHTS_CONTENT_TYPES,
  RIGHTS_PLATFORMS,
  RIGHTS_STATUSES,
  type RightsFilter,
  type RightsFilterClause,
  type RightsFilterField,
  type RightsFilterOperator,
} from "@/lib/rights/types";

const MAX_CLAUSES = 32;
const MAX_TEXT = 240;
const MAX_IN_VALUES = 100;
const OPERATORS = new Set<RightsFilterOperator>([
  "eq", "in", "gt", "gte", "lt", "lte", "present", "missing", "search",
]);
const FIELDS = new Set<RightsFilterField>([
  "content_type", "provider_id", "rights_status", "uploader_id", "import_batch",
  "ingested_at", "country_code", "region", "territory", "evidence_status",
  "license_expires_at", "stream_type", "source_host", "source_active", "search",
  ...RIGHTS_PLATFORMS.map((platform) => `platform.${platform}` as const),
]);

function cleanText(value: unknown) {
  if (typeof value !== "string") throw new Error("Filter value must be text.");
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > MAX_TEXT) throw new Error("Invalid filter text length.");
  return cleaned;
}

function normalizeValue(clause: RightsFilterClause) {
  if (clause.op === "present" || clause.op === "missing") return undefined;
  if (clause.op === "in") {
    if (!Array.isArray(clause.value) || clause.value.length === 0 || clause.value.length > MAX_IN_VALUES) {
      throw new Error("IN filters require 1-100 values.");
    }
    return [...new Set(clause.value.map(cleanText))].sort();
  }
  if (clause.field === "source_active" || clause.field.startsWith("platform.")) {
    if (typeof clause.value !== "boolean") throw new Error("Boolean filter value required.");
    return clause.value;
  }
  const value = cleanText(clause.value);
  if (clause.field === "content_type" && !RIGHTS_CONTENT_TYPES.includes(value as never)) {
    throw new Error("Unknown content type.");
  }
  if (clause.field === "rights_status" && !RIGHTS_STATUSES.includes(value as never)) {
    throw new Error("Unknown rights status.");
  }
  if ((clause.field === "ingested_at" || clause.field === "license_expires_at") && Number.isNaN(Date.parse(value))) {
    throw new Error("Invalid date filter.");
  }
  return value;
}

export function normalizeRightsFilter(input: unknown): RightsFilter {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Filter must be an object.");
  const candidate = input as { version?: unknown; all?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.all) || candidate.all.length > MAX_CLAUSES) {
    throw new Error("Unsupported or oversized filter.");
  }
  const all = candidate.all.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid filter clause.");
    const clause = raw as RightsFilterClause;
    if (!FIELDS.has(clause.field) || !OPERATORS.has(clause.op)) throw new Error("Unsupported filter field or operation.");
    if (clause.field === "search" && clause.op !== "search") throw new Error("Search requires the search operator.");
    if (clause.op === "search" && clause.field !== "search") throw new Error("Search operator is field-specific.");
    return { field: clause.field, op: clause.op, value: normalizeValue(clause) } as RightsFilterClause;
  });
  all.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { version: 1, all };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashRightsValue(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function createFilterSnapshot(input: unknown, options: {
  actorId: string;
  exactCount: number;
  catalogWatermark: string;
  policyRevision: number;
  ttlMinutes?: number;
}) {
  const filter = normalizeRightsFilter(input);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + (options.ttlMinutes ?? 30) * 60_000);
  return {
    actor_id: options.actorId,
    normalized_filter: filter,
    filter_hash: hashRightsValue(filter),
    exact_count: options.exactCount,
    catalog_watermark: options.catalogWatermark,
    policy_revision: options.policyRevision,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

