/**
 * Android Auto readiness checklist (static / behavioural source proofs).
 * Does NOT run a native build or device test.
 *
 * Exit 0 = suite ran; prints verdict A/B/C/D.
 * Individual criteria are PASS/FAIL/UNKNOWN; failures lower the verdict.
 *
 * Run: node scripts/test-android-auto-readiness.mjs
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];
const gaps = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function pass(id, detail) {
  passes.push({ id, detail });
}

function fail(id, detail) {
  failures.push({ id, detail });
}

function gap(id, detail) {
  gaps.push({ id, detail });
}

function mustInclude(rel, needle, id) {
  const text = read(rel);
  if (!text.includes(needle)) fail(id, `${rel} missing: ${needle}`);
  else pass(id, `${rel} has ${needle}`);
}

function mustNotInclude(rel, needle, id) {
  const text = read(rel);
  if (text.includes(needle)) fail(id, `${rel} unexpectedly contains: ${needle}`);
  else pass(id, `${rel} excludes ${needle}`);
}

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

// --- Architecture / ownership ---
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt",
  "MediaBrowserServiceCompat",
  "mbs_compat"
);
mustNotInclude(
  "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt",
  "MediaLibraryService",
  "no_media3_library_service"
);
mustInclude(
  "plugins/hidden-audio/android/res/xml/automotive_app_desc.xml",
  '<uses name="media"',
  "automotive_media_desc"
);
mustInclude(
  "plugins/hidden-audio/index.js",
  "android.media.browse.MediaBrowserService",
  "plugin_mbs_intent"
);
mustInclude(
  "plugins/hidden-audio/index.js",
  'exported: "true"',
  "plugin_mbs_exported"
);
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioCore.kt",
  "EXOPLAYER_HANDLES_AUDIO_FOCUS = false",
  "manual_audio_focus"
);
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioCore.kt",
  "taskRemovalShutdown",
  "task_removal_marker"
);
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioCore.kt",
  "pausedByCall",
  "call_interruption_marker"
);

// Single ExoPlayer construction site in Core
{
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  const builders = countMatches(core, /ExoPlayer\.Builder/g);
  if (builders !== 1) fail("single_exoplayer_builder", `found ${builders}`);
  else pass("single_exoplayer_builder", "one ExoPlayer.Builder in Core");
}

// No Cars App Library
{
  const plugin = read("plugins/hidden-audio/index.js");
  if (/androidx\.car\.app|CarAppService/.test(plugin)) {
    fail("no_cars_app_library", "Cars App Library referenced in plugin");
  } else {
    pass("no_cars_app_library", "no Cars App Library in plugin");
  }
}

// Root does not detach / wait for network
{
  const mbs = read("plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt");
  if (mbs.includes("result.detach()")) {
    fail("root_no_detach", "onLoadChildren detaches (risk of waiting)");
  } else {
    pass("root_no_detach", "onLoadChildren sends sync result");
  }
  if (!mbs.includes("ensureDefaultCatalog()")) {
    fail("root_defaults", "missing ensureDefaultCatalog on root path");
  } else {
    pass("root_defaults", "default catalog ensured before root");
  }
  if (!mbs.includes("Never start playback merely because Android Auto connected")) {
    gap("no_autoplay_on_connect", "comment/guard text missing");
  } else {
    pass("no_autoplay_on_connect", "connect does not autoplay");
  }
}

// TV exclusion in native catalog
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
  'contentType == "tv"',
  "tv_excluded_native"
);
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
  "Never expose TV/video",
  "tv_excluded_comment"
);

// Stable media ID prefixes in JS sync
{
  const sync = read("services/androidAutoCatalogSync.ts");
  for (const prefix of ["song:", "radio:", "podcast:", "fav:song:"]) {
    if (!sync.includes(prefix)) fail("media_id_prefix", `missing ${prefix}`);
  }
  pass("media_id_prefixes", "song/radio/podcast/fav prefixes present");
}

// Play path to HiddenAudio
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioMediaSessionManager.kt",
  "playFromAutoMediaId",
  "session_play_from_media_id"
);
mustInclude(
  "plugins/hidden-audio/android/HiddenAudioCore.kt",
  'emitRemoteCommand("play_from_media_id"',
  "core_emits_play_from_media_id"
);
mustInclude(
  "services/androidAutoMediaResolver.ts",
  "playAndroidAutoMediaId",
  "js_resolver"
);

// --- Known readiness gaps (lower verdict; do not hard-fail suite) ---
{
  const allKt = [
    "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt",
    "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
    "plugins/hidden-audio/android/HiddenAudioModule.kt",
    "plugins/hidden-audio/android/HiddenAudioCore.kt",
  ]
    .filter(exists)
    .map(read)
    .join("\n");
  if (!allKt.includes("notifyChildrenChanged")) {
    gap(
      "notify_children_changed",
      "No notifyChildrenChanged after catalog sync — Auto UI may stay empty/stale until reconnect"
    );
  } else {
    pass("notify_children_changed", "notifyChildrenChanged present");
  }
}

{
  const bridge = read("services/androidAutoCatalogBridge.ts");
  const sync = read("services/androidAutoCatalogSync.ts");
  if (sync.includes("HIDDEN_AA_ROOTS") && sync.includes("buildVisibleRoots")) {
    pass("unsupported_roots_hidden", "audiobooks/motivation/lectures hidden from AA roots");
  } else if (!/extras\.audiobooks\s*=/.test(bridge) && !bridge.includes("audiobooks:")) {
    gap(
      "bridge_audiobooks_empty",
      "buildExtras() does not populate audiobooks — AA root stays empty"
    );
  }
  if (sync.includes("rememberAndroidAutoPlayableTracks")) {
    pass("podcast_registry", "podcast tracks registered for AA resolve");
  }
}

{
  const resolver = read("services/androidAutoMediaResolver.ts");
  if (resolver.includes("podcast_registry")) {
    pass("podcast_not_recent_only", "podcast resolves from AA catalog registry");
  }
  if (
    resolver.includes("audiobook_root_hidden") ||
    resolver.includes("motivation_root_hidden") ||
    resolver.includes("lecture_root_hidden")
  ) {
    pass("unsupported_domains_fail_closed", "audiobook/motivation/lecture fail closed");
  }
}

{
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  if (/shouldPreservePlaybackAfterTaskRemoved\(\): Boolean \{\s*return false\s*\}/.test(core)) {
    pass("task_removal_full_shutdown", "Recents clear always stops even with AA connected");
  } else if (
    core.includes("shouldPreservePlaybackAfterTaskRemoved") &&
    core.includes("androidAutoBrowserClients > 0 && isPlaybackActive()")
  ) {
    gap(
      "task_removal_vs_aa_preserve",
      "Recents swipe preserves playback when AA browser bound AND playing"
    );
  }
}

{
  const auth = exists("services/androidAutoTapAuthority.ts")
    ? read("services/androidAutoTapAuthority.ts")
    : "";
  const resolver = read("services/androidAutoMediaResolver.ts");
  if (auth.includes("isAndroidAutoTransactionCurrent") && resolver.includes("stale_transaction")) {
    pass("music_latest_tap", "music AA latest-tap authority present");
  }
}

// Package / permissions (app.json)
{
  const app = read("app.json");
  if (!app.includes("com.hiddentunes.app")) fail("package_id", "package missing");
  else pass("package_id", "com.hiddentunes.app");
  for (const perm of [
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "WAKE_LOCK",
    "POST_NOTIFICATIONS",
  ]) {
    if (!app.includes(perm)) fail("permission", `missing ${perm}`);
  }
  pass("permissions", "FGS/wake/notification permissions declared");
}

// Duplicate MEDIA_BUTTON strategy
mustInclude(
  "plugins/hidden-audio/index.js",
  "Do NOT register a second MEDIA_BUTTON",
  "no_second_media_button_receiver"
);

// Verdict
function verdict() {
  const hardBlockers = failures.length;
  if (hardBlockers > 0) return "D";
  const blockingGaps = gaps.filter((g) =>
    [
      "notify_children_changed",
      "task_removal_vs_aa_preserve",
      "resolver_non_music_incomplete",
      "bridge_audiobooks_empty",
      "bridge_motivation_empty",
      "bridge_lectures_empty",
    ].includes(g.id)
  );
  if (blockingGaps.length > 0) return "C";
  // Proven blockers closed in source — still requires a new dev-client build + vehicle QA.
  return "A";
}

const v = verdict();
const report = {
  verdict: v,
  passCount: passes.length,
  failCount: failures.length,
  gapCount: gaps.length,
  passes: passes.map((p) => p.id),
  failures,
  gaps,
  notes: [
    "Static readiness only — not a real car/DHU proof.",
    "A requires device verification of browse + play + transport.",
    "Notification/MediaSession alone is insufficient for A.",
  ],
};

console.log(JSON.stringify(report, null, 2));
console.log(`[android-auto-readiness] verdict=${v}`);

if (failures.length) {
  process.exit(1);
}
process.exit(0);
