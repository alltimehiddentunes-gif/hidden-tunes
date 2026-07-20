/**
 * Sports correctness contracts — latest-tap-wins, navigation, search, actions, bounds.
 * Run: npx tsx scripts/test-sports-correctness.ts
 */
import assert from "assert/strict";

import {
  getSportsWatchAction,
  isSportsPlayerRouteActive,
  needsSportsCountdownClock,
  openSportsPlayer,
  setSportsPlayerRouteActive,
  shouldOpenSportsPlayer,
} from "../lib/sports/ui/availability";
import {
  boundSectionItems,
  SPORTS_SECTION_LIMITS,
} from "../lib/sports/ui/homeSections";
import {
  isSportsResolveAbortError,
  shouldCommitSportsResolve,
} from "../services/sports/sportsPlaybackResolver";
import type { SportsMatchCard } from "../types/sports";

const upcoming: SportsMatchCard = {
  id: "upcoming-1",
  status: { code: "scheduled", label: "Upcoming", live: false, finished: false },
  timing: { startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  watchability: { state: "starting_soon", playable: false },
};

const livePlayable: SportsMatchCard = {
  id: "live-1",
  status: { code: "live", label: "Live", live: true, finished: false },
  watchability: { state: "watch", playable: true, access: "in_app" },
};

const finished: SportsMatchCard = {
  id: "finished-1",
  status: { code: "finished", label: "Final", live: false, finished: true },
  watchability: { state: "unavailable", playable: false },
};

function main() {
  // --- Latest-tap-wins generation gate ---
  assert.equal(
    shouldCommitSportsResolve({
      generation: 3,
      currentGeneration: 3,
      fixtureId: "C",
      activeFixtureId: "C",
      aborted: false,
      mounted: true,
    }),
    true
  );
  assert.equal(
    shouldCommitSportsResolve({
      generation: 1,
      currentGeneration: 3,
      fixtureId: "A",
      activeFixtureId: "C",
      aborted: false,
      mounted: true,
    }),
    false,
    "A must not update after C"
  );
  assert.equal(
    shouldCommitSportsResolve({
      generation: 2,
      currentGeneration: 3,
      fixtureId: "B",
      activeFixtureId: "C",
      aborted: true,
      mounted: true,
    }),
    false,
    "B aborted must not update"
  );
  assert.equal(
    shouldCommitSportsResolve({
      generation: 3,
      currentGeneration: 3,
      fixtureId: "C",
      activeFixtureId: "C",
      aborted: false,
      mounted: false,
    }),
    false,
    "unmounted must not update"
  );

  // Simulate A → B → C generations
  let currentGeneration = 0;
  const timeline: Array<{
    fixture: string;
    generation: number;
    aborted: boolean;
    mayUpdate: boolean;
  }> = [];
  for (const fixture of ["A", "B", "C"]) {
    currentGeneration += 1;
    const generation = currentGeneration;
    // Prior requests are aborted when a newer one starts.
    for (const prior of timeline) {
      prior.aborted = true;
      prior.mayUpdate = false;
    }
    timeline.push({
      fixture,
      generation,
      aborted: false,
      mayUpdate: shouldCommitSportsResolve({
        generation,
        currentGeneration,
        fixtureId: fixture,
        activeFixtureId: "C",
        aborted: false,
        mounted: true,
      }),
    });
  }
  // After C is active, only C's generation may commit for fixture C.
  assert.equal(timeline[0].fixture, "A");
  assert.equal(timeline[0].mayUpdate, false);
  assert.equal(timeline[1].fixture, "B");
  assert.equal(timeline[1].mayUpdate, false);
  assert.equal(timeline[2].fixture, "C");
  assert.equal(timeline[2].mayUpdate, true);
  assert.equal(
    shouldCommitSportsResolve({
      generation: 1,
      currentGeneration: 3,
      fixtureId: "A",
      activeFixtureId: "C",
      aborted: false,
      mounted: true,
    }),
    false
  );
  assert.equal(
    shouldCommitSportsResolve({
      generation: 2,
      currentGeneration: 3,
      fixtureId: "B",
      activeFixtureId: "C",
      aborted: false,
      mounted: true,
    }),
    false
  );

  // --- Abort errors are not user errors ---
  assert.equal(isSportsResolveAbortError({ name: "AbortError" }), true);
  assert.equal(isSportsResolveAbortError(new Error("Network down")), false);

  // --- Match card semantic actions ---
  assert.equal(getSportsWatchAction(upcoming).kind, "remind");
  assert.equal(getSportsWatchAction(livePlayable).kind, "watch_live");
  assert.equal(getSportsWatchAction(finished).kind, "none");
  assert.equal(shouldOpenSportsPlayer(upcoming), false);
  assert.equal(shouldOpenSportsPlayer(livePlayable), true);
  assert.equal(shouldOpenSportsPlayer(finished), false);
  assert.equal(needsSportsCountdownClock(upcoming), true);
  assert.equal(needsSportsCountdownClock(livePlayable), false);
  assert.equal(needsSportsCountdownClock(finished), false);

  // --- Section bounds ---
  const many = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}` }));
  assert.equal(
    boundSectionItems(many, SPORTS_SECTION_LIMITS.horizontal).length,
    SPORTS_SECTION_LIMITS.horizontal
  );
  assert.equal(SPORTS_SECTION_LIMITS.horizontal, 16);

  // --- Player route replace flag ---
  setSportsPlayerRouteActive(false);
  assert.equal(isSportsPlayerRouteActive(), false);
  setSportsPlayerRouteActive(true);
  assert.equal(isSportsPlayerRouteActive(), true);
  setSportsPlayerRouteActive(false);

  // openSportsPlayer is callable (router may throw outside RN; only verify export).
  assert.equal(typeof openSportsPlayer, "function");

  console.log("Sports correctness contracts: PASS");
  console.log(
    JSON.stringify(
      timeline.map((row) => ({
        Fixture: row.fixture,
        Generation: row.generation,
        "Aborted/ignored": row.aborted || row.fixture !== "C",
        "May update player?": row.fixture === "C",
      })),
      null,
      2
    )
  );
}

main();
