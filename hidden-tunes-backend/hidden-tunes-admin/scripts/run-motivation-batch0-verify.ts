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

async function fetchJson(pathname: string) {
  const started = Date.now();
  const response = await fetch(`${BASE}${pathname}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return {
    pathname,
    status: response.status,
    elapsed_ms: Date.now() - started,
    body,
    serialized: JSON.stringify(body),
  };
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const counts = {
    motivation_categories: (
      await supabaseAdmin.from("motivation_categories").select("id", { count: "exact", head: true })
    ).count,
    motivation_items: (
      await supabaseAdmin.from("motivation_items").select("id", { count: "exact", head: true })
    ).count,
    motivation_files: (
      await supabaseAdmin.from("motivation_files").select("id", { count: "exact", head: true })
    ).count,
  };

  const { data: statusRows } = await supabaseAdmin
    .from("motivation_items")
    .select("status, is_active, is_verified, playback_status");

  const statusDistribution: Record<string, number> = {};
  for (const row of statusRows || []) {
    const key = `${row.status}|active:${row.is_active}|verified:${row.is_verified}|playback:${row.playback_status}`;
    statusDistribution[key] = (statusDistribution[key] || 0) + 1;
  }

  const { data: dupSourceKeys } = await supabaseAdmin
    .from("motivation_items")
    .select("source_key")
    .not("source_key", "is", null);
  const sourceKeyCounts = new Map<string, number>();
  for (const row of dupSourceKeys || []) {
    const key = String(row.source_key);
    sourceKeyCounts.set(key, (sourceKeyCounts.get(key) || 0) + 1);
  }
  const duplicateSourceKeys = [...sourceKeyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([source_key, count]) => ({ source_key, count }));

  const { data: dupPairs } = await supabaseAdmin
    .from("motivation_items")
    .select("source_type, source_id");
  const pairCounts = new Map<string, number>();
  for (const row of dupPairs || []) {
    const key = `${row.source_type}:${row.source_id}`;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  const duplicatePairs = [...pairCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pair, count]) => ({ pair, count }));

  const { data: dupFileKeys } = await supabaseAdmin
    .from("motivation_files")
    .select("source_key")
    .not("source_key", "is", null);
  const fileKeyCounts = new Map<string, number>();
  for (const row of dupFileKeys || []) {
    const key = String(row.source_key);
    fileKeyCounts.set(key, (fileKeyCounts.get(key) || 0) + 1);
  }
  const duplicateFileKeys = [...fileKeyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([source_key, count]) => ({ source_key, count }));

  const { data: orphanFiles } = await supabaseAdmin
    .from("motivation_files")
    .select("item_id, motivation_items!left(id)");
  const orphanCount = (orphanFiles || []).filter((row) => !(row as { motivation_items?: { id?: string } }).motivation_items?.id).length;

  const browseRoutes = [
    "/api/motivation/items?limit=40",
    "/api/motivation/categories",
    "/api/motivation/category/focus?limit=40",
    "/api/motivation/search?q=success&limit=40",
  ];

  const browse = [];
  for (const pathname of browseRoutes) {
    const result = await fetchJson(pathname);
    browse.push({
      pathname,
      status: result.status,
      elapsed_ms: result.elapsed_ms,
      metadata_only: !/audio_url|video_url|stream_url|playable_url|file_url|signed_url/i.test(
        result.serialized
      ),
    });
  }

  const { data: approvedItems } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .limit(20);

  const resolverResults = [];
  for (const row of approvedItems || []) {
    const id = String(row.id);
    const result = await fetchJson(`/api/motivation/items/${encodeURIComponent(id)}/play`);
    const body = result.body;
    const returnedId = String(body.id || "");
    resolverResults.push({
      requested_id: id,
      returned_id: returnedId,
      status: result.status,
      exact_match: result.status === 200 && returnedId === id,
    });
  }

  const negativeTests = [];
  for (const [label, id] of [
    ["malformed", "not-a-uuid"],
    ["nonexistent", "00000000-0000-4000-8000-000000000000"],
  ] as const) {
    const result = await fetchJson(`/api/motivation/items/${encodeURIComponent(id)}/play`);
    negativeTests.push({
      label,
      status: result.status,
      ok: result.status >= 400 && result.status < 500,
      body: result.body,
    });
  }

  const { data: pendingItem } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (pendingItem?.id) {
    const result = await fetchJson(
      `/api/motivation/items/${encodeURIComponent(String(pendingItem.id))}/play`
    );
    negativeTests.push({
      label: "pending",
      status: result.status,
      ok: result.status >= 400 && result.status < 500,
      body: result.body,
    });
  }

  const { data: checkpoints } = await supabaseAdmin
    .from("motivation_import_checkpoints")
    .select("*")
    .eq("section", "motivation")
    .order("updated_at", { ascending: false })
    .limit(3);

  console.log(
    JSON.stringify(
      {
        counts,
        statusDistribution,
        duplicateSourceKeys,
        duplicatePairs,
        duplicateFileKeys,
        orphanCount,
        browse,
        resolverResults,
        negativeTests,
        checkpoints,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
