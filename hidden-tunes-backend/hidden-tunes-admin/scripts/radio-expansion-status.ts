import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  remainingPublicPlayableGap,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";

async function main() {
  const adminRoot = path.resolve(__dirname, "..");
  loadAdminEnv(adminRoot);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const counts = await getRadioCatalogCounts(supabase);
  const productionPublic = await fetchProductionPublicCount().catch(() => null);

  console.log(
    JSON.stringify(
      {
        target: RADIO_PUBLIC_PLAYABLE_TARGET,
        production_public: productionPublic,
        db_public_general: counts.public_general,
        db_total: counts.total,
        db_unchecked: counts.unchecked,
        remaining_gap: remainingPublicPlayableGap(
          productionPublic ?? counts.public_general
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
