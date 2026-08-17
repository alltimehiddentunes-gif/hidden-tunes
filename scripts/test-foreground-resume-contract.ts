import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const source = await readFile(
    resolve(process.cwd(), "context", "PlayerContext.tsx"),
    "utf8"
  );
  const activeHandler = source.slice(
    source.indexOf('if (nextState === "active")'),
    source.indexOf("return () => {", source.indexOf('if (nextState === "active")'))
  );

  assert.match(
    activeHandler,
    /Platform\.OS === "ios"[\s\S]*await resyncForegroundHiddenAudioState\(\)/,
    "iOS foreground resume uses the single native resync owner"
  );
  assert.match(
    activeHandler,
    /else \{[\s\S]*await reconcileHiddenAudioActiveState\("app_state_active"\)/,
    "Android keeps its existing foreground reconciliation"
  );
  assert.equal(
    (activeHandler.match(/await resyncForegroundHiddenAudioState\(\)/g) || []).length,
    1,
    "foreground resume must not run a duplicate native resync"
  );

  console.log("foreground resume contract passed");
}

void main();
