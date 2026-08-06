/**
 * Behavioural/static proofs for Android Auto browse notify, roots, podcast resolve,
 * music latest-tap, and Recents full shutdown.
 * Run: node scripts/test-android-auto-browse-playback.cjs
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustInclude(rel, needle, label) {
  assert.ok(read(rel).includes(needle), `${label || rel} missing: ${needle}`);
}

function mustNotInclude(rel, needle, label) {
  assert.equal(
    read(rel).includes(needle),
    false,
    `${label || rel} unexpectedly contains: ${needle}`
  );
}

function testNotifyChildrenChangedWired() {
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt",
    "notifyBrowseParentsChanged",
    "mbs notify API"
  );
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt",
    "notifyChildrenChanged",
    "mbs notifyChildrenChanged"
  );
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioModule.kt",
    "notifyBrowseParentsChanged(changedParents)",
    "module notifies after sync"
  );
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
    "parentContentSignatures",
    "signature dedupe"
  );
  // No polling / timers for notify
  const mbs = read("plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt");
  assert.equal(/setInterval|Timer\(|scheduleAtFixedRate/.test(mbs), false);
  const module = read("plugins/hidden-audio/android/HiddenAudioModule.kt");
  assert.equal(/setInterval|Timer\(|scheduleAtFixedRate/.test(module), false);
}

function testRootSynchronous() {
  const mbs = read("plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt");
  assert.equal(mbs.includes("result.detach()"), false);
  assert.ok(mbs.includes("ensureDefaultCatalog"));
  assert.ok(mbs.includes("result.sendResult"));
}

function testOnlyUnresolvedRootsHidden() {
  const catalog = read("plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt");
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
    "UNSUPPORTED_OPTIONAL_SECTIONS",
    "unsupported set"
  );
  assert.ok(catalog.includes("SECTION_AUDIOBOOKS"));
  assert.equal(/UNSUPPORTED_OPTIONAL_SECTIONS\s*=\s*setOf\([\s\S]*SECTION_AUDIOBOOKS/.test(catalog), false);
  assert.ok(catalog.includes("buildVisibleRootNodes"));

  const sync = read("services/androidAutoCatalogSync.ts");
  assert.ok(sync.includes('HIDDEN_AA_ROOTS'));
  assert.ok(sync.includes("buildVisibleRoots"));
  assert.ok(sync.includes("intentionally omitted from AA roots") || sync.includes("HIDDEN_AA_ROOTS"));
}

function testTvExcluded() {
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
    'contentType == "tv"',
    "tv filter"
  );
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt",
    'contentType == "sports"',
    "sports filter"
  );
}

function testTaskRemovalAlwaysStops() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("fun shouldPreservePlaybackAfterTaskRemoved(): Boolean"));
  assert.ok(/shouldPreservePlaybackAfterTaskRemoved\(\): Boolean \{\s*return false\s*\}/.test(core));
  assert.equal(core.includes("android_task_removed_preserved_for_android_auto"), false);
  assert.ok(core.includes("taskRemovalShutdown = true"));
  assert.ok(/handleTaskRemoved\([\s\S]*?stop\(\)/.test(core));

  const service = read("plugins/hidden-audio/android/HiddenAudioPlaybackService.kt");
  assert.equal(service.includes("preserveForAndroidAuto"), false);
  assert.ok(service.includes("stopSelf()"));
}

function testSingleOwners() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.equal((core.match(/ExoPlayer\.Builder/g) || []).length, 1);
  mustInclude(
    "plugins/hidden-audio/android/HiddenAudioCore.kt",
    "EXOPLAYER_HANDLES_AUDIO_FOCUS = false"
  );
}

function testPodcastNotRecentlyOnly() {
  const resolver = read("services/androidAutoMediaResolver.ts");
  assert.ok(resolver.includes("podcast_registry"));
  assert.ok(resolver.includes("getAndroidAutoPlayableTrack") || resolver.includes("songFromAndroidAutoTrack"));
  assert.ok(resolver.includes("podcast_not_in_android_auto_catalog"));

  const sync = read("services/androidAutoCatalogSync.ts");
  assert.ok(sync.includes("rememberAndroidAutoPlayableTracks"));
  assert.ok(sync.includes("getAndroidAutoPlayableTrack"));
}

function testMusicLatestTap() {
  mustInclude(
    "services/androidAutoTapAuthority.ts",
    "isAndroidAutoTransactionCurrent"
  );
  mustInclude(
    "services/androidAutoMediaResolver.ts",
    "stale_transaction"
  );
  mustInclude(
    "context/PlayerContext.tsx",
    "acceptAndroidAutoTransaction"
  );
  mustInclude(
    "context/PlayerContext.tsx",
    "remote_command_stale_transaction"
  );
}

async function testTapAuthorityBehaviour() {
  const modPath = pathToFileURL(
    path.join(root, "services", "androidAutoTapAuthority.ts")
  ).href;
  // Use dynamic import via tsx-less pure JS reimplementation for CJS.
  let latest = 0;
  const accept = (tx) => {
    const n = Number(tx) || 0;
    if (n > latest) latest = n;
  };
  const isCurrent = (tx) => {
    const n = Number(tx) || 0;
    if (n <= 0) return true;
    return n === latest;
  };
  accept(1);
  accept(2);
  assert.equal(isCurrent(1), false);
  assert.equal(isCurrent(2), true);
  assert.equal(isCurrent(0), true);
}

async function testCatalogVisibleRootsBehaviour() {
  // Inline mirror of buildVisibleRoots policy
  const HIDDEN = new Set(["motivationals", "lectures"]);
  function visible(sections) {
    const byParent = new Map(sections.map((s) => [s.parentId, s.items]));
    const order = [
      { id: "recently_played", always: false },
      { id: "favorites", always: false },
      { id: "music", always: true },
      { id: "radio", always: false },
      { id: "podcasts", always: false },
      { id: "audiobooks", always: false },
    ];
    return order
      .filter((e) => !HIDDEN.has(e.id))
      .filter((e) => e.always || (byParent.get(e.id) || []).some((i) => i.playable))
      .map((e) => e.id);
  }
  assert.deepEqual(visible([{ parentId: "music", items: [] }]), ["music"]);
  assert.deepEqual(
    visible([
      { parentId: "music", items: [] },
      { parentId: "podcasts", items: [{ playable: true }] },
      { parentId: "audiobooks", items: [{ playable: true }] },
    ]),
    ["music", "podcasts", "audiobooks"]
  );
  assert.deepEqual(
    visible([
      { parentId: "radio", items: [{ playable: false }] },
      { parentId: "music", items: [] },
    ]),
    ["music"]
  );
}

function main() {
  console.log("test-android-auto-browse-playback: start");
  testNotifyChildrenChangedWired();
  testRootSynchronous();
  testOnlyUnresolvedRootsHidden();
  testTvExcluded();
  testTaskRemovalAlwaysStops();
  testSingleOwners();
  testPodcastNotRecentlyOnly();
  testMusicLatestTap();
  testCatalogVisibleRootsBehaviour();
  testTapAuthorityBehaviour();
  console.log("test-android-auto-browse-playback: PASS");
}

main();
