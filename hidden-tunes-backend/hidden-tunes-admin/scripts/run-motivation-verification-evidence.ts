import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

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

async function main() {
  const limitIndex = process.argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Math.max(1, Number(process.argv[limitIndex + 1] || 20)) : 20;

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { buildMotivationVerificationEvidence } = await import("@/lib/motivationVerification");
  const {
    loadEnabledMotivationRegistrySources,
    resolveMotivationRegistrySourceKey,
  } = await import("@/lib/motivationSourceRegistry");

  const registrySources = await loadEnabledMotivationRegistrySources();
  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, title, description, source_type, source_id, source_url, embed_url, source_key, category, subcategory, speaker_name, channel_name, duration_seconds, is_mature, status"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const reports = [];
  for (const item of data || []) {
    const registryKey = resolveMotivationRegistrySourceKey(item.source_key, registrySources);
    const registrySource =
      registrySources.find((row) => row.source_key === registryKey) || null;
    const report = await buildMotivationVerificationEvidence(item, registrySource);
    reports.push({
      item_id: report.item_id,
      eligibility: report.eligibility,
      summary: report.summary,
      health_score: report.health_score,
      health_status: report.health_status,
      checks: report.checks.map((check) => ({
        check: check.check,
        status: check.status,
        reason: check.reason,
      })),
    });
  }

  console.log(JSON.stringify({ dry_run: true, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
