import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("components/navigation/AppShell.tsx", "utf8");
const navigation = fs.readFileSync("utils/primaryNavigation.ts", "utf8");
const diagnostics = fs.readFileSync("utils/tapResponseDiagnostics.ts", "utf8");

assert.match(shell, /onPressIn=\{handlePressIn\}/, "tabs need touch-down feedback/instrumentation");
assert.match(shell, /onPress=\{handlePress\}/, "tabs need a direct synchronous press handler");
assert.doesNotMatch(shell, /InteractionManager|setTimeout|await\s+.*navigate/, "tab routing must not be deferred");
assert.match(shell, /getNowPlayingSongIdSnapshot/, "shell must not rerender for playback progress/play state");
assert.match(navigation, /router\.replace\(path as any\)/, "primary routing must dispatch synchronously");
assert.doesNotMatch(navigation, /dismissAll\(\)/, "navigation must not synchronously unwind the stack before dispatch");
assert.match(diagnostics, /const enabled = __DEV__/, "timing logs must be development-only");

console.log("Ultra-instant primary navigation contract: PASS");
