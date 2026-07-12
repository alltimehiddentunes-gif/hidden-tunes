import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.MOTIVATION_VERIFY_BASE_URL || "https://admin.hiddentunes.com";

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

async function fetchCategoryTotal(slug: string) {
  const response = await fetch(
    `${BASE}/api/motivation/category/${encodeURIComponent(slug)}?limit=1`,
    { signal: AbortSignal.timeout(25_000) }
  );
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    total: Number(body?.pagination?.total || 0),
    error: body?.error || null,
  };
}

async function main() {
  const { MOTIVATION_CATEGORIES, countMotivationItemsForCategory } = await import(
    "../lib/motivationCatalog"
  );

  const live: Record<string, { status: number; total: number; error?: string | null }> = {};
  const database: Record<string, number> = {};

  for (const category of MOTIVATION_CATEGORIES) {
    live[category.slug] = await fetchCategoryTotal(category.slug);
    database[category.slug] = await countMotivationItemsForCategory(category.slug).catch(
      () => -1
    );
  }

  const emptyCategories = MOTIVATION_CATEGORIES.map((c) => c.slug).filter(
    (slug) => (database[slug] || 0) === 0 || (live[slug]?.total || 0) === 0
  );

  console.log(JSON.stringify({ live_api: live, database, empty_categories: emptyCategories }, null, 2));

  if (emptyCategories.length === MOTIVATION_CATEGORIES.length) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
