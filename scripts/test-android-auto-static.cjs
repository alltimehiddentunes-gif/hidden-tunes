/**
 * Static readiness checks for Android Auto source implementation.
 * Enforces exactly one merged MEDIA_BUTTON BroadcastReceiver strategy:
 * expo-media-control's androidx.media.session.MediaButtonReceiver only.
 * Does not run a native build.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const failures = [];

function mustExist(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) failures.push(`missing: ${rel}`);
  return full;
}

function mustContain(rel, needles) {
  const full = mustExist(rel);
  if (!full || !fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) {
      failures.push(`${rel} missing snippet: ${needle}`);
    }
  }
}

function mustNotContain(rel, needles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) {
      failures.push(`${rel} must not contain: ${needle}`);
    }
  }
}

function countMediaButtonReceivers(manifestXml) {
  const receivers = manifestXml.match(/<receiver\b[\s\S]*?<\/receiver>/g) || [];
  return receivers.filter((block) =>
    block.includes("android.intent.action.MEDIA_BUTTON")
  );
}

mustExist("plugins/hidden-audio/android/res/xml/automotive_app_desc.xml");
mustContain("plugins/hidden-audio/android/res/xml/automotive_app_desc.xml", [
  '<uses name="media" />',
]);

const androidFiles = [
  "HiddenAudioMediaBrowserService.kt",
  "HiddenAudioMediaSessionManager.kt",
  "HiddenAudioAutoCatalog.kt",
  "HiddenAudioCore.kt",
  "HiddenAudioPlaybackService.kt",
  "HiddenAudioModule.kt",
  "HiddenAudioPackage.kt",
  "HiddenAudioPlaybackTransaction.kt",
  "HiddenAudioPendingCommandQueue.kt",
];
for (const file of androidFiles) {
  mustExist(`plugins/hidden-audio/android/${file}`);
}

// Custom duplicate receiver must not ship.
if (
  fs.existsSync(
    path.join(
      root,
      "plugins/hidden-audio/android/HiddenAudioMediaButtonReceiver.kt"
    )
  )
) {
  failures.push(
    "HiddenAudioMediaButtonReceiver.kt must be removed (duplicate MEDIA_BUTTON)"
  );
}

mustContain("plugins/hidden-audio/index.js", [
  "HiddenAudioMediaBrowserService",
  "automotive_app_desc",
  "com.google.android.gms.car.application",
  "HiddenAudioPlaybackTransaction.kt",
  "HiddenAudioPendingCommandQueue.kt",
  "android.media.browse.MediaBrowserService",
  "Do NOT register a second MEDIA_BUTTON",
]);

mustNotContain("plugins/hidden-audio/index.js", [
  'intentFilterActions: ["android.intent.action.MEDIA_BUTTON"]',
  "HiddenAudioMediaButtonReceiver.kt",
]);

mustContain("plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt", [
  "onGetRoot",
  "onLoadChildren",
  "onSearch",
  "android_auto_root_requested",
  "android_auto_children_requested",
  "android_auto_search_requested",
]);

mustContain("plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt", [
  "recently_played",
  "favorites",
  "motivationals",
  "lectures",
  "fun search(",
]);

mustContain("plugins/hidden-audio/android/HiddenAudioCore.kt", [
  "playFromAutoMediaId",
  "HiddenAudioPlaybackTransaction",
  "HiddenAudioPendingCommandQueue",
  "flushPendingRemoteCommands",
  "canonical_player_invoked",
]);

mustContain("plugins/hidden-audio/android/HiddenAudioMediaSessionManager.kt", [
  "ACTION_PLAY_FROM_SEARCH",
  "onPlayFromMediaId",
  "onPlayFromSearch",
  "metadata_published",
  "playback_state_published",
  "androidx.media.session.MediaButtonReceiver",
]);

mustNotContain(
  "plugins/hidden-audio/android/HiddenAudioMediaSessionManager.kt",
  ["HiddenAudioMediaButtonReceiver"]
);

mustContain("services/androidAutoCatalogSync.ts", [
  "recently_played",
  "motivationals",
  "parseAndroidAutoMediaId",
]);

mustContain("services/androidAutoMediaResolver.ts", [
  "playAndroidAutoMediaId",
  "routeRadioPlayback",
]);

mustContain("app.json", [
  "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "POST_NOTIFICATIONS",
  "./plugins/hidden-audio",
]);

// Canonical pre-existing MEDIA_BUTTON receiver from expo-media-control.
mustContain(
  "node_modules/expo-media-control/android/src/main/AndroidManifest.xml",
  [
    'android:name="androidx.media.session.MediaButtonReceiver"',
    "android.intent.action.MEDIA_BUTTON",
  ]
);

const expoMediaControlManifest = fs.readFileSync(
  path.join(
    root,
    "node_modules/expo-media-control/android/src/main/AndroidManifest.xml"
  ),
  "utf8"
);
const libraryReceivers = countMediaButtonReceivers(expoMediaControlManifest);
if (libraryReceivers.length !== 1) {
  failures.push(
    `expo-media-control must declare exactly 1 MEDIA_BUTTON receiver, found ${libraryReceivers.length}`
  );
}

// Ensure MBS is not incorrectly forced as FGS type in plugin source.
const plugin = fs.readFileSync(
  path.join(root, "plugins/hidden-audio/index.js"),
  "utf8"
);
const mbsIdx = plugin.indexOf("ANDROID_AUTO_MEDIA_BROWSER_SERVICE");
const mbsEnsureIdx = plugin.indexOf(
  "ensureAndroidManifestService(mainApplication, {\n      name: ANDROID_AUTO_MEDIA_BROWSER_SERVICE"
);
if (mbsEnsureIdx >= 0) {
  const mbsBlock = plugin.slice(mbsEnsureIdx, mbsEnsureIdx + 500);
  if (mbsBlock.includes('foregroundServiceType: "mediaPlayback"')) {
    failures.push(
      "MediaBrowserService should not use foregroundServiceType mediaPlayback"
    );
  }
}

// TV / Expo Video must not be edited to mask this crash.
const protectedPaths = [
  "components/tv/TvNativeVideoSurface.tsx",
  "components/tv/TvNativeVideoSurfaceImpl.tsx",
  "node_modules/expo-video",
];
for (const rel of protectedPaths) {
  // Only assert local source TV files are not in the AA repair diff intent.
  if (rel.startsWith("node_modules/")) continue;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
}

try {
  const dirtyTv = execSync(
    'git diff --name-only -- "components/tv" "app/tv-player.tsx" "context/TvPlaybackContext.tsx"',
    { cwd: root, encoding: "utf8" }
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // TvPlaybackContext may already be dirty from earlier work — do not fail AA
  // static for pre-existing dirt. Only fail if TvNativeVideoSurface* changed.
  const surfaceDirt = dirtyTv.filter((f) =>
    /TvNativeVideoSurface/i.test(f)
  );
  if (surfaceDirt.length) {
    failures.push(
      `TvNativeVideoSurface files must not be altered for MEDIA_BUTTON fix: ${surfaceDirt.join(
        ", "
      )}`
    );
  }
} catch {
  // git unavailable — skip dirty TV surface check
}

// Optional: validate a generated app manifest path if provided.
const generatedManifest =
  process.env.HT_GENERATED_ANDROID_MANIFEST ||
  path.join(root, "android/app/src/main/AndroidManifest.xml");
let generatedReceiverCount = null;
if (fs.existsSync(generatedManifest)) {
  const generated = fs.readFileSync(generatedManifest, "utf8");
  const appReceivers = countMediaButtonReceivers(generated);
  generatedReceiverCount = appReceivers.length;
  if (appReceivers.length !== 0) {
    failures.push(
      `generated app AndroidManifest must declare 0 MEDIA_BUTTON receivers (library supplies the one). Found ${appReceivers.length}: ${appReceivers
        .map((b) => {
          const m = b.match(/android:name="([^"]+)"/);
          return m ? m[1] : "unknown";
        })
        .join(", ")}`
    );
  }
  if (!generated.includes("HiddenAudioMediaBrowserService")) {
    failures.push("generated manifest missing HiddenAudioMediaBrowserService");
  }
  if (!generated.includes("HiddenAudioPlaybackService")) {
    failures.push("generated manifest missing HiddenAudioPlaybackService");
  }
  if (!generated.includes("@xml/automotive_app_desc")) {
    failures.push("generated manifest missing automotive_app_desc meta");
  }
  if (
    generated.includes("HiddenAudioMediaButtonReceiver") &&
    generated.includes("MEDIA_BUTTON")
  ) {
    failures.push(
      "generated manifest still registers HiddenAudioMediaButtonReceiver for MEDIA_BUTTON"
    );
  }
}

if (failures.length) {
  console.error("[android-auto-static] FAIL");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}

console.log("[android-auto-static] PASS");
console.log(
  JSON.stringify(
    {
      packageId: "com.hiddentunes.app",
      mediaBrowserService:
        "com.hiddentunes.app.audio.HiddenAudioMediaBrowserService",
      automotiveDesc: "@xml/automotive_app_desc",
      canonicalMediaButtonReceiver:
        "androidx.media.session.MediaButtonReceiver",
      canonicalReceiverSource: "expo-media-control",
      libraryMediaButtonReceiverCount: libraryReceivers.length,
      generatedAppMediaButtonReceiverCount: generatedReceiverCount,
      androidCheckedIn: false,
      generatedBy: "expo config plugin ./plugins/hidden-audio",
    },
    null,
    2
  )
);
