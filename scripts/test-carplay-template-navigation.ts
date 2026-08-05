import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(
  "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift",
  "utf8"
);

const searchStart = manager.indexOf("private func presentSearchTemplate()");
const searchEnd = manager.indexOf("private func ensureSessionConfiguration()", searchStart);
assert.ok(searchStart >= 0 && searchEnd > searchStart, "search presentation method exists");
const searchMethod = manager.slice(searchStart, searchEnd);

assert.equal(manager.includes("CPSearchTemplate("), false, "navigation-only CPSearchTemplate is absent");
assert.ok(searchMethod.includes('let search = CPListTemplate('), "constructs audio-safe Search list");
assert.ok(searchMethod.includes("boundedAudioSearchBrowseNodes()"), "uses bounded audio search browse nodes");
assert.ok(searchMethod.includes("prefix(HiddenAudioCarPlayCatalog.limits.search)"), "caps Search at 30");
assert.ok(
  searchMethod.includes('pushTemplateSafely(search, operation: "search", mediaId: "search")'),
  "Search CPListTemplate uses guarded navigation"
);
assert.equal(
  /presentTemplate\s*\(\s*search/.test(searchMethod),
  false,
  "Search must never use modal presentTemplate"
);

assert.ok(
  manager.includes('pushTemplateSafely(template, operation: "child_list"'),
  "CPListTemplate uses navigation push"
);
assert.ok(
  manager.includes("CPNowPlayingTemplate.shared")
    && manager.includes('pushTemplateSafely(nowPlaying, operation: "now_playing")'),
  "CPNowPlayingTemplate singleton uses its existing special singleton plus navigation push"
);
assert.equal(/presentTemplate\s*\([^)]*CPListTemplate/.test(manager), false, "list is not modal");
assert.equal(/presentTemplate\s*\([^)]*CPGridTemplate/.test(manager), false, "grid is not modal");
assert.equal(/presentTemplate\s*\([^)]*CPNowPlayingTemplate/.test(manager), false, "now playing is not modal");

// SDK contract classification: alert/action-sheet are modal; this manager does
// not currently construct either class, so no production call needs changing.
assert.equal(manager.includes("CPAlertTemplate("), false, "no alert presentation path");
assert.equal(manager.includes("CPActionSheetTemplate("), false, "no action-sheet presentation path");
assert.equal(manager.includes("CPVoiceControlTemplate("), false, "no voice-control modal path");
assert.equal(manager.includes("CPGridTemplate("), false, "no grid path");
assert.equal(manager.includes("CPInformationTemplate("), false, "unsupported app-category template absent");
assert.equal(manager.includes("CPPointOfInterestTemplate("), false, "unsupported app-category template absent");

assert.equal(/presentTemplate\s*\(/.test(manager), false, "no unguarded modal presentation exists");
assert.match(manager, /dispatchPrecondition\(condition: \.onQueue\(\.main\)\)/, "navigation asserts main queue");
assert.match(manager, /reason": "transition_in_progress"/, "rapid transitions fail closed");
assert.match(manager, /reason": "modal_active"/, "navigation is blocked while a modal is active");
assert.match(manager, /reason": "template_already_in_stack"/, "same template cannot be pushed twice");
assert.match(manager, /logical_template_already_in_stack/, "logical Search destination cannot be pushed twice");
assert.match(manager, /activeConnectionGeneration/, "async navigation is connection-generation guarded");
assert.match(manager, /controllerIdentity = ObjectIdentifier\(interfaceController\)/, "push binds controller identity");
assert.match(manager, /reason": "stale_push_completion"/, "stale push completion fails closed");
assert.match(manager, /isNavigationTransitionInProgress = false/, "push completion clears transition lock");
assert.match(searchMethod, /empty:search/, "empty Search remains safe");
assert.match(manager, /parentId: "search_results"/, "Search result uses authoritative selection path");
assert.match(manager, /scheduleNowPlayingAfterSelectionCompletion/, "selection completes before Now Playing navigation");
assert.match(manager, /interfaceController\.templates\.count == 1/, "root upgrade cannot replace an active child stack");

const rootCalls = [...manager.matchAll(/setRootTemplate\(([^,]+)/g)].map((match) => match[1].trim());
assert.ok(rootCalls.length >= 3, "root installation paths are covered");
assert.ok(rootCalls.every((value) => value === "list" || value === "tabBar"),
  `only CPListTemplate/CPTabBarTemplate roots are installed: ${rootCalls.join(", ")}`);

console.log("carplay-template-navigation: PASS");
console.log("pushable: CPListTemplate, CPGridTemplate");
console.log("modal: CPAlertTemplate, CPActionSheetTemplate, CPVoiceControlTemplate");
console.log("singleton/special: CPNowPlayingTemplate.shared (pushed by existing path)");
