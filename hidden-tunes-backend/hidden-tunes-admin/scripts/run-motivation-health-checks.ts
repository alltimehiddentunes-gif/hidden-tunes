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
    limitIndex >= 0 ? Math.max(1, Number(process.argv[limitIndex + 1] || 50)) : 50;

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { probeMotivationItem, applyMotivationHealthProbe } = await import(
    "@/lib/motivationHealth"
  );
  const { computeMotivationHealthScore } = await import("@/lib/motivationHealthScore");

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, source_type, source_id, source_url, embed_url, status, playback_status, is_active, is_verified, reliability_score, consecutive_failures"
    )
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .order("last_health_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let checked = 0;
  let playable = 0;
  let demoted = 0;
  let healthy = 0;
  let warning = 0;
  let unhealthy = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of data || []) {
    const probe = await probeMotivationItem(row);
    const update = applyMotivationHealthProbe(row, probe);
    const healthScore = computeMotivationHealthScore({
      media_probe_pass: probe.playable,
      rights_pass: true,
      metadata_complete: true,
      primary_file_pass: true,
      duplicate_classification: "none",
      category_valid: true,
      maturity_valid: true,
      registry_valid: true,
    });
    if (healthScore.status === "healthy") healthy += 1;
    else if (healthScore.status === "warning") warning += 1;
    else if (healthScore.status === "unhealthy") unhealthy += 1;
    const { error: updateError } = await supabaseAdmin
      .from("motivation_items")
      .update({
        ...update,
        is_verified: probe.playable && update.status === "approved",
      })
      .eq("id", row.id);

    if (updateError) throw new Error(updateError.message);

    checked += 1;
    if (probe.playable) {
      playable += 1;
    } else if (!update.is_active) {
      demoted += 1;
    }

    results.push({
      id: row.id,
      playable: probe.playable,
      status: update.status,
      playback_status: update.playback_status,
      is_active: update.is_active,
      reason: probe.reason,
      health_score: healthScore.score,
      health_status: healthScore.status,
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        checked,
        playable,
        demoted,
        healthy,
        warning,
        unhealthy,
        results,
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
