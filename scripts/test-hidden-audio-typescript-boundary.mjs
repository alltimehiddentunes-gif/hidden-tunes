import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = process.cwd();
const shimPath = resolve(root, "plugins/hidden-audio/index.ts");
const pluginPath = resolve(root, "plugins/hidden-audio/index.js");
const shim = readFileSync(shimPath, "utf8");

assert.match(
  shim,
  /declare const module: \{ exports: unknown \};/,
  "the Node/CommonJS declaration must remain file-local"
);
assert.doesNotMatch(
  readFileSync(resolve(root, "tsconfig.json"), "utf8"),
  /"types"\s*:\s*\[[^\]]*"node"/,
  "mobile runtime TypeScript must not gain broad Node globals"
);

const require = createRequire(import.meta.url);
const plugin = require(pluginPath);
assert.equal(typeof plugin, "function", "Expo must load HiddenAudio as a config plugin");
const source = readFileSync(pluginPath, "utf8");
assert.match(source, /withHiddenAudioAndroidManifest/, "Android plugin path must remain present");
assert.match(source, /withHiddenAudioEntitlements/, "iOS entitlement path must remain present");
assert.match(source, /withHiddenAudioNativeSources/, "iOS native-source path must remain present");

console.log("HiddenAudio TypeScript boundary and Node plugin execution: PASS");
