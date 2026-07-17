import { listSportsTaxonomy } from "@/lib/sports/catalog";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({ enabled: false, sports: [], categories: [] });
    }
    const taxonomy = await listSportsTaxonomy();
    return jsonSportsOk({ enabled: true, ...taxonomy });
  } catch (err) {
    return jsonSportsError(
      "Failed to load Sports categories.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
