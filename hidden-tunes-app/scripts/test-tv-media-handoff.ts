import assert from "node:assert/strict";

import {
  beginTvMediaTransition,
  getCurrentTvMediaTransitionId,
  invalidateTvMediaTransitions,
  isCurrentTvMediaTransition,
  runAudioToTvHandoff,
} from "../services/tv/tvMediaHandoff";

async function main() {
  const first = beginTvMediaTransition();
  assert.equal(isCurrentTvMediaTransition(first.transitionId), true);

  const second = beginTvMediaTransition();
  assert.equal(isCurrentTvMediaTransition(first.transitionId), false);
  assert.equal(isCurrentTvMediaTransition(second.transitionId), true);
  assert.equal(getCurrentTvMediaTransitionId(), second.transitionId);

  invalidateTvMediaTransitions();
  assert.equal(isCurrentTvMediaTransition(second.transitionId), false);

  let opened = "";

  const stalePromise = runAudioToTvHandoff({
    stopPlayback: async () => {
      // Newer user action wins while the older handoff is still stopping audio.
      beginTvMediaTransition();
    },
    run: async () => {
      opened = "stale";
      return "stale";
    },
  });

  const freshPromise = runAudioToTvHandoff({
    stopPlayback: async () => undefined,
    run: async () => {
      opened = "fresh";
      return "fresh";
    },
  });

  const staleResult = await stalePromise;
  const freshResult = await freshPromise;

  assert.equal(staleResult.ok, false);
  assert.equal(freshResult.ok, true);
  assert.equal(opened, "fresh");

  console.log("TV media handoff tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
