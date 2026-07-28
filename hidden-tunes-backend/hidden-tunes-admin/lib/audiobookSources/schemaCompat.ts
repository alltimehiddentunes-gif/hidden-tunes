import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ColumnCache = {
  probedAt: number;
  tables: Record<string, Set<string>>;
};

const cache: ColumnCache = {
  probedAt: 0,
  tables: {},
};

const CACHE_TTL_MS = 5 * 60_000;

async function probeTableColumns(table: string): Promise<Set<string>> {
  const now = Date.now();
  if (now - cache.probedAt < CACHE_TTL_MS && cache.tables[table]) {
    return cache.tables[table];
  }

  const { data, error } = await supabaseAdmin.from(table).select("*").limit(1);
  if (error) throw error;

  const columns = new Set(data?.[0] ? Object.keys(data[0]) : []);
  // When empty, fall back to a conservative known production set.
  if (columns.size === 0) {
    if (table === "audiobooks") {
      return new Set([
        "slug",
        "title",
        "subtitle",
        "description",
        "cover_url",
        "author_name",
        "narrator_name",
        "category_slug",
        "categories",
        "language",
        "publisher",
        "source_type",
        "source_id",
        "source_url",
        "source_key",
        "normalized_title_author",
        "rights",
        "duration_seconds",
        "chapter_count",
        "status",
        "playback_status",
        "is_active",
        "is_verified",
        "is_mature",
        "is_public",
        "published_at",
        "last_checked_at",
      ]);
    }
    if (table === "audiobook_chapters") {
      return new Set([
        "audiobook_id",
        "title",
        "description",
        "chapter_number",
        "duration_seconds",
        "source_key",
        "audio_url",
        "is_active",
        "published_at",
      ]);
    }
    if (table === "audiobook_files") {
      return new Set([
        "audiobook_id",
        "chapter_id",
        "title",
        "audio_url",
        "duration_seconds",
        "format",
        "mime_type",
        "is_primary",
        "playback_status",
        "is_active",
        "source_key",
      ]);
    }
  }

  cache.tables[table] = columns;
  cache.probedAt = now;
  return columns;
}

export async function pickExistingColumns<T extends Record<string, unknown>>(
  table: string,
  payload: T
): Promise<Partial<T>> {
  const columns = await probeTableColumns(table);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (columns.has(key)) next[key] = value;
  }
  return next as Partial<T>;
}

export async function tableExists(table: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from(table).select("id").limit(1);
  if (!error) return true;
  const message = error.message || "";
  return !(
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}
