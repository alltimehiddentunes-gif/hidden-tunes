import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.AUDIOBOOK_VERIFY_BASE_URL || "https://admin.hiddentunes.com";

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

async function fetchCategoryTotal(category: string) {
  const response = await fetch(
    `${BASE}/api/audiobooks/category/${encodeURIComponent(category)}?limit=1`,
    { signal: AbortSignal.timeout(25_000) }
  );
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    total: Number(body?.pagination?.total || 0),
    error: body?.error || null,
    details: body?.details || null,
  };
}

async function main() {
  const { AUDIOBOOK_CATEGORIES, countAudiobooksForCategory } = await import(
    "../lib/audiobookCatalog"
  );

  const schemaMode = "modern";
  const categories = AUDIOBOOK_CATEGORIES.filter(
    (category) => category.slug !== "mature"
  ).map((category) => category.slug);

  const live: Record<string, { status: number; total: number; error?: string | null }> =
    {};
  const database: Record<string, number> = {};

  for (const category of categories) {
    live[category] = await fetchCategoryTotal(category);
    database[category] = await countAudiobooksForCategory(category, false).catch(
      () => -1
    );
  }

  const emptyCategories = categories.filter(
    (slug) => (database[slug] || 0) === 0 || (live[slug]?.total || 0) === 0
  );

  console.log(
    JSON.stringify(
      {
        schema_mode: schemaMode,
        live_api: live,
        database,
        empty_categories: emptyCategories,
      },
      null,
      2
    )
  );

  if (emptyCategories.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
