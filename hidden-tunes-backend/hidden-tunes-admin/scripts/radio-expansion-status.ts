import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionPublicCount,
  fetchProductionMaturePublicCount,
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
  const productionMature = await fetchProductionMaturePublicCount().catch(() => null);
  const combined =
    (productionPublic ?? counts.public_general) + (productionMature ?? counts.public_mature);

  console.log(
    JSON.stringify(
      {
        target: RADIO_PUBLIC_PLAYABLE_TARGET,
        mature_target: 5000,
        production_public_general: productionPublic,
        production_public_mature: productionMature,
        production_public_combined: combined,
        db_public_general: counts.public_general,
        db_public_mature: counts.public_mature,
        db_total: counts.total,
        db_unchecked: counts.unchecked,
        remaining_gap_to_40k: remainingPublicPlayableGap(combined),
        remaining_gap_to_5k_mature: Math.max(0, 5000 - (productionMature ?? counts.public_mature)),
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
