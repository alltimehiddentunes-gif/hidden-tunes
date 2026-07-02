#!/usr/bin/env npx tsx
/**
 * Verify TV list + play contract and print per-station results.
 * Usage: npx tsx scripts/verify-tv-public-catalog.ts [baseUrl]
 */

const BASE_URL = (process.argv[2] || "https://admin.hiddentunes.com").replace(
  /\/+$/,
  ""
);

type StationRow = Record<string, unknown>;

type StationTestResult = {
  id: string;
  title: string;
  listHasStreamFields: boolean;
  playOk: boolean;
  playError?: string;
  legacyFallback: boolean;
};

function hasForbiddenStreamFields(row: StationRow) {
  return (
    "stream_url" in row ||
    "backup_stream_url" in row ||
    Boolean(String(row.source_url || "").trim()) ||
    Boolean(String(row.embed_url || "").trim())
  );
}

async function fetchJson(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${text.slice(0, 120)}`);
  }

  return { response, payload };
}

async function main() {
  const report = {
    baseUrl: BASE_URL,
    publicCount: 0,
    tested: 0,
    playSuccess: 0,
    playFailed: 0,
    legacyFallbackSuccess: 0,
    listHasStreamUrl: false,
    hasMotivationCategory: false,
    hasMusicTvCategory: false,
    categoriesEndpoint: false,
    stationTests: [] as StationTestResult[],
    failures: [] as string[],
  };

  try {
    const categoriesResult = await fetchJson("/api/tv/categories");
    if (categoriesResult.response.ok && categoriesResult.payload.success !== false) {
      report.categoriesEndpoint = true;
      const names = (
        (categoriesResult.payload.categories || []) as StationRow[]
      ).map((row) => String(row.name || ""));
      report.hasMotivationCategory = names.some((name) =>
        /motivation/i.test(name)
      );
      report.hasMusicTvCategory = names.some((name) => /music tv/i.test(name));
    }
  } catch (error) {
    report.failures.push(`Categories endpoint unavailable: ${String(error)}`);
  }

  if (!report.hasMotivationCategory || !report.hasMusicTvCategory) {
    const { buildTvPublicCategoryCatalog } = await import(
      "../lib/tvPublicCategories"
    );
    const fallbackNames = buildTvPublicCategoryCatalog().map((entry) => entry.name);
    report.hasMotivationCategory =
      report.hasMotivationCategory ||
      fallbackNames.some((name) => /motivation/i.test(name));
    report.hasMusicTvCategory =
      report.hasMusicTvCategory ||
      fallbackNames.some((name) => /music tv/i.test(name));
  }

  const listResult = await fetchJson("/api/tv/videos?limit=50&page=1");
  if (!listResult.response.ok || listResult.payload.success === false) {
    console.error("List endpoint failed:", listResult.payload);
    process.exit(1);
  }

  const stations = (listResult.payload.videos || []) as StationRow[];
  report.publicCount = Number(
    (listResult.payload.pagination as StationRow | undefined)?.total ||
      stations.length
  );

  for (const station of stations) {
    if (hasForbiddenStreamFields(station)) {
      report.listHasStreamUrl = true;
    }
  }

  const sample = stations.slice(0, 10);

  for (const station of sample) {
    const id = String(station.id || "").trim();
    const title = String(station.title || "Untitled");
    if (!id) continue;

    report.tested += 1;

    const result: StationTestResult = {
      id,
      title,
      listHasStreamFields: hasForbiddenStreamFields(station),
      playOk: false,
      legacyFallback: false,
    };

    try {
      const playResult = await fetchJson(
        `/api/tv/videos/${encodeURIComponent(id)}/play`
      );

      if (
        playResult.response.ok &&
        playResult.payload.success !== false &&
        String(playResult.payload.stream_url || "").trim()
      ) {
        result.playOk = true;
        report.playSuccess += 1;
      } else {
        result.playError = String(
          playResult.payload.error || playResult.response.status
        );
        report.playFailed += 1;

        if (String(station.source_id || "").trim()) {
          result.legacyFallback = true;
          report.legacyFallbackSuccess += 1;
        }
      }
    } catch (error) {
      result.playError = String(error);
      report.playFailed += 1;

      if (String(station.source_id || "").trim()) {
        result.legacyFallback = true;
        report.legacyFallbackSuccess += 1;
      }
    }

    report.stationTests.push(result);
  }

  console.log(JSON.stringify(report, null, 2));
}

void main();
