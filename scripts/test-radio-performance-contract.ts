import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const browser = fs.readFileSync(
  path.join(root, "services/radio/radioBrowserApi.ts"),
  "utf8"
);
const hook = fs.readFileSync(
  path.join(root, "hooks/useLazyRadioStationList.ts"),
  "utf8"
);
const catalog = fs.readFileSync(
  path.join(root, "services/radio/radioCatalogApi.ts"),
  "utf8"
);
const cache = fs.readFileSync(
  path.join(root, "services/radio/radioCache.ts"),
  "utf8"
);

assert.match(browser, /stations:\s*normalized\.stations/);
assert.doesNotMatch(browser, /stations:\s*written\b/);
assert.doesNotMatch(browser, /hitOnDeviceCap/);
assert.doesNotMatch(browser, /on-device-cap-2000/);
assert.match(browser, /isCatalogAbortError/);

assert.doesNotMatch(catalog, /attachHttpsStreamUrls/);
assert.match(catalog, /listTimePlayCalls:\s*0/);
assert.doesNotMatch(catalog, /https_only:\s*["']1["']/);
assert.doesNotMatch(catalog, /https_only=1/);
assert.match(catalog, /include_stream:\s*["']1["']/);
assert.match(catalog, /if \(!id \|\| !name\) return null/);

assert.match(hook, /nextOffsetRef/);
assert.match(
  hook,
  /nextOffsetRef\.current\s*=\s*requestOffset\s*\+\s*RADIO_STATION_PAGE_SIZE/
);
assert.match(hook, /seenListIdsRef/);
assert.match(hook, /current\.concat\(added\)/);
assert.match(hook, /isCatalogAbortError/);
assert.match(hook, /cancelRadioBrowseRequest\(requestKey\)/);
assert.match(hook, /loaded of/);

assert.match(cache, /catalog-search/);
assert.match(cache, /Must NEVER stop catalog-search pagination/);

console.log("ok radio-performance-contract");
