/**
 * Reproduce phone TV search empty results without importing react-native.
 *   npx tsx scripts/repro-tv-phone-search-path.ts
 */
const BASE = "https://admin.hiddentunes.com";
const TV_VALIDATION_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
const TV_PUBLIC_RELIABILITY_THRESHOLD = 60;

const QUERIES = [
  "Alone",
  "Alone TV",
  "Storage Wars",
  "Storage Wars TV",
  "Deadliest Catch",
];

function normalizeTvSearchQuery(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function isValidationFreshOld(lastValidatedAt: string | null | undefined, now = Date.now()) {
  if (!lastValidatedAt) return false;
  const checkedAt = new Date(lastValidatedAt).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  return now - checkedAt <= TV_VALIDATION_FRESHNESS_MS;
}

/** Mirrors committed HEAD quality gate (with 7-day freshness hide). */
function isEligibleCommittedHead(station: Record<string, unknown>) {
  if (station.public !== true) return false;
  if (station.verified !== true) return false;
  if (station.playable !== true) return false;
  if (station.disabled === true) return false;
  if (station.is_active === false) return false;
  if (cleanText(station.playback_status).toLowerCase() !== "playable") return false;
  if (cleanText(station.quarantined_at)) return false;
  if (!isValidationFreshOld(String(station.last_validated_at || station.last_health_checked_at || ""))) {
    return false;
  }
  const score = Number(station.reliability_score ?? 100);
  if (Number.isFinite(score) && score < TV_PUBLIC_RELIABILITY_THRESHOLD) return false;
  if (station.android_playable !== true) return false;
  if (station.stream_is_https !== true) return false;
  return true;
}

/** Mirrors dirty working-tree evidence gate (timestamp required, age does not hide). */
function isEligibleWorkingTree(station: Record<string, unknown>) {
  if (station.public !== true) return false;
  if (station.verified !== true) return false;
  if (station.playable !== true) return false;
  if (station.disabled === true) return false;
  if (station.is_active === false) return false;
  if (cleanText(station.playback_status).toLowerCase() !== "playable") return false;
  if (cleanText(station.quarantined_at)) return false;
  if (!cleanText(station.last_validated_at || station.last_health_checked_at)) return false;
  const score = Number(station.reliability_score ?? 100);
  if (Number.isFinite(score) && score < TV_PUBLIC_RELIABILITY_THRESHOLD) return false;
  if (station.android_playable !== true) return false;
  if (station.stream_is_https !== true) return false;
  return true;
}

async function main() {
  const report = [];
  for (const q of QUERIES) {
    const clean = normalizeTvSearchQuery(q);
    const url = `${BASE}/api/tv/videos?platform=android&limit=20&page=1&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const body = await res.json();
    const videos = (body.videos || []) as Record<string, unknown>[];
    const afterHead = videos.filter(isEligibleCommittedHead);
    const afterWorktree = videos.filter(isEligibleWorkingTree);
    report.push({
      q,
      clean,
      http: res.status,
      apiTotal: body.pagination?.total,
      apiReturned: videos.length,
      afterCommittedHead7DayGate: afterHead.length,
      afterWorkingTreeEvidenceGate: afterWorktree.length,
      titlesApi: videos.map((v) => v.title),
      titlesAfterHeadGate: afterHead.map((v) => v.title),
      titlesAfterWorktreeGate: afterWorktree.map((v) => v.title),
      sampleAgesDays: videos.slice(0, 3).map((v) => {
        const t = new Date(String(v.last_validated_at || v.last_health_checked_at || "")).getTime();
        return {
          title: v.title,
          ageDays: Number.isFinite(t) ? Math.round((Date.now() - t) / 86400000) : null,
          last_health_checked_at: v.last_health_checked_at,
        };
      }),
    });
  }
  console.log(JSON.stringify({ defect: "client_7day_freshness_hides_stale_verified", report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
