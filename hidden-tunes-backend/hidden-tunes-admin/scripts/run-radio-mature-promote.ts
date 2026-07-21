import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { promoteEligibleMatureRadioStations } from "@/lib/radioMature/promotion";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const limitIndex = process.argv.indexOf("--limit");
  return {
    mode: args.has("--execute") ? ("execute" as const) : ("dry-run" as const),
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : null,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await promoteEligibleMatureRadioStations(supabase, {
    dryRun: options.mode === "dry-run",
    limit: options.limit,
  });

  console.log(JSON.stringify({ success: true, mode: options.mode, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
