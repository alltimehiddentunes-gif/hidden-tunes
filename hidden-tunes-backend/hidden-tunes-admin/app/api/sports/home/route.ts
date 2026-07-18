import { NextRequest } from "next/server";

import { buildSportsHomeContract } from "@/lib/sports/home";
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
        generatedAt: new Date().toISOString(),
        sections: [],
      });
    }

    const url = new URL(request.url);
    const country = parseSportsCountry(request);
    const platform = parseSportsPlatform(request);
    const timeZone =
      String(url.searchParams.get("tz") || url.searchParams.get("timezone") || "")
        .trim() || null;
    const locale =
      String(
        url.searchParams.get("locale") ||
          request.headers.get("accept-language") ||
          ""
      )
        .split(",")[0]
        ?.trim() || null;
    const userId =
      String(
        request.headers.get("x-ht-user-id") ||
          url.searchParams.get("userId") ||
          ""
      ).trim() || null;

    const limitOverride = parsePositiveInt(
      url.searchParams.get("limitPerSection"),
      0,
      50
    );

    const {
      response,
      sectionErrors,
      homeIaEnabled,
      personalizationEnabled,
      personalizationApplied,
    } = await buildSportsHomeContract({
      country,
      platform,
      userId,
      timeZone,
      locale,
      limits: limitOverride
        ? {
            liveNow: limitOverride,
            startingSoon: limitOverride,
            featured: limitOverride,
            becauseYouFollow: limitOverride,
            continueWatching: limitOverride,
            popularCompetitions: limitOverride,
            browseSports: Math.max(limitOverride, 30),
            browseCountries: Math.max(limitOverride, 30),
            todaysSchedule: Math.max(limitOverride, 40),
            trending: limitOverride,
            recentlyFinished: limitOverride,
            highlights: limitOverride,
            replays: limitOverride,
          }
        : undefined,
    });

    return jsonSportsOk({
      enabled: true,
      homeIaEnabled,
      personalizationEnabled,
      personalizationApplied,
      country,
      platform,
      timeZone: timeZone || "UTC",
      generatedAt: response.generatedAt,
      sections: response.sections,
      sectionErrors,
      message: homeIaEnabled
        ? undefined
        : "Sports home IA is disabled by feature flag.",
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load Sports home.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
