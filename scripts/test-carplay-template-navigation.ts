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

assert.ok(searchMethod.includes("let search = CPSearchTemplate()"), "constructs CPSearchTemplate");
assert.ok(searchMethod.includes("search.delegate = self"), "assigns search delegate");
assert.ok(
  searchMethod.includes("interfaceController.pushTemplate(search, animated: true)"),
  "CPSearchTemplate is pushed onto navigation hierarchy"
);
assert.equal(
  /presentTemplate\s*\(\s*search/.test(searchMethod),
  false,
  "CPSearchTemplate must never use modal presentTemplate"
);

assert.ok(
  manager.includes("interfaceController.pushTemplate(template, animated: true)"),
  "CPListTemplate uses navigation push"
);
assert.ok(
  manager.includes("CPNowPlayingTemplate.shared")
    && manager.includes("interfaceController.pushTemplate(nowPlaying, animated: true)"),
  "CPNowPlayingTemplate singleton uses its existing special singleton plus navigation push"
);
assert.equal(/presentTemplate\s*\([^)]*CPListTemplate/.test(manager), false, "list is not modal");
assert.equal(/presentTemplate\s*\([^)]*CPGridTemplate/.test(manager), false, "grid is not modal");
assert.equal(/presentTemplate\s*\([^)]*CPNowPlayingTemplate/.test(manager), false, "now playing is not modal");

// SDK contract classification: alert/action-sheet are modal; this manager does
// not currently construct either class, so no production call needs changing.
assert.equal(manager.includes("CPAlertTemplate("), false, "no alert presentation path");
assert.equal(manager.includes("CPActionSheetTemplate("), false, "no action-sheet presentation path");

console.log("carplay-template-navigation: PASS");
console.log("pushable: CPListTemplate, CPGridTemplate, CPSearchTemplate");
console.log("modal: CPAlertTemplate, CPActionSheetTemplate, CPVoiceControlTemplate");
console.log("singleton/special: CPNowPlayingTemplate.shared (pushed by existing path)");
