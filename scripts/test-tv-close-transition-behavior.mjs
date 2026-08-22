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

const renderSignalSource = readFileSync(
  resolve(process.cwd(), "services/tv/tvCloseRenderSignal.ts"),
  "utf8"
);
const renderSignalCompiled = transformSync(renderSignalSource, {
  format: "esm",
  loader: "ts",
}).code;
const renderSignalUrl = `data:text/javascript;base64,${Buffer.from(
  renderSignalCompiled
).toString("base64")}`;
const renderSignal = await import(renderSignalUrl);

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

const baselineEpoch = renderSignal.getTvCloseRenderEpoch();
let observed = null;
const unsubscribe = renderSignal.subscribeTvCloseDestinationRendered((signal) => {
  observed = signal;
});
renderSignal.markTvCloseDestinationRendered("/youtube-feed?tab=live");
unsubscribe();
assert.ok(observed, "destination component emits an explicit render signal");
assert.equal(observed.path, "/youtube-feed");
assert.equal(
  renderSignal.isFreshTvCloseDestinationRender(
    observed,
    "/youtube-feed",
    baselineEpoch
  ),
  true,
  "only a fresh matching destination render can finalize close"
);
assert.equal(
  renderSignal.isFreshTvCloseDestinationRender(observed, "/search", baselineEpoch),
  false,
  "a different rendered route cannot release the TV owner"
);
assert.equal(
  renderSignal.isFreshTvCloseDestinationRender(
    observed,
    "/youtube-feed",
    observed.epoch
  ),
  false,
  "a pre-close render cannot be reused"
);

console.log("PASS: behavioral TV close transition state machine");
