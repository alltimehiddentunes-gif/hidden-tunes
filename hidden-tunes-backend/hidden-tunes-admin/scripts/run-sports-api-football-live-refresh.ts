import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const sb = createClient(String(process.env.SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false } });
const key = String(process.env.API_FOOTBALL_KEY || ""), base = String(process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
if (!key) throw new Error("API_FOOTBALL_KEY missing");
const slug = (kind: string, id: number) => `api-football-${kind}-${id}`;

async function main() {
  const response = await fetch(`${base}/fixtures?live=all`, { headers: { "x-apisports-key": key, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  const payload: any = await response.json(), rows: any[] = payload.response || [];
  const { data: sport, error: sportError } = await sb.from("sports").upsert({ slug: "football", name: "Football", status: "active", updated_at: new Date().toISOString() }, { onConflict: "slug" }).select("id").single(); if (sportError) throw sportError;
  const { data: provider, error: providerError } = await sb.from("sports_providers").upsert({ slug: "api-football", name: "API-Football", provider_type: "fast", official_domain: "api-football.com", is_enabled: true, health_status: "healthy", last_health_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "slug" }).select("id").single(); if (providerError) throw providerError;
  let inserted = 0, updated = 0;
  for (const item of rows) {
    const now = new Date().toISOString(), leagueId = Number(item.league.id), fixtureId = String(item.fixture.id);
    const { data: competition, error: competitionError } = await sb.from("sports_competitions").upsert({ sport_id: sport.id, provider_id: provider.id, provider_external_id: String(leagueId), name: item.league.name, slug: slug("league", leagueId), artwork_url: item.league.logo || null, competition_type: "league", status: "active", updated_at: now }, { onConflict: "slug" }).select("id").single(); if (competitionError) throw competitionError;
    async function team(side: "home" | "away") { const t = item.teams[side], id = Number(t.id); const result = await sb.from("sports_teams").upsert({ sport_id: sport.id, provider_id: provider.id, provider_external_id: String(id), name: t.name, slug: slug("team", id), competition_id: competition.id, artwork_url: t.logo || null, status: "active", updated_at: now }, { onConflict: "slug" }).select("id").single(); if (result.error) throw result.error; return result.data; }
    const home = await team("home"), away = await team("away");
    const mappedStatus = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(item.fixture.status.short) ? "live" : "scheduled";
    const { data: existing } = await sb.from("sports_fixtures").select("id").eq("provider_id", provider.id).eq("provider_external_id", fixtureId).limit(1).maybeSingle();
    const fixtureRow = { sport_id: sport.id, competition_id: competition.id, provider_id: provider.id, provider_external_id: fixtureId, title: `${item.teams.home.name} vs ${item.teams.away.name}`, starts_at: item.fixture.date, status: mappedStatus, metadata: { source: "api-football", providerStatus: item.fixture.status, league: item.league, score: item.goals, lastRealRefreshAt: now }, updated_at: now };
    const fixtureResult = existing ? await sb.from("sports_fixtures").update(fixtureRow).eq("id", existing.id).select("id").single() : await sb.from("sports_fixtures").insert(fixtureRow).select("id").single(); if (fixtureResult.error) throw fixtureResult.error; existing ? updated++ : inserted++;
    await sb.from("sports_fixture_participants").delete().eq("fixture_id", fixtureResult.data.id);
    const participantResult = await sb.from("sports_fixture_participants").insert([{ fixture_id: fixtureResult.data.id, team_id: home.id, side: "home" }, { fixture_id: fixtureResult.data.id, team_id: away.id, side: "away" }]); if (participantResult.error) throw participantResult.error;
    await sb.from("sports_fixture_scores").upsert({ fixture_id: fixtureResult.data.id, period: "current", home_score: item.goals.home, away_score: item.goals.away, score_payload: item.score || {}, updated_source: "api-football", updated_at: now }, { onConflict: "fixture_id,period" });
  }
  console.log(JSON.stringify({ provider: "api-football", requests: 1, realLiveFixtures: rows.length, inserted, updated, remaining: payload.paging, quotaHeaders: { remaining: response.headers.get("x-ratelimit-requests-remaining") } }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
