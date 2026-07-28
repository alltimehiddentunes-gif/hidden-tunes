/**
 * Post-Wave-1 search + API contract validation. Read-only. No mobile changes.
 */
const BASE = "https://admin.hiddentunes.com";

type Check = { name: string; ok: boolean; detail?: string };

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

function stationShapeOk(station: any): string | null {
  const required = [
    "id",
    "name",
    "artwork_url",
    "country",
    "country_code",
    "state",
    "language",
    "tags",
    "categories",
    "bitrate",
    "codec",
    "popularity",
    "quality_score",
    "reliability_score",
    "is_featured",
    "is_mature",
    "content_rating",
  ];
  for (const key of required) {
    if (!(key in station)) return `missing_${key}`;
  }
  if (!station.popularity || typeof station.popularity.votes !== "number") {
    return "bad_popularity";
  }
  // Forbidden: newly required fields that would break older mobile
  // city may be absent; must not be required
  return null;
}

async function main() {
  const checks: Check[] = [];

  const queries = [
    { name: "exact_station_name", path: "/api/radio/stations?q=BBC&limit=5&page=1" },
    { name: "partial_station_name", path: "/api/radio/stations?q=radio&limit=5&page=1" },
    { name: "city_term", path: "/api/radio/stations?q=Lagos&limit=5&page=1" },
    { name: "state_term", path: "/api/radio/stations?q=California&limit=5&page=1" },
    { name: "country_name", path: "/api/radio/stations?country=Nigeria&limit=5&page=1" },
    { name: "country_code", path: "/api/radio/stations?country=NG&limit=5&page=1" },
    { name: "language", path: "/api/radio/stations?language=spanish&limit=5&page=1" },
    { name: "genre_tag", path: "/api/radio/stations?category=jazz&limit=5&page=1" },
    { name: "accented", path: "/api/radio/stations?q=São&limit=5&page=1" },
    { name: "mixed_case", path: "/api/radio/stations?q=RaDiO&limit=5&page=1" },
    { name: "punctuation", path: "/api/radio/stations?q=181.FM&limit=5&page=1" },
    { name: "empty_query", path: "/api/radio/stations?limit=5&page=1" },
    { name: "no_result", path: "/api/radio/stations?q=zzzxxyyqq-no-such-station&limit=5&page=1" },
    { name: "search_alias", path: "/api/radio/search?q=jazz&limit=5&page=1" },
  ];

  for (const q of queries) {
    const { status, json } = await getJson(q.path);
    const ok =
      status === 200 &&
      json?.success === true &&
      Array.isArray(json.stations) &&
      json.pagination &&
      typeof json.pagination.total === "number";
    let detail = `status=${status} total=${json?.pagination?.total ?? "n/a"} count=${json?.stations?.length ?? 0}`;
    if (ok && json.stations[0]) {
      const shape = stationShapeOk(json.stations[0]);
      if (shape) {
        checks.push({ name: q.name, ok: false, detail: shape });
        continue;
      }
    }
    if (q.name === "no_result") {
      checks.push({
        name: q.name,
        ok: ok && (json.stations?.length || 0) === 0,
        detail,
      });
      continue;
    }
    checks.push({ name: q.name, ok, detail });
  }

  // Pagination stability / no duplicates across pages
  const p1 = await getJson("/api/radio/stations?limit=40&page=1");
  const p2 = await getJson("/api/radio/stations?limit=40&page=2");
  const ids1 = new Set((p1.json?.stations || []).map((s: any) => s.id));
  const ids2 = (p2.json?.stations || []).map((s: any) => s.id);
  const overlap = ids2.filter((id: string) => ids1.has(id));
  checks.push({
    name: "pagination_no_duplicate_ids",
    ok: p1.status === 200 && p2.status === 200 && overlap.length === 0,
    detail: `overlap=${overlap.length} p1=${ids1.size} p2=${ids2.length}`,
  });
  checks.push({
    name: "pagination_has_more",
    ok: p1.json?.pagination?.hasMore === true && p1.json?.pagination?.total > 40,
    detail: `total=${p1.json?.pagination?.total} hasMore=${p1.json?.pagination?.hasMore}`,
  });

  // Only public eligible: spot-check reliability and mature flags
  const sample = p1.json?.stations || [];
  const badPublic = sample.filter(
    (s: any) => s.is_mature === true || Number(s.reliability_score) < 60
  );
  checks.push({
    name: "public_eligibility_sample",
    ok: badPublic.length === 0,
    detail: `bad=${badPublic.length}`,
  });

  // Play contract for first station
  const firstId = sample[0]?.id;
  if (firstId) {
    const play = await getJson(`/api/radio/stations/${firstId}/play`);
    const deliveryOk =
      play.status === 200 &&
      play.json?.success === true &&
      typeof play.json?.stream_url === "string" &&
      play.json.stream_url.startsWith("https://") &&
      (play.json.delivery === "direct" || play.json.delivery === "relay");
    checks.push({
      name: "play_contract",
      ok: deliveryOk,
      detail: `status=${play.status} delivery=${play.json?.delivery} keys=${Object.keys(play.json || {}).join(",")}`,
    });
  }

  const failed = checks.filter((c) => !c.ok);
  const report = {
    ok: failed.length === 0,
    checked_at: new Date().toISOString(),
    production_base: BASE,
    checks,
    failed: failed.map((f) => f.name),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
