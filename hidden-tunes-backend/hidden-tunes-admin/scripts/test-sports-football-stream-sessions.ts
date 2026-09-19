import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { resolveFixturePlayback } from "../lib/sports/playback/fixtureResolver";
import { resolveSportsPlaybackSession } from "../lib/sports/playback/sessions";
import { fetchLiveFootballStreamCatalog, stableListingId } from "../lib/sports/providers/footballStream";
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const sb = createClient(String(process.env.SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false } });
async function main() {
  const { data: provider } = await sb.from("sports_providers").select("id").eq("slug", "football_stream_api").single();
  const { data: rows, error } = await sb.from("sports_broadcasts").select("fixture_id,provider_asset_id").eq("provider_id", provider!.id).eq("validation_status", "validated").not("published_at", "is", null).limit(10); if (error) throw error;
  const catalog = await fetchLiveFootballStreamCatalog(), currentIds = new Set(catalog.matches.map(stableListingId));
  let created = 0, resolved = 0; const failures: Record<string, number> = {};
  for (const row of rows || []) { if (!row.fixture_id) continue; const session = await resolveFixturePlayback(row.fixture_id, { platform: "desktop", privatePilot: true, userId: null }); if (session.status !== "ready") { failures[`create:${session.status}:${"reason" in session ? session.reason : "unknown"}`] = (failures[`create:${session.status}:${"reason" in session ? session.reason : "unknown"}`] || 0) + 1; continue; } created++; const playback = await resolveSportsPlaybackSession(session.playbackToken); if (playback.ok && playback.playbackKind === "hls" && playback.embedUrl?.startsWith("https://")) resolved++; else { const reason = playback.ok ? "invalid_payload" : playback.reason; failures[`resolve:${reason}`] = (failures[`resolve:${reason}`] || 0) + 1; } }
  console.log(JSON.stringify({ candidates: rows?.length || 0, identitiesPresentInCurrentCatalog: (rows || []).filter((row) => currentIds.has(String(row.provider_asset_id))).length, sessionsCreated: created, hlsSessionsResolved: resolved, failures, rawUrlsLogged: 0, ttlSeconds: 120 }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
