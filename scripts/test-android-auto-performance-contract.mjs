import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const bridge = read("services/androidAutoCatalogBridge.ts");
const premium = read("services/androidAutoPremiumSnapshot.ts");
const catalog = read("plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt");
const browser = read("plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt");
const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");

assert.match(bridge, /getCachedHiddenTunesCatalog\(\)/);
assert.doesNotMatch(bridge, /fetchHiddenTunesCatalog|setInterval|poll/i);
assert.match(bridge, /signature === lastSyncSignature/);
assert.match(premium, /MAX_TRACKS = 420/);
assert.match(premium, /MAX_FOLDER_ITEMS = 24/);
assert.match(catalog, /MAX_SEARCH = 24/);
assert.match(catalog, /MAX_TRACKS = 420/);
for (const marker of ["android_auto_service_start_timing", "android_auto_folder_open_timing",
  "android_auto_search_timing", "android_auto_snapshot_metrics", "android_auto_snapshot_persist_timing"])
  assert.ok(browser.includes(marker) || catalog.includes(marker), `missing ${marker}`);
assert.equal((core.match(/ExoPlayer\.Builder/g) || []).length, 1);
assert.match(core, /fun emitAutoPerformanceDiagnostic[\s\S]*emitJsDiagnosticThrottled/);
assert.match(core, /private fun emitJsDiagnosticThrottled[\s\S]*if \(!isDebuggableBuild\(\)\) return/);

console.log("test-android-auto-performance-contract: PASS");
