import { NextRequest } from "next/server";

import {
  getSportsHome,
  omitEmptyHomeSections,
} from "@/lib/sports/catalog";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsCountry,
  parseSportsPlatform,
} from "@/lib/sports/http";
import { parsePositiveInt } from "@/lib/tvCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        message: "Sports is disabled by feature flag.",
        sections: {},
      });
    }

    const url = new URL(request.url);
    const country = parseSportsCountry(request);
    const platform = parseSportsPlatform(request);
    const limitPerSection = Math.min(
      20,
      Math.max(10, parsePositiveInt(url.searchParams.get("limitPerSection"), 16, 20))
    );

    const { sections, sectionErrors, featureEnabled } = await getSportsHome({
      country,
      platform,
      limitPerSection,
    });

    return jsonSportsOk({
      enabled: featureEnabled,
      country,
      platform,
      sections: omitEmptyHomeSections(sections),
      sectionErrors,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load Sports home.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
