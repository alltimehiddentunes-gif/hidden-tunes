import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.MOTIVATION_VERIFY_BASE_URL || "https://admin.hiddentunes.com";

const PROHIBITED =
  /audio_url|video_url|file_url|stream_url|playable_url|signed_url|storage_key|required_headers/i;

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
  let parseError: string | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parseError = "non-json";
    body = { raw: text.slice(0, 160) };
  }
  const serialized = JSON.stringify(body);
  return {
    pathname,
    status: response.status,
    elapsed_ms: Date.now() - started,
    contentType: response.headers.get("content-type"),
    parseError,
    metadata_only: !PROHIBITED.test(serialized),
    has_details_leak: /invalid input syntax for type uuid|permission denied|supabase|postgres/i.test(
      serialized
    ),
    body,
    serialized,
  };
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const browse = await Promise.all([
    fetchJson("/api/motivation/items?limit=40"),
    fetchJson("/api/motivation/categories"),
    fetchJson("/api/motivation/search?q=success&limit=40"),
    fetchJson("/api/motivation/category/focus?limit=40"),
  ]);

  const { data: approvedItems } = await supabaseAdmin
    .from("motivation_items")
    .select("id, source_type, media_type:source_type")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable");

  const { data: pendingItem } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  const { data: inactiveItem } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("is_active", false)
    .limit(1)
    .maybeSingle();

  const { data: unverifiedItem } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("is_verified", false)
    .limit(1)
    .maybeSingle();

  const negativeTests = [];
  for (const [label, id] of [
    ["malformed", "not-a-uuid"],
    ["nonexistent", "00000000-0000-4000-8000-000000000000"],
  ] as const) {
    const result = await fetchJson(`/api/motivation/items/${encodeURIComponent(id)}/play`);
    negativeTests.push({
      label,
      status: result.status,
      ok:
        label === "malformed"
          ? result.status === 400 && !result.has_details_leak
          : result.status === 404 && !result.has_details_leak,
      error: (result.body.error as string) || null,
      details_present: "details" in result.body,
      db_leak: result.has_details_leak,
    });
  }

  for (const [label, row] of [
    ["pending", pendingItem],
    ["inactive", inactiveItem],
    ["unverified", unverifiedItem],
  ] as const) {
    if (!row?.id) continue;
    const result = await fetchJson(
      `/api/motivation/items/${encodeURIComponent(String(row.id))}/play`
    );
    negativeTests.push({
      label,
      status: result.status,
      ok: result.status >= 400 && result.status < 500 && !result.has_details_leak,
      error: (result.body.error as string) || null,
      details_present: "details" in result.body,
      db_leak: result.has_details_leak,
    });
  }

  const resolverResults = [];
  for (const row of approvedItems || []) {
    const id = String(row.id);
    const result = await fetchJson(`/api/motivation/items/${encodeURIComponent(id)}/play`);
    const returnedId = String(result.body.id || "");
    resolverResults.push({
      requested_id: id,
      returned_id: returnedId,
      status: result.status,
      media_type: result.body.media_type || null,
      playable_url_present: Boolean(result.body.stream_url),
      exact_match: result.status === 200 && returnedId === id,
    });
  }

  let detail: Awaited<ReturnType<typeof fetchJson>> | null = null;
  const approvedId = approvedItems?.[0]?.id;
  if (approvedId) {
    detail = await fetchJson(`/api/motivation/items/${encodeURIComponent(String(approvedId))}`);
  }

  const dup = {
    duplicateSourceKeys: 0,
    duplicatePairs: 0,
    duplicateFileKeys: 0,
    orphanCount: 0,
  };

  const { data: dupSourceKeys } = await supabaseAdmin
    .from("motivation_items")
    .select("source_key")
    .not("source_key", "is", null);
  const sourceKeyCounts = new Map<string, number>();
  for (const row of dupSourceKeys || []) {
    const key = String(row.source_key);
    sourceKeyCounts.set(key, (sourceKeyCounts.get(key) || 0) + 1);
  }
  dup.duplicateSourceKeys = [...sourceKeyCounts.values()].filter((count) => count > 1).length;

  const { data: dupPairs } = await supabaseAdmin.from("motivation_items").select("source_type, source_id");
  const pairCounts = new Map<string, number>();
  for (const row of dupPairs || []) {
    const key = `${row.source_type}:${row.source_id}`;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  dup.duplicatePairs = [...pairCounts.values()].filter((count) => count > 1).length;

  const { data: dupFileKeys } = await supabaseAdmin
    .from("motivation_files")
    .select("source_key")
    .not("source_key", "is", null);
  const fileKeyCounts = new Map<string, number>();
  for (const row of dupFileKeys || []) {
    const key = String(row.source_key);
    fileKeyCounts.set(key, (fileKeyCounts.get(key) || 0) + 1);
  }
  dup.duplicateFileKeys = [...fileKeyCounts.values()].filter((count) => count > 1).length;

  const { data: orphanFiles } = await supabaseAdmin
    .from("motivation_files")
    .select("item_id, motivation_items!left(id)");
  dup.orphanCount = (orphanFiles || []).filter(
    (row) => !(row as { motivation_items?: { id?: string } }).motivation_items?.id
  ).length;

  const { data: checkpoints } = await supabaseAdmin
    .from("motivation_import_checkpoints")
    .select("id, section, status, records_inserted, files_inserted, updated_at")
    .eq("section", "motivation")
    .order("updated_at", { ascending: false })
    .limit(3);

  const publicItemsCount = browse[0].body.items
    ? (browse[0].body.items as unknown[]).length
    : 0;

  console.log(
    JSON.stringify(
      {
        base_url: BASE,
        browse,
        detail,
        resolverResults,
        negativeTests,
        integrity: dup,
        checkpoints,
        public_catalog: {
          browse_visible_count: publicItemsCount,
          approved_db_count: approvedItems?.length || 0,
          pending_hidden: Boolean(pendingItem?.id),
        },
        latency_ms: Object.fromEntries(browse.map((row) => [row.pathname, row.elapsed_ms])),
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
