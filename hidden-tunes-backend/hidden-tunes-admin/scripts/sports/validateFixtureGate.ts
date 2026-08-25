/** Read-only validation of the fixture-facing Sports sections. */
import { listSportsFixturesFiltered } from "../../lib/sports/fixtures/listFixtures";
import {
  loadSaturdayFootball,
  loadTodaySchedule,
} from "../../lib/sports/home/loaders";
import { resolveSportsHomeLimits } from "../../lib/sports/home/limits";

const TIME_ZONES = [
  "Europe/Berlin",
  "Africa/Accra",
  "Pacific/Auckland",
  "America/Los_Angeles",
] as const;

function representative(items: Array<Record<string, unknown>>) {
  return items.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    competition: item.competition,
    participants: item.participants,
    status: item.status,
    timing: item.timing,
  }));
}

async function main() {
  const now = new Date();
  const limits = resolveSportsHomeLimits({
    todaysSchedule: 60,
    sectionTimeoutMs: 15_000,
  });
  const [live, upcoming, finished, ...timeZoneSections] = await Promise.all([
    listSportsFixturesFiltered({ live: true, limit: 50, now }),
    listSportsFixturesFiltered({ upcoming: true, limit: 50, now }),
    listSportsFixturesFiltered({ finished: true, limit: 50, now }),
    ...TIME_ZONES.flatMap((timeZone) => [
      loadTodaySchedule({
        country: "DE",
        platform: "audit",
        timeZone,
        limits,
        now,
      }),
      loadSaturdayFootball({
        country: "DE",
        platform: "audit",
        timeZone,
        limits,
        now,
      }),
    ]),
  ]);
  const byTimeZone: Record<string, unknown> = {};
  TIME_ZONES.forEach((timeZone, index) => {
    const today = timeZoneSections[index * 2];
    const saturday = timeZoneSections[index * 2 + 1];
    byTimeZone[timeZone] = {
      today: { count: today.items.length, subtitle: today.subtitle },
      saturday: {
        count: saturday.items.length,
        subtitle: saturday.subtitle,
        representative: representative(
          saturday.items as Array<Record<string, unknown>>
        ),
      },
    };
  });
  console.log(
    JSON.stringify(
      {
        auditedAt: now.toISOString(),
        live: {
          count: live.items.length,
          representative: representative(
            live.items as unknown as Array<Record<string, unknown>>
          ),
        },
        upcoming: {
          count: upcoming.items.length,
          representative: representative(
            upcoming.items as unknown as Array<Record<string, unknown>>
          ),
        },
        finished: {
          count: finished.items.length,
          representative: representative(
            finished.items as unknown as Array<Record<string, unknown>>
          ),
        },
        timeZones: byTimeZone,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
