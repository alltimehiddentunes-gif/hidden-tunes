import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRightsFilter } from "@/lib/rights/filterSchema";
import type { RightsFilter, RightsFilterClause } from "@/lib/rights/types";

export const RIGHTS_CATALOG_SELECT = [
  "id", "content_type", "content_id", "parent_content_id", "title", "creator_name",
  "provider_id", "source_type", "source_key", "source_id", "source_host", "uploader_id",
  "import_batch", "ingested_at", "country_code", "region", "territory_hint", "stream_type",
  "base_rights_status", "evidence_status", "license_expires_at", "source_active",
  "ios_enabled", "android_enabled", "web_enabled", "windows_enabled", "macos_enabled",
  "linux_enabled", "review_assignee", "sort_at", "updated_at",
].join(",");

function invoke(query: unknown, method: string, ...args: unknown[]) {
  if (!query || typeof query !== "object") throw new Error("Invalid query builder.");
  const candidate = (query as Record<string, unknown>)[method];
  if (typeof candidate !== "function") throw new Error(`Query builder does not support ${method}.`);
  return candidate.apply(query, args) as unknown;
}

const FIELD_COLUMNS: Partial<Record<RightsFilterClause["field"], string>> = {
  content_type: "content_type",
  provider_id: "provider_id",
  rights_status: "base_rights_status",
  uploader_id: "uploader_id",
  import_batch: "import_batch",
  ingested_at: "ingested_at",
  country_code: "country_code",
  region: "region",
  territory: "territory_hint",
  evidence_status: "evidence_status",
  license_expires_at: "license_expires_at",
  stream_type: "stream_type",
  source_host: "source_host",
  source_active: "source_active",
  "platform.ios": "ios_enabled",
  "platform.android": "android_enabled",
  "platform.web": "web_enabled",
  "platform.windows": "windows_enabled",
  "platform.macos": "macos_enabled",
  "platform.linux": "linux_enabled",
};

export function applyRightsFilter<T>(query: T, filterInput: unknown) {
  const filter = normalizeRightsFilter(filterInput);
  let next: unknown = query;
  for (const clause of filter.all) {
    if (clause.field === "search") {
      next = invoke(next, "textSearch", "search_document", String(clause.value), {
        type: "websearch",
        config: "simple",
      });
      continue;
    }
    const column = FIELD_COLUMNS[clause.field];
    if (!column) throw new Error(`Unsupported filter column: ${clause.field}`);
    switch (clause.op) {
      case "eq": next = invoke(next, "eq", column, clause.value); break;
      case "in": next = invoke(next, "in", column, clause.value as string[]); break;
      case "gt": next = invoke(next, "gt", column, clause.value); break;
      case "gte": next = invoke(next, "gte", column, clause.value); break;
      case "lt": next = invoke(next, "lt", column, clause.value); break;
      case "lte": next = invoke(next, "lte", column, clause.value); break;
      case "present": next = invoke(next, "not", column, "is", null); break;
      case "missing": next = invoke(next, "is", column, null); break;
      default: throw new Error(`Unsupported filter operation: ${clause.op}`);
    }
  }
  return { query: next as T, filter };
}

export async function queryRightsCatalog(input: {
  client: SupabaseClient;
  filter: RightsFilter | unknown;
  limit?: number;
  afterId?: number;
  count?: "exact" | null;
}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);
  const base = input.client
    .from("rights_catalog_items")
    .select(RIGHTS_CATALOG_SELECT, { count: input.count ?? "exact" });
  const { query, filter } = applyRightsFilter(base, input.filter);
  const cursorQuery = input.afterId && input.afterId > 0 ? query.gt("id", input.afterId) : query;
  const result = await cursorQuery.order("id", { ascending: true }).limit(limit);
  return { ...result, normalizedFilter: filter, limit, afterId: input.afterId ?? null };
}

export async function countRightsCatalog(client: SupabaseClient, filter: RightsFilter | unknown) {
  const base = client.from("rights_catalog_items").select("id", { count: "exact", head: true });
  const { query, filter: normalizedFilter } = applyRightsFilter(base, filter);
  const result = await query;
  return { ...result, normalizedFilter };
}
