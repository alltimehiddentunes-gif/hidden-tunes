import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.AUDIOBOOK_VERIFY_BASE_URL || "https://admin.hiddentunes.com";

const REQUIRED_TABLES = [
  "audiobook_categories",
  "audiobook_authors",
  "audiobook_series",
  "audiobooks",
  "audiobook_chapters",
  "audiobook_files",
] as const;

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

function serializeLocalError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: String(error || "unknown") };
  }
  const record = error as Record<string, unknown>;
  return {
    message: record.message || "unknown",
    code: record.code || null,
    details: record.details || null,
    hint: record.hint || null,
    schema_mode: record.schema_mode || null,
  };
}

async function tableExists(table: string) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { error } = await supabaseAdmin.from(table).select("id").limit(1);
  if (!error) return { ok: true as const };

  return {
    ok: false as const,
    code: (error as { code?: string }).code || null,
    message: error.message,
    details: (error as { details?: string }).details || null,
    hint: (error as { hint?: string }).hint || null,
  };
}

async function probeEndpoint(path: string) {
  const url = `${BASE}${path}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const body = await response.json().catch(() => ({}));
    return {
      url,
      status: response.status,
      success: body?.success === true,
      error: body?.error || null,
      details: body?.details || null,
      sample_keys: Object.keys(body || {}).slice(0, 8),
      total:
        Number(body?.pagination?.total) ||
        Number(body?.categories?.length) ||
        Number(body?.items?.length) ||
        0,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: null,
      sample_keys: [],
      total: 0,
    };
  }
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { AUDIOBOOK_CATEGORIES, listAudiobookCategories, listAudiobooks } =
    await import("../lib/audiobookCatalog");

  const schemaMode = "modern";

  const env = Object.fromEntries(
    REQUIRED_ENV.map((key) => [key, Boolean(process.env[key])])
  );

  const tables: Record<string, unknown> = {};
  for (const table of REQUIRED_TABLES) {
    tables[table] = await tableExists(table);
  }

  const { count: publicBooks, error: publicBooksError } = await supabaseAdmin
    .from("audiobooks")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false);

  const { count: playableFiles, error: playableFilesError } = await supabaseAdmin
    .from("audiobook_files")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("playback_status", "playable");

  const endpoints = {
    tree: await probeEndpoint("/api/audiobooks/tree"),
    fiction: await probeEndpoint("/api/audiobooks/category/fiction?limit=1"),
    search: await probeEndpoint("/api/audiobooks/search?q=adventure&limit=1"),
  };

  let samplePlay: Record<string, unknown> | null = null;
  const fiction = await probeEndpoint("/api/audiobooks/category/fiction?limit=1");
  const fictionBody = fiction as {
    audiobooks?: Array<{ id?: string; audio_url?: string }>;
  };
  const sampleId = fictionBody.audiobooks?.[0]?.id || null;

  if (sampleId) {
    const detail = await probeEndpoint(`/api/audiobooks/${encodeURIComponent(sampleId)}`);
    const play = await probeEndpoint(
      `/api/audiobooks/${encodeURIComponent(sampleId)}/play`
    );
    samplePlay = {
      detail,
      play_has_audio_url: Boolean((play as { audio_url?: string }).audio_url),
      list_has_audio_url: Boolean(fictionBody.audiobooks?.[0]?.audio_url),
    };
  }

  const { countAudiobooksForCategory } = await import("../lib/audiobookCatalog");
  const categoryCounts: Record<string, number> = {};
  for (const category of AUDIOBOOK_CATEGORIES.filter(
    (entry) => entry.slug !== "mature"
  )) {
    try {
      categoryCounts[category.slug] = await countAudiobooksForCategory(
        category.slug,
        false
      );
    } catch (error) {
      categoryCounts[category.slug] = -1;
      categoryCounts[`${category.slug}_error`] = serializeLocalError(error) as never;
    }
  }

  const localTree = await listAudiobookCategories(false).catch((error) => ({
    error: serializeLocalError(error),
  }));
  const localFictionResult = await listAudiobooks({
    page: 1,
    limit: 1,
    category: "fiction",
    mature: false,
  }).catch((error) => ({ error: serializeLocalError(error) }));

  const localFiction =
    "error" in localFictionResult
      ? localFictionResult
      : {
          total: localFictionResult.pagination.total,
          sample_title: localFictionResult.items[0]?.title || null,
        };

  const report = {
    base_url: BASE,
    schema_mode: schemaMode,
    env,
    tables,
    database: {
      public_books: publicBooksError
        ? { error: publicBooksError.message, code: publicBooksError.code }
        : publicBooks || 0,
      playable_files: playableFilesError
        ? { error: playableFilesError.message, code: playableFilesError.code }
        : playableFiles || 0,
      category_counts: categoryCounts,
    },
    endpoints,
    local_api: {
      tree: Array.isArray(localTree)
        ? {
            categories: localTree.length,
            with_items: localTree.filter((entry) => entry.item_count > 0).length,
          }
        : localTree,
      fiction: localFiction,
    },
    sample_play: samplePlay,
    migration_hint:
      "Run npm run audiobook:apply-migration if any audiobook_* table is missing or missing columns.",
  };

  console.log(JSON.stringify(report, null, 2));

  const tablesOk = Object.values(tables).every((entry) =>
    Boolean((entry as { ok?: boolean }).ok)
  );
  const envOk = REQUIRED_ENV.every((key) => env[key]);
  const hasPublicBooks =
    typeof report.database.public_books === "number" &&
    report.database.public_books > 0;

  const localOk =
    Array.isArray(localTree) &&
    localTree.some((entry) => entry.item_count > 0) &&
    !("error" in localFiction) &&
    "total" in localFiction &&
    localFiction.total > 0;

  if (!tablesOk || !envOk) {
    process.exitCode = 2;
    return;
  }

  if (!hasPublicBooks || !localOk) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
