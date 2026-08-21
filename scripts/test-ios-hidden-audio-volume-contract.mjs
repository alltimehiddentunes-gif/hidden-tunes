import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const swift = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
const objc = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.m");
const bridge = read("src/hidden-audio/hiddenAudioBridge.ts");
const playbackBridge = read("services/playbackBridge.ts");
const player = read("context/PlayerContext.tsx");

assert.match(swift, /private var currentVolume: Float = 1\.0/);
assert.match(swift, /@objc\(setVolume:resolver:rejecter:\)/);
assert.match(swift, /currentVolume = min\(1\.0, max\(0\.0, volume\.floatValue\)\)/);
assert.match(swift, /player\?\.volume = currentVolume/);
assert.match(objc, /RCT_EXTERN_METHOD\(setVolume:/);
assert.match(bridge, /setVolume\?\(volume: number\): Promise<void>/);
assert.match(bridge, /await HiddenAudioNative\.setVolume\(safeVolume\)/);
assert.match(playbackBridge, /hiddenAudioBridge\.setVolume\(muted \? 0 : volume\)/);
assert.match(player, /bridgeSetVolume\(safeValue, isMutedRef\.current\)/);
assert.match(player, /bridgeSetVolume\(volumeRef\.current, nextMuted\)/);

console.log("PASS: iOS HiddenAudio volume and mute contract");
