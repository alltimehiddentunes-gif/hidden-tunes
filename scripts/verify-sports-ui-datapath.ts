/**
 * Read-only Sports UI data-path verification against production API.
 * Mirrors the fixtures-only home fallback used when home IA is disabled,
 * including client-side participant/order repair.
 */
import {
  normalizeFixtureDetail,
  normalizeMatchCards,
  sortFinishedNewestFirst,
} from "../lib/sports/ui/normalizeMatchCard";

const BASE = "https://admin.hiddentunes.com";

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-ht-platform": "android", "x-ht-storefront-country": "ZZ" },
  });
  const json = await res.json();
  return { status: res.status, json };
}

function summarizeItems(items: any[] | undefined) {
  return (items || []).slice(0, 5).map((i) => ({
    id: i.id,
    title: i.title,
    sport: i.sport?.slug || i.sport?.name,
    participants: (i.participants || []).map((p: any) => p.name).filter(Boolean),
    finished: Boolean(i.status?.finished),
    live: Boolean(i.status?.live),
    startsAt: i.timing?.startsAt || i.startsAt,
  }));
}

function isNewestFirst(items: any[]): boolean {
  if (items.length < 2) return true;
  const times = items.map((i: any) =>
    Date.parse(String(i.timing?.startsAt || i.startsAt || ""))
  );
  for (let i = 1; i < times.length; i++) {
    if (
      Number.isFinite(times[i - 1]) &&
      Number.isFinite(times[i]) &&
      times[i - 1] < times[i]
    ) {
      return false;
    }
  }
  return true;
}

async function main() {
  const [home, live, upcoming, finished, football, cricket] = await Promise.all([
    getJson("/api/sports/home?limitPerSection=10"),
    getJson("/api/sports/live?limit=20"),
    getJson("/api/sports/fixtures?upcoming=true&limit=20"),
    getJson("/api/sports/fixtures?finished=true&limit=20"),
    getJson("/api/sports/fixtures?sport=football&limit=5"),
    getJson("/api/sports/fixtures?sport=cricket&finished=true&limit=5"),
  ]);

  const upcomingNorm = normalizeMatchCards(upcoming.json.items);
  const finishedNorm = sortFinishedNewestFirst(
    normalizeMatchCards(finished.json.items)
  );
  const footballNorm = normalizeMatchCards(football.json.items);
  const cricketNorm = normalizeMatchCards(cricket.json.items);

  const footballDetailId = footballNorm[0]?.id;
  const cricketDetailId = cricketNorm[0]?.id;
  const footballDetailRaw = footballDetailId
    ? await getJson(`/api/sports/fixtures/${footballDetailId}`)
    : null;
  const cricketDetailRaw = cricketDetailId
    ? await getJson(`/api/sports/fixtures/${cricketDetailId}`)
    : null;
  const footballDetail = footballDetailRaw
    ? normalizeFixtureDetail(footballDetailRaw.json.fixture)
    : null;
  const cricketDetail = cricketDetailRaw
    ? normalizeFixtureDetail(cricketDetailRaw.json.fixture)
    : null;

  const report = {
    homeIaEnabled: home.json.homeIaEnabled,
    homeSections: (home.json.sections || []).length,
    homeMessage: home.json.message || null,
    liveCount: (live.json.items || []).length,
    upcomingCount: upcomingNorm.length,
    resultsCount: finishedNorm.length,
    upcomingSample: summarizeItems(upcomingNorm),
    resultsSample: summarizeItems(finishedNorm),
    footballSample: summarizeItems(footballNorm),
    cricketSample: summarizeItems(cricketNorm),
    footballDetail: footballDetail
      ? {
          id: footballDetail.id,
          title: footballDetail.title,
          participants: (footballDetail.participants || []).map((p) => p.name),
          watchLivePresent: Boolean(
            (footballDetail.broadcasts || []).some((b: any) =>
              String(b?.status || "")
                .toLowerCase()
                .includes("live")
            )
          ),
        }
      : null,
    cricketDetail: cricketDetail
      ? {
          id: cricketDetail.id,
          title: cricketDetail.title,
          participants: (cricketDetail.participants || []).map((p) => p.name),
        }
      : null,
    resultsNewestFirstRawApi: isNewestFirst(finished.json.items || []),
    resultsNewestFirstAfterClient: isNewestFirst(finishedNorm),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
