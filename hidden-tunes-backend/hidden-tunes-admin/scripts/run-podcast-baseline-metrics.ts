import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const PUBLIC_BASE =
  process.env.PODCAST_PUBLIC_BASE_URL?.trim() || "https://admin.hiddentunes.com";

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

async function timedFetch(url: string) {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const elapsedMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, elapsedMs, payload };
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const counts: Record<string, number | string> = {};
  const countQueries = {
    shows_total: () =>
      supabaseAdmin.from("podcast_shows").select("id", { count: "exact", head: true }),
    shows_public: () =>
      supabaseAdmin
        .from("podcast_shows")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("feed_status", "active")
        .eq("is_mature", false),
    episodes_total: () =>
      supabaseAdmin.from("podcast_episodes").select("id", { count: "exact", head: true }),
    episodes_playable: () =>
      supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("playback_status", "playable"),
  };

  for (const [label, fn] of Object.entries(countQueries)) {
    const { count, error } = await fn();
    counts[label] = error ? error.message : count || 0;
  }

  const apiLatency: Record<string, unknown> = {};
  for (const endpoint of [
    "/api/podcasts/categories",
    "/api/podcasts/shows?limit=1",
    "/api/podcasts/episodes?limit=1",
  ]) {
    const result = await timedFetch(`${PUBLIC_BASE}${endpoint}`);
    apiLatency[endpoint] = {
      status: result.status,
      elapsed_ms: result.elapsedMs,
      total: Number(result.payload?.pagination?.total || 0),
    };
  }

  const report = {
    captured_at: new Date().toISOString(),
    database: counts,
    api_latency: apiLatency,
    base_url: PUBLIC_BASE,
  };

  const outDir = path.join(adminRoot, "data", "podcast-backups");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `baseline-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ ...report, saved_to: path.relative(adminRoot, outPath) }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
