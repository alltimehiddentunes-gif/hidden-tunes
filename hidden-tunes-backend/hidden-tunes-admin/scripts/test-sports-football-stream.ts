import assert from "node:assert/strict";
import { classifyServer, matchFixture, normalizeTeamName, requestBudget, stableListingId } from "../lib/sports/providers/footballStream";

assert.equal(normalizeTeamName("1. FÇ Kaiserslautern"), "1 kaiserslautern");
assert.equal(normalizeTeamName("VfL Wolfsburg FC"), "vfl wolfsburg");
assert.equal(classifyServer({ type: "direct", url: "https://cdn.example/live.m3u8?token=x" }), "direct_hls");
assert.equal(classifyServer({ type: "referer", url: "https://cdn.example/live" }), "referer_dependent");
assert.equal(classifyServer({ type: "direct", url: "https://cdn.example/live.mpd" }), "direct_dash");
assert.equal(classifyServer({ type: "direct", url: "https://cdn.example/live?drm=widevine" }), "drm");

const fixture = { id: "fixture-1", startsAt: "2026-08-08T18:00:00Z", homeName: "VfL Wolfsburg", awayName: "1. FC Kaiserslautern", competitionName: "Bundesliga" };
assert.deepEqual(matchFixture({ startsAt: "2026-08-08T18:10:00Z", homeName: "VfL Wolfsburg FC", awayName: "1. FÇ Kaiserslautern", competitionName: "GER Bundesliga" }, [fixture]), { confidence: "HIGH", fixtureId: "fixture-1" });
assert.equal(matchFixture({ startsAt: fixture.startsAt, homeName: fixture.awayName, awayName: fixture.homeName }, [fixture]).confidence, "REJECT");
assert.equal(matchFixture({ startsAt: fixture.startsAt, homeName: "Other", awayName: "Club" }, [fixture]).confidence, "REJECT");

const listing = { match_time: 1786212000, match_status: "live", home_team_name: "A", away_team_name: "B", league_name: "C" };
assert.equal(stableListingId(listing), stableListingId({ ...listing }));
assert.deepEqual(requestBudget(), { cyclesPerDay: 480, catalog: 1920, validation: 4800, resolverCallsPerDay: 1000, expected: 7720, worstCase: 9640, quota: 55000, margin: 45360 });
console.log("football-stream provider safety tests: PASS");
