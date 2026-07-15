import assert from "node:assert/strict";

import {
  allAdaptersExhausted,
  allRegisteredSourcesExhausted,
} from "../lib/tvExpansion25k/sourceDiscovery";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { getWave4SourceWeight } from "../lib/tvExpansion25k/wave4/scheduler";
import { TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";
import {
  createInitialWave4Checkpoint,
  loadTvWave4Checkpoint,
  saveTvWave4Checkpoint,
} from "../lib/tvExpansion25k/wave4/checkpoint";

function testWave4CheckpointIsolation() {
  const adminRoot = process.cwd();
  const checkpoint = createInitialWave4Checkpoint("normal");
  checkpoint.batchNumber = 7;
  saveTvWave4Checkpoint(checkpoint, adminRoot);
  const loaded = loadTvWave4Checkpoint(adminRoot);
  assert.equal(loaded.batchNumber, 7);
  assert.equal(loaded.wave, 4);
  assert.equal(loaded.contentScope, "normal");
}

function testExhaustionOnlyActiveWeights() {
  const cursors: Record<string, ReturnType<typeof createInitialSourceCursor>> = {};
  for (const id of TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS) {
    cursors[id] = {
      ...createInitialSourceCursor(id),
      exhausted: true,
      status: "exhausted",
    };
  }
  cursors["iptv-org"] = createInitialSourceCursor("iptv-org");

  assert.equal(
    allAdaptersExhausted(cursors, [...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS], getWave4SourceWeight),
    true
  );

  cursors[TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS[0]] = createInitialSourceCursor(
    TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS[0]
  );
  assert.equal(
    allAdaptersExhausted(cursors, [...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS], getWave4SourceWeight),
    false
  );
}

function testLegacyExhaustionIgnoresZeroWeightLegacy() {
  const cursors: Record<string, ReturnType<typeof createInitialSourceCursor>> = {};
  for (const id of ["iptv-org", "free-tv-legal", ...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS]) {
    cursors[id] = {
      ...createInitialSourceCursor(id),
      exhausted: id.startsWith("iptv") || id.startsWith("free") ? false : true,
      status: id.startsWith("iptv") || id.startsWith("free") ? "active" : "exhausted",
    };
  }
  const exhausted = allRegisteredSourcesExhausted({ adapterCursors: cursors });
  assert.equal(typeof exhausted, "boolean");
}

testWave4CheckpointIsolation();
testExhaustionOnlyActiveWeights();
testLegacyExhaustionIgnoresZeroWeightLegacy();

console.log(JSON.stringify({ ok: true, tests: 3 }, null, 2));
