import assert from "node:assert/strict";
import fs from "node:fs";

const manifestPath = process.env.HT_MERGED_ANDROID_MANIFEST;
assert.ok(
  manifestPath,
  "HT_MERGED_ANDROID_MANIFEST must point to Gradle's final merged AndroidManifest.xml"
);
assert.ok(fs.existsSync(manifestPath), `merged manifest not found: ${manifestPath}`);

const manifest = fs.readFileSync(manifestPath, "utf8");
const count = (pattern) => (manifest.match(pattern) || []).length;

assert.equal(
  count(/<uses-permission\b[^>]*android:name="android\.permission\.FOREGROUND_SERVICE"[^>]*\/>/g),
  1,
  "FOREGROUND_SERVICE must be declared once"
);
assert.equal(
  count(/<uses-permission\b[^>]*android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK"[^>]*\/>/g),
  1,
  "FOREGROUND_SERVICE_MEDIA_PLAYBACK must be declared once"
);
assert.equal(
  count(/<uses-permission\b[^>]*android:name="android\.permission\.WAKE_LOCK"[^>]*\/>/g),
  1,
  "WAKE_LOCK must be declared once"
);
assert.doesNotMatch(manifest, /android\.permission\.RECORD_AUDIO/);
assert.doesNotMatch(manifest, /expo\.modules\.mediacontrol\.MediaPlaybackService/);
assert.equal(
  count(/android:name="com\.hiddentunes\.app\.audio\.HiddenAudioMediaBrowserService"/g),
  1,
  "exactly one HiddenAudio Android Auto browser service is required"
);
assert.match(
  manifest,
  /android:name="com\.hiddentunes\.app\.audio\.HiddenAudioMediaBrowserService"[\s\S]*?android:exported="true"[\s\S]*?android\.media\.browse\.MediaBrowserService[\s\S]*?android\.intent\.category\.DEFAULT/
);
assert.equal(
  count(/android:name="androidx\.media\.session\.MediaButtonReceiver"/g),
  1,
  "exactly one canonical media-button receiver is required"
);
assert.match(manifest, /android:name="com\.google\.android\.gms\.car\.application"/);
assert.match(manifest, /android:resource="@xml\/automotive_app_desc"/);
assert.match(
  manifest,
  /android:name="com\.hiddentunes\.app\.audio\.HiddenAudioPlaybackService"[^>]*android:exported="false"[^>]*android:foregroundServiceType="mediaPlayback"/
);
assert.match(
  manifest,
  /android:name="expo\.modules\.video\.playbackService\.ExpoVideoPlaybackService"[^>]*android:exported="false"[^>]*android:foregroundServiceType="mediaPlayback"/
);

console.log("test-android-merged-manifest: PASS");
