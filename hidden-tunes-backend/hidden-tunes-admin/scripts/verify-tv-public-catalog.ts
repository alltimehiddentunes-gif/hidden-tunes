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
  playUrlIsHttps: boolean;
  playError?: string;
  legacyFallback: boolean;
};

const REQUIRED_QUALITY_FIELDS = [
  "public",
  "verified",
  "playable",
  "disabled",
  "ios_playable",
  "android_playable",
  "stream_protocol",
  "stream_is_https",
  "last_validated_at",
  "last_validation_result",
  "failure_count",
  "playback_status",
  "last_health_checked_at",
  "quarantined_at",
] as const;

function hasForbiddenStreamFields(row: StationRow) {
  return (
    "stream_url" in row ||
    "backup_stream_url" in row ||
    Boolean(String(row.source_url || "").trim()) ||
    Boolean(String(row.embed_url || "").trim())
  );
}

function missingQualityFields(row: StationRow) {
  return REQUIRED_QUALITY_FIELDS.filter((field) => !(field in row));
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

async function verifyBrowse(platform: "ios" | "android") {
  const listResult = await fetchJson(
    `/api/tv/videos?platform=${platform}&limit=40&page=1`
  );

  if (!listResult.response.ok || listResult.payload.success === false) {
    throw new Error(`${platform} browse failed: ${JSON.stringify(listResult.payload)}`);
  }

  const stations = (listResult.payload.videos || []) as StationRow[];
  const ids = new Set<string>();
  const issues: string[] = [];

  for (const station of stations) {
    const id = String(station.id || "").trim();
    if (!id) {
      issues.push("row missing id");
      continue;
    }
    if (ids.has(id)) issues.push(`duplicate id ${id}`);
    ids.add(id);

    if (hasForbiddenStreamFields(station)) {
      issues.push(`${id} exposes stream fields in browse`);
    }

    const missing = missingQualityFields(station);
    if (missing.length) {
      issues.push(`${id} missing quality fields: ${missing.join(", ")}`);
    }

    if (station.public !== true) issues.push(`${id} public !== true`);
    if (station.playable !== true) issues.push(`${id} playable !== true`);
    if (station.disabled === true) issues.push(`${id} disabled`);
    if (station.quarantined_at) issues.push(`${id} quarantined`);
    if (station.playback_status !== "playable") {
      issues.push(`${id} playback_status !== playable`);
    }

    if (platform === "ios") {
      if (station.ios_playable !== true) issues.push(`${id} ios_playable !== true`);
      if (station.stream_is_https !== true) issues.push(`${id} stream_is_https !== true`);
      if (String(station.stream_protocol || "").toLowerCase() === "http") {
        issues.push(`${id} http protocol in ios browse`);
      }
    } else {
      if (station.android_playable !== true) {
        issues.push(`${id} android_playable !== true`);
      }
    }
  }

  return {
    platform,
    count: stations.length,
    total: Number(
      (listResult.payload.pagination as StationRow | undefined)?.total || stations.length
    ),
    duplicateIds: stations.length - ids.size,
    issues,
    stations,
  };
}

async function main() {
  const report = {
    baseUrl: BASE_URL,
    iosBrowse: null as Awaited<ReturnType<typeof verifyBrowse>> | null,
    androidBrowse: null as Awaited<ReturnType<typeof verifyBrowse>> | null,
    tested: 0,
    playSuccess: 0,
    playFailed: 0,
    playHttpFailures: 0,
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

  try {
    report.iosBrowse = await verifyBrowse("ios");
    report.androidBrowse = await verifyBrowse("android");
    report.listHasStreamUrl = report.iosBrowse.issues.some((issue) =>
      issue.includes("stream fields")
    );
    report.failures.push(...report.iosBrowse.issues, ...report.androidBrowse.issues);
  } catch (error) {
    report.failures.push(String(error));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const sample = (report.iosBrowse?.stations || []).slice(0, 50);

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
      playUrlIsHttps: false,
      legacyFallback: false,
    };

    try {
      const playResult = await fetchJson(
        `/api/tv/videos/${encodeURIComponent(id)}/play?platform=ios`
      );

      const streamUrl = String(playResult.payload.stream_url || "").trim();
      result.playUrlIsHttps = streamUrl.startsWith("https://");

      if (
        playResult.response.ok &&
        playResult.payload.success !== false &&
        streamUrl &&
        result.playUrlIsHttps
      ) {
        result.playOk = true;
        report.playSuccess += 1;
      } else {
        if (streamUrl && !result.playUrlIsHttps) report.playHttpFailures += 1;
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

  if (
    report.failures.length > 0 ||
    report.playHttpFailures > 0 ||
    report.playFailed > 0
  ) {
    process.exit(1);
  }
}

void main();

export {};
