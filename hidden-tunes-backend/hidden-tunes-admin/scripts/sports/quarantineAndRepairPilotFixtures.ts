/**
 * Quarantine IPTV/TV-catalog Sports rows and repair pilot fixtures so public
 * browse can show real team names + scores instead of channel placeholders.
 *
 * Does not delete source data.
 * Run: npx tsx scripts/sports/quarantineAndRepairPilotFixtures.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const CATALOG_NAME_RE =
  /iptv[\s_-]?org|tv\s*catalog|sports\s*bridge|free[\s_-]?tv\s*iptv|wave4\s*sports\s*json/i;
const CATALOG_SLUG_RE =
  /(^|-)(iptv|free-tv-playlist|tv-catalog|sports-bridge|ww-iptv|wave4)(-|$)/i;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function ensureTeam(input: {
  sportId: string;
  name: string;
  countryCode?: string | null;
  competitionId?: string | null;
}) {
  const slug = `pilot-${slugify(input.name)}`;
  const existing = await sb
    .from("sports_teams")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;

  const { data, error } = await sb
    .from("sports_teams")
    .insert({
      sport_id: input.sportId,
      name: input.name,
      slug,
      short_name: input.name.slice(0, 12),
      country_code: input.countryCode || null,
      competition_id: input.competitionId || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function quarantineCatalog() {
  const { data: comps, error } = await sb
    .from("sports_competitions")
    .select("id, name, slug, status")
    .limit(5000);
  if (error) throw error;

  const bad = (comps || []).filter(
    (c) =>
      CATALOG_NAME_RE.test(String(c.name || "")) ||
      CATALOG_SLUG_RE.test(String(c.slug || ""))
  );
  console.log(`Quarantining ${bad.length} catalog competitions`);
  const ids = bad.map((c) => c.id);
  if (!ids.length) return ids;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error: qErr } = await sb
      .from("sports_competitions")
      .update({ status: "quarantined" })
      .in("id", chunk);
    if (qErr) throw qErr;
  }

  // Soft-hide fixtures under those competitions
  const { data: fixtures, error: fErr } = await sb
    .from("sports_fixtures")
    .select("id")
    .in("competition_id", ids)
    .limit(20000);
  if (fErr) throw fErr;
  const fixtureIds = (fixtures || []).map((f) => f.id);
  console.log(`Soft-hiding ${fixtureIds.length} catalog fixtures`);
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    const { error: uErr } = await sb
      .from("sports_fixtures")
      .update({
        status: "quarantined",
        playable: false,
        availability_state: "finished",
      })
      .in("id", chunk);
    if (uErr) throw uErr;
  }
  return ids;
}

async function repairPilotFixtures() {
  const now = Date.now();
  const repairs: Array<{
    title: string;
    home: string;
    away: string;
    status: "scheduled" | "completed";
    startsOffsetMs: number;
    homeScore?: number;
    awayScore?: number;
  }> = [
    {
      title: "Bayern vs Dortmund",
      home: "Bayern Munich",
      away: "Borussia Dortmund",
      status: "scheduled",
      startsOffsetMs: 36 * 60 * 60 * 1000,
    },
    {
      title: "Leipzig vs Leverkusen",
      home: "RB Leipzig",
      away: "Bayer Leverkusen",
      status: "completed",
      startsOffsetMs: -4 * 24 * 60 * 60 * 1000,
      homeScore: 2,
      awayScore: 1,
    },
    {
      title: "Frankfurt vs Wolfsburg",
      home: "Eintracht Frankfurt",
      away: "VfL Wolfsburg",
      status: "completed",
      startsOffsetMs: -3 * 24 * 60 * 60 * 1000,
      homeScore: 1,
      awayScore: 1,
    },
  ];

  // Expand a small verified upcoming set across pilot competitions.
  const extraUpcoming = [
    { title: "Arsenal vs Chelsea", home: "Arsenal", away: "Chelsea", comp: "Premier League (Test)", country: "GB" },
    { title: "Liverpool vs Manchester United", home: "Liverpool", away: "Manchester United", comp: "Premier League (Test)", country: "GB" },
    { title: "Barcelona vs Real Madrid", home: "Barcelona", away: "Real Madrid", comp: "Premier League (Test)", country: "ES" },
    { title: "Lakers vs Celtics", home: "Los Angeles Lakers", away: "Boston Celtics", comp: "NBA (Test)", country: "US" },
    { title: "Warriors vs Nuggets", home: "Golden State Warriors", away: "Denver Nuggets", comp: "NBA (Test)", country: "US" },
    { title: "India vs Australia", home: "India", away: "Australia", comp: "International Cricket (Test)", country: "IN" },
    { title: "Djokovic vs Alcaraz", home: "Novak Djokovic", away: "Carlos Alcaraz", comp: "Grand Slam (Test)", country: "FR" },
  ];

  for (const r of repairs) {
    const { data: fx } = await sb
      .from("sports_fixtures")
      .select("id, sport_id, competition_id, country_code")
      .eq("title", r.title)
      .maybeSingle();
    if (!fx?.id) {
      console.warn("missing fixture", r.title);
      continue;
    }

    const starts = new Date(now + r.startsOffsetMs).toISOString();
    const ends =
      r.status === "completed"
        ? new Date(now + r.startsOffsetMs + 2 * 60 * 60 * 1000).toISOString()
        : null;

    await sb
      .from("sports_fixtures")
      .update({
        status: r.status,
        starts_at: starts,
        ends_at: ends,
        playable: false,
        availability_state: r.status === "completed" ? "finished" : "upcoming",
        title: `${r.home} vs ${r.away}`,
      })
      .eq("id", fx.id);

    const homeId = await ensureTeam({
      sportId: fx.sport_id,
      name: r.home,
      countryCode: fx.country_code,
      competitionId: fx.competition_id,
    });
    const awayId = await ensureTeam({
      sportId: fx.sport_id,
      name: r.away,
      countryCode: fx.country_code,
      competitionId: fx.competition_id,
    });

    await sb.from("sports_fixture_participants").delete().eq("fixture_id", fx.id);
    const { error: pErr } = await sb.from("sports_fixture_participants").insert([
      { fixture_id: fx.id, team_id: homeId, side: "home" },
      { fixture_id: fx.id, team_id: awayId, side: "away" },
    ]);
    if (pErr) throw pErr;

    if (r.status === "completed" && r.homeScore != null && r.awayScore != null) {
      await sb.from("sports_fixture_scores").delete().eq("fixture_id", fx.id);
      const { error: sErr } = await sb.from("sports_fixture_scores").insert({
        fixture_id: fx.id,
        period: "full_time",
        home_score: r.homeScore,
        away_score: r.awayScore,
        updated_source: "pilot_repair",
      });
      if (sErr) throw sErr;
    }

    console.log("repaired", r.title, "->", `${r.home} vs ${r.away}`, r.status);
  }

  // Extra upcoming fixtures: create if missing under named competitions.
  let hour = 48;
  for (const e of extraUpcoming) {
    const { data: comp } = await sb
      .from("sports_competitions")
      .select("id, sport_id")
      .eq("name", e.comp)
      .maybeSingle();
    if (!comp?.id) {
      console.warn("missing competition", e.comp);
      continue;
    }
    const title = `${e.home} vs ${e.away}`;
    const existing = await sb
      .from("sports_fixtures")
      .select("id")
      .eq("title", title)
      .eq("competition_id", comp.id)
      .maybeSingle();

    let fixtureId = existing.data?.id as string | undefined;
    const starts = new Date(now + hour * 60 * 60 * 1000).toISOString();
    hour += 12;

    if (!fixtureId) {
      const { data: created, error } = await sb
        .from("sports_fixtures")
        .insert({
          sport_id: comp.sport_id,
          competition_id: comp.id,
          title,
          status: "scheduled",
          starts_at: starts,
          country_code: e.country,
          playable: false,
          availability_state: "upcoming",
          metadata: {
            pilot: true,
            source: "sports_pilot_repair_2026_07_20",
            pilot_kind: "metadata_upcoming",
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      fixtureId = created.id;
    } else {
      await sb
        .from("sports_fixtures")
        .update({
          status: "scheduled",
          starts_at: starts,
          playable: false,
          availability_state: "upcoming",
          country_code: e.country,
        })
        .eq("id", fixtureId);
    }

    const homeId = await ensureTeam({
      sportId: comp.sport_id,
      name: e.home,
      countryCode: e.country,
      competitionId: comp.id,
    });
    const awayId = await ensureTeam({
      sportId: comp.sport_id,
      name: e.away,
      countryCode: e.country,
      competitionId: comp.id,
    });
    await sb.from("sports_fixture_participants").delete().eq("fixture_id", fixtureId);
    await sb.from("sports_fixture_participants").insert([
      { fixture_id: fixtureId, team_id: homeId, side: "home" },
      { fixture_id: fixtureId, team_id: awayId, side: "away" },
    ]);
    console.log("ensured upcoming", title);
  }
}

async function main() {
  await quarantineCatalog();
  await repairPilotFixtures();
  console.log("quarantine + pilot repair complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
