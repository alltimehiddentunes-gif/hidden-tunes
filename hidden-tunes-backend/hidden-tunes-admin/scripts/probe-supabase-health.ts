import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function timed<T>(label: string, fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const result = await fn();
    console.log(JSON.stringify({ label, ms: Date.now() - started, result }, null, 2));
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          label,
          ms: Date.now() - started,
          threw: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
  }
}

async function main() {
  const cfg = getSupabaseAdminConfig();
  console.log(
    JSON.stringify({
      urlHost: (() => {
        try {
          return new URL(cfg.supabaseUrl).host;
        } catch {
          return null;
        }
      })(),
      hasServiceKey: Boolean(cfg.serviceRoleKey),
      missing: cfg.missingVariables,
    })
  );

  const client = getSupabaseAdmin();

  await timed("rest_health", async () => {
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: cfg.serviceRoleKey,
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    return { status: response.status, ok: response.ok };
  });

  await timed("select_one_show", async () => {
    const { data, error } = await client
      .from("podcast_shows")
      .select("id,title,is_mature")
      .eq("is_mature", true)
      .limit(1);
    return { data, error };
  });

  await timed("count_mature_head", async () => {
    const { count, error } = await client
      .from("podcast_shows")
      .select("id", { count: "exact", head: true })
      .eq("is_mature", true);
    return { count, error };
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
