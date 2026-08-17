import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const source = await readFile(
    resolve(process.cwd(), "app", "music-feed.tsx"),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /AppState\.addEventListener\("change"/,
    "Home must not attach foreground listeners"
  );
  assert.doesNotMatch(
    source,
    /nextState === "active"[\s\S]*refreshGenreSpotlightSignals/,
    "Home must not rehydrate preference signals on warm resume"
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*void loadCatalog\(\);[\s\S]*\}, \[loadCatalog\]\);/,
    "catalog hydration remains owned by screen mount"
  );
  assert.match(
    source,
    /if \(catalogRequestRef\.current\)[\s\S]*deduped_inflight_request/,
    "catalog mount requests remain deduplicated"
  );

  console.log("Home resume contract passed");
}

void main();
