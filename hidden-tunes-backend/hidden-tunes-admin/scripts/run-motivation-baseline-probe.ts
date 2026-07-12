import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = "https://admin.hiddentunes.com";

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

async function probeRoute(name: string, routePath: string) {
  const started = Date.now();
  const url = `${BASE}${routePath}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await response.text();
    const elapsed = Date.now() - started;
    let body: unknown = null;
    let parseError: string | null = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      parseError = "non-json";
    }
    const serialized = JSON.stringify(body ?? text.slice(0, 200));
    return {
      name,
      url,
      status: response.status,
      ok: response.ok,
      elapsed_ms: elapsed,
      parseError,
      success: typeof body === "object" && body !== null && (body as { success?: boolean }).success,
      hasPlayableUrl: /audio_url|video_url|stream_url|playable_url|file_url|signed_url/i.test(
        serialized
      ),
      sample: serialized.slice(0, 200),
    };
  } catch (error) {
    return {
      name,
      url,
      status: 0,
      ok: false,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const tables = [
    "motivation_categories",
    "motivation_items",
    "motivation_files",
    "motivation_source_registry",
    "motivation_import_checkpoints",
  ] as const;

  const tablePrimaryKeys: Record<(typeof tables)[number], string> = {
    motivation_categories: "id",
    motivation_items: "id",
    motivation_files: "id",
    motivation_source_registry: "source_key",
    motivation_import_checkpoints: "id",
  };

  const tableChecks = [];
  for (const table of tables) {
    const pk = tablePrimaryKeys[table];
    const countResult = await supabaseAdmin.from(table).select(pk, { count: "exact", head: true });
    const rowResult = await supabaseAdmin.from(table).select(pk).limit(1);
    tableChecks.push({
      table,
      count: countResult.error ? null : countResult.count ?? 0,
      readable: !countResult.error && !rowResult.error,
      error: countResult.error?.message || rowResult.error?.message || null,
    });
  }

  const publicFilesAccess = {
    anon_blocked: true,
    authenticated_blocked: true,
    details: [] as string[],
  };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (supabaseUrl && anonKey) {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonResult = await anonClient.from("motivation_files").select("id").limit(1);
    publicFilesAccess.anon_blocked = Boolean(anonResult.error);
    publicFilesAccess.details.push(
      anonResult.error
        ? `anon blocked: ${anonResult.error.message}`
        : "anon NOT blocked: motivation_files readable"
    );
  } else {
    publicFilesAccess.details.push("anon probe skipped: missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const routes = [
    ["items", "/api/motivation/items?limit=3"],
    ["categories", "/api/motivation/categories"],
    ["search", "/api/motivation/search?q=success&limit=3"],
    ["category_focus", "/api/motivation/category/focus?limit=3"],
  ] as const;

  const routeResults = [];
  for (const [name, routePath] of routes) {
    routeResults.push(await probeRoute(name, routePath));
  }

  const permissionDenied = tableChecks.some((row) =>
    String(row.error || "").toLowerCase().includes("permission denied")
  );
  const allReadable = tableChecks.every((row) => row.readable);
  const routesCoreOk = routeResults
    .filter((row) => row.name === "items" || row.name === "categories")
    .every((row) => row.ok && row.success && !row.parseError);

  const pass = !permissionDenied && allReadable && publicFilesAccess.anon_blocked && routesCoreOk;

  console.log(
    JSON.stringify(
      {
        pass,
        tableChecks,
        starting_counts: Object.fromEntries(
          tableChecks.map((row) => [row.table, row.count])
        ),
        publicFilesAccess,
        routeResults,
      },
      null,
      2
    )
  );

  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
