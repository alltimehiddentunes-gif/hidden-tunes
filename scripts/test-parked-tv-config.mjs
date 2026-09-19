import assert from "node:assert/strict";
import parkedTv from "../plugins/parked-tv/index.js";

assert.equal(parkedTv.isAaosBuild({}), false);
assert.equal(parkedTv.isAaosBuild({ HIDDEN_TUNES_AAOS: "0" }), false);
assert.equal(parkedTv.isAaosBuild({ HIDDEN_TUNES_AAOS: "1" }), true);

const manifest = {
  manifest: {
    "uses-feature": [],
    application: [{
      $: { "android:name": ".MainApplication", "android:appCategory": "audio" },
      "meta-data": [{ $: { "android:name": "com.google.android.gms.car.application" } }],
      service: [{ $: { "android:name": "com.hiddentunes.app.audio.HiddenAudioMediaBrowserService" } }],
      activity: [{ $: { "android:name": ".MainActivity", "android:distractionOptimized": "true" } }],
    }],
  },
};
parkedTv.configureAaosManifest(manifest);
const app = manifest.manifest.application[0];
assert.equal(app.$["android:appCategory"], "video");
assert.equal(app["meta-data"].length, 0);
assert.equal(app.service.length, 0);
assert.equal(app.activity[0].$["android:distractionOptimized"], undefined);
assert.deepEqual(manifest.manifest["uses-feature"], [{ $: {
  "android:name": "android.hardware.type.automotive",
  "android:required": "true",
} }]);

const gradle = parkedTv.patchGradle(`android {\n defaultConfig {\n applicationId 'com.hiddentunes.app'\n }\n buildTypes { debug { applicationIdSuffix ".dev" } }\n}`);
assert.match(gradle, /useLibrary 'android\.car'/);
assert.match(gradle, /applicationId 'com\.hiddentunes\.app\.automotive'/);
assert.match(gradle, /hidden-tunes-aaos-build/);
assert.equal(parkedTv.patchGradle(gradle), gradle);
const overwrittenIdentity = gradle.replace(
  "applicationId 'com.hiddentunes.app.automotive'",
  'applicationId "com.hiddentunes.app"'
);
assert.match(
  parkedTv.patchGradle(overwrittenIdentity),
  /applicationId 'com\.hiddentunes\.app\.automotive'/
);

console.log("parked-tv config contract: PASS");
