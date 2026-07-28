import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const backupDir = path.join(adminRoot, "data", "podcast-backups");

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

async function fetchAllRows(
  table: string,
  select: string,
  pageSize = 1000
) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`${table}: ${error.message}`);

    const batch = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(backupDir, timestamp);
  fs.mkdirSync(targetDir, { recursive: true });

  const tables = [
    {
      name: "podcast_categories",
      select: "id, name, slug, description, is_active, sort_order, created_at",
    },
    {
      name: "podcast_shows",
      select: "*",
    },
    {
      name: "podcast_episodes",
      select: "*",
    },
  ] as const;

  const manifest: Record<string, unknown> = {
    created_at: new Date().toISOString(),
    tables: {},
    rollback_hint:
      "Restore by re-importing JSON snapshots into Supabase or using pg_restore from a DB dump taken before migration.",
  };

  for (const table of tables) {
    const rows = await fetchAllRows(table.name, table.select);
    const filePath = path.join(targetDir, `${table.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
    manifest.tables = {
      ...(manifest.tables as Record<string, unknown>),
      [table.name]: {
        row_count: rows.length,
        file: path.relative(adminRoot, filePath),
      },
    };
  }

  const manifestPath = path.join(targetDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        success: true,
        backup_dir: path.relative(adminRoot, targetDir),
        manifest: manifestPath,
        tables: manifest.tables,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
