import assert from "node:assert/strict";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";

const source = readFileSync(
  resolve(process.cwd(), "services/tv/tvCloseTransition.ts"),
  "utf8"
);
const compiled = transformSync(source, { format: "esm", loader: "ts" }).code;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const close = await import(moduleUrl);

for (const playbackState of ["playing", "paused", "buffering", "failed"]) {
  let state = close.beginTvCloseTransition(
    close.IDLE_TV_CLOSE_TRANSITION,
    "/youtube-feed"
  );
  assert.equal(state.phase, "navigating", `${playbackState}: overlay remains mounted`);
  assert.equal(
    close.finalizeTvCloseTransition(state).phase,
    "navigating",
    `${playbackState}: teardown cannot run before navigation commits`
  );

  const duplicate = close.beginTvCloseTransition(state, "/youtube-feed");
  assert.strictEqual(duplicate, state, `${playbackState}: rapid double-X is idempotent`);

  state = close.observeTvClosePathname(state, "/tv-player");
  assert.equal(state.phase, "navigating", `${playbackState}: player shell never confirms close`);
  state = close.observeTvClosePathname(state, "/youtube-feed");
  assert.equal(state.phase, "destinationCommitted");
  state = close.markTvCloseDestinationRendered(state);
  assert.equal(state.phase, "destinationRendered");
  state = close.finalizeTvCloseTransition(state);
  assert.equal(state.phase, "finalized", `${playbackState}: teardown executes after render`);
  assert.strictEqual(
    close.finalizeTvCloseTransition(state),
    state,
    `${playbackState}: teardown executes exactly once`
  );
}

let missingHistory = close.beginTvCloseTransition(
  close.IDLE_TV_CLOSE_TRANSITION,
  ""
);
assert.equal(missingHistory.target, "/youtube-feed");
missingHistory = close.fallbackTvCloseTransition(missingHistory);
assert.deepEqual(missingHistory, { phase: "fallback", target: "/youtube-feed" });
assert.equal(
  close.observeTvClosePathname(missingHistory, "/tv-player").phase,
  "fallback",
  "timeout keeps the overlay covering the non-rendering shell"
);

assert.equal(
  close.isTvCloseDestinationCommitted("/youtube-feed?tab=live", "/youtube-feed"),
  true
);
assert.equal(close.isTvCloseDestinationCommitted("/tv-player", "/tv-player"), false);

console.log("PASS: behavioral TV close transition state machine");
